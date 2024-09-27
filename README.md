# Nebula Knowledge Base
Welcome to the Nebula Knowledge Base, which provides contextual chat capabilities to help you query and understand your enterprise documents effectively. 
With deployment made simple through CloudFormation, you can get started in just a few clicks. 
It is fully contained within your environment, ensuring that your data remains secure at all times.


## Deploying the Stack
The application can be deployed by simply clicking `Deploy the Stack` below. This link will take you directly to the CloudFormation console with the proper template preloaded.  
  
Due to origin limitations around lambda zip files delivered using S3, Nebula can only be deployed in the following regions. If you require deploying to a region not on the list, just let us know at 
accelerators@1159.ai  

- US-EAST-1
- US-WEST-2
- CA-CENTRAL-1

Once the stack creation is complete, the output `WebUrl` can be found in the Output tab with CloudFormation. Following this link should take you to the application 
and you can login with the temporary password that was sent to the user email provided during deployment

**Note: You must have access to the chosen models BEFORE deploying this application.** To gain access to the necessary models, please reference 
[Manage access to Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) in the Bedrock User Guide  

**[Deploy the Stack](https://console.aws.amazon.com/cloudformation/home?#/stacks/new?stackName=KB-Demo-1159&templateURL=https://1159-public-assets.s3.amazonaws.com/kb-accelerator/1.2.0/template.json)**

#### CloudFormation Parameters
##### User Email
This will be used to create the initial Cognito user and a temporary password 
will be sent to this address during the deployment

##### Upload Sample Documents
Don't worry, it's just a couple of documents about [11:59](https://1159.ai), so storage consumption
should not be an issue

##### Embedding Model
These are the embeddings models available to choose:
- amazon.titan-embed-text-v1
- **amazon.titan-embed-text-v2:0**
- cohere.embed-english-v3
- cohere.embed-multilingual-v3

##### Foundation Model
These are the LLMs available to choose:
- amazon.titan-text-premier-v1:0
- anthropic.claude-v2
- anthropic.claude-v2:1
- **anthropic.claude-3-sonnet-20240229-v1:0**
- anthropic.claude-3-haiku-20240307-v1:0
- anthropic.claude-instant-v1

## Component Details
#### Backend
- [API Gateway](https://aws.amazon.com/api-gateway/)
- [Bedrock](https://aws.amazon.com/bedrock/)
- [CloudFront](https://aws.amazon.com/cloudfront/)
- [Cognito](https://aws.amazon.com/cognito/)
- [Lambda](https://aws.amazon.com/lambda/)
- [OpenSearch](https://aws.amazon.com/opensearch-service/)
- [S3](https://aws.amazon.com/s3/)

#### Frontend
- [Quasar Framework](https://quasar.dev/)
- [Vue.js](https://vuejs.org/)

#### Architecture
![Architeture Diagram](/client/public/diagram.png "Architecture Diagram")

## Building Your Own
#### Install the Prerequisites
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Node.js](https://nodejs.org/en/download/package-manager)

#### Create an AWS CLI Profile
Nebula uses AWS profiles in order to authenticate to AWS, and, by default, the profile is named `shared-services`. 
If you have a different name for your profile you must change all references to `shared-services` in 
the top-level `package.json` file.

#### Create or Set the Source Bucket
We designed Nebula to be deployable using nothing but a CloudFormation link, and because of that, 
all artifacts are built and then uploaded to an S3 bucket for distribution. We're using a bucket called 
`1159-public-assets` which obviously needs to be changed to your chosen bucket. References to the bucket 
are located in the following files:
- package.json
- lib/nebula-stack.ts

#### Build the App
After you've installed the prerequisites, set your AWS profile, and created the source bucket you can simple run 
`npm run build` to build the application. This is a cascading command that kicks off multiple other tasks in the `package.json` file.
1. Compiles the TypeScript lambdas using [esbuild](https://esbuild.github.io/)
2. Compiles the Quasar client
3. Archives the lambdas into zip files
4. Synthesizes the CDK project to CloudFormation
5. Uploads the CF templates, client assets, lambdas, and sample data to the source bucket

After the build is complete, you should find the final CloudFormation file in your source bucket 
under `nebula/{version}/template.json`
