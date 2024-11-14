import { fetchAuthSession } from '@aws-amplify/auth';
//import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { exportFile, Notify } from 'quasar';

const getRegion = async () => {
  try {
    const { region } = await fetch('/config.json').then((response) =>
      response.json()
    );
    return region;
  } catch {
    Notify.create({
      type: 'negative',
      position: 'top',
      message: 'Could not get region',
    });
  }
};

const buildClient = async () => {
  const authSession = await fetchAuthSession();
  const creds = authSession.credentials;
  if (
    creds &&
    creds.accessKeyId &&
    creds.sessionToken &&
    creds.secretAccessKey
  ) {
    return new S3Client({
      region: await getRegion(),
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds?.secretAccessKey,
        sessionToken: creds?.sessionToken,
      },
    });
  } else {
    Notify.create({
      type: 'negative',
      position: 'top',
      message: 'Could not create S3 client',
    });
  }
};

export const downloadHelper = async (bucket: string, key: string) => {
  const s3Client = await buildClient();

  const getObject = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  if (s3Client) {
    const s3Response = await s3Client.send(getObject);

    const streamToBytes = await s3Response.Body?.transformToByteArray();

    if (streamToBytes) {
      exportFile(key, streamToBytes);
    }
  }
};
