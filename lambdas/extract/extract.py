from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_s3.client import S3Client
from mypy_boto3_textract.client import TextractClient
from mypy_boto3_stepfunctions.client import SFNClient
import boto3
import json
import os

logger = Logger()

rds_client: RDSDataServiceClient = boto3.client("rds-data")
s3_client: S3Client = boto3.client("s3")
sfn_client: SFNClient = boto3.client("stepfunctions")
textract_client: TextractClient = boto3.client("textract")


def save_extract_token(
    id: str, token: str, cluster_arn: str, secret_arn: str, client: RDSDataServiceClient
) -> None:
    #! Saves the Task Token produces by the state machine into the documents table.
    #! Value is stored in column extract_token of the document being processed
    client.execute_statement(
        database="nebula",
        secretArn=secret_arn,
        resourceArn=cluster_arn,
        sql=(f"UPDATE documents SET extract_token = '{token}' WHERE id = '{id}'"),
    )


def get_extract_token(
    id: str, cluster_arn: str, secret_arn: str, client: RDSDataServiceClient
) -> None:
    #! Saves the Task Token produces by the state machine into the documents table.
    #! Value is stored in column extract_token of the document being processed
    response = client.execute_statement(
        database="nebula",
        secretArn=secret_arn,
        resourceArn=cluster_arn,
        sql=(f"SELECT extract_token FROM documents WHERE id = '{id}'"),
    )

    return response


def start_textract_detection(
    id: str,
    bucket: str,
    key: str,
    utility_bucket: str,
    topic_arn: str,
    role_arn: str,
    client: TextractClient,
):
    #! Calls Textract asynchronously to start text detection
    client.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
        JobTag=id,
        NotificationChannel={"SNSTopicArn": topic_arn, "RoleArn": role_arn},
        OutputConfig={"S3Bucket": utility_bucket},
    )

def get_textract_detection(job_id: str):
    response = textract_client.get_document_text_detection(
        JobId=job_id,
        MaxResults=1000,
    )
    
    return response


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict, context: LambdaContext):
    cluster_arn = os.environ["CLUSTER_ARN"]
    secret_arn = os.environ["SECRET_ARN"]
    extract_bucket = os.environ["EXTRACT_BUCKET"]
    role_arn = os.environ["ROLE_ARN"]
    topic_arn = os.environ["TOPIC_ARN"]
    utility_bucket = os.environ["UTILITY_BUCKET"]

    #! Matches if taskToken is contained within the event
    #! This flow handles events sent from the state machine
    if "taskToken" in event.keys():
        logger.info("taskToken found in event")
        try:
            bucket = event["doc"]["bucket"]
            key = event["doc"]["key"]
            ext = event["fileType"]["ext"]
            id = event["id"]
            token = event["taskToken"]

        except Exception as e:
            logger.error(f"Invalid event: {e}")
            raise

        #! Only sends native PDFs to Textract
        #! Documents converted into PDFs for processing will have
        #! their text extracted in other ways
        if ext == "pdf":
            try:
                logger.info("Updating DB record with step function task token")
                save_extract_token(
                    id=id,
                    token=token,
                    cluster_arn=cluster_arn,
                    secret_arn=secret_arn,
                    client=rds_client,
                )

                logger.info("Starting Textract text detection")
                start_textract_detection(
                    id=id,
                    bucket=bucket,
                    key=key,
                    utility_bucket=utility_bucket,
                    topic_arn=topic_arn,
                    role_arn=role_arn,
                    client=textract_client,
                )
            except Exception as e:
                raise

            return

    if "Records" in event.keys():
        record = event["Records"][0]
        message = json.loads(record["Sns"]["Message"])
        try:
            logger.info("Getting DB record")
            db_response = get_extract_token(
                id=message["JobTag"],
                cluster_arn=cluster_arn,
                secret_arn=secret_arn,
                client=rds_client,
            )

            token = db_response["records"][0][0]["stringValue"]

            logger.info(f"retrieved token {token}")

            logger.info("Checking Textract job status")

            if message["Status"] == "SUCCEEDED":
                logger.info("Textract job succeeded")

                text = get_textract_detection(job_id=message["JobId"])

                logger.info(text)

                sfn_client.send_task_success(
                    taskToken=token,
                    output=json.dumps({"jobId": message["JobId"]})
                )
            else:
                logger.info("Textract job failed")

                sfn_client.send_task_failure(
                    taskToken=token,
                    cause=json.dumps("Textract job failed")
                )
        except Exception as e:
            raise

        return

    return
