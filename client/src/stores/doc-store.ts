import { defineStore } from 'pinia';
import { useUiStore } from './ui-store';
import { api } from 'boot/axios';
import { useAuthStore } from './auth-store';

const authStore = useAuthStore();
const uiStore = useUiStore();

export const useDocStore = defineStore('doc', {
  state: () => ({
    docs: [] as Document[],
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  actions: {
    async listDocs() {
      uiStore.waiting = true;

      try {
        const response = await api.get('/docs', {
          headers: { Authorization: `Bearer ${authStore.idToken}` },
        });
        this.docs = response.data.docs;
        //this.sessionId = response.data.data.sessionId;
      } catch (err) {
        console.log(err);
      }
      uiStore.waiting = false;
    },
  },
});

interface Document {
  id: string;
  region: string;
  bucket: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  ext: string;
  summary?: string;
  createdAt: string;
}
