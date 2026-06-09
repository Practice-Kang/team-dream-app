<script setup lang="ts">
import { computed, ref } from "vue";
import { UserPlus } from "@lucide/vue";

import type { Gender } from "@/shared/domain";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const name = ref("");
const gender = ref<Gender | null>(null);
const scoreText = ref("");

const score = computed(() => Number(scoreText.value));
const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    gender.value !== null &&
    scoreText.value.trim().length > 0 &&
    Number.isFinite(score.value) &&
    score.value >= 0 &&
    score.value <= 100,
);

function selectGender(value: Gender) {
  gender.value = value;
}

function submitGuest() {
  if (!canSubmit.value || !gender.value) return;

  const added = session.addGuestAttendee({
    name: name.value,
    gender: gender.value,
    skillScore: score.value,
  });
  if (!added) return;

  name.value = "";
  gender.value = null;
  scoreText.value = "";
}
</script>

<template>
  <section class="guest-panel" aria-label="게스트 추가">
    <div class="section-title">
      <span>게스트 추가</span>
      <strong>{{ session.guestCount }}명</strong>
    </div>

    <form class="guest-form" @submit.prevent="submitGuest">
      <label class="guest-field guest-name-field">
        <span>이름</span>
        <input v-model="name" autocomplete="off" type="text" />
      </label>

      <div class="guest-gender-control" aria-label="성별">
        <button :class="{ active: gender === '남' }" type="button" @click="selectGender('남')">
          남
        </button>
        <button :class="{ active: gender === '여' }" type="button" @click="selectGender('여')">
          여
        </button>
      </div>

      <label class="guest-field">
        <span>점수</span>
        <input v-model="scoreText" inputmode="numeric" max="100" min="0" type="number" />
      </label>

      <button
        class="command guest-add-command"
        :disabled="!canSubmit || session.syncStatus === 'saving'"
        type="submit"
      >
        <UserPlus :size="18" />
        <span>추가</span>
      </button>
    </form>
  </section>
</template>
