from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from io import BytesIO
import os
import boto3
from pypdfium2 import PdfPage, PdfDocument, PdfBitmap
from PIL import Image

logger = Logger()

s3_client = boto3.client("s3")

MAX_SIZE = (512, 512)


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context: LambdaContext):
    response = {
        "status": "SUCCESS"
    }

    image_bytes = BytesIO()

    try:
        bucket: str = event["doc"]["bucket"]
        key: str = event["doc"]["key"]
        id: str = event["id"]
        ext: str = event["fileType"]["ext"]
        thumbnail_bucket: str = os.environ["THUMBNAIL_BUCKET"]
    except Exception as e:
        logger.error(f"Invalid event: {e}")
        raise

    logger.info("Getting S3 object")
    try:
        doc: dict = s3_client.get_object(Bucket=bucket, Key=key)
        doc_data: bytes = doc["Body"].read()
    except Exception as e:
        logger.error(f"Could not get object: {e}")
        raise

    try:
        if ext == "pdf":
            logger.info("Generating thumbnail for PDF")
            pdf = PdfDocument(doc_data)
            title_page: PdfPage = pdf[0]
            bitmap: PdfBitmap = title_page.render()
            image: Image = bitmap.to_pil()
        else:
            logger.info("Generating thumbnail for Image")
            doc_data = BytesIO(doc_data)
            image: Image = Image.open(doc_data)
        image.thumbnail(MAX_SIZE)
        image.save(fp=image_bytes, format="PNG")

        logger.info("Putting thumbnail to Bucket")
        s3_client.put_object(
            Body=image_bytes.getvalue(), Bucket=thumbnail_bucket, Key=id
        )
    except Exception as e:
        logger.error(f"Could not generate thumbnail: {e}")
        raise

    return response
