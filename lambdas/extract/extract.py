from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_rds_data.client import RDSDataServiceClient
from mypy_boto3_rds_data.type_defs import ExecuteStatementResponseTypeDef
from mypy_boto3_s3.client import S3Client
from typing import Any
from pypdfium2 import PdfDocument, PdfTextPage
import boto3
import json
import os

logger = Logger()

# rds_client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore
s3_client: S3Client = boto3.client("s3")  # type: ignore
# sfn_client: SFNClient = boto3.client("stepfunctions")  # type: ignore
# textract_client: TextractClient = boto3.client("textract")  # type: ignore

UTILITY_BUCKET = os.environ["UTILITY_BUCKET"]


# def save_extract_token(id: str, token: str, cluster_arn: str, secret_arn: str) -> None:
#     """Save the Task Token in the documents table."""
#     sql = f"UPDATE documents SET extract_token = '{token}' WHERE id = '{id}'"
#     rds_client.execute_statement(
#         database="nebula",
#         secretArn=secret_arn,
#         resourceArn=cluster_arn,
#         sql=sql,
#     )


# def get_extract_token(
#     id: str, cluster_arn: str, secret_arn: str
# ) -> ExecuteStatementResponseTypeDef:
#     """Retrieve the Task Token from the documents table."""
#     sql = f"SELECT extract_token FROM documents WHERE id = '{id}'"
#     response = rds_client.execute_statement(
#         database="nebula",
#         secretArn=secret_arn,
#         resourceArn=cluster_arn,
#         sql=sql,
#     )

#     return response


# def start_textract_detection(
#     id: str, bucket: str, key: str, utility_bucket: str, topic_arn: str, role_arn: str
# ) -> None:
#     """Start asynchronous Textract text detection."""
#     textract_client.start_document_text_detection(
#         DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
#         JobTag=id,
#         NotificationChannel={"SNSTopicArn": topic_arn, "RoleArn": role_arn},
#         OutputConfig={"S3Bucket": utility_bucket},
#     )


# def handle_state_machine_event(
#     event: dict[str, Any],
#     cluster_arn: str,
#     secret_arn: str,
#     utility_bucket: str,
#     role_arn: str,
#     topic_arn: str,
# ) -> None:
#     """Handle events sent from the state machine."""
#     bucket = event["doc"]["bucket"]
#     key = event["doc"]["key"]
#     id = event["id"]
#     token = event["taskToken"]
#     ext = event["fileType"]["ext"]

#     if ext == "pdf":
#         save_extract_token(id, token, cluster_arn, secret_arn)
#         start_textract_detection(id, bucket, key, utility_bucket, topic_arn, role_arn)

#     return


# def handle_sns_event(event: dict[str, Any], cluster_arn: str, secret_arn: str) -> None:
#     """Handle SNS events."""
#     message = json.loads(event["Records"][0]["Sns"]["Message"])
#     db_response = get_extract_token(message["JobTag"], cluster_arn, secret_arn)
#     token = db_response["records"][0][0]["stringValue"]  # type: ignore

#     if message["Status"] == "SUCCEEDED":
#         sfn_client.send_task_success(
#             taskToken=token, output=json.dumps({"jobId": message["JobId"]})
#         )
#     else:
#         sfn_client.send_task_failure(
#             taskToken=token, cause=json.dumps("Textract job failed")
#         )


def get_s3_object(bucket: str, key: str) -> bytes:
    try:
        doc = s3_client.get_object(Bucket=bucket, Key=key)
        return doc["Body"].read()
    except Exception as e:
        logger.error(f"Could not get object from S3: {e}")
        raise e


def extract_text(doc_data: bytes):
    logger.info("Extracting text from PDF")
    pdf = PdfDocument(doc_data)
    doc_text: str = ""

    for page in pdf:
        textpage: PdfTextPage = page.get_textpage()
        doc_text += textpage.get_text_bounded()

    return doc_text


def save_extracted_text(doc_text: str, id: str):
    logger.info("Putting extracted text to Utility bucket")
    try:
        bytes = doc_text.encode()
        s3_client.put_object(Body=bytes, Bucket=UTILITY_BUCKET, Key=f"pdf_output/{id}")
    except Exception as e:
        logger.error(f"Could not save thumbnail to S3: {e}")
        raise e

    return None


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    # cluster_arn = os.environ["CLUSTER_ARN"]
    # secret_arn = os.environ["SECRET_ARN"]
    # role_arn = os.environ["ROLE_ARN"]
    # topic_arn = os.environ["TOPIC_ARN"]
    bucket = event["doc"]["bucket"]
    key = event["doc"]["key"]
    id = event["dbRecord"]["id"]["StringValue"]

    try:
        # if "taskToken" in event:
        #     handle_state_machine_event(
        #         event, cluster_arn, secret_arn, utility_bucket, role_arn, topic_arn
        #     )
        # elif "Records" in event:
        #     handle_sns_event(event, cluster_arn, secret_arn)
        doc_data = get_s3_object(bucket=bucket, key=key)
        doc_text = extract_text(doc_data=doc_data)
        save_extracted_text(doc_text=doc_text, id=id)
        return {"status": "SUCCESS"}
    except Exception as e:
        logger.error(f"Error processing event: {e}")
        return {"status": "FAILED", "message": str(e)}
