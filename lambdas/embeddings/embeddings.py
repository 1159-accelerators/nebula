import os
import boto3
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_aws import BedrockEmbeddings
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_bedrock_runtime.client import BedrockRuntimeClient
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_s3.client import S3Client
from typing import Any

logger = Logger()

bedrock_client: BedrockRuntimeClient = boto3.client("bedrock-runtime")  # type: ignore
s3_client: S3Client = boto3.client("s3")  # type: ignore
rds_client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 0
IMAGE_TYPES = ["gif", "jpg", "jpeg", "png", "webp"]

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP, length_function=len
)


def get_event_data(event: dict) -> dict[str, str]:
    try:
        return {
            "bucket": event["doc"]["bucket"],
            "key": event["doc"]["key"],
            "id": event["id"],
            "ext": event["fileType"]["ext"],
            "cluster_arn": os.environ["CLUSTER_ARN"],
            "secret_arn": os.environ["SECRET_ARN"],
            "model_id": os.environ["MODEL_ID"],
        }
    except KeyError as e:
        logger.error(f"Missing required event data: {e}")
        raise ValueError(f"Invalid event structure: {e}")


def get_image_summary(
    id: str, cluster_arn: str, secret_arn: str, client: RDSDataServiceClient
) -> dict[str, Any]:
    response = client.execute_statement(
        database="nebula",
        secretArn=secret_arn,
        resourceArn=cluster_arn,
        sql=(f"SELECT summary FROM documents WHERE id = '{id}'"),
    )

    return response  # type: ignore


def get_embeddings(
    split_text: list[str], model_id: str, client: BedrockRuntimeClient
) -> list[list[float]]:
    bedrock = BedrockEmbeddings(model_id=model_id, client=client)

    return bedrock.embed_documents(split_text)


def build_parameter_sets(split_text: list[str], embeddings: list[list[float]], id: str):
    collection = []

    for idx, text in enumerate(split_text):
        collection.append(
            [
                {
                    "name": "id",
                    "value": {"stringValue": id},
                },
                {
                    "name": "text",
                    "value": {"stringValue": text},
                },
                {
                    "name": "embedding",
                    "value": {
                        "stringValue": str(embeddings[idx])
                    }
                },
            ]
        )

    return collection

def put_embeddings(id: str, cluster_arn: str, secret_arn: str, client: RDSDataServiceClient, parameter_sets: list[list[dict]]):
    response = client.batch_execute_statement(
        database="nebula",
        secretArn=secret_arn,
        resourceArn=cluster_arn,
        sql=(f"INSERT into documents_embeddings (document_id, text, embedding) VALUES(CAST(:id AS UUID), :text, CAST(:embedding as vector))"),
        parameterSets=parameter_sets #type: ignore
    )

    return response  # type: ignore

@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict[str, Any], context: LambdaContext):
    try:
        event_data = get_event_data(event)

        if event_data["ext"] in IMAGE_TYPES:
            image_summary = get_image_summary(
                event_data["id"],
                event_data["cluster_arn"],
                event_data["secret_arn"],
                rds_client,
            )
            text = image_summary["records"][0][0]["stringValue"]

        logger.info("Splitting text")
        split_text: list[str] = text_splitter.split_text(text)

        logger.info("Creating embeddings")
        embeddings = get_embeddings(split_text, event_data["model_id"], bedrock_client)
        parameter_sets = build_parameter_sets(split_text, embeddings, event_data["id"])
        put_embeddings(event_data["id"], event_data["cluster_arn"], event_data["secret_arn"], rds_client, parameter_sets)

        return parameter_sets
    except Exception as e:
        logger.error(f"Could not create embeddings: {e}")
        raise e
