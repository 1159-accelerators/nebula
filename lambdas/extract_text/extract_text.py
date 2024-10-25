import boto3
import logging
import pypandoc
import os

logger = logging.getLogger()
logger.setLevel("INFO")

s3_client = boto3.client("s3")

def lambda_handler(event, context):
  bucket: str = event["bucket"]
  key: str = event["key"]
  ext: str = event["ext"]
  id: str = event["id"]

  try:
    doc: dict = s3_client.get_object(Bucket=bucket, Key=key)
    doc_data = doc["Body"].read()
    plain: str = pypandoc.convert_file(doc_data, 'plain', format=ext)
    plain_bytes = plain.encode('utf-8')

    s3_client.put_object(Body=plain_bytes, Bucket=os.environ["EXTRACT_BUCKET"], Key=id)
  except Exception as e:
    logger.error(f"Could not extract text: {e}")
    raise



