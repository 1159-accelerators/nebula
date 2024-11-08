import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { S3Client, ListObjectsCommand } from "@aws-sdk/client-s3";
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
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
  Citation,
} from "@aws-sdk/client-bedrock-agent-runtime";

const logger = new Logger();

const rdsClient = new RDSDataClient({});
const rdsListDocumentsInput = {
  resourceArn: process.env.CLUSTER_ARN, // required
  secretArn: process.env.SECRET_ARN, // required
  sql: "SELECT id, region, bucket, key, name, size, created_at FROM documents", // required
  database: "nebula",
};
const rdsListDocumentsCommand = new ExecuteStatementCommand(
  rdsListDocumentsInput
);

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
    citations?: Citation[];
  };
  error?: {
    message?: string;
    detail?: unknown;
  };
};

interface Document {
  id?: string;
  region?: string;
  bucket?: string;
  key?: string;
  name?: string;
  mime?: string;
  size?: number;
  ext?: string;
  summary?: string;
  createdAt?: string;
}

interface ResponseError {
  message?: string;
  detail?: string;
}

interface DocumentResponse {
  docs?: Document[] | [];
  error?: ResponseError;
}

const buildResponse = (
  body: ResponseBody | DocumentResponse,
  statusCode = 200
) => {
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
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.logEventIfEnabled(event);
  logger.addContext(context);

  let response;

  if (event.path === "/docs" && event.httpMethod === "GET") {
    logger.info("Retrieving document list");
    try {
      const rdsResponse = await rdsClient.send(rdsListDocumentsCommand);

      let records: Document[] | [];

      if (rdsResponse.records) {
        records = rdsResponse.records.map((record) => ({
          id: record[0]["stringValue"],
          region: record[1]["stringValue"],
          bucket: record[2]["stringValue"],
          key: record[3]["stringValue"],
          name: record[4]["stringValue"],
          size: record[5]["longValue"],
          createdAt: record[6]["stringValue"],
        }));
      } else {
        records = [];
      }

      response = buildResponse({
        docs: records,
      });
    } catch (err) {
      logger.error("Error getting documents", err as Error);
      response = buildResponse(
        { error: { message: "Could not retrieve documents", detail: err } },
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
                  numberOfResults: Number(process.env.SOURCE_CHUNKS),
                  overrideSearchType: "HYBRID",
                },
              },
              generationConfiguration: {
                // promptTemplate: { // PromptTemplate
                //   textPromptTemplate: "STRING_VALUE",
                // },
                inferenceConfig: {
                  textInferenceConfig: {
                    temperature: Number(process.env.TEMPERATURE),
                    topP: Number(process.env.TOP_P),
                    maxTokens: Number(process.env.MAX_TOKENS),
                  },
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
          citations: query.citations,
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
