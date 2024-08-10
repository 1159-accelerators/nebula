import { boot } from 'quasar/wrappers';
import axios, { AxiosInstance } from 'axios';
import { Notify } from 'quasar';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const getBaseUrl = async () => {
  const { baseUrl } = await fetch('/config.json').then((response) =>
    response.json()
  );
  return baseUrl;
};

const api = axios.create();

export default boot(async ({ app }) => {
  app.config.globalProperties.$axios = axios;

  app.config.globalProperties.$api = api;

  api.defaults.baseURL = await getBaseUrl();
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      Notify.create({
        type: 'negative',
        position: 'top',
        message: 'Something went wrong',
      });
      console.log(error);
    }
  );
});

export { api };
