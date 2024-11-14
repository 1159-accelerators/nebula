import os
import boto3
import json
import urllib.parse
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.utilities.data_classes import (
    event_source,
    APIGatewayProxyEvent,
)
from mypy_boto3_bedrock_runtime.client import BedrockRuntimeClient
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_rds_data.type_defs import ExecuteStatementResponseTypeDef
from langchain_aws import BedrockEmbeddings
from typing import Any

logger = Logger()

bedrock_client: BedrockRuntimeClient = boto3.client("bedrock-runtime")  # type: ignore
rds_client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore

cluster_arn = os.environ["CLUSTER_ARN"]
embedding_model_id = os.environ["EMBEDDING_MODEL_ID"]
secret_arn = os.environ["SECRET_ARN"]


def embed_question(question: str) -> list[float]:
    bedrock = BedrockEmbeddings(model_id=embedding_model_id, client=bedrock_client)

    return bedrock.embed_query(question)


def build_response(body: dict[str, Any], status_code=200):
    return {
        "isBase64Encoded": False,
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
        },
        "body": json.dumps(body),
    }


@logger.inject_lambda_context(log_event=True)
@event_source(data_class=APIGatewayProxyEvent)
def lambda_handler(event: APIGatewayProxyEvent, context: LambdaContext):

    if event.path == "/docs" and event.http_method == "GET":
        logger.info("Listing documents")
        try:
            rds_response: ExecuteStatementResponseTypeDef = (
                rds_client.execute_statement(
                    database="nebula",
                    resourceArn=os.environ["CLUSTER_ARN"],
                    secretArn=os.environ["SECRET_ARN"],
                    sql="SELECT id, region, bucket, key, name, size, created_at FROM documents",
                )
            )

            records = []

            if rds_response["records"]:
                for record in rds_response["records"]:
                    records.append(
                        {
                            "id": record[0]["stringValue"],  # type: ignore
                            "region": record[1]["stringValue"],  # type: ignore
                            "bucket": record[2]["stringValue"],  # type: ignore
                            "key": record[3]["stringValue"],  # type: ignore
                            "name": record[4]["stringValue"],  # type: ignore
                            "size": record[5]["longValue"],  # type: ignore
                            "createdAt": record[6]["stringValue"],  # type: ignore
                        }
                    )

            return build_response({"docs": records})
        except Exception as e:
            logger.error(e)
            return build_response({"error": "Something went wrong"}, 500)

    elif event.resource == "/docs/{id}" and event.http_method == "GET":
        logger.info("Getting document")

        id = event.path_parameters["id"]

        rds_response: ExecuteStatementResponseTypeDef = rds_client.execute_statement(
            database="nebula",
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql=f"SELECT id, region, bucket, key, name, size, created_at, summary FROM documents WHERE id = '{id}'",
        )

        record = ""

        if rds_response["records"]:
            record = {
                "id": rds_response["records"][0][0]["stringValue"],  # type: ignore
                "region": rds_response["records"][0][1]["stringValue"],  # type: ignore
                "bucket": rds_response["records"][0][2]["stringValue"],  # type: ignore
                "key": rds_response["records"][0][3]["stringValue"],  # type: ignore
                "name": rds_response["records"][0][4]["stringValue"],  # type: ignore
                "size": rds_response["records"][0][5]["longValue"],  # type: ignore
                "createdAt": rds_response["records"][0][6]["stringValue"],  # type: ignore
                "summary": rds_response["records"][0][7]["stringValue"],  # type: ignore
            }

        return build_response({"doc": record})
    elif event.path == "/search" and event.http_method == "GET":
        question = event.query_string_parameters.get("q")

        if question:
            decoded_question = urllib.parse.unquote_plus(question)
            embedded_question = embed_question(decoded_question)

            rds_response = rds_client.execute_statement(
                database="nebula",
                secretArn=secret_arn,
                resourceArn=cluster_arn,
                sql=(
                    f"""
                     SELECT d.id as id, key, name, de.text, de.distance
                     FROM documents d
                     JOIN (
                        SELECT
                            document_id,
                            text,
                            embedding <=> '{embedded_question}' as distance,
                            RANK() OVER(PARTITION BY document_id ORDER BY embedding <=> '{embedded_question}') as rank
                        FROM documents_embeddings
                        ) de
                     ON (d.id = de.document_id)
                     WHERE de.rank = 1 AND de.distance < 0.88
                     ORDER BY de.distance
                     LIMIT 10
                     """
                ),
            )

            records = []

            if rds_response["records"]:
                logger.info(rds_response["records"])
                for record in rds_response["records"]:
                    records.append(
                        {
                            "id": record[0]["stringValue"],  # type: ignore
                            "key": record[1]["stringValue"],  # type: ignore
                            "name": record[2]["stringValue"],  # type: ignore
                            "text": record[3]["stringValue"],  # type: ignore
                            "distance": record[4]["doubleValue"],  # type: ignore
                        }
                    )

            return build_response({"results": records})
