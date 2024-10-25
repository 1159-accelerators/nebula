import filetype
import boto3
import logging

logger = logging.getLogger()
logger.setLevel("INFO")

client = boto3.client("s3")


def lambda_handler(event, context):
    bucket: str = event["bucket"]
    key: str = event["key"]

    response: dict = {"mime": None, "ext": None}

    logger.info("Retrieving document")

    try:
        doc: dict = client.get_object(Bucket=bucket, Key=key)

        magic_header = doc["Body"].read(amt=261)
    except Exception as e:
        logger.error(f"Could not retrieve document: {e}")
        raise

    logger.info("Getting file type")

    try:
        kind = filetype.guess(magic_header)
        if kind is None:
            logger.warning("Could not get file type")
            return response

        response["ext"] = kind.extension
        response["mime"] = kind.mime
    except Exception as e:
        logger.error(f"An error occurred getting file type: {e}")
        raise
    
    return response
