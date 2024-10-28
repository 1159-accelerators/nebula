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
  aws_ec2 as ec2,
  aws_rds as rds,
  aws_events as events,
  aws_stepfunctions as sfn,
  CustomResource,
  Fn,
  CfnCondition,
  CfnOutput,
  CfnDeletionPolicy,
} from "aws-cdk-lib";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class NebulaStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, { ...props, analyticsReporting: false });

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
        default: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        description: "Base model for the conversational interface",
        allowedValues: [
          "anthropic.claude-v2",
          "anthropic.claude-v2:1",
          "anthropic.claude-3-sonnet-20240229-v1:0",
          "anthropic.claude-3-haiku-20240307-v1:0",
          "anthropic.claude-3-5-sonnet-20240620-v1:0",
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
          [foundationModelParam.logicalId]: {
            default: "Foundation Model",
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

    const docsBucket = new s3.CfnBucket(this, "DocsBucket", {
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
    });

    docsBucket.cfnOptions.deletionPolicy = CfnDeletionPolicy.RETAIN;
    docsBucket.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.RETAIN;

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

    const extractBucket = new s3.Bucket(this, "Extract", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const thumbnailBucket = new s3.Bucket(this, "Thumbnail", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
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

    const nebulaWebBucket = new s3.Bucket(this, "NebulaWebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [corsRule],
    });

    // Networking Config
    // const nebulaIgw = new ec2.CfnInternetGateway(this, "NebulaIgw", {
    //   tags: [
    //     {
    //       key: "Name",
    //       value: "nebula-IGW",
    //     },
    //   ],
    // });

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

    nebulaDbCluster.node.addDependency(nebulaDbSubnetGroup);
    nebulaDbInstance.node.addDependency(nebulaDbCluster);

    const nebulaSetupDatabasePolicy = new iam.ManagedPolicy(
      this,
      "NebulaSetupDatabasePolicy",
      {
        managedPolicyName: "NebulaSetupDatabasePolicy",
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
              actions: ["secretsmanager:GetSecretValue"],
              resources: [nebulaDbCluster.attrMasterUserSecretSecretArn],
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

    const nebulaSetupDatabaseRole = new iam.Role(
      this,
      "NebulaSetupDatabaseRole",
      {
        roleName: "NebulaSetupDatabaseRole",
        path: "/service-role/",
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [nebulaSetupDatabasePolicy],
      }
    );

    const nebulaSetupDatabaseFunction = new lambda.Function(
      this,
      "NebulaSetupDatabaseFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/setup_database.zip`
        ),
        handler: "setup_database.lambda_handler",
        functionName: "NebulaSetupDatabaseFunction",
        role: nebulaSetupDatabaseRole,
        environment: {
          DATABASE: "nebula",
          SECRET_ARN: nebulaDbCluster.attrMasterUserSecretSecretArn,
          CLUSTER_ARN: nebulaDbCluster.attrDbClusterArn,
        },
        timeout: Duration.seconds(300),
      }
    );

    const nebulaSetupDatabaseCr = new CustomResource(
      this,
      "NebulaSetupDatabaseCr",
      {
        serviceToken: nebulaSetupDatabaseFunction.functionArn,
        removalPolicy: RemovalPolicy.RETAIN,
      }
    );

    nebulaSetupDatabaseCr.node.addDependency(nebulaDbInstance);

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

    const nebulaUserPoolClient = nebulaUserPool.addClient(
      "NebulaUserPoolClient",
      {
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
      }
    );

    const nebulaWebApiPolicy = new iam.ManagedPolicy(
      this,
      "NebulaWebApiPolicy",
      {
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
              resources: [docsBucket.attrArn],
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
      }
    );

    const nebulaWebApiRole = new iam.Role(this, "NebulaWebApiRole", {
      roleName: "NebulaWebApiRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaWebApiPolicy],
    });

    const nebulaWebApiFunction = new lambda.Function(
      this,
      "NebulaWebApiFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/web_api.zip`
        ),
        handler: "web_api.handler",
        functionName: "NebulaWebApiFunction",
        role: nebulaWebApiRole,
        environment: {
          DOCS_BUCKET: docsBucket.ref,
          FOUNDATION_MODEL_ARN: `arn:aws:bedrock:${Aws.REGION}::foundation-model/${foundationModelParam.valueAsString}`,
          SOURCE_CHUNKS: "25",
          TEMPERATURE: "0.3",
          TOP_P: "0.9",
          MAX_TOKENS: "2048",
        },
        timeout: Duration.seconds(30),
      }
    );

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

    const nebulaApiDeployment = new apigateway.Deployment(
      this,
      "NebulaApiDeployment",
      {
        api: nebulaApi,
      }
    );

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
              resources: [`${docsBucket.attrArn}/*`],
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
          DOCS_BUCKET: docsBucket.ref,
          SOURCE_BUCKET: publicBucket.bucketName,
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
    nebulaSampleDataFunctionCfn.cfnOptions.condition =
      nebulaSampleDataCondition;

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

    const nebulaCopySitePolicy = new iam.ManagedPolicy(
      this,
      "NebulaCopySitePolicy",
      {
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
              resources: [
                publicBucket.bucketArn,
                `${publicBucket.bucketArn}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: ["s3:PutObject"],
              resources: [`${nebulaWebBucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              actions: ["sns:Publish"],
              resources: [
                `arn:aws:sns:${Aws.REGION}:844603932797:1159-accelerators-topic`,
              ],
            }),
          ],
        }),
      }
    );

    const nebulaCopySiteRole = new iam.Role(this, "NebulaCopySiteRole", {
      roleName: "NebulaCopySiteRole",
      path: "/service-role/",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [nebulaCopySitePolicy],
    });

    const nebulaCopySiteFunction = new lambda.Function(
      this,
      "NebulaCopySiteFunction",
      {
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
          USER_EMAIL: userEmailParam.valueAsString,
          TOPIC_ARN: `arn:aws:sns:${Aws.REGION}:844603932797:1159-accelerators-topic`,
        },
        timeout: Duration.seconds(120),
      }
    );

    const nebulaCopySiteCr = new CustomResource(this, "NebulaCopySiteCr", {
      serviceToken: nebulaCopySiteFunction.functionArn,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const nebulaDistoOutput = new CfnOutput(this, "WebUrl", {
      description: "CloudFront Web URL for the demo application",
      value: nebulaDistro.distributionDomainName,
    });

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
            ],
          }),
          new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [nebulaDbCluster.attrMasterUserSecretSecretArn],
          }),
          new iam.PolicyStatement({
            actions: ["s3:PutObject"],
            resources: [
              `${nebulaWebBucket.bucketArn}/*`,
              `${extractBucket.bucketArn}/*`,
              `${thumbnailBucket.bucketArn}/*`,
              `${utilityBucket.bucketArn}/*`,
            ],
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
      timeout: Duration.seconds(120),
    });

    const createEmbeddingsFunction = new lambda.Function(
      this,
      "CreateEmbeddingsFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromBucket(
          publicBucket,
          `nebula/${process.env.npm_package_version}/lambdas/create_embeddings.zip`
        ),
        handler: "create_embeddings.lambda_handler",
        functionName: "NebulaCreateEmbeddingsFunction",
        role: lambdaRole,
        environment: {
          REGION: `${Aws.REGION}`,
          MODEL: embeddingModelParam.valueAsString,
        },
        timeout: Duration.seconds(300),
      }
    );

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
        environment: {
          EXTRACT_BUCKET: extractBucket.bucketName,
        },
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
        THUMBNAIL_BUCKET: thumbnailBucket.bucketName,
      },
      timeout: Duration.seconds(600),
    });

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
        Comment: "A description of my state machine",
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
                "States.Format('INSERT INTO documents (region, bucket, key, mime, ext, created_at, size, name) VALUES ('{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}') RETURNING id', $.doc.region, $.doc.bucket, $.doc.key, $.fileType.mime, $.fileType.ext, $.doc.time, $.doc.size, $.doc.name)",
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
            ResultPath: null,
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
                Next: "Get Summary",
                Comment: "Images",
              },
            ],
            Default: "Success (1)",
          },
          "Success (1)": {
            Type: "Succeed",
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
          "Get Summary": {
            Next: "Update Record with Summary",
            Parameters: {
              FunctionName: summaryFunction.functionArn,
              Payload: {
                "bucket.$": "$.doc.bucket",
                "ext.$": "$.fileType.ext",
                "key.$": "$.doc.key",
                "mime.$": "$.fileType.mime",
                model_id: "anthropic.claude-3-5-sonnet-20240620-v1:0",
                prompt: "Describe this image",
              },
            },
            Resource: "arn:aws:states:::lambda:invoke",
            ResultPath: "$.getSummary",
            ResultSelector: {
              "content.$": "$.Payload",
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
          "Update Record with Summary": {
            End: true,
            Parameters: {
              Database: "nebula",
              ResourceArn: nebulaDbCluster.attrDbClusterArn,
              SecretArn: nebulaDbCluster.attrMasterUserSecretSecretArn,
              "Sql.$":
                "States.Format('UPDATE documents SET summary = '{}' WHERE id = '{}'', $.getSummary.content, $.dbRecord.id.StringValue)",
            },
            Resource: "arn:aws:states:::aws-sdk:rdsdata:executeStatement",
            Type: "Task",
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
  }
}
