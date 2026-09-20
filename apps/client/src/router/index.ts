import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: "home", component: () => import("../views/home.vue"), meta: { keepAlive: true } },
    { path: '/settings', name: "settings", component: () => import("../views/settings/index.vue") },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
