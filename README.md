# Nebula Knowledge Base
Welcome to the Nebula Knowledge Base Demo! This application offers an easy-to-use and responsive web interface that ensures a seamless user experience. 
With deployment made simple through CloudFormation, you can get started in just a few clicks. Our application provides contextual chat capabilities to help you query and understand your enterprise documents effectively. 
It is fully contained within your environment, ensuring that your data remains secure at all times.
## Overview
### Architecture
![Architeture Diagram](/client/public/diagram.png "Architecture Diagram")
### Components
This list is not comprehensive, but should provide a high-level overview of the services deployed
for the application. In addition to the resources listed below, a number of named roles and policies are created
as part of the deployment. They are all suffixed with 1159 for easy identification
| Name | Type | Description |
| ---- | ---- | ----------- |
| kb-1159 | Bedrock Knowledge Base | Primary component for document intelligence |
| [stack name]-kbdocsbucket* | S3 Bucket | Document repository and data source for `kb-1159` |
| [stack name]-kbwebbucket* | S3 Bucket | Web assets for client |
| KbCopySiteFunction-1159 | Lambda Function | Copies assets from source to `kbwebbucket` |
| KbCreateIndexFunction-1159 | Lambda Function | Creates the `kb-index-1159` OpenSearch index |
| KbSampleDataFunction-1159 | Lambda Function | Copies the same data from the source to `kbdocsbucket` |
| KbWebApiFunction-1159 | Lambda Function | Proxy lambda for `KbApi-1159` |
| kb-collection-1159 | OpenSearch Collection | Serverless collection that contains `kb-index-1159` |
| kb-index-1159 | OpenSearch Index | Vector index for storing embeddings |
| KbUserPool-1159 | Cognito User Pool | Provides authentication for the application |

### Regions
The demo is currently limited to deployments in the following regions:
- US-EAST-1
- US-WEST-2
- CA-CENTRAL-1

If you would like to deploy to a region not on the list, just let us know at 
accelerators@1159.ai

## Deploying the Stack
The application can be deployed simply by using this 
[link](https://console.aws.amazon.com/cloudformation/home?#/stacks/new?stackName=KB-Demo-1159&templateURL=https://1159-public-assets.s3.amazonaws.com/kb-accelerator/1.2.0/template.json).
Once the stack creation is complete, the output `WebUrl` can be found in the Output tab with CloudFormation. Following this link should take you to the application 
and you can login with the temporary password that was sent to the user email provided during deployment

**Note: You must have access to the chosen models BEFORE deploying this application.** To gain access to the necessary models, please reference 
[Manage access to Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) in the Bedrock User Guide

### Parameters
#### User Email
This will be used to create the initial Cognito user and a temporary password 
will be sent to this address during the deployment

#### Upload Sample Documents
Don't worry, it's just a couple of documents about [11:59](https://1159.ai), so storage consumption
should not be an issue

#### Embedding Model
These are the embeddings models available to choose:
- amazon.titan-embed-text-v1
- **amazon.titan-embed-text-v2:0**
- cohere.embed-english-v3
- cohere.embed-multilingual-v3

#### Foundation Model
These are the LLMs available to choose:
- amazon.titan-text-premier-v1:0
- anthropic.claude-v2
- anthropic.claude-v2:1
- **anthropic.claude-3-sonnet-20240229-v1:0**
- anthropic.claude-3-haiku-20240307-v1:0
- anthropic.claude-instant-v1