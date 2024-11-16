import { defineStore } from 'pinia';
import { api } from 'boot/axios';
import { fetchAuthSession } from '@aws-amplify/auth';

export const useDocStore = defineStore('doc', {
  state: () => ({
    docs: [] as Document[],
    search: '',
    searchResults: [] as SearchResult[],
    docsLoading: true,
    searchLoading: true,
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  actions: {
    async listDocs() {
      this.docsLoading = true;

      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        const response = await api.get('/docs', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        this.docs = response.data.docs;
        //this.sessionId = response.data.data.sessionId;
      } catch (err) {
        console.log(err);
      }
      this.docsLoading = false;
    },
    async getSearchResults() {
      this.searchLoading = true;
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        const response = await api.get(`/search?q=${this.search}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        this.searchLoading = false;
        this.searchResults = response.data.results;
        this.search = '';
        //this.sessionId = response.data.data.sessionId;
      } catch (err) {
        console.log(err);
      }
    },
  },
});

export interface Document {
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

export interface SearchResult {
  id: string;
  key: string;
  name: string;
  text: string;
  distance: number;
}
