import { defineStore } from 'pinia';
import { api } from 'boot/axios';
import { useAuthStore } from './auth-store';

const authStore = useAuthStore();

export const useKbStore = defineStore('kb', {
  state: () => ({
    bucket: {
      docs: [],
      count: 0,
    },
    dataSource: {
      createdAt: '',
      dataDeletionPolicy: '',
      dataSourceConfiguration: {
        s3Configuration: {
          bucketArn: '',
          bucketOwnerAccountId: '',
        },
        type: '',
      },
      dataSourceId: '',
      knowledgeBaseId: '',
      name: '',
      status: '',
      updatedAt: '',
    },
    knowledgeBase: {
      createdAt: '',
      knowledgeBaseArn: '',
      knowledgeBaseConfiguration: {
        type: '',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: '',
        },
      },
      knowledgeBaseId: '',
      name: '',
      roleArn: '',
      status: '',
      updatedAt: '',
      storageConfiguration: {
        type: '',
        opensearchServerlessConfiguration: {
          collectionArn: '',
          fieldMapping: {
            metadataField: '',
            textField: '',
            vectorField: '',
          },
          vectorIndexName: '',
        },
      },
    },
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  getters: {
    bucketName(state) {
      const stringArray =
        state.dataSource.dataSourceConfiguration.s3Configuration.bucketArn.split(
          ':::'
        );
      return stringArray[1];
    },
    storageType(state) {
      if (
        state.knowledgeBase.storageConfiguration.type ===
        'OPENSEARCH_SERVERLESS'
      ) {
        return 'OpenSearch Serverless';
      } else {
        return 'Unknown';
      }
    },
  },
  actions: {
    async getDocsInfo() {
      try {
        const response = await api.get('/docs', {
          headers: { Authorization: `Bearer ${authStore.idToken}` },
        });
        this.bucket = response.data.data;
      } catch (error) {
        console.error(error);
      }
    },
    async getKbInfo() {
      try {
        const response = await api.get('/kb', {
          headers: { Authorization: `Bearer ${authStore.idToken}` },
        });
        this.dataSource = response.data.data.dataSource;
        this.knowledgeBase = response.data.data.knowledgeBase;
      } catch (error) {
        console.error(error);
      }
    },
  },
});
