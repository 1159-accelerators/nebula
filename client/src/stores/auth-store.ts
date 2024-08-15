import { defineStore } from 'pinia';
//import { toRefs } from 'vue';
//import { useAuthenticator } from '@aws-amplify/ui-vue';
import { fetchAuthSession } from 'aws-amplify/auth';

//const authenticator = useAuthenticator();

export const useAuthStore = defineStore('auth', {
  state: () => ({
    idToken: '' as string | undefined
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  actions: {
    // signOut() {
    //   authenticator.signOut();
    //   this.$reset();
    // },
    async setToken() {
      try {
        const session = await fetchAuthSession();
        this.idToken = session.tokens?.idToken?.toString();
      } catch (err) {
        console.log(err);
      }
    },
  },
});
