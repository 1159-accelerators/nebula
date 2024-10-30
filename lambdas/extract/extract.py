from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from typing import Type
from boto3
import boto3
import os

logger = Logger()

s3_client = boto3.client("s3")
textract_client = boto3.client('textract')


def save_extract_token(id: str, token: str, cluster_arn: str, client: Type[boto3.client]) -> None:
    try: 
      response = client.execute_statement(
          database='nebula'

      )
    except Exception as e:
        logger.error(f"Could not store token in DB record: {e}")
        raise


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: LambdaContext):
    if "taskToken" in event.keys():
        try:
            bucket = event["doc"]["bucket"]
            key = event["doc"]["key"]
            ext = event["fileType"]["ext"]
            id = event["id"]

            cluster_arn = os.environ["CLUSTER_ARN"]
            utility_bucket = os.environ["UTILITY_BUCKET"]

        except Exception as e:
            logger.error(f"Invalid event: {e}")
            raise
