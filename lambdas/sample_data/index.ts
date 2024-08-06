import { Context } from "aws-lambda";
import * as https from "node:https";
import {
  S3Client,
  ListObjectsCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";

const s3Client = new S3Client({});
const listObjectsCommand = new ListObjectsCommand({
  Bucket: "1159-public-assets",
  Prefix: `kb-accelerator/${process.env.VERSION}/sample_data/`,
});

const bedrockAgentClient = new BedrockAgentClient({});
const startIngestionJobCommand = new StartIngestionJobCommand({
  knowledgeBaseId: process.env.KB_ID,
  dataSourceId: process.env.DATA_SOURCE_ID,
});

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

  // For Delete requests, immediately send a SUCCESS response.
  if (event.RequestType === "Delete" || event.ResourceType === "Update") {
    await sendResponse(event, context, "SUCCESS", { Status: "Deleting" });
    return;
  }

  try {
    const sourceObjects = await s3Client.send(listObjectsCommand);
    console.log(sourceObjects)
    const keys = sourceObjects.Contents?.map((object) => ({
      newKey: object.Key?.slice(33),
      oldKey: object.Key,
    }));

    if (keys?.length) {
      for (const key of keys) {
        const send = await s3Client.send(
          new CopyObjectCommand({
            Bucket: process.env.DOCS_BUCKET,
            Key: key.newKey,
            CopySource: `1159-public-assets/${key.oldKey}`,
          })
        );
      }
    }

    await bedrockAgentClient.send(startIngestionJobCommand);
    responseStatus = "SUCCESS";
    responseData = { Status: "Sample data copied" };
  } catch (err) {
    responseData = { Error: "Something went wrong" };
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
