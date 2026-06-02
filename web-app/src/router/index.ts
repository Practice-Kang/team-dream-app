import { createRouter, createWebHistory } from "vue-router";

import AdminSessionView from "@/views/AdminSessionView.vue";
import BoardView from "@/views/BoardView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/admin/new",
    },
    {
      path: "/admin/new",
      name: "admin-new",
      component: AdminSessionView,
    },
    {
      path: "/admin/:sessionId",
      name: "admin-session",
      component: AdminSessionView,
    },
    {
      path: "/board/:sessionId",
      name: "board",
      component: BoardView,
    },
  ],
});
