import { Context } from "aws-lambda";
import * as https from "node:https";
import {
  S3Client,
  ListObjectsCommand,
  CopyObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const s3Client = new S3Client({});
const snsClient = new SNSClient({});

const listObjectsCommand = new ListObjectsCommand({
  Bucket: process.env.SOURCE_BUCKET,
  Prefix: `nebula/${process.env.VERSION}/site`,
});

const publishCommand = new PublishCommand({
  TopicArn: "arn:aws:sns:us-east-1:010438489563:1159-accelerators-topic",
  Subject: "Accelerator Deployment",
  Message: JSON.stringify({
    accelerator: "KB",
    user_email: process.env.USER_EMAIL,
  }),
});

type CloudFormationEvent = {
  RequestType: "Create" | "Delete" | "Update";
  RequestId: string;
  ResponseURL: string;
  ResourceType: string;
  LogicalResourceId: string;
  StackId: string;
};

type ResponseStatus = "FAILED" | "SUCCESS";

type ResponseData = {
  Status?: string;
  Error?: string;
};

export const handler = async (event: CloudFormationEvent, context: Context) => {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

  let responseStatus: ResponseStatus = "FAILED";
  let responseData: ResponseData = {};

  // For Delete requests, immediately send a SUCCESS response.
  if (event.RequestType === "Delete" || event.ResourceType === "Update") {
    await sendResponse(event, context, "SUCCESS", { Status: "Deleting" });
    return;
  }

  try {
    await snsClient.send(publishCommand);
    const sourceObjects = await s3Client.send(listObjectsCommand);
    const keys = sourceObjects.Contents?.map((object) => ({
      newKey: object.Key?.slice(18),
      oldKey: object.Key,
    }));

    if (keys?.length) {
      for (const key of keys) {
        const send = await s3Client.send(
          new CopyObjectCommand({
            Bucket: process.env.WEB_BUCKET,
            Key: key.newKey,
            CopySource: `${process.env.SOURCE_BUCKET}/${key.oldKey}`,
          })
        );
      }
    }
    const putConfig = await s3Client.send(
      new PutObjectCommand({
        Key: "config.json",
        Body: JSON.stringify({
          baseUrl: process.env.API_URL,
          cognitoOptions: {
            Auth: {
              Cognito: {
                userPoolId: process.env.USER_POOL_ID,
                userPoolClientId: process.env.USER_POOL_CLIENT_ID,
                loginWith: {
                  email: true,
                },
                signUpVerificationMethod: "code",
                userAttributes: {
                  email: {
                    required: true,
                  },
                },
                allowGuestAccess: false,
                passwordFormat: {
                  minLength: 12,
                  requireLowercase: true,
                  requireUppercase: true,
                  requireNumbers: true,
                  requireSpecialCharacters: true,
                },
              },
            },
          },
        }),
        Bucket: process.env.WEB_BUCKET,
      })
    );
    responseStatus = "SUCCESS";
    responseData = { Status: "Objects copied" };
  } catch (err) {
    responseData = { Error: "Something went wrong" };
    console.log(responseData.Error + ":\n", err);
  }

  await sendResponse(event, context, responseStatus, responseData);
};

function sendResponse(
  event: CloudFormationEvent,
  context: Context,
  responseStatus: ResponseStatus,
  responseData: ResponseData
) {
  return new Promise((resolve, reject) => {
    let responseBody = JSON.stringify({
      Status: responseStatus,
      Reason:
        "See the details in CloudWatch Log Stream: " + context.logStreamName,
      PhysicalResourceId: context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: false,
      Data: responseData,
    });

    console.log("Response body:\n", responseBody);

    //var parsedUrl = url.parse(event.ResponseURL);
    //let parsedUrl = new URL(event.ResponseURL);
    let options = {
      method: "PUT",
      headers: {
        "Content-Type": "",
        "Content-Length": responseBody.length,
      },
    };

    var request = https.request(event.ResponseURL, options, (response) => {
      console.log("Status code: " + response.statusCode);
      resolve(context.done());
    });

    request.on("error", function (error) {
      console.log("send(..) failed executing https.request(..): " + error);
      reject(context.done(error));
    });

    request.write(responseBody);
    request.end();
  });
}
