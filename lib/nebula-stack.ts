import { Construct, DependencyGroup } from "constructs";
import { SnsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
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
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_events as events,
  aws_stepfunctions as sfn,
  aws_sns as sns,
  aws_sns_subscriptions as sns_subcriptions,
  aws_stepfunctions_tasks as sfn_tasks,
  CustomResource,
  Fn,
  CfnCondition,
  CfnOutput,
  CfnDeletionPolicy,
} from "aws-cdk-lib";
import { AllowedMethods } from "aws-cdk-lib/aws-cloudfront";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class NebulaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, { ...props, analyticsReporting: false });

    // ! ======================================================================
    // ! Parameters
    // ! ======================================================================

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
      ],
    });

    const summarizationModelParam = new CfnParameter(
      this,
      "SummarizationModelParam",
      {
        type: "String",
        default: "anthropic.claude-3-sonnet-20240229-v1:0",
        description:
          "This model will be used to create summaries of documents and images",
        allowedValues: [
          "anthropic.claude-3-sonnet-20240229-v1:0",
          "anthropic.claude-3-haiku-20240307-v1:0",
          "anthropic.claude-3-5-sonnet-20240620-v1:0",
        ],
      }
    );

    const foundationModelParam = new CfnParameter(
      this,
      "FoundationModelParam",
      {
        type: "String",
        default: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        description: "Base model for the conversational interface",
        allowedValues: [
          "anthropic.claude-3-sonnet-20240229-v1:0",
          "anthropic.claude-3-haiku-20240307-v1:0",
          "anthropic.claude-3-5-sonnet-20240620-v1:0",
        ],
      }
    );

    const distanceParam = new CfnParameter(
      this,
      "DistanceParam",
      {
        type: "String",
        default: "Cosine",
        description: "Distance function for nearest neighbor. (Cannot be changed later)",
        allowedValues: [
          "Cosine",
          "L2",
        ],
      }
    );

    const distanceMaxParam = new CfnParameter(
      this,
      "DistanceMaxParam",
      {
        type: "Number",
        default: 0.90,
        description: "Maximum distance allowed for search results. (Min: 0.5, Max: 2.0)",
        maxValue: 2.0,
        minValue: 0.5
      }
    );

    const searchMaxParam = new CfnParameter(
      this,
      "SearchMaxParam",
      {
        type: "Number",
        default: 10,
        description: "Maximum number of results returned from similarity search. (Min: 5, Max: 20)",
        maxValue: 20,
        minValue: 5
      }
    );

    const chunkParam = new CfnParameter(
      this,
      "ChunkParam",
      {
        type: "Number",
        default: 1000,
        description: "Maxiumum number of characters that a chunk can contain. (Min: 100, Max: 2000)",
        maxValue: 2000,
        minValue: 100
      }
    );

    const chunkOverlapParam = new CfnParameter(
      this,
      "ChunkOverlapParam",
      {
        type: "Number",
        default: 20,
        description: "Chunk overlap when recursively splitting text. (Min: 0, Max: 50)",
        maxValue: 50,
        minValue: 0
      }
    );

    const vectorParam = new CfnParameter(
      this,
      "VectorParam",
      {
        type: "String",
        default: "1024",
        description: "Must be set to 1,536 for Titan V1. For V2, the value should be 256, 512, or 1,024. (Cannot be changed later)",
        allowedValues: [
          "256",
          "512",
          "1024",
          "1536",
        ],
      }
    );

    const uploadParam = new CfnParameter(this, "UploadParam", {
      type: "String",
      default: "YES",
      description:
        "Uploads sample documents to your bucket. Must answer YES or NO",
      allowedValues: ["YES", "NO"],
      allowedPattern: "^YES|NO$",
    });

    const existingVpcParam = new CfnParameter(this, "ExistingVpcParam", {
      type: "String",
      default: "NO",
      description:
        'Select "YES" if you would like Aurora placed in an existing VPC, otherwise a new VPC will be created',
      allowedValues: ["YES", "NO"],
      allowedPattern: "^YES|NO$",
    });

    const existingVpcIdParam = new CfnParameter(this, "ExistingVpcIdParam", {
      type: "String",
      default: "",
      description:
        'The ID of the existing VPC to use if you chose "YES" on "Use existing VPC?"',
      allowedPattern: "^$|^vpc-\\w{8}(\\w{9})?$",
    });

    const existingSubnetIdsParam = new CfnParameter(
      this,
      "ExistingSubnetIdsParam",
      {
        type: "CommaDelimitedList",
        default: "",
        description:
          "If using an existing VPC, please provide a comma-separated list of PUBLIC subnets to be used",
        allowedPattern: "^$|^subnet-\\w{8}(\\w{9})?$",
      }
    );

    // ! ======================================================================
    // ! Metadata
    // ! ======================================================================

    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "General" },
            Parameters: [userEmailParam.logicalId, uploadParam.logicalId],
          },
          {
            Label: { default: "Network" },
            Parameters: [
              existingVpcParam.logicalId,
              existingVpcIdParam.logicalId,
              existingSubnetIdsParam.logicalId,
            ],
          },
          {
            Label: { default: "Models" },
            Parameters: [
              embeddingModelParam.logicalId,
              summarizationModelParam.logicalId,
              foundationModelParam.logicalId,
            ],
          },
          {
            Label: { default: "Advanced" },
            Parameters: [
              distanceParam.logicalId,
              distanceMaxParam.logicalId,
              searchMaxParam.logicalId,
              chunkParam.logicalId,
              chunkOverlapParam.logicalId,
              vectorParam.logicalId
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
          [existingVpcParam.logicalId]: {
            default: "Use existing VPC?",
          },
          [existingVpcIdParam.logicalId]: {
            default: "Existing VPC ID",
          },
          [existingSubnetIdsParam.logicalId]: {
            default: "Existing public subnet IDs",
          },
          [embeddingModelParam.logicalId]: {
            default: "Embedding Model",
          },
          [summarizationModelParam.logicalId]: {
            default: "Summarization Model",
          },
          [foundationModelParam.logicalId]: {
            default: "Conversation Model",
          },
          [distanceParam.logicalId]: {
            default: "Distance Function",
          },
          [distanceMaxParam.logicalId]: {
            default: "Maximum Distance",
          },
          [searchMaxParam.logicalId]: {
            default: "Maximum Search Results",
          },
          [chunkParam.logicalId]: {
            default: "Chunk Size",
          },
          [chunkOverlapParam.logicalId]: {
            default: "Chunk Overlap",
          },
          [chunkOverlapParam.logicalId]: {
            default: "Vector Size",
          },
        },
      },
    };

    // ! ======================================================================
    // ! S3 Buckets
    // ! ======================================================================

    const publicBucket = s3.Bucket.fromBucketArn(
      this,
      "PublicBucket",
      `arn:aws:s3:::1159-public-assets-${Aws.REGION}`
    );

    const docsBucket = new s3.CfnBucket(this, "Docs", {
      bucketEncryption: {
        serverSideEncryptionConfiguration: [
          {
            serverSideEncryptionByDefault: {
              sseAlgorithm: "AES256",
            },
          },
        ],
      },
      // versioningConfiguration: {
      //   status: "Enabled",
      // },
      notificationConfiguration: {
        eventBridgeConfiguration: {
          eventBridgeEnabled: true,
        },
      },
      publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      corsConfiguration: {
        corsRules: [
          {
            allowedHeaders: ["*"],
            allowedMethods: ["GET", "HEAD"],
            maxAge: 300,
            allowedOrigins: ["*"]
          }
        ]
      }
    });

    docsBucket.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN;
    docsBucket.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.RETAIN;

    //! Enforces SSL for the Document Bucket
    const docsBucketPolicy = new s3.CfnBucketPolicy(this, "DocsBucketPolicy", {
      bucket: docsBucket.ref,
      policyDocument: {
        Statement: [
          {
            Action: "s3:*",
            Condition: {
              Bool: {
                "aws:SecureTransport": "false",
              },
            },
            Effect: "Deny",
            Principal: {
              AWS: "*",
            },
            Resource: [docsBucket.attrArn, `${docsBucket.attrArn}/*`],
          },
        ],
      },
    });

    const utilityBucket = new s3.Bucket(this, "Utility", {
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

    const webBucket = new s3.Bucket(this, "Web", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [corsRule],
    });

    const thumbnailBucket = new s3.Bucket(this, "Thumbnail", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [corsRule],
    });

    // ! ======================================================================
    // ! Networking
    // ! ======================================================================

    const nebulaVpc = new ec2.CfnVPC(this, "NebulaVpc", {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      instanceTenancy: "default",
      cidrBlock: "10.0.0.0/24",
      tags: [
        {
          key: "Name",
          value: "nebula-VPC",
        },
      ],
    });

    const nebulaSubnetA = new ec2.CfnSubnet(this, "NebulaSubnetA", {
      vpcId: nebulaVpc.attrVpcId,
      mapPublicIpOnLaunch: false,
      availabilityZone: `${Aws.REGION}a`,
      cidrBlock: "10.0.0.16/28",
      tags: [
        {
          key: "Name",
          value: "nebula-subnet-a",
        },
      ],
    });

    const nebulaSubnetB = new ec2.CfnSubnet(this, "NebulaSubnetB", {
      vpcId: nebulaVpc.attrVpcId,
      mapPublicIpOnLaunch: false,
      availabilityZone: `${Aws.REGION}b`,
      cidrBlock: "10.0.0.32/28",
      tags: [
        {
          key: "Name",
          value: "nebula-subnet-b",
        },
      ],
    });

    // const nebulaVpcIgwAttachment = new ec2.CfnVPCGatewayAttachment(
    //   this,
    //   "NebulaVpcIgwAttachment",
    //   {
    //     vpcId: nebulaVpc.attrVpcId,
    //     internetGatewayId: nebulaIgw.attrInternetGatewayId,
    //   }
    // );

    const nebulaExistingVpcCondition = new CfnCondition(
      this,
      "NebulaExistingVpcCondition",
      {
        expression: Fn.conditionEquals(existingVpcParam.valueAsString, "NO"),
      }
    );

    // nebulaIgw.cfnOptions.condition = nebulaExistingVpcCondition;
    nebulaVpc.cfnOptions.condition = nebulaExistingVpcCondition;
    nebulaSubnetA.cfnOptions.condition = nebulaExistingVpcCondition;
    nebulaSubnetB.cfnOptions.condition = nebulaExistingVpcCondition;
    // nebulaVpcIgwAttachment.cfnOptions.condition = nebulaExistingVpcCondition;

    const nebulaDbSubnetGroup = new rds.CfnDBSubnetGroup(
      this,
      "NebulaDbSubnetGroup",
      {
        dbSubnetGroupDescription: "Subnet group for the Nebula Aurora Database",
        subnetIds: [nebulaSubnetA.attrSubnetId, nebulaSubnetB.attrSubnetId],
        dbSubnetGroupName: "nebula-db-subnet-group",
      }
    );

    const nebulaDbCluster = new rds.CfnDBCluster(this, "NebulaDbCluster", {
      availabilityZones: [`${Aws.REGION}a`, `${Aws.REGION}b`],
      databaseName: "nebula",
      dbSubnetGroupName: nebulaDbSubnetGroup.dbSubnetGroupName,
      enableHttpEndpoint: true,
      engine: "aurora-postgresql",
      engineMode: "provisioned",
      engineVersion: "16.4",
      manageMasterUserPassword: true,
      networkType: "IPV4",
      serverlessV2ScalingConfiguration: {
        minCapacity: 0.5,
        maxCapacity: 1,
      },
      masterUsername: "clusteradmin",
      dbClusterIdentifier: "nebula-db-cluster",
    });

    const nebulaDbInstance = new rds.CfnDBInstance(this, "NebulaDbInstance", {
      dbClusterIdentifier: nebulaDbCluster.dbClusterIdentifier,
      enablePerformanceInsights: false,
      engine: "aurora-postgresql",
      dbInstanceClass: "db.serverless",
    });

    // ! ======================================================================
    // ! Cognito Components
    // ! User pool, identity pool, and policies
    // ! ======================================================================

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

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: nebulaUserPool,
      authFlows: { userSrp: true },
      accessTokenValidity: Duration.minutes(180),
      authSessionValidity: Duration.minutes(5),
      enableTokenRevocation: true,
      generateSecret: false,
      idTokenValidity: Duration.minutes(180),
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(30),
      userPoolClientName: "web",
    });

    // const nebulaUserPoolClient = nebulaUserPool.addClient(
    //   "NebulaUserPoolClient",
    //   {
    //     authFlows: {
    //       userSrp: true,
    //     },
    //     accessTokenValidity: Duration.minutes(180),
    //     authSessionValidity: Duration.minutes(5),
    //     enableTokenRevocation: true,
    //     generateSecret: false,
    //     idTokenValidity: Duration.minutes(180),
    //     preventUserExistenceErrors: true,
    //     refreshTokenValidity: Duration.days(30),
    //     userPoolClientName: "web",
    //   }
    // );

    const identityPool = new cognito.CfnIdentityPool(this, "IdentityPool", {
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: nebulaUserPool.userPoolProviderName,
        },
      ],
      allowUnauthenticatedIdentities: false,
      allowClassicFlow: false,
      identityPoolName: "NebulaIdentityPool",
    });

    const userPolicy = new iam.ManagedPolicy(this, "UserPolicy", {
      managedPolicyName: "NebulaUserPolicy",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["cognito-identity:GetCredentialsForIdentity"],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket"],
            resources: [docsBucket.attrArn],
          }),
          new iam.PolicyStatement({
            actions: ["s3:GetObject"],
            resources: [`${docsBucket.attrArn}/*`],
          }),
        ],
      }),
    });

    const userRole = new iam.Role(this, "UserRole", {
      assumedBy: new iam.WebIdentityPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        }
      ),
      managedPolicies: [userPolicy],
      roleName: "NebulaUserRole",
    });

    const userRoleAttachment = new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "UserRoleAttachment",
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: userRole.roleArn,
        },
      }
    );

    // ! ======================================================================
    // ! SNS
    // ! ======================================================================

    const extractTopic = new sns.Topic(this, "ExtractTopic", {
      topicName: `nebula-extract-${Aws.REGION}`,
    });

    // ! ======================================================================
    // ! Textract
    // ! Policy and role
    // ! ======================================================================

    const textractPolicy = new iam.ManagedPolicy(this, "textractPolicy", {
      managedPolicyName: "NebulaTextractPolicy",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["sns:Publish"],
            resources: [extractTopic.topicArn],
          }),
        ],
      }),
    });

    const textractRole = new iam.Role(this, "TextractRole", {
      roleName: "NebulaTextractRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("textract.amazonaws.com"),
      managedPolicies: [textractPolicy],
    });

    // ! ======================================================================
    // ! Lambda
    // ! Policy, role, and functions
    // ! ======================================================================

    const lambdaPolicy = new iam.ManagedPolicy(this, "LambdaPolicy", {
      managedPolicyName: "NebulaLambdaPolicy",
      path: "/service-role/",
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
              "bedrock:InvokeModel",
              "bedrock:Converse",
              "states:SendTaskFailure",
              "states:SendTaskSuccess",
              "textract:DetectDocumentText",
              "textract:StartDocumentTextDetection",
              "textract:StartDocumentAnalysis",
              "textract:GetDocumentTextDetection",
            ],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            actions: ["s3:ListBucket", "s3:GetObject"],
            resources: [
              publicBucket.bucketArn,
              `${publicBucket.bucketArn}/*`,
              docsBucket.attrArn,
              `${docsBucket.attrArn}/*`,
              utilityBucket.bucketArn,
              `${utilityBucket.bucketArn}/*`,
              `${webBucket.bucketArn}/thumbnails/*`,
            ],
          }),
          new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [nebulaDbCluster.attrMasterUserSecretSecretArn],
          }),
          new iam.PolicyStatement({
            actions: ["s3:PutObject", "s3:DeleteObject"],
            resources: [
              `${webBucket.bucketArn}/*`,
              `${thumbnailBucket.bucketArn}/*`,
              `${utilityBucket.bucketArn}/*`,
              `${docsBucket.attrArn}/*`,
            ],
          }),
          new iam.PolicyStatement({
            actions: [
              "rds-data:BatchExecuteStatement",
              "rds-data:BeginTransaction",
              "rds-data:CommitTransaction",
              "rds-data:ExecuteStatement",
              "rds-data:RollbackTransaction",
            ],
            resources: [nebulaDbCluster.attrDbClusterArn],
          }),
          new iam.PolicyStatement({
            actions: ["sns:Publish"],
            resources: [
              `arn:aws:sns:${Aws.REGION}:844603932797:1159-accelerators-topic`,
            ],
          }),
        ],
      }),
    });

    const lambdaRole = new iam.Role(this, "LambdaRole", {
      roleName: "NebulaLambdaRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [lambdaPolicy],
    });

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/api.zip`
      ),
      handler: "api.lambda_handler",
      functionName: "NebulaApiFunction",
      role: lambdaRole,
      environment: {
        DOCS_BUCKET: docsBucket.ref,
        FOUNDATION_MODEL_ARN: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${foundationModelParam.valueAsString}`,
        EMBEDDING_MODEL_ID: embeddingModelParam.valueAsString,
        SOURCE_CHUNKS: "25",
        TEMPERATURE: "0.3",
        TOP_P: "0.9",
        MAX_TOKENS: "2048",
        CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
        SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
        POWERTOOLS_LOGGER_LOG_EVENT: "true",
      },
      timeout: Duration.seconds(120),
    });

    const setupDbFunction = new lambda.Function(
      this,
      "SetupDbFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/setup_database.zip`
        ),
        handler: "setup_database.lambda_handler",
        functionName: "NebulaSetupDbFunction",
        role: lambdaRole,
        environment: {
          DATABASE: "nebula",
          SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
          CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
          DISTANCE_FUNCTION: distanceParam.valueAsString,
          VECTOR_SIZE: vectorParam.valueAsString
        },
        timeout: Duration.seconds(300),
      }
    );

    const sampleDataFunction = new lambda.Function(this, "SampleDataFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/sample_data.zip`
      ),
      handler: "sample_data.handler",
      functionName: "NebulaSampleDataFunction",
      role: lambdaRole,
      environment: {
        VERSION: `${process.env.npm_package_version}`,
        DOCS_BUCKET: docsBucket.ref,
        SOURCE_BUCKET: publicBucket.bucketName,
      },
      timeout: Duration.seconds(120),
    });

    const fileTypeFunction = new lambda.Function(this, "FileTypeFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/file_type.zip`
      ),
      handler: "file_type.lambda_handler",
      functionName: "NebulaFileTypeFunction",
      role: lambdaRole,
      timeout: Duration.seconds(15),
    });

    const summaryFunction = new lambda.Function(this, "SummaryFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/summary.zip`
      ),
      handler: "summary.lambda_handler",
      functionName: "NebulaSummaryFunction",
      role: lambdaRole,
      timeout: Duration.seconds(300),
      environment: {
        MODEL_ID: summarizationModelParam.valueAsString,
        CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
        SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
      },
    });

    const embeddingsFunction = new lambda.Function(this, "EmbeddingsFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/embeddings.zip`
      ),
      handler: "embeddings.lambda_handler",
      functionName: "NebulaEmbeddingsFunction",
      role: lambdaRole,
      environment: {
        MODEL_ID: embeddingModelParam.valueAsString,
        CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
        SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
      },
      timeout: Duration.seconds(900),
      memorySize: 512,
    });

    const extractPptxFunction = new lambda.Function(
      this,
      "ExtractPptxFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/extract_pptx.zip`
        ),
        handler: "extract_pptx.lambda_handler",
        functionName: "NebulaExtractPptxFunction",
        role: lambdaRole,
        timeout: Duration.seconds(600),
      }
    );

    const thumbnailFunction = new lambda.Function(this, "ThumbnailFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/thumbnail.zip`
      ),
      handler: "thumbnail.lambda_handler",
      functionName: "NebulaThumbnailFunction",
      role: lambdaRole,
      environment: {
        WEB_BUCKET: webBucket.bucketName,
      },
      timeout: Duration.seconds(600),
    });

    const extractFunction = new lambda.Function(this, "ExtractFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/extract.zip`
      ),
      handler: "extract.lambda_handler",
      functionName: "NebulaExtractFunction",
      role: lambdaRole,
      environment: {
        CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
        SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
        UTILITY_BUCKET: utilityBucket.bucketName,
        TOPIC_ARN: extractTopic.topicArn,
        ROLE_ARN: textractRole.roleArn,
      },
      timeout: Duration.seconds(600),
    });

    // ! ======================================================================
    // ! API Gateway
    // ! ======================================================================

    const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "ApiAuthorizer",
      {
        cognitoUserPools: [nebulaUserPool],
        authorizerName: "NebulaAuthorizer",
      }
    );

    const api = new apigateway.LambdaRestApi(this, "Api", {
      restApiName: "NebulaApi",
      handler: apiFunction,
      retainDeployments: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
      defaultMethodOptions: {
        authorizer: apiAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
      deploy: false,
      proxy: false,
    });

    const apiDocs = api.root.addResource("docs");
    apiDocs.addMethod("GET");

    const apiDoc = apiDocs.addResource("{id}");
    apiDoc.addMethod("GET");

    const apiSearch = api.root.addResource("search")
    apiSearch.addMethod("GET")

    apiAuthorizer._attachToApi(api);

    const apiDeployment = new apigateway.Deployment(this, "ApiDeployment", {
      api: api,
    });

    const apiStage = new apigateway.Stage(this, "ApiStage", {
      deployment: apiDeployment,
      stageName: "prod",
    });

    api.addGatewayResponse("NebulaApiUnauthorizedResponse", {
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

    // ! ======================================================================
    // ! CloudFront Distribution
    // ! ======================================================================

    const copySiteFunction = new lambda.Function(this, "CopySiteFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromBucket(
        publicBucket,
        `nebula/${process.env.npm_package_version}/lambdas/copy_site.zip`
      ),
      handler: "copy_site.handler",
      functionName: "NebulaCopySiteFunction",
      role: lambdaRole,
      environment: {
        VERSION: `${process.env.npm_package_version}`,
        WEB_BUCKET: webBucket.bucketName,
        API_URL: apiStage.urlForPath(),
        USER_POOL_ID: nebulaUserPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        IDENTITY_POOL_ID: identityPool.ref,
        SOURCE_BUCKET: publicBucket.bucketName,
        USER_EMAIL: userEmailParam.valueAsString,
        TOPIC_ARN: `arn:aws:sns:${Aws.REGION}:844603932797:1159-accelerators-topic`,
        REGION: `${Aws.REGION}`
      },
      timeout: Duration.seconds(120),
    });

    const oai = new cloudfront.OriginAccessIdentity(this, "Oai", {
      comment: "Access to Nebula Web Bucket",
    });

    const distro = new cloudfront.CloudFrontWebDistribution(this, "Distro", {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: webBucket,
            originAccessIdentity: oai,
          },
          behaviors: [
            {
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              isDefaultBehavior: true,
            },
            {
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
              pathPattern: "/thumbnails/*",
            },
          ],
        },
      ],
      defaultRootObject: "index.html",
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      viewerCertificate:
        cloudfront.ViewerCertificate.fromCloudFrontDefaultCertificate(),
    });

    const distoOutput = new CfnOutput(this, "WebUrl", {
      description: "CloudFront Web URL for the demo application",
      value: distro.distributionDomainName,
    });

    // ! ======================================================================
    // ! Custom Resources
    // ! ======================================================================

    const setupDatabaseCr = new CustomResource(this, "SetupDatabaseCr", {
      serviceToken: setupDbFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const sampleDataCr = new CustomResource(this, "SampleDataCr", {
      serviceToken: sampleDataFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const copySiteCr = new CustomResource(this, "CopySiteCr", {
      serviceToken: copySiteFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ! ======================================================================
    // ! SNS Subscriptions
    // ! ======================================================================

    extractTopic.addSubscription(
      new sns_subcriptions.LambdaSubscription(extractFunction)
    );

    // ! ======================================================================
    // ! Step Function components
    // ! State machine, policy, and role
    // ! ======================================================================

    const stateMachinePolicy = new iam.ManagedPolicy(
      this,
      "StateMachinePolicy",
      {
        managedPolicyName: "NebulaStateMachinePolicy",
        path: "/service-role/",
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["secretsmanager:GetSecretValue"],
              resources: [nebulaDbCluster.attrMasterUserSecretSecretArn],
            }),
            new iam.PolicyStatement({
              actions: ["lambda:InvokeFunction"],
              resources: [
                fileTypeFunction.functionArn,
                summaryFunction.functionArn,
                extractPptxFunction.functionArn,
                thumbnailFunction.functionArn,
                extractFunction.functionArn,
                embeddingsFunction.functionArn,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                "rds-data:BatchExecuteStatement",
                "rds-data:BeginTransaction",
                "rds-data:CommitTransaction",
                "rds-data:ExecuteStatement",
                "rds-data:RollbackTransaction",
              ],
              resources: [nebulaDbCluster.attrDbClusterArn],
            }),
          ],
        }),
      }
    );

    const stateMachineRole = new iam.Role(this, "stateMachineRole", {
      roleName: "NebulaStateMachineRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
      managedPolicies: [stateMachinePolicy],
    });

    const stateMachine = new sfn.CfnStateMachine(this, "NebulaStateMachine", {
      stateMachineName: "NebulaStateMachine",
      roleArn: stateMachineRole.roleArn,
      definition: {
        Comment: "Performs processing on object creation",
        StartAt: "Filter Event Data",
        States: {
          "Create Document Record": {
            Comment:
              "Inserts region, bucket, and key into the documents table. Returns UUID",
            Next: "File Type Choice",
            Parameters: {
              Database: "nebula",
              ResourceArn: nebulaDbCluster.attrDbClusterArn,
              SecretArn: nebulaDbCluster.attrMasterUserSecretSecretArn,
              "Sql.$":
                "States.Format('INSERT INTO documents (region, bucket, key, mime, ext, created_at, size, name) " +
                "VALUES (\\'{}\\', \\'{}\\', \\'{}\\', \\'{}\\', \\'{}\\', \\'{}\\', \\'{}\\', \\'{}\\') RETURNING id', " +
                "$.doc.region, $.doc.bucket, $.doc.key, $.fileType.mime, $.fileType.ext, $.doc.time, $.doc.size, $.doc.name)",
            },
            Resource: "arn:aws:states:::aws-sdk:rdsdata:executeStatement",
            ResultPath: "$.dbRecord",
            ResultSelector: {
              "id.$":
                "States.ArrayGetItem(States.ArrayGetItem($.Records, 0), 0)",
            },
            Type: "Task",
          },
          "File Type Choice": {
            Choices: [
              {
                Or: [
                  {
                    Variable: "$.fileType.ext",
                    StringMatches: "png",
                  },
                  {
                    Variable: "$.fileType.ext",
                    StringMatches: "jpg",
                  },
                  {
                    Variable: "$.fileType.ext",
                    StringMatches: "gif",
                  },
                  {
                    Variable: "$.fileType.ext",
                    StringMatches: "webp",
                  },
                  {
                    Variable: "$.fileType.ext",
                    StringMatches: "pdf",
                  },
                ],
                Comment: "PDFs or Images",
                Next: "Thumbnail",
              },
            ],
            Default: "Success",
            Type: "Choice",
          },
          Thumbnail: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: {
              FunctionName: thumbnailFunction.functionArn,
              Payload: {
                "doc.$": "$.doc",
                "id.$": "$.dbRecord.id.StringValue",
                "fileType.$": "$.fileType",
              },
            },
            Retry: [
              {
                ErrorEquals: [
                  "Lambda.ServiceException",
                  "Lambda.AWSLambdaException",
                  "Lambda.SdkClientException",
                  "Lambda.TooManyRequestsException",
                ],
                IntervalSeconds: 1,
                MaxAttempts: 3,
                BackoffRate: 2,
              },
            ],
            ResultSelector: {
              "status.$": "$.Payload.status",
            },
            ResultPath: "$.thumbnail",
            Next: "Process PDF?",
          },
          "Process PDF?": {
            Type: "Choice",
            Choices: [
              {
                Not: {
                  Variable: "$.fileType.ext",
                  StringMatches: "pdf",
                },
                Next: "Summary",
                Comment: "NO",
              },
            ],
            Default: "Extract Text",
          },
          "Extract Text": {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke.waitForTaskToken",
            ResultPath: "$.textract",
            Parameters: {
              Payload: {
                "taskToken.$": "$$.Task.Token",
                "doc.$": "$.doc",
                "fileType.$": "$.fileType",
                "id.$": "$.dbRecord.id.StringValue",
              },
              FunctionName: extractFunction.functionArn,
            },
            Retry: [
              {
                ErrorEquals: [
                  "Lambda.ServiceException",
                  "Lambda.AWSLambdaException",
                  "Lambda.SdkClientException",
                  "Lambda.TooManyRequestsException",
                ],
                IntervalSeconds: 1,
                MaxAttempts: 3,
                BackoffRate: 2,
              },
            ],
            Next: "Summary",
          },
          "Filter Event Data": {
            Comment: "Removes all but the region, bucket, and key",
            Next: "Get File Type",
            Parameters: {
              doc: {
                "bucket.$": "$.detail.bucket.name",
                "key.$": "$.detail.object.key",
                "name.$":
                  "States.ArrayGetItem(States.StringSplit($.detail.object.key, '/'), States.MathAdd(States.ArrayLength(States.StringSplit($.detail.object.key, '/')), -1))",
                "region.$": "$.region",
                "size.$": "$.detail.object.size",
                "time.$": "$.time",
              },
            },
            Type: "Pass",
          },
          "Get File Type": {
            Next: "Create Document Record",
            Parameters: {
              FunctionName: fileTypeFunction.functionArn,
              Payload: {
                "bucket.$": "$.doc.bucket",
                "key.$": "$.doc.key",
              },
            },
            Resource: "arn:aws:states:::lambda:invoke",
            ResultPath: "$.fileType",
            ResultSelector: {
              "ext.$": "$.Payload.ext",
              "mime.$": "$.Payload.mime",
            },
            Retry: [
              {
                BackoffRate: 2,
                ErrorEquals: [
                  "Lambda.ServiceException",
                  "Lambda.AWSLambdaException",
                  "Lambda.SdkClientException",
                  "Lambda.TooManyRequestsException",
                ],
                IntervalSeconds: 1,
                MaxAttempts: 3,
              },
            ],
            Type: "Task",
          },
          Summary: {
            Next: "Embeddings",
            Parameters: {
              FunctionName: summaryFunction.functionArn,
              "Payload.$": "$",
            },
            Resource: "arn:aws:states:::lambda:invoke",
            ResultPath: "$.summary",
            ResultSelector: {
              "status.$": "$.Payload",
            },
            Retry: [
              {
                BackoffRate: 2,
                ErrorEquals: [
                  "Lambda.ServiceException",
                  "Lambda.AWSLambdaException",
                  "Lambda.SdkClientException",
                  "Lambda.TooManyRequestsException",
                ],
                IntervalSeconds: 1,
                MaxAttempts: 3,
              },
            ],
            Type: "Task",
          },
          Success: {
            Type: "Succeed",
          },
          Embeddings: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            OutputPath: "$.Payload",
            Parameters: {
              FunctionName:
                "arn:aws:lambda:us-east-1:010438489563:function:NebulaEmbeddingsFunction",
              "Payload.$": "$",
            },
            Retry: [
              {
                ErrorEquals: [
                  "Lambda.ServiceException",
                  "Lambda.AWSLambdaException",
                  "Lambda.SdkClientException",
                  "Lambda.TooManyRequestsException",
                ],
                IntervalSeconds: 1,
                MaxAttempts: 3,
                BackoffRate: 2,
              },
            ],
            End: true,
          },
        },
      },
    });

    // ! ======================================================================
    // ! Componenets related to EventBridge
    // ! Rule, Rule Policy, Rule Role
    // ! ======================================================================

    const objectCreatedPolicy = new iam.ManagedPolicy(
      this,
      "objectCreatedPolicy",
      {
        managedPolicyName: "NebulaObjectCreatedPolicy",
        path: "/service-role/",
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["states:StartExecution"],
              resources: ["*"],
            }),
          ],
        }),
      }
    );

    const objectCreatedRole = new iam.Role(this, "ObjectCreatedRole", {
      roleName: "NebulaObjectCreatedRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("events.amazonaws.com"),
      managedPolicies: [objectCreatedPolicy],
    });

    const objectCreatedRule = new events.CfnRule(this, "ObjectCreatedRule", {
      name: "NebulaObjectCreatedRule",
      description: `Triggered when objects are added to ${docsBucket.ref}`,
      eventPattern: {
        source: ["aws.s3"],
        "detail-type": ["Object Created"],
        detail: {
          bucket: {
            name: [docsBucket.ref],
          },
        },
      },
      targets: [
        {
          roleArn: objectCreatedRole.roleArn,
          arn: stateMachine.attrArn,
          id: "stateMachine",
        },
      ],
    });
    // ! ======================================================================
    // ! Dependencies
    // ! Static dependency mapping
    // ! ======================================================================

    nebulaDbCluster.node.addDependency(nebulaDbSubnetGroup);
    nebulaDbInstance.node.addDependency(nebulaDbCluster);

    const sampleDataDepends = new DependencyGroup();
    sampleDataDepends.add(nebulaDbInstance);
    sampleDataDepends.add(docsBucket);
    sampleDataDepends.add(objectCreatedRule);
    sampleDataDepends.add(stateMachine);
    sampleDataCr.node.addDependency(sampleDataDepends);

    copySiteCr.node.addDependency(webBucket);

    setupDatabaseCr.node.addDependency(nebulaDbInstance);

    // ! ======================================================================
    // ! Conditions
    // ! ======================================================================

    const sampleDataCondition = new CfnCondition(this, "SampleDataCondition", {
      expression: Fn.conditionEquals(uploadParam.valueAsString, "YES"),
    });

    const sampleDataFunctionCfn = sampleDataFunction.node
      .defaultChild as lambda.CfnFunction;
    sampleDataFunctionCfn.cfnOptions.condition = sampleDataCondition;

    const sampleDataCrCfn = sampleDataCr.node
      .defaultChild as cloudformation.CfnCustomResource;
    sampleDataCrCfn.cfnOptions.condition = sampleDataCondition;
  }
}
