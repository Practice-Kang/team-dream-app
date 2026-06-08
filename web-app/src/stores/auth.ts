import { defineStore } from "pinia";

import { fetchAuthSession, loginAdmin, logoutAdmin } from "@/services/auth";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    checked: false,
    loading: false,
    error: null as string | null,
    isAdmin: false,
  }),
  actions: {
    async checkSession() {
      if (this.checked) return this.isAdmin;

      this.loading = true;
      this.error = null;

      try {
        const session = await fetchAuthSession();
        this.isAdmin = session.authenticated && session.role === "admin";
      } catch {
        this.isAdmin = false;
      } finally {
        this.checked = true;
        this.loading = false;
      }

      return this.isAdmin;
    },
    async login(id: string, password: string) {
      this.loading = true;
      this.error = null;

      try {
        const session = await loginAdmin({ id, password });
        this.isAdmin = session.authenticated && session.role === "admin";
        this.checked = true;
      } catch (error) {
        this.isAdmin = false;
        this.error = error instanceof Error ? error.message : "운영자 로그인에 실패했습니다.";
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      this.loading = true;
      this.error = null;

      try {
        await logoutAdmin();
      } finally {
        this.isAdmin = false;
        this.checked = true;
        this.loading = false;
      }
    },
  },
});
