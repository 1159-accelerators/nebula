import logging
import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_aws import BedrockEmbeddings

logger = logging.getLogger()
logger.setLevel("INFO")

bedrock_client = BedrockEmbeddings(
    model_id=os.environ["MODEL"], region_name=os.environ["REGION"]
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000, chunk_overlap=0, length_function=len
)


def lambda_handler(event, context):
    text: str = event["text"]

    try:
        logger.info("Splitting text")
        split_text: list[str] = text_splitter.split_text(text)

        logger.info("Creating embeddings")
        embeddings = bedrock_client.embed_documents(split_text)

        return embeddings
    except Exception as e:
        logger.error(f"Could not create embeddings: {e}")
        raise
