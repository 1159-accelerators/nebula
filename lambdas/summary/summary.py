import os
import boto3
import base64
import json
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_bedrock_runtime.client import BedrockRuntimeClient
from mypy_boto3_s3.client import S3Client
from mypy_boto3_s3.type_defs import GetObjectOutputTypeDef
from typing import Any

logger = Logger()

s3_client: S3Client = boto3.client("s3") # type: ignore
bedrock_client: BedrockRuntimeClient = boto3.client("bedrock-runtime") # type: ignore

MAX_TOKENS = 1024
MODEL_ID = os.environ["MODEL_ID"]


def get_image_data(bucket: str, key: str) -> str:
    """Retrieve and encode image data from S3."""
    try:
        doc: GetObjectOutputTypeDef = s3_client.get_object(Bucket=bucket, Key=key)
        return base64.b64encode(doc["Body"].read()).decode("utf-8")
    except Exception as e:
        logger.error(f"Could not retrieve image from S3: {e}")
        raise


def create_bedrock_request(image_data, mime, prompt) -> dict[str, Any]:
    """Create the request body for Bedrock API."""
    return {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
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
    request_body = create_bedrock_request(image_data, mime, "Describe this image.")
    return invoke_bedrock_model(request_body)


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict[str, Any], context: LambdaContext) -> str:
    try:
        bucket: str = event["doc"]["bucket"]
        key: str = event["doc"]["key"]
        mime: str = event["fileType"]["mime"]
        ext: str = event["fileType"]["ext"]
    except KeyError as e:
        logger.error(f"Invalid event structure: {e}")
        raise ValueError(f"Missing required field in event: {e}")

    if ext not in ["png", "jpg", "gif", "webp"]:
        logger.info(f"Unsupported file extension: {ext}")
        return ""

    try:
        return process_image(bucket, key, mime)
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        raise
