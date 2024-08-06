import { Context } from "aws-lambda";
import { defaultProvider } from "@aws-sdk/credential-provider-node"; // V3 SDK.
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import * as https from "node:https";

let region: string;

const endpoint = process.env.ENDPOINT;

type CloudFormationEvent = {
  RequestType: "Create" | "Delete" | "Update";
  RequestId: string;
  ResponseURL: string;
  ResourceType: string;
  LogicalResourceId: string;
  StackId: string;
};

type ResponseStatus = "FAILED" | "SUCCESS";

type ResponseData = {
  Status?: string;
  Error?: string;
};

export const handler = async (event: CloudFormationEvent, context: Context) => {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

  let responseStatus: ResponseStatus = "FAILED";
  let responseData: ResponseData = {};

  if (process.env.REGION) {
    region = process.env.REGION;
  } else {
    await sendResponse(event, context, responseStatus, { Error: "REGION variable not set" });
  }

  const client = new Client({
    ...AwsSigv4Signer({
      region: region,
      service: "aoss",
      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    node: endpoint, // OpenSearch domain URL
  });

  // For Delete requests, immediately send a SUCCESS response.
  if (event.RequestType === "Delete" || event.ResourceType === "Update") {
    await sendResponse(event, context, "SUCCESS", { Status: "Deleting" });
    return;
  }

  const settings = {
    settings: {
      index: {
        number_of_shards: 2,
        number_of_replicas: 0,
      },
    },
    mappings: {
      properties: {
        BEDROCK_METADATA: { type: "text", index: false },
        BEDROCK_TEXT_CHUNK: { type: "text" },
        "kb-vector-1159": {
          type: "knn_vector",
          dimension: 1024,
          method: {
            engine: "faiss",
            space_type: "l2",
            name: "hnsw",
            parameters: {},
          },
        },
      },
    },
  };

  try {
    await client.indices.create({
      index: "kb-index-1159",
      body: settings,
    });
    responseStatus = "SUCCESS";
    responseData = { Status: "Index created" };
  } catch (err) {
    responseData = { Error: "Index was not created" };
    console.log(responseData.Error + ":\n", err);
  }

  await sendResponse(event, context, responseStatus, responseData);
};

function sendResponse(
  event: CloudFormationEvent,
  context: Context,
  responseStatus: ResponseStatus,
  responseData: ResponseData
) {
  return new Promise((resolve, reject) => {
    let responseBody = JSON.stringify({
      Status: responseStatus,
      Reason:
        "See the details in CloudWatch Log Stream: " + context.logStreamName,
      PhysicalResourceId: context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: false,
      Data: responseData,
    });

    console.log("Response body:\n", responseBody);

    //var parsedUrl = url.parse(event.ResponseURL);
    //let parsedUrl = new URL(event.ResponseURL);
    let options = {
      method: "PUT",
      headers: {
        "Content-Type": "",
        "Content-Length": responseBody.length,
      },
    };

    var request = https.request(event.ResponseURL, options, (response) => {
      console.log("Status code: " + response.statusCode);
      resolve(context.done());
    });

    request.on("error", function (error) {
      console.log("send(..) failed executing https.request(..): " + error);
      reject(context.done(error));
    });

    request.write(responseBody);
    request.end();
  });
}
