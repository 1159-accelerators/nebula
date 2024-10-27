import base64
import boto3
import json
import logging

logger = logging.getLogger()
logger.setLevel("INFO")

s3_client = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime")


def lambda_handler(event, context):
    bucket: str = event["bucket"]
    key: str = event["key"]
    mime: str = event["mime"]
    ext: str = event["ext"]
    prompt: str = event["prompt"]
    model_id: str = event["model_id"]

    if ext in ["png", "jpg", "gif", "webp"]:
        try:
            doc: dict = s3_client.get_object(Bucket=bucket, Key=key)
            image_data = base64.b64encode(doc["Body"].read()).decode("utf-8")

            max_tokens = 1024

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

            return response_body
        except Exception as e:
            logger.error(f"Could not summarize image: {e}")
