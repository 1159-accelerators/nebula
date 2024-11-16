import os
import boto3
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_aws import BedrockEmbeddings
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_bedrock_runtime.client import BedrockRuntimeClient
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_rds_data.type_defs import BatchExecuteStatementResponseTypeDef
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import GetObjectOutputTypeDef
from mypy_boto3_textract.client import TextractClient

# from trp.trp2 import TDocument, TDocumentSchema, TextractBlockTypes
# from trp.t_pipeline import order_blocks_by_geo
# from textractcaller import get_full_json
from typing import Any

logger = Logger()

bedrock_client: BedrockRuntimeClient = boto3.client("bedrock-runtime")  # type: ignore
s3_client: S3Client = boto3.client("s3")  # type: ignore
rds_client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore
textract_client: TextractClient = boto3.client("textract")  # type: ignore

CHUNK_SIZE = os.environ.get("CHUNK_SIZE", "500")
CHUNK_OVERLAP = os.environ.get("CHUNK_OVERLAP", "0")
IMAGE_TYPES = ["gif", "jpg", "jpeg", "png", "webp"]
UTILITY_BUCKET = os.environ["UTILITY_BUCKET"]
CLUSTER_ARN = os.environ["CLUSTER_ARN"]
SECRET_ARN = os.environ["SECRET_ARN"]
MODEL_ID = os.environ["MODEL_ID"]

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=int(CHUNK_SIZE), chunk_overlap=int(CHUNK_OVERLAP), length_function=len
)


def get_image_summary(id: str) -> dict[str, Any]:
    response = rds_client.execute_statement(
        database="nebula",
        secretArn=SECRET_ARN,
        resourceArn=CLUSTER_ARN,
        sql=(f"SELECT summary FROM documents WHERE id = '{id}'"),
    )

    return response  # type: ignore


def get_extracted_text(id: str) -> str:
    try:
        doc: GetObjectOutputTypeDef = s3_client.get_object(
            Bucket=UTILITY_BUCKET, Key=f"pdf_output/{id}"
        )
        return doc["Body"].read().decode("utf-8")
    except Exception as e:
        logger.error(f"Could not retrieve text from Utility bucket: {e}")
        raise


def get_embeddings(split_text: list[str]) -> list[list[float]]:
    bedrock = BedrockEmbeddings(model_id=MODEL_ID, client=bedrock_client)

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
                {"name": "embedding", "value": {"stringValue": str(embeddings[idx])}},
            ]
        )

    return collection


def put_embeddings(
    parameter_sets: list[list[dict]],
) -> BatchExecuteStatementResponseTypeDef:
    response = rds_client.batch_execute_statement(
        database="nebula",
        secretArn=SECRET_ARN,
        resourceArn=CLUSTER_ARN,
        sql=(
            f"INSERT into documents_embeddings (document_id, text, embedding) VALUES(CAST(:id AS UUID), :text, CAST(:embedding as vector))"
        ),
        parameterSets=parameter_sets,  # type: ignore
    )

    return response  # type: ignore


# def get_textract_data(job_id: str, textract_client: TextractClient) -> dict:
#     response = get_full_json(job_id=job_id, boto3_textract_client=textract_client)

#     return response


# def parse_textract_data(textract_data) -> str:
#     doc = TDocumentSchema().load(textract_data)

#     ordered_lines = order_blocks_by_geo(doc).get_blocks_by_type(block_type_enum=TextractBlockTypes.LINE)  # type: ignore
#     text = TDocument.get_text_for_tblocks(ordered_lines)

#     return text


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict[str, Any], context: LambdaContext):
    try:
        id = event["dbRecord"]["id"]["StringValue"]
        ext = event["fileType"]["ext"]

        if ext in IMAGE_TYPES:
            image_summary = get_image_summary(id=id)
            text = image_summary["records"][0][0]["stringValue"]
        else:
            text = get_extracted_text(id=id)
        logger.info("Splitting text")
        split_text: list[str] = text_splitter.split_text(text)

        logger.info("Creating embeddings")
        embeddings = get_embeddings(split_text)
        parameter_sets = build_parameter_sets(split_text, embeddings, id)
        return put_embeddings(parameter_sets)

    except Exception as e:
        logger.error(f"Could not create embeddings: {e}")
        raise e
