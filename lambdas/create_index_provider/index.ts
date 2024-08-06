import { Context } from "aws-lambda";
import { defaultProvider } from "@aws-sdk/credential-provider-node"; // V3 SDK.
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

let region;
if (process.env.REGION) {
  region = process.env.REGION;
} else {
  throw new Error("REGION environmental variable not set");
}

const endpoint = process.env.ENDPOINT;

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

type CloudFormationEvent = {
  RequestType: "Create" | "Delete" | "Update";
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  StackId: string;
  OldResourceProperties: { [key: string]: string };
  ResourceProperties: { [key: string]: string };
  PhysicalResourceId: string;
};

type ResponseObject = {
  PhysicalResourceId: string;
  NoEcho: boolean;
  Data: { [key: string]: string };
};

export const handler = async (
  event: CloudFormationEvent,
  _context: Context
): Promise<ResponseObject> => {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

  const requestType = event.RequestType;

  if (requestType === "Update" || requestType === "Delete") {
    return {
      PhysicalResourceId: event.PhysicalResourceId,
      NoEcho: false,
      Data: {},
    };
  } else {
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
      return {
        PhysicalResourceId: "kb-index-1159",
        NoEcho: false,
        Data: { Status: "index created" },
      };
    } catch (err) {
      console.log(err);
      throw new Error("Error:" + err);
    }
  }
};
