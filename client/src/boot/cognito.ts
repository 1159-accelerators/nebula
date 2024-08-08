import { boot } from 'quasar/wrappers';
import { Amplify } from 'aws-amplify';

const getCognitoOptions = async () => {
  const { cognitoOptions } = await fetch('/config.json').then((response) => response.json())
  return cognitoOptions
}
// Be careful when using SSR for cross-request state pollution
// due to creating a Singleton instance here;
// If any client changes this (global) instance, it might be a
// good idea to move this instance creation inside of the
// "export default () => {}" function below (which runs individually
// for each client)

export default boot(async () => {
  const options = await getCognitoOptions()
  Amplify.configure(options)
});

export { Amplify };
