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

with Diagram("Nebula V2 - Data Processing", outformat="png", filename="data-processing"):

    #! Storage
    thumb_bucket = S3("Thumbnails")
    db = Aurora("PostgreSQL\n(Aurora Serverless)")
    
    inbound_bucket = S3("Docs Bucket")


    with Cluster("Step Function"):
        filter = Action("Filter Data")
        file_type = Lambda("Get File Type")
        create_record = Action("Create DB Record")
        file_type_choice = Decision("File Type?")
        thumb = Lambda("Generate Thumbnail")
        convert = Lambda("Convert to PDF")
        extract_choice = Decision("Extract Text?")
        extract_start = Lambda("Start Text Extraction")
        summary = Sagemaker("Get Summary")
        save_summary = Action("Save Summary")
        embeddings = Lambda("Generate Embeddings")
        save_embeddings = Action("Save Embeddings")

    extract_text = Textract("Extract Text\n(Async)")
    extract_topic = SNS("Notify on Finish")

        
        
    


    #! Web Components

    #! Data Processing Flow
    inbound_bucket >> filter >> file_type >> create_record >> db # type: ignore
    create_record >> file_type_choice # type: ignore
    file_type_choice >> Edge(label="Images or PDFs") >> thumb # type: ignore
    file_type_choice >> Edge(label="Office Files") >> convert >> thumb # type: ignore
    thumb >> thumb_bucket # type: ignore
    thumb >> extract_choice # type: ignore
    extract_choice >> Edge(label="No") >> summary >> save_summary >> db # type: ignore
    extract_choice >> Edge(label="Yes") >> extract_start >> extract_text >> extract_topic >> extract_start >> summary # type: ignore
    save_summary >> embeddings >> save_embeddings >> db # type: ignore


    # Client Web Flow
