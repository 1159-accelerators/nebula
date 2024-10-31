from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from io import BytesIO
import os
import boto3
from pypdfium2 import PdfDocument
from PIL import Image
from mypy_boto3_s3.client import S3Client

logger = Logger()
s3_client: S3Client = boto3.client("s3") # type: ignore
MAX_SIZE = (512, 512)

def get_event_data(event: dict) -> dict[str, str]:
    try:
        return {
            "bucket": event["doc"]["bucket"],
            "key": event["doc"]["key"],
            "id": event["id"],
            "ext": event["fileType"]["ext"],
            "thumbnail_bucket": os.environ["THUMBNAIL_BUCKET"]
        }
    except KeyError as e:
        logger.error(f"Missing required event data: {e}")
        raise ValueError(f"Invalid event structure: {e}")

def get_s3_object(bucket: str, key: str) -> bytes:
    try:
        doc = s3_client.get_object(Bucket=bucket, Key=key)
        return doc["Body"].read()
    except Exception as e:
        logger.error(f"Could not get object from S3: {e}")
        raise

def generate_thumbnail(doc_data: bytes, ext: str) -> Image.Image:
    if ext == "pdf":
        logger.info("Generating thumbnail for PDF")
        pdf = PdfDocument(doc_data)
        title_page = pdf[0]
        bitmap = title_page.render()
        image = bitmap.to_pil()
    else:
        logger.info("Generating thumbnail for Image")
        image = Image.open(BytesIO(doc_data))
    
    image.thumbnail(MAX_SIZE)
    return image

def save_thumbnail(image, bucket, key):
    image_bytes = BytesIO()
    image.save(fp=image_bytes, format="PNG")
    try:
        s3_client.put_object(Body=image_bytes.getvalue(), Bucket=bucket, Key=key)
    except Exception as e:
        logger.error(f"Could not save thumbnail to S3: {e}")
        raise

@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context: LambdaContext):
    try:
        event_data = get_event_data(event)
        doc_data = get_s3_object(event_data["bucket"], event_data["key"])
        thumbnail = generate_thumbnail(doc_data, event_data["ext"])
        save_thumbnail(thumbnail, event_data["thumbnail_bucket"], event_data["id"])
        return {"status": "SUCCESS"}
    except Exception as e:
        logger.error(f"Error processing thumbnail: {e}")
        return {"status": "ERROR", "message": str(e)}
