import boto3
import os
import logging
import cfnresponse

logger = logging.getLogger()
logger.setLevel("INFO")

secret_arn = os.environ["SECRET_ARN"]
cluster_arn = os.environ["CLUSTER_ARN"]
database = os.environ["DATABASE"]

client = boto3.client("rds-data")


def lambda_handler(event, context):
    if event["RequestType"] == "Delete" or event["ResourceType"] == "Update":
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {"Status": "Done"})
        return
    try:
        logging.info("Creating vector extension")
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql='CREATE EXTENSION IF NOT EXISTS "vector"',
            database=database,
        )

        logging.info("Creating uuid extension")
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql='CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
            database=database,
        )

        logging.info("Creating documents table")
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql="""
            CREATE TABLE IF NOT EXISTS documents (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              region VARCHAR(32) NOT NULL,
              bucket VARCHAR(1024) NOT NULL,
              key VARCHAR(1024) NOT NULL,
              mime VARCHAR(256),
              ext VARCHAR(32),
              summary TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            database=database,
        )

        logging.info("Creating embeddings table")
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql="""
            CREATE TABLE IF NOT EXISTS documents_embeddings (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
              embedding VECTOR(1024) NOT NULL
            )
            """,
            database=database,
        )
        logging.info("Creating index")
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            sql="""
            CREATE INDEX IF NOT EXISTS documents_embeddings_embeddings_idx ON documents_embeddings USING hnsw (embeddings vector_cosine_ops) WITH (ef_construction=256)
            """,
            database=database,
        )

        cfnresponse.send(event, context, cfnresponse.SUCCESS, {"Status": "Done"})
        return
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        cfnresponse.send(
            event,
            context,
            cfnresponse.FAILED,
            {"Status": "Error", "Message": "Something went wrong"},
        )
        raise
