import os
from diagrams import Cluster, Diagram, Edge
from diagrams.custom import Custom
from diagrams.aws.storage import S3
from diagrams.aws.compute import Lambda, LambdaFunction
from diagrams.aws.database import Aurora
from diagrams.aws.ml import Sagemaker, Textract
from diagrams.aws.integration import SNS
from diagrams.aws.network import APIGateway, CF
from diagrams.aws.security import Cognito
from diagrams.onprem.client import User
from diagrams.programming.flowchart import Action, Decision, Delay, Document, Or
from diagrams.programming.framework import Vue

with Diagram("Nebula V2", outformat="png", filename="diagram"):

    #! Storage
    with Cluster("Storage"):
      extract_bucket = S3("Extract Bucket")
      thumb_bucket = S3("Thumbnails")
      db = Aurora("PostgreSQL Serverless")
      inbound_bucket = S3("Docs Bucket")

    with Cluster("Web"):
        user = User("User")

        with Cluster("Client"):
            client = Vue("Client")
            auth = Cognito("Auth")
            web_bucket = S3("Web Assets")
            distro = CF("Web Distribution")

            user >> client << distro >> web_bucket

        with Cluster("API"):
            api = APIGateway("API")
            (
                api
                >> [
                    LambdaFunction("/search"),
                    LambdaFunction("/docs"),
                    LambdaFunction("/chat"),
                ]
                >> db
            )
            client >> auth >> api

    with Cluster("Data Processing"):
        filter = Custom("Filter Data", "./icons/filter-outline.png")
        file_type = Lambda("Get File Type")
        create_record = Custom("Save Record", "./icons/content-save-outline.png")
        file_type_choice = Custom("File Type?", "./icons/call-split-custom.png")

        with Cluster("Images"):
            image_summary = Sagemaker("Create Summary")
            image_thumb = Lambda("Create Thumbnail")

            image_summary >> db
            image_thumb >> thumb_bucket

        with Cluster("Office Files"):
            office_convert = Lambda("LibreOffice")
            office_extract = Lambda("Extract Text")
            office_thumb = Lambda("Create Thumbnail")
            office_summary = Sagemaker("Create Summary")

            office_convert >> office_extract >> office_summary >> db
            office_convert >> office_thumb >> thumb_bucket
        
    


    #! Web Components

    #! Data Processing Flow
    inbound_bucket >> filter >> file_type >> create_record >> db
    create_record >> file_type_choice
    file_type_choice >> [image_summary, image_thumb]

    # Client Web Flow
