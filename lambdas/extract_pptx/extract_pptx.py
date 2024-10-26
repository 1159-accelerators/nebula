import boto3
import os
from pptx import Presentation
from io import BytesIO
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()

s3_client = boto3.client("s3")


@logger.inject_lambda_context
def lambda_handler(event, context: LambdaContext):
    """
    Checks whether the necessary keys and variables exist
    """
    try:
        bucket: str = event["bucket"]
        key: str = event["key"]
        id: str = event["id"]
        extract_bucket = os.environ["EXTRACT_BUCKET"]
    except Exception as e:
        logger.error(f"Error setting up parameters: {e}")
        raise

    """
    Gets object from docs bucket
    """
    try:
        doc: dict = s3_client.get_object(Bucket=bucket, Key=key)
        doc_data: BytesIO = BytesIO(doc["Body"].read())
    except Exception as e:
        logger.error(f"Could get object: {e}")
        raise

    """
    Extracts text from presentation
    """
    try:
        prs = Presentation(doc_data)
        # text_runs will be populated with a list of strings,
        # one for each text run in presentation
        text_array = []

        for slide in prs.slides:
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                for paragraph in shape.text_frame.paragraphs:
                    for run in paragraph.runs:
                        text_array.append(run.text)

        text: str = " ".join(text_array)
    except Exception as e:
        logger.error(f"Could not extract text from presentation: {e}")
        raise
    """
    Saves the extract text to the extract bucket
    File is named to match the UUID from the documents table
    """
    try:
        bytes = text.encode("utf-8")
        s3_client.put_object(Body=bytes, Bucket=extract_bucket, Key=id)
    except Exception as e:
        logger.error(f"Could not save file to the extract bucket: {e}")
        raise

    return
