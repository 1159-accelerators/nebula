import { Condition } from "./../lambdas/sample_data/node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d";
import { Construct, DependencyGroup } from "constructs";
import {
  RemovalPolicy,
  Stack,
  StackProps,
  aws_s3 as s3,
  aws_cognito as cognito,
  aws_opensearchserverless as opensearchserverless,
  aws_iam as iam,
  Aws,
  Duration,
  CfnParameter,
  custom_resources as cr,
  aws_lambda as lambda,
  aws_apigateway as apigateway,
  aws_bedrock as bedrock,
  aws_cloudfront as cloudfront,
  aws_cloudformation as cloudformation,
  CustomResource,
  Fn,
  CfnCondition,
  CfnOutput,
} from "aws-cdk-lib";
import { ViewerCertificate } from "aws-cdk-lib/aws-cloudfront";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class Kb1159Stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const publicBucket = s3.Bucket.fromBucketArn(
      this,
      "PublicBucket",
      "arn:aws:s3:::1159-public-assets"
    );

    const userEmailParam = new CfnParameter(this, "UserEmailParam", {
      type: "String",
      noEcho: false,
      description:
        "Will be used to create your Cognito account. You will receive an invitation email at this address",
      allowedPattern: "[^\\s@]+@[^\\s@]+\\.[^\\s@]+",
      constraintDescription: "Must enter a valid email address",
      minLength: 5,
    });

    const embeddingModelParam = new CfnParameter(this, "EmbeddingModelParam", {
      type: "String",
      default: "amazon.titan-embed-text-v2:0",
      description:
        "This model will be used to create embeddings from the document repository",
      allowedValues: [
        "amazon.titan-embed-text-v1",
        "amazon.titan-embed-text-v2:0",
        "cohere.embed-english-v3",
        "cohere.embed-multilingual-v3",
      ],
    });

    const foundationModelParam = new CfnParameter(
      this,
      "FoundationModelParam",
      {
        type: "String",
        default: "anthropic.claude-3-sonnet-20240229-v1:0",
        description: "Base model for the conversational interface",
        allowedValues: [
          "amazon.titan-text-premier-v1:0",
          "anthropic.claude-v2",
          "anthropic.claude-v2:1",
          "anthropic.claude-3-sonnet-20240229-v1:0",
          "anthropic.claude-3-haiku-20240307-v1:0",
          "anthropic.claude-instant-v1",
        ],
      }
    );

    const uploadParam = new CfnParameter(this, "UploadParam", {
      type: "String",
      default: "YES",
      description:
        "Uploads sample documents to your bucket. Must answer YES or NO",
      allowedValues: ["YES", "NO"],
    });

    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "General" },
            Parameters: [userEmailParam.logicalId, uploadParam.logicalId],
          },
          {
            Label: { default: "Models" },
            Parameters: [
              embeddingModelParam.logicalId,
              foundationModelParam.logicalId,
            ],
          },
        ],
        ParameterLabels: {
          [userEmailParam.logicalId]: {
            default: "What is your email address?",
          },
          [uploadParam.logicalId]: {
            default: "Upload sample documents?",
          },
          [embeddingModelParam.logicalId]: {
            default: "Embedding Model?",
          },
          [foundationModelParam.logicalId]: {
            default: "Foundation Model?",
          },
        },
      },
    };

    const kbDocsBucket = new s3.Bucket(this, "KbDocsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const corsRule: s3.CorsRule = {
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      maxAge: 300,
    };

    const kbWebBucket = new s3.Bucket(this, "KbWebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
      cors: [corsRule],
    });

    const kbUserPool = new cognito.UserPool(this, "KbUserPool", {
      deletionProtection: false,
      mfa: cognito.Mfa.OFF,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      signInCaseSensitive: false,
      email: cognito.UserPoolEmail.withCognito(),
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      enableSmsRole: false,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        phone: false,
        preferredUsername: false,
        username: false,
      },
      autoVerify: { email: true, phone: false },
      userPoolName: "KbUserPool-1159",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const kbUser = new cognito.CfnUserPoolUser(this, "KbUser", {
      userPoolId: kbUserPool.userPoolId,
      desiredDeliveryMediums: ["EMAIL"],
      username: userEmailParam.valueAsString,
    });

    const kbUserPoolClient = kbUserPool.addClient("KbUserPoolClient", {
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: Duration.minutes(180),
      authSessionValidity: Duration.minutes(5),
      enableTokenRevocation: true,
      generateSecret: false,
      idTokenValidity: Duration.minutes(180),
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(30),
      userPoolClientName: "web",
    });

    const kbCollection = new opensearchserverless.CfnCollection(
      this,
      "KbCollection",
      {
        name: "kb-collection-1159",
        description: "Collection for 11:59 Knowledge Base",
        standbyReplicas: "DISABLED",
        type: "VECTORSEARCH",
      }
    );

    const kbCollectionEncryptionPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "KbCollectionEncryptionPolicy",
        {
          policy: JSON.stringify({
            Rules: [
              {
                Resource: ["collection/kb-collection-1159"],
                ResourceType: "collection",
              },
            ],
            AWSOwnedKey: true,
          }),
          type: "encryption",
          description: "Encryption policy for Knowledge Base Collection",
          name: "kb-encryption-policy-1159",
        }
      );

    const kbCollectionNetworkPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "KbCollectionNetworkPolicy",
        {
          policy: JSON.stringify([
            {
              Rules: [
                {
                  Resource: ["collection/kb-collection-1159"],
                  ResourceType: "dashboard",
                },
                {
                  Resource: ["collection/kb-collection-1159"],
                  ResourceType: "collection",
                },
              ],
              AllowFromPublic: true,
            },
          ]),
          type: "network",
          description: "Network policy for Knowledge Base Collection",
          name: "kb-network-policy-1159",
        }
      );

    const kbCollectionAccessPolicy = new opensearchserverless.CfnAccessPolicy(
      this,
      "KbCollectionAccessPolicy",
      {
        policy: JSON.stringify([
          {
            Rules: [
              {
                Resource: ["collection/kb-collection-1159"],
                Permission: [
                  "aoss:DescribeCollectionItems",
                  "aoss:CreateCollectionItems",
                  "aoss:UpdateCollectionItems",
                ],
                ResourceType: "collection",
              },
              {
                Resource: ["index/kb-collection-1159/*"],
                Permission: [
                  "aoss:UpdateIndex",
                  "aoss:DescribeIndex",
                  "aoss:ReadDocument",
                  "aoss:WriteDocument",
                  "aoss:CreateIndex",
                ],
                ResourceType: "index",
              },
            ],
            Principal: [
              `arn:aws:iam::${Aws.ACCOUNT_ID}:role/service-role/KbBedrockRole-1159`,
              `arn:aws:iam::${Aws.ACCOUNT_ID}:role/service-role/KbCreateIndexRole-1159`,
              `arn:aws:iam::${Aws.ACCOUNT_ID}:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_AWSAdministratorAccess_dd6fb7b2f244b79a`,
            ],
          },
        ]),
        type: "data",
        description: "Access policy for Knowledge Base Collection",
        name: "kb-access-policy-1159",
      }
    );

    const kbCollectionDepencyGroup = new DependencyGroup();
    kbCollectionDepencyGroup.add(kbCollectionEncryptionPolicy);
    kbCollectionDepencyGroup.add(kbCollectionNetworkPolicy);
    kbCollectionDepencyGroup.add(kbCollectionAccessPolicy);

    kbCollection.node.addDependency(kbCollectionDepencyGroup);

    kbCollection.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const kbCreateIndexPolicy = new iam.ManagedPolicy(
      this,
      "KbCreateIndexPolicy",
      {
        managedPolicyName: "KbIndexFunctionPolicy-1159",
        path: "/service-role/",
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "cloudformation:SignalResource",
                "cloudformation:DescribeStackResource",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["aoss:APIAccessAll"],
              resources: [kbCollection.attrArn],
            }),
          ],
        }),
      }
    );

    const kbCreateIndexRole = new iam.Role(this, "KbCreateIndexRole", {
      roleName: "KbCreateIndexRole-1159",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [kbCreateIndexPolicy],
    });

    const kbCreateIndexFunction = new lambda.Function(
      this,
      "KbCreateIndexFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromBucket(
          publicBucket,
          `kb-accelerator/${process.env.npm_package_version}/lambdas/create_index.zip`
        ),
        handler: "create_index.handler",
        functionName: "KbCreateIndexFunction-1159",
        role: kbCreateIndexRole,
        environment: {
          REGION: `${Aws.REGION}`,
          ENDPOINT: kbCollection.attrCollectionEndpoint,
        },
        timeout: Duration.seconds(600),
      }
    );

    const kbCreateIndexCr = new CustomResource(this, "KbCreateIndexCr", {
      serviceToken: kbCreateIndexFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const kbBedrockPolicy = new iam.ManagedPolicy(this, "KbBedrockPolicy", {
      managedPolicyName: "KbBedrockPolicy-1159",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["aoss:APIAccessAll"],
            resources: [kbCollection.attrArn],
          }),
          new iam.PolicyStatement({
            actions: ["bedrock:InvokeModel"],
            resources: [
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/${embeddingModelParam.valueAsString}`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/${foundationModelParam.valueAsString}`,
            ],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket", "s3:GetObject"],
            resources: [kbDocsBucket.bucketArn, `${kbDocsBucket.bucketArn}/*`],
          }),
          new iam.PolicyStatement({
            actions: [
              "bedrock:RetrieveAndGenerate",
              "bedrock:ListFoundationModels",
              "bedrock:ListCustomModels",
              "bedrock:Retrieve",
            ],
            resources: ["*"],
          }),
        ],
      }),
    });

    const kbBedrockRole = new iam.Role(this, "KbBedrockRole", {
      roleName: "KbBedrockRole-1159",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      managedPolicies: [kbBedrockPolicy],
    });

    const kb = new bedrock.CfnKnowledgeBase(this, "KB", {
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${embeddingModelParam.valueAsString}`,
        },
      },
      name: "kb-1159",
      roleArn: kbBedrockRole.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: kbCollection.attrArn,
          fieldMapping: {
            metadataField: "BEDROCK_METADATA",
            textField: "BEDROCK_TEXT_CHUNK",
            vectorField: "kb-vector-1159",
          },
          vectorIndexName: "kb-index-1159",
        },
        type: "OPENSEARCH_SERVERLESS",
      },
    });

    const kbDepencyGroup = new DependencyGroup();
    kbDepencyGroup.add(kbCollection);
    kbDepencyGroup.add(kbBedrockRole);
    kbDepencyGroup.add(kbCreateIndexCr);

    kb.node.addDependency(kbDepencyGroup);

    const kbDataSource = new bedrock.CfnDataSource(this, "KbDataSource", {
      name: "kb-source-1159",
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      dataDeletionPolicy: "DELETE",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: kbDocsBucket.bucketArn,
          bucketOwnerAccountId: `${Aws.ACCOUNT_ID}`,
        },
      },
    });

    const kbWebApiPolicy = new iam.ManagedPolicy(this, "KbWebApiPolicy", {
      managedPolicyName: "KbWebApiPolicy-1159",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket"],
            resources: [kbDocsBucket.bucketArn],
          }),
          new iam.PolicyStatement({
            actions: [
              "bedrock:GetAgentKnowledgeBase",
              "bedrock:GetKnowledgeBase",
              "bedrock:GetDataSource",
            ],
            resources: [kb.attrKnowledgeBaseArn],
          }),
          new iam.PolicyStatement({
            actions: [
              "bedrock:RetrieveAndGenerate",
              "bedrock:Retrieve",
              "bedrock:InvokeModel",
            ],
            resources: ["*"],
          }),
        ],
      }),
    });

    const kbWebApiRole = new iam.Role(this, "KbWebApiRole", {
      roleName: "KbWebApiRole-1159",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [kbWebApiPolicy],
    });

    const kbWebApiFunction = new lambda.Function(this, "KbWebApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `kb-accelerator/${process.env.npm_package_version}/lambdas/web_api.zip`
      ),
      handler: "web_api.handler",
      functionName: "KbWebApiFunction-1159",
      role: kbWebApiRole,
      environment: {
        DOCS_BUCKET: kbDocsBucket.bucketName,
        KB_ID: kb.attrKnowledgeBaseId,
        DATA_SOURCE_ID: kbDataSource.attrDataSourceId,
        FOUNDATION_MODEL_ARN: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${foundationModelParam.valueAsString}`,
      },
      timeout: Duration.seconds(30),
    });

    kbWebApiFunction.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const kbApiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "KbApiAuthorizer",
      {
        cognitoUserPools: [kbUserPool],
        authorizerName: "KbAuthorizer-1159",
      }
    );

    const kbApi = new apigateway.LambdaRestApi(this, "KbApi", {
      restApiName: "KbApi-1159",
      handler: kbWebApiFunction,
      retainDeployments: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      defaultMethodOptions: {
        authorizer: kbApiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
      deploy: false,
      proxy: true,
    });

    kbApiAuthorizer._attachToApi(kbApi);

    const kbApiDeployment = new apigateway.Deployment(this, "KbApiDeployment", {
      api: kbApi,
    });

    const kbApiStagee = new apigateway.Stage(this, "KbApiStage", {
      deployment: kbApiDeployment,
      stageName: "prod",
    });

    kbApi.addGatewayResponse("KbApiUnauthorizedResponse", {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: "401",
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Methods": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type, Authorization'",
        //"Access-Control-Allow-Credentials": 'true'
      },
      templates: {
        "application/json": '{"message":$context.error.messageString}',
      },
    });

    const kbSampleDataPolicy = new iam.ManagedPolicy(
      this,
      "KbSampleDataPolicy",
      {
        managedPolicyName: "KbSampleDataPolicy-1159",
        path: "/service-role/",
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "cloudformation:SignalResource",
                "cloudformation:DescribeStackResource",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["s3:ListBucket", "s3:GetObject"],
              resources: [
                publicBucket.bucketArn,
                `${publicBucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ["s3:PutObject"],
              resources: [`${kbDocsBucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              actions: ["bedrock:StartIngestionJob"],
              resources: [kb.attrKnowledgeBaseArn],
            }),
          ],
        }),
      }
    );

    const kbSampleDataRole = new iam.Role(this, "KbSampleDataRole", {
      roleName: "KbSampleDataRole-1159",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [kbSampleDataPolicy],
    });

    const kbSampleDataFunction = new lambda.Function(
      this,
      "KbSampleDataFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromBucket(
          publicBucket,
          `kb-accelerator/${process.env.npm_package_version}/lambdas/sample_data.zip`
        ),
        handler: "sample_data.handler",
        functionName: "KbSampleDataFunction-1159",
        role: kbSampleDataRole,
        environment: {
          VERSION: `${process.env.npm_package_version}`,
          DOCS_BUCKET: kbDocsBucket.bucketName,
          KB_ID: kb.attrKnowledgeBaseId,
          DATA_SOURCE_ID: kbDataSource.attrDataSourceId,
        },
        timeout: Duration.seconds(120),
      }
    );

    const kbSampleDataCr = new CustomResource(this, "KbSampleDataCr", {
      serviceToken: kbSampleDataFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const kbSampleDataCondition = new CfnCondition(
      this,
      "KbSampleDataCondition",
      {
        expression: Fn.conditionEquals(uploadParam.valueAsString, "YES"),
      }
    );

    const kbSampleDataPolicyCfn = kbSampleDataPolicy.node
      .defaultChild as iam.CfnManagedPolicy;
    kbSampleDataPolicyCfn.cfnOptions.condition = kbSampleDataCondition;

    const kbSampleDataRoleCfn = kbSampleDataRole.node
      .defaultChild as iam.CfnRole;
    kbSampleDataRoleCfn.cfnOptions.condition = kbSampleDataCondition;

    const kbSampleDataFunctionCfn = kbSampleDataFunction.node
      .defaultChild as lambda.CfnFunction;
    kbSampleDataFunctionCfn.cfnOptions.condition = kbSampleDataCondition;

    const kbSampleDataCrCfn = kbSampleDataCr.node
      .defaultChild as cloudformation.CfnCustomResource;
    kbSampleDataCrCfn.cfnOptions.condition = kbSampleDataCondition;

    const kbOai = new cloudfront.OriginAccessIdentity(this, "KbOai");

    const kbDistro = new cloudfront.CloudFrontWebDistribution(
      this,
      "KbDistro",
      {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: kbWebBucket,
              originAccessIdentity: kbOai,
            },
            behaviors: [
              { isDefaultBehavior: true },
              {
                allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
                pathPattern: "/*",
              },
            ],
          },
        ],
        defaultRootObject: "index.html",
        enabled: true,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        viewerCertificate:
          cloudfront.ViewerCertificate.fromCloudFrontDefaultCertificate(),
      }
    );

    const kbCopySitePolicy = new iam.ManagedPolicy(this, "KbCopySitePolicy", {
      managedPolicyName: "KbCopySitePolicy-1159",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "cloudformation:SignalResource",
              "cloudformation:DescribeStackResource",
            ],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket", "s3:GetObject"],
            resources: [publicBucket.bucketArn, `${publicBucket.bucketArn}/*`],
          }),
          new iam.PolicyStatement({
            actions: ["s3:PutObject"],
            resources: [`${kbWebBucket.bucketArn}/*`],
          }),
        ],
      }),
    });

    const kbCopySiteRole = new iam.Role(this, "KbCopySiteRole", {
      roleName: "KbCopySiteRole-1159",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [kbCopySitePolicy],
    });

    const kbCopySiteFunction = new lambda.Function(this, "KbCopySiteFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `kb-accelerator/${process.env.npm_package_version}/lambdas/copy_site.zip`
      ),
      handler: "copy_site.handler",
      functionName: "KbCopySiteFunction-1159",
      role: kbCopySiteRole,
      environment: {
        VERSION: `${process.env.npm_package_version}`,
        WEB_BUCKET: kbWebBucket.bucketName,
        API_URL: kbApiStagee.urlForPath(),
        USER_POOL_ID: kbUserPool.userPoolId,
        USER_POOL_CLIENT_ID: kbUserPoolClient.userPoolClientId,
      },
      timeout: Duration.seconds(120),
    });

    const kbCopySiteCr = new CustomResource(this, "KbCopySiteCr", {
      serviceToken: kbCopySiteFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const kbDistoOutput = new CfnOutput(this, "WebUrl", {
      description: "CloudFront Web URL for the demo application",
      value: kbDistro.distributionDomainName,
    });
  }
}
