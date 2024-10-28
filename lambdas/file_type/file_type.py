from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()

mime_types: dict[str, str] = {
    "gif": "image/gif",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


@logger.inject_lambda_context
def lambda_handler(event, context: LambdaContext):

    response: dict = {"mime": "unknown", "ext": "unknown"}

    try:
        key: str = event["key"]
        ext: str = key.rsplit(".", 1)[1]
    except:
        logger.error(f"Could not find the file's extension")
        return response

    logger.info("Getting file type")

    ext = ext.lower()

    if ext in [key for key in mime_types]:
        response["ext"] = ext
        response["mime"] = mime_types[ext]

    print(response)
    return response
