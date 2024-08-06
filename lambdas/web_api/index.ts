import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import {
  BedrockAgentClient,
  GetKnowledgeBaseCommand,
  GetDataSourceCommand,
} from "@aws-sdk/client-bedrock-agent";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

const s3Client = new S3Client({});
const s3ListObjectsInput = {
  Bucket: process.env.DOCS_BUCKET,
};
const s3ListObjectsCommand = new ListObjectsCommand(s3ListObjectsInput);

const bedrockAgentClient = new BedrockAgentClient({});
const bedrockGetKnowledgeBaseCommand = new GetKnowledgeBaseCommand({
  knowledgeBaseId: process.env.KB_ID,
});

const bedrockGetDataSourceCommand = new GetDataSourceCommand({
  knowledgeBaseId: process.env.KB_ID,
  dataSourceId: process.env.DATA_SOURCE_ID,
});

const bedrockAgentRuntimeClient = new BedrockAgentRuntimeClient({});

const retrieveAndGenerateConfiguration = {
  // RetrieveAndGenerateConfiguration
  type: "KNOWLEDGE_BASE", // required
  knowledgeBaseConfiguration: {
    knowledgeBaseId: process.env.KB_ID,
    modelArn: process.env.FOUNDATION_MODEL_ARN, // required
    retrievalConfiguration: {
      // KnowledgeBaseRetrievalConfiguration
      vectorSearchConfiguration: {
        // KnowledgeBaseVectorSearchConfiguration
        numberOfResults: Number("3"),
        overrideSearchType: "HYBRID" || "SEMANTIC",
      },
    },
  },
};
const input = {
  // RetrieveAndGenerateRequest
  sessionId: "STRING_VALUE",
  input: {
    // RetrieveAndGenerateInput
    text: "STRING_VALUE", // required
  },
  retrieveAndGenerateConfiguration: {
    // RetrieveAndGenerateConfiguration
    type: "KNOWLEDGE_BASE", // required
    knowledgeBaseConfiguration: {
      knowledgeBaseId: process.env.KB_ID,
      modelArn: process.env.FOUNDATION_MODEL_ARN, // required
      retrievalConfiguration: {
        // KnowledgeBaseRetrievalConfiguration
        vectorSearchConfiguration: {
          // KnowledgeBaseVectorSearchConfiguration
          numberOfResults: Number("3"),
          overrideSearchType: "HYBRID" || "SEMANTIC",
        },
      },
    },
  },
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: "",
  };

  if (event.path === "/docs" && event.httpMethod === "GET") {
    try {
      const s3Response = await s3Client.send(s3ListObjectsCommand);
      response.body = JSON.stringify({
        data: {
          docs: s3Response.Contents?.map((doc) => doc.Key),
          count: s3Response.Contents?.length,
        },
      });
    } catch (err) {
      console.log(err);
      response.statusCode = 500;
      response.body = JSON.stringify({
        data: {
          message: "some error happened",
        },
      });
    }
  } else if (event.path === "/kb" && event.httpMethod === "GET") {
    try {
      const bedrockKbResponse = await bedrockAgentClient.send(
        bedrockGetKnowledgeBaseCommand
      );

      const bedrockDataSourceResponse = await bedrockAgentClient.send(
        bedrockGetDataSourceCommand
      );

      response.body = JSON.stringify({
        data: {
          dataSource: bedrockDataSourceResponse.dataSource,
          knowledgeBase: bedrockKbResponse.knowledgeBase,
        },
      });
    } catch (err) {
      console.log(err);
      response.statusCode = 500;
      response.body = JSON.stringify({
        data: {
          message: "some error happened",
        },
      });
    }
  } else if (
    event.path === "/chat" &&
    event.httpMethod === "POST" &&
    event.body &&
    event.body !== ""
  ) {
    const body = JSON.parse(event.body)
    try {

    } catch (err) {
      console.log(err);
      response.statusCode = 500;
      response.body = JSON.stringify({
        data: {
          message: "some error happened",
        },
      });
    }
  } else {
    response.body = JSON.stringify({
      data: "",
    });
  }

  return response;
};
