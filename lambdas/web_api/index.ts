import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import {
  BedrockAgentClient,
  GetKnowledgeBaseCommand,
  GetDataSourceCommand,
  DataSource,
  KnowledgeBase,
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

type ResponseBody = {
  data?: {
    docs?: (string | undefined)[] | undefined;
    count?: number;
    knowledgeBase?: KnowledgeBase;
    dataSource?: DataSource;
    answer?: string;
    sessionId?: string;
  };
  error?: {
    message?: string;
    detail?: unknown;
  };
};

const buildResponse = (body: ResponseBody, statusCode = 200) => {
  return {
    statusCode: statusCode,
    headers: {
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
    },
    body: JSON.stringify(body),
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  let response;

  if (event.path === "/docs" && event.httpMethod === "GET") {
    try {
      const s3Response = await s3Client.send(s3ListObjectsCommand);
      response = buildResponse({
        data: {
          docs: s3Response.Contents?.map((doc) => doc.Key),
          count: s3Response.Contents?.length,
        },
      });
    } catch (err) {
      console.log(err);
      response = buildResponse(
        { error: { message: "something went wrong", detail: err } },
        500
      );
    }
  } else if (event.path === "/kb" && event.httpMethod === "GET") {
    try {
      const bedrockKbResponse = await bedrockAgentClient.send(
        bedrockGetKnowledgeBaseCommand
      );

      const bedrockDataSourceResponse = await bedrockAgentClient.send(
        bedrockGetDataSourceCommand
      );
      response = buildResponse({
        data: {
          dataSource: bedrockDataSourceResponse.dataSource,
          knowledgeBase: bedrockKbResponse.knowledgeBase,
        },
      });
    } catch (err) {
      console.log(err);
      response = buildResponse(
        { error: { message: "something went wrong", detail: err } },
        500
      );
    }
  } else if (
    event.path === "/chat" &&
    event.httpMethod === "POST" &&
    event.body &&
    event.body !== ""
  ) {
    const body = JSON.parse(event.body);
    try {
      const query = await bedrockAgentRuntimeClient.send(
        new RetrieveAndGenerateCommand({
          sessionId: body.sessionId,
          input: {
            text: body.question, // required
          },
          retrieveAndGenerateConfiguration: {
            type: "KNOWLEDGE_BASE", // required
            knowledgeBaseConfiguration: {
              knowledgeBaseId: process.env.KB_ID,
              modelArn: process.env.FOUNDATION_MODEL_ARN,
              retrievalConfiguration: {
                // KnowledgeBaseRetrievalConfiguration
                vectorSearchConfiguration: {
                  // KnowledgeBaseVectorSearchConfiguration
                  numberOfResults: Number("20"),
                  overrideSearchType: "HYBRID",
                },
              },
            },
          },
        })
      );
      response = buildResponse({
        data: {
          answer: query.output?.text,
          sessionId: query.sessionId,
        },
      });
    } catch (err) {
      console.log(err);
      response = buildResponse(
        { error: { message: "something went wrong", detail: err } },
        500
      );
    }
  } else {
    response = buildResponse({ error: { message: "Invalid operaton" } });
  }

  return response;
};
