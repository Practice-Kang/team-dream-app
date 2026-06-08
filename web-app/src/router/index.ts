import { createRouter, createWebHistory } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import AdminSessionView from "@/views/AdminSessionView.vue";
import BoardView from "@/views/BoardView.vue";
import LoginView from "@/views/LoginView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/admin/new",
    },
    {
      path: "/login",
      name: "login",
      component: LoginView,
    },
    {
      path: "/admin/new",
      name: "admin-new",
      component: AdminSessionView,
      meta: {
        requiresAdmin: true,
      },
    },
    {
      path: "/admin/:sessionId",
      name: "admin-session",
      component: AdminSessionView,
      meta: {
        requiresAdmin: true,
      },
    },
    {
      path: "/board/:sessionId",
      name: "board",
      component: BoardView,
    },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAdmin) return true;

  const auth = useAuthStore();
  const isAdmin = await auth.checkSession();

  if (isAdmin) return true;

  return {
    name: "login",
    query: {
      redirect: to.fullPath,
    },
  };
});
