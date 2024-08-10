import { defineStore } from 'pinia';
import { useUiStore } from './ui-store';
import { api } from 'boot/axios';
import { useAuthStore } from './auth-store';

const authStore = useAuthStore();
const uiStore = useUiStore();

export const useMessageStore = defineStore('message', {
  state: () => ({
    messages: [] as Message[],
    sessionId: undefined as string | undefined,
    questionInput: '',
    questionInputRef: null as HTMLDivElement | null,
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  actions: {
    async focusInput() {
      if (this.questionInputRef) {
        this.questionInputRef.focus();
      }
    },
    async addMessage() {
      uiStore.waiting = true;
      const staticInput = JSON.parse(JSON.stringify(this.questionInput));
      this.questionInput = '';
      this.messages.push({ sender: 'me', text: staticInput });

      const payload = { question: staticInput, sessionId: this.sessionId };

      try {
        const response = await api.post('/chat', payload, {
          headers: { Authorization: `Bearer ${authStore.idToken}` },
        });
        this.messages.push({ sender: 'aws', text: response.data.data.answer });
        this.sessionId = response.data.data.sessionId;
      } catch (err) {
        console.log(err);
      }
      uiStore.waiting = false;
      this.questionInputRef?.focus();
    },
  },
});

interface Message {
  sender: 'me' | 'aws';
  text: string;
}