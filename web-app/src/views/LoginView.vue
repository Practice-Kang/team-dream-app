<script setup lang="ts">
import { computed, ref } from "vue";
import { LogIn } from "@lucide/vue";
import { useRoute, useRouter } from "vue-router";

import AppHeader from "@/components/AppHeader.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const id = ref("");
const password = ref("");

const canSubmit = computed(() => id.value.trim().length > 0 && password.value.length > 0 && !auth.loading);

async function submitLogin() {
  if (!canSubmit.value) return;

  try {
    await auth.login(id.value.trim(), password.value);
    await router.replace(String(route.query.redirect || "/admin/new"));
  } catch {
    password.value = "";
  }
}
</script>

<template>
  <main class="screen login-screen">
    <AppHeader />

    <section class="login-panel" aria-label="운영자 로그인">
      <div class="section-title">
        <span>운영자 로그인</span>
      </div>

      <form class="login-form" @submit.prevent="submitLogin">
        <label>
          <span>아이디</span>
          <input v-model="id" autocomplete="username" inputmode="text" type="text" />
        </label>

        <label>
          <span>비밀번호</span>
          <input v-model="password" autocomplete="current-password" type="password" />
        </label>

        <p v-if="auth.error" class="form-error">{{ auth.error }}</p>

        <button class="command primary" :disabled="!canSubmit" type="submit">
          <LogIn :size="19" />
          <span>{{ auth.loading ? "확인 중" : "로그인" }}</span>
        </button>
      </form>
    </section>

    <section class="guest-note">
      <strong>회원은 로그인하지 않아도 됩니다</strong>
      <span>공유받은 경기판 링크에서는 코트 현황과 대기 순번만 읽기 전용으로 볼 수 있어요.</span>
    </section>
  </main>
</template>
