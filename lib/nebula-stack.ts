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
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class NebulaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const publicBucket = s3.Bucket.fromBucketArn(
      this,
      "PublicBucket",
      `arn:aws:s3:::1159-public-assets-${Aws.REGION}`
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

    const nebulaDocsBucket = new s3.Bucket(this, "NebulaDocsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const corsRule: s3.CorsRule = {
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
      allowedOrigins: ["*"],
      allowedHeaders: ["*"],
      maxAge: 300,
    };

    const nebulaWebBucket = new s3.Bucket(this, "NebulaWebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [corsRule],
    });

    const nebulaUserPool = new cognito.UserPool(this, "NebulaUserPool", {
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
      userPoolName: "NebulaUserPool",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const nebulaUser = new cognito.CfnUserPoolUser(this, "NebulaUser", {
      userPoolId: nebulaUserPool.userPoolId,
      desiredDeliveryMediums: ["EMAIL"],
      username: userEmailParam.valueAsString,
    });

    const nebulaUserPoolClient = nebulaUserPool.addClient("NebulaUserPoolClient", {
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

    const nebulaCollection = new opensearchserverless.CfnCollection(
      this,
      "NebulaCollection",
      {
        name: "nebula-collection",
        description: "Collection for Nebula Knowledge Base",
        standbyReplicas: "DISABLED",
        type: "VECTORSEARCH",
      }
    );

    const nebulaCollectionEncryptionPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "NebulaCollectionEncryptionPolicy",
        {
          policy: JSON.stringify({
            Rules: [
              {
                Resource: ["collection/nebula-collection"],
                ResourceType: "collection",
              },
            ],
            AWSOwnedKey: true,
          }),
          type: "encryption",
          description: "Encryption policy for Nebula Knowledge Base Collection",
          name: "nebula-encryption-policy",
        }
      );

    const nebulaCollectionNetworkPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "NebulaCollectionNetworkPolicy",
        {
          policy: JSON.stringify([
            {
              Rules: [
                {
                  Resource: ["collection/nebula-collection"],
                  ResourceType: "dashboard",
                },
                {
                  Resource: ["collection/nebula-collection"],
                  ResourceType: "collection",
                },
              ],
              AllowFromPublic: true,
            },
          ]),
          type: "network",
          description: "Network policy for Knowledge Base Collection",
          name: "nebula-network-policy",
        }
      );

    const nebulaCollectionAccessPolicy = new opensearchserverless.CfnAccessPolicy(
      this,
      "NebulaCollectionAccessPolicy",
      {
        policy: JSON.stringify([
          {
            Rules: [
              {
                Resource: ["collection/nebula-collection"],
                Permission: [
                  "aoss:DescribeCollectionItems",
                  "aoss:CreateCollectionItems",
                  "aoss:UpdateCollectionItems",
                ],
                ResourceType: "collection",
              },
              {
                Resource: ["index/nebula-collection/*"],
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
              `arn:aws:iam::${Aws.ACCOUNT_ID}:role/service-role/NebulaBedrockRole`,
              `arn:aws:iam::${Aws.ACCOUNT_ID}:role/service-role/NebulaCreateIndexRole`,
            ],
          },
        ]),
        type: "data",
        description: "Access policy for Knowledge Base Collection",
        name: "nebula-access-policy",
      }
    );

    const NebulaCollectionDepencyGroup = new DependencyGroup();
    NebulaCollectionDepencyGroup.add(nebulaCollectionEncryptionPolicy);
    NebulaCollectionDepencyGroup.add(nebulaCollectionNetworkPolicy);
    NebulaCollectionDepencyGroup.add(nebulaCollectionAccessPolicy);

    nebulaCollection.node.addDependency(NebulaCollectionDepencyGroup);

    nebulaCollection.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const nebulaCreateIndexPolicy = new iam.ManagedPolicy(
      this,
      "NebulaCreateIndexPolicy",
      {
        managedPolicyName: "NebulaCreateIndexPolicy",
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
              resources: [nebulaCollection.attrArn],
            }),
          ],
        }),
      }
    );

    const nebulaCreateIndexRole = new iam.Role(this, "NebulaCreateIndexRole", {
      roleName: "NebulaCreateIndexRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaCreateIndexPolicy],
    });

    const nebulaCreateIndexFunction = new lambda.Function(
      this,
      "NebulaCreateIndexFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/create_index.zip`
        ),
        handler: "create_index.handler",
        functionName: "NebulaCreateIndexFunction",
        role: nebulaCreateIndexRole,
        environment: {
          REGION: `${Aws.REGION}`,
          ENDPOINT: nebulaCollection.attrCollectionEndpoint,
        },
        timeout: Duration.seconds(600),
      }
    );

    const nebulaCreateIndexCr = new CustomResource(this, "NebulaCreateIndexCr", {
      serviceToken: nebulaCreateIndexFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const nebulaBedrockPolicy = new iam.ManagedPolicy(this, "NebulaBedrockPolicy", {
      managedPolicyName: "NebulaBedrockPolicy",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["aoss:APIAccessAll"],
            resources: [nebulaCollection.attrArn],
          }),
          new iam.PolicyStatement({
            actions: ["bedrock:InvokeModel"],
            resources: [
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/amazon.titan-embed-text-v1`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/amazon.titan-embed-text-v2:0`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/cohere.embed-english-v3`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/cohere.embed-multilingual-v3`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/amazon.titan-text-premier-v1:0`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/anthropic.claude-v2`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/anthropic.claude-v2:1`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
              `arn:aws:bedrock:${Aws.REGION}::foundation-model/anthropic.claude-instant-v1`,
            ],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket", "s3:GetObject"],
            resources: [nebulaDocsBucket.bucketArn, `${nebulaDocsBucket.bucketArn}/*`],
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

    const nebulaBedrockRole = new iam.Role(this, "NebulaBedrockRole", {
      roleName: "NebulaBedrockRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      managedPolicies: [nebulaBedrockPolicy],
    });

    const nebulaKb = new bedrock.CfnKnowledgeBase(this, "NebulaKB", {
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${embeddingModelParam.valueAsString}`,
        },
      },
      name: "nebula-kb",
      roleArn: nebulaBedrockRole.roleArn,
      storageConfiguration: {
        opensearchServerlessConfiguration: {
          collectionArn: nebulaCollection.attrArn,
          fieldMapping: {
            metadataField: "BEDROCK_METADATA",
            textField: "BEDROCK_TEXT_CHUNK",
            vectorField: "nebula-vector",
          },
          vectorIndexName: "nebula-index",
        },
        type: "OPENSEARCH_SERVERLESS",
      },
    });

    const nebulaDepencyGroup = new DependencyGroup();
    nebulaDepencyGroup.add(nebulaCollection);
    nebulaDepencyGroup.add(nebulaBedrockRole);
    nebulaDepencyGroup.add(nebulaCreateIndexCr);

    nebulaKb.node.addDependency(nebulaDepencyGroup);

    const nebulaDataSource = new bedrock.CfnDataSource(this, "NebulaDataSource", {
      name: "nebula-source",
      knowledgeBaseId: nebulaKb.attrKnowledgeBaseId,
      dataDeletionPolicy: "DELETE",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: nebulaDocsBucket.bucketArn,
          bucketOwnerAccountId: `${Aws.ACCOUNT_ID}`,
        },
      },
    });

    const nebulaWebApiPolicy = new iam.ManagedPolicy(this, "NebulaWebApiPolicy", {
      managedPolicyName: "NebulaWebApiPolicy",
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
            resources: [nebulaDocsBucket.bucketArn],
          }),
          new iam.PolicyStatement({
            actions: [
              "bedrock:GetAgentKnowledgeBase",
              "bedrock:GetKnowledgeBase",
              "bedrock:GetDataSource",
            ],
            resources: [nebulaKb.attrKnowledgeBaseArn],
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

    const nebulaWebApiRole = new iam.Role(this, "NebulaWebApiRole", {
      roleName: "NebulaWebApiRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaWebApiPolicy],
    });

    const nebulaWebApiFunction = new lambda.Function(this, "NebulaWebApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/web_api.zip`
      ),
      handler: "web_api.handler",
      functionName: "NebulaWebApiFunction",
      role: nebulaWebApiRole,
      environment: {
        DOCS_BUCKET: nebulaDocsBucket.bucketName,
        KB_ID: nebulaKb.attrKnowledgeBaseId,
        DATA_SOURCE_ID: nebulaDataSource.attrDataSourceId,
        FOUNDATION_MODEL_ARN: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${foundationModelParam.valueAsString}`,
        SOURCE_CHUNKS: "25",
        TEMPERATURE: "0.3",
        TOP_P: "0.9",
        MAX_TOKENS: "2048",
      },
      timeout: Duration.seconds(30),
    });

    nebulaWebApiFunction.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const nebulaApiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "NebulaApiAuthorizer",
      {
        cognitoUserPools: [nebulaUserPool],
        authorizerName: "NebulaAuthorizer",
      }
    );

    const nebulaApi = new apigateway.LambdaRestApi(this, "NebulaApi", {
      restApiName: "NebulaApi",
      handler: nebulaWebApiFunction,
      retainDeployments: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      defaultMethodOptions: {
        authorizer: nebulaApiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
      deploy: false,
      proxy: true,
    });

    nebulaApiAuthorizer._attachToApi(nebulaApi);

    const nebulaApiDeployment = new apigateway.Deployment(this, "NebulaApiDeployment", {
      api: nebulaApi,
    });

    const nebulaApiStagee = new apigateway.Stage(this, "NebulaApiStage", {
      deployment: nebulaApiDeployment,
      stageName: "prod",
    });

    nebulaApi.addGatewayResponse("NebulaApiUnauthorizedResponse", {
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

    const nebulaSampleDataPolicy = new iam.ManagedPolicy(
      this,
      "NebulaSampleDataPolicy",
      {
        managedPolicyName: "NebulaSampleDataPolicy",
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
              resources: [`${nebulaDocsBucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              actions: ["bedrock:StartIngestionJob"],
              resources: [nebulaKb.attrKnowledgeBaseArn],
            }),
          ],
        }),
      }
    );

    const nebulaSampleDataRole = new iam.Role(this, "NebulaSampleDataRole", {
      roleName: "NebulaSampleDataRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaSampleDataPolicy],
    });

    const nebulaSampleDataFunction = new lambda.Function(
      this,
      "NebulaSampleDataFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/sample_data.zip`
        ),
        handler: "sample_data.handler",
        functionName: "NebulaSampleDataFunction",
        role: nebulaSampleDataRole,
        environment: {
          VERSION: `${process.env.npm_package_version}`,
          DOCS_BUCKET: nebulaDocsBucket.bucketName,
          KB_ID: nebulaKb.attrKnowledgeBaseId,
          DATA_SOURCE_ID: nebulaDataSource.attrDataSourceId,
          SOURCE_BUCKET: publicBucket.bucketName
        },
        timeout: Duration.seconds(120),
      }
    );

    const nebulaSampleDataCr = new CustomResource(this, "NebulaSampleDataCr", {
      serviceToken: nebulaSampleDataFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const nebulaSampleDataCondition = new CfnCondition(
      this,
      "NebulaSampleDataCondition",
      {
        expression: Fn.conditionEquals(uploadParam.valueAsString, "YES"),
      }
    );

    const nebulaSampleDataPolicyCfn = nebulaSampleDataPolicy.node
      .defaultChild as iam.CfnManagedPolicy;
    nebulaSampleDataPolicyCfn.cfnOptions.condition = nebulaSampleDataCondition;

    const nebulaSampleDataRoleCfn = nebulaSampleDataRole.node
      .defaultChild as iam.CfnRole;
    nebulaSampleDataRoleCfn.cfnOptions.condition = nebulaSampleDataCondition;

    const nebulaSampleDataFunctionCfn = nebulaSampleDataFunction.node
      .defaultChild as lambda.CfnFunction;
    nebulaSampleDataFunctionCfn.cfnOptions.condition = nebulaSampleDataCondition;

    const nebulaSampleDataCrCfn = nebulaSampleDataCr.node
      .defaultChild as cloudformation.CfnCustomResource;
    nebulaSampleDataCrCfn.cfnOptions.condition = nebulaSampleDataCondition;

    const nebulaOai = new cloudfront.OriginAccessIdentity(this, "NebulaOai");

    const nebulaDistro = new cloudfront.CloudFrontWebDistribution(
      this,
      "NebulaDistro",
      {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: nebulaWebBucket,
              originAccessIdentity: nebulaOai,
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

    const nebulaCopySitePolicy = new iam.ManagedPolicy(this, "NebulaCopySitePolicy", {
      managedPolicyName: "NebulaCopySitePolicy",
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
            resources: [`${nebulaWebBucket.bucketArn}/*`],
          }),
          new iam. PolicyStatement({
            actions: ["sns:Publish"],
            resources: ["arn:aws:sns:us-east-1:010438489563:1159-accelerators-topic"]
          })
        ],
      }),
    });

    const nebulaCopySiteRole = new iam.Role(this, "NebulaCopySiteRole", {
      roleName: "NebulaCopySiteRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaCopySitePolicy],
    });

    const nebulaCopySiteFunction = new lambda.Function(this, "NebulaCopySiteFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/copy_site.zip`
      ),
      handler: "copy_site.handler",
      functionName: "NebulaCopySiteFunction",
      role: nebulaCopySiteRole,
      environment: {
        VERSION: `${process.env.npm_package_version}`,
        WEB_BUCKET: nebulaWebBucket.bucketName,
        API_URL: nebulaApiStagee.urlForPath(),
        USER_POOL_ID: nebulaUserPool.userPoolId,
        USER_POOL_CLIENT_ID: nebulaUserPoolClient.userPoolClientId,
        SOURCE_BUCKET: publicBucket.bucketName,
        USER_EMAIL: userEmailParam.valueAsString
      },
      timeout: Duration.seconds(120),
    });

    const nebulaCopySiteCr = new CustomResource(this, "NebulaCopySiteCr", {
      serviceToken: nebulaCopySiteFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const nebulaDistoOutput = new CfnOutput(this, "WebUrl", {
      description: "CloudFront Web URL for the demo application",
      value: nebulaDistro.distributionDomainName,
    });
  }
}
