import os
import boto3
import base64
import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_bedrock_runtime.client import BedrockRuntimeClient
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import GetObjectOutputTypeDef
from mypy_boto3_textract.client import TextractClient
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_textract.type_defs import GetDocumentTextDetectionResponseTypeDef
from trp.trp2 import TDocument, TDocumentSchema, TextractBlockTypes
from trp import Document
from trp.t_pipeline import order_blocks_by_geo
from textractcaller import get_full_json
from typing import Any

logger = Logger()

s3_client: S3Client = boto3.client("s3")  # type: ignore
bedrock_client: BedrockRuntimeClient = boto3.client("bedrock-runtime")  # type: ignore
rds_client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore
textract_client: TextractClient = boto3.client("textract")  # type: ignore

MAX_IMAGE_TOKENS = 1024
MAX_TEXT_TOKENS = 8192
MODEL_ID = os.environ["MODEL_ID"]
IMAGE_TYPES = ["gif", "jpg", "jpeg", "png", "webp"]
SUMMARY_TYPES = ["gif", "jpg", "jpeg", "png", "webp", "pdf"]


def get_image_data(bucket: str, key: str) -> str:
    """Retrieve and encode image data from S3."""
    try:
        doc: GetObjectOutputTypeDef = s3_client.get_object(Bucket=bucket, Key=key)
        return base64.b64encode(doc["Body"].read()).decode("utf-8")
    except Exception as e:
        logger.error(f"Could not retrieve image from S3: {e}")
        raise


def get_textract_data(job_id: str, textract_client: TextractClient) -> dict:
    response = get_full_json(job_id=job_id, boto3_textract_client=textract_client)

    return response


def parse_textract_data(textract_data) -> str:
    doc = TDocumentSchema().load(textract_data)

    ordered_lines = order_blocks_by_geo(doc).get_blocks_by_type(block_type_enum=TextractBlockTypes.LINE)  # type: ignore
    text = TDocument.get_text_for_tblocks(ordered_lines)

    return text


def create_bedrock_image_request(image_data, mime, prompt) -> dict[str, Any]:
    """Create the request body for Bedrock API."""
    return {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_IMAGE_TOKENS,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }


def create_bedrock_text_request(text_data) -> dict[str, Any]:
    """Create the request body for Bedrock API."""
    return {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TEXT_TOKENS,
        "messages": [
            {
                "role": "user",
                "content": f"""
                You are a helpful agent that specializes summarizing text pulled
                from documents. I will provide you text extracted from a PDF, and your job
                is to write no more than three paragraphs summarizing the content. Do not
                include any conversational language in your response, and attempt to start
                the response with the inferred title.

                Here is the text:
                {text_data} 
                """,
            }
        ],
    }


def invoke_bedrock_model(request_body: dict[str, Any]) -> str:
    """Invoke Bedrock model and return the response."""
    try:
        response = bedrock_client.invoke_model(
            body=json.dumps(request_body), modelId=MODEL_ID
        )
        response_body = json.loads(response.get("body").read())
        return (
            response_body["content"][0]["text"].replace("\n\n", " ").replace("'", "''")
        )
    except Exception as e:
        logger.error(f"Could not invoke Bedrock model: {e}")
        raise


def process_image(bucket: str, key: str, mime: str) -> str:
    """Process the image and return the summary."""
    image_data = get_image_data(bucket, key)
    request_body = create_bedrock_image_request(
        image_data, mime, "Describe this image."
    )
    return invoke_bedrock_model(request_body)


def process_pdf(job_id: str, textract_client: TextractClient) -> str:
    textract_data = get_textract_data(job_id, textract_client)
    parsed_data = parse_textract_data(textract_data)
    request_body = create_bedrock_text_request(parsed_data)
    return invoke_bedrock_model(request_body)


def put_summary(id: str, summary: str):
    rds_client.execute_statement(
        resourceArn=os.environ["CLUSTER_ARN"],
        secretArn=os.environ["SECRET_ARN"],
        database="nebula",
        sql=f"UPDATE documents SET summary = '{summary}' WHERE id = '{id}'",
    )


@logger.inject_lambda_context(log_event=True)
def lambda_handler(
    event: dict[str, Any], context: LambdaContext
) -> dict[str, str] | None:
    try:
        bucket: str = event["doc"]["bucket"]
        key: str = event["doc"]["key"]
        mime: str = event["fileType"]["mime"]
        ext: str = event["fileType"]["ext"]
        job_id: str = event.get("textract", {}).get("jobId", "")
        id: str = event["dbRecord"]["id"]["StringValue"]
    except KeyError as e:
        logger.error(f"Invalid event structure: {e}")
        raise ValueError(f"Missing required field in event: {e}")

    if ext not in SUMMARY_TYPES:
        logger.info(f"Unsupported file extension: {ext}")
        return {"status": "none"}

    try:
        if ext in IMAGE_TYPES:
            summary = process_image(bucket, key, mime)
        else:
            summary = process_pdf(job_id, textract_client)

        logger.info(summary)
        put_summary(id=id, summary=summary)

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error processing file: {e}")
        return {"status": "failed"}
        raise e
