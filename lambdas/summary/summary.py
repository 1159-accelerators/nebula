from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from typing import Type
import os
import boto3
import base64
import json

logger = Logger()

s3_client = boto3.client("s3")

MAX_SIZE = (512, 512)

s3_client = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime")


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: LambdaContext) -> str:
    try:
        bucket: str = event["doc"]["bucket"]
        key: str = event["doc"]["key"]
        mime: str = event["fileType"]["mime"]
        ext: str = event["fileType"]["ext"]
        model_id: str = os.environ["MODEL_ID"]

    except Exception as e:
        logger.error(f"Invalid event: {e}")
        raise

    response_body: str = ""

    if ext in ["png", "jpg", "gif", "webp"]:

        prompt = "Describe this image."
        try:
            doc: dict = s3_client.get_object(Bucket=bucket, Key=key)
            image_data: str = base64.b64encode(doc["Body"].read()).decode("utf-8")

            max_tokens: int = 1024

            message = {
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

            messages = [message]

            body = json.dumps(
                {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": max_tokens,
                    "messages": messages,
                }
            )

            response = bedrock_client.invoke_model(body=body, modelId=model_id)
            response_body = json.loads(response.get("body").read())
            response_body = response_body["content"][0]["text"].replace("\n\n", " ")
            response_body = response_body.replace("'", "''")

        except Exception as e:
            logger.error(f"Could not summarize image: {e}")
            raise

    return response_body
