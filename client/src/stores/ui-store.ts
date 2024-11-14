import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    rightDrawer: false,
    waiting: false,
    header: true,
    grid: false,
    pagination: {
      sortBy: 'name',
      descending: false,
      rowsPerPage: 25,
    },
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
