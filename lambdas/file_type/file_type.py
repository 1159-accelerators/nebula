import os
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()

mime_types = {
    "gif": "image/gif",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

DEFAULT_RESPONSE = {"mime": "unknown", "ext": "unknown"}


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context: LambdaContext):
    key = event.get("key", "")
    _, ext = os.path.splitext(key)
    ext = ext.lstrip(".").lower()

    if not ext:
        logger.error("Could not find the file's extension")
        return DEFAULT_RESPONSE

    logger.info("Getting file type")

    if ext in mime_types:
        return {"ext": ext, "mime": mime_types[ext]}

    return DEFAULT_RESPONSE
