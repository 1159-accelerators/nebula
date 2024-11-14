import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/IndexPage.vue'),
        name: 'index',
        children: [
          {
            path: ':id',
            name: 'doc',
            component: () => import('pages/DocPage.vue'),
          },
        ],
      },
      {
        path: '/search',
        component: () => import('pages/SearchPage.vue'),
        name: 'search',
        children: [
          {
            path: ':id',
            name: 'searchDoc',
            component: () => import('pages/DocPage.vue'),
          },
        ],
      },
      {
        path: '/info',
        component: () => import('pages/KbHelp.vue'),
        name: 'help',
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
