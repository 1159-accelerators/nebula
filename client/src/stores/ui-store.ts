import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    rightDrawer: false,
    waiting: false
  }),
  // getters: {
  //   doubleCount: (state) => state.counter * 2,
  // },
  actions: {
    toggleRightDrawer() {
      this.rightDrawer = !this.rightDrawer;
    },
  },
});
