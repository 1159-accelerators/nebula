import boto3
import os
import cfnresponse
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from mypy_boto3_rds_data.client import RDSDataServiceClient
from typing import Any

logger = Logger()

SECRET_ARN = os.environ["SECRET_ARN"]
CLUSTER_ARN = os.environ["CLUSTER_ARN"]
DATABASE = os.environ["DATABASE"]
DISTANCE_FUNCTION = os.environ.get("DISTANCE_FUNCTION", "Cosine")
VECTOR_SIZE = os.environ.get("VECTOR_SIZE", "1024")

client: RDSDataServiceClient = boto3.client("rds-data")  # type: ignore


def execute_sql(sql: str) -> None:
    """Execute a SQL statement using the RDS Data API."""
    try:
        client.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            sql=sql,
            database=DATABASE,
        )
    except Exception as e:
        logger.error(f"Failed to execute SQL: {sql}")
        raise e


def create_extensions() -> None:
    """Create necessary database extensions."""
    extensions = ["vector", "uuid-ossp"]
    for ext in extensions:
        logger.info(f"Creating {ext} extension")
        execute_sql(f'CREATE EXTENSION IF NOT EXISTS "{ext}"')


def create_documents_table() -> None:
    """Create the documents table."""
    logger.info("Creating documents table")
    sql = """
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      region VARCHAR(32) NOT NULL,
      bucket VARCHAR(1024) NOT NULL,
      key VARCHAR(1024) NOT NULL,
      name VARCHAR(1024) NOT NULL,
      mime VARCHAR(256),
      size BIGINT NOT NULL,
      ext VARCHAR(32),
      summary TEXT,
      extract_token VARCHAR(1024),
      extract_status VARCHAR(32),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    execute_sql(sql)


def create_embeddings_table() -> None:
    """Create the documents_embeddings table and its index."""
    logger.info("Creating embeddings table")
    sql = f"""
    CREATE TABLE IF NOT EXISTS documents_embeddings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
      embedding VECTOR({VECTOR_SIZE}) NOT NULL,
      text TEXT NOT NULL
    )
    """
    execute_sql(sql)

    logger.info("Creating vector index")

    distance_index = (
        "vector_l2_ops" if DISTANCE_FUNCTION == "L2" else "vector_cosine_ops"
    )

    sql = f"""
    CREATE INDEX IF NOT EXISTS documents_embeddings_embedding_idx 
    ON documents_embeddings USING hnsw (embedding {distance_index}) 
    WITH (ef_construction=256)
    """
    execute_sql(sql)

    logger.info("Creating document_id index")
    sql = """
    CREATE INDEX IF NOT EXISTS documents_embeddings_document_id_idx 
    ON documents_embeddings (document_id) 
    """
    execute_sql(sql)


def setup_database() -> None:
    """Set up the database by creating extensions and tables."""
    create_extensions()
    create_documents_table()
    create_embeddings_table()


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event: dict[str, Any], context: LambdaContext) -> None:
    if event["RequestType"] in ["Delete", "Update"]:
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {"Status": "Done"})
        return

    try:
        setup_database()
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {"Status": "Done"})
    except Exception as e:
        logger.error(f"An error occurred: {e}")
        cfnresponse.send(
            event,
            context,
            cfnresponse.FAILED,
            {"Status": "Error", "Message": str(e)},
        )
        raise
