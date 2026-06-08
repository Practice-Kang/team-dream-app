<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Search } from "@lucide/vue";

import AppHeader from "@/components/AppHeader.vue";
import type { CourtStatus } from "@/shared/domain";
import { SESSION_POLL_INTERVAL_MS } from "@/shared/sessionSource";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const searchText = ref("");

let pollTimer: number | null = null;

const waitingPlayers = computed(() => {
  const keyword = searchText.value.trim();
  if (!keyword) return session.waitingQueue;

  return session.waitingQueue.filter((player) => player.name.includes(keyword));
});

const syncLabel = computed(() => {
  if (session.syncStatus === "loading") return "경기판 불러오는 중";
  if (session.syncError) return session.syncError;
  if (!session.lastSyncedAt) return "공유된 경기판을 기다리는 중";

  return `마지막 갱신 ${formatTime(session.lastSyncedAt)}`;
});

onMounted(() => {
  void session.loadRemoteSession();
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void session.loadRemoteSession({ silent: true });
    }
  }, SESSION_POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", refreshWhenVisible);
});

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }

  document.removeEventListener("visibilitychange", refreshWhenVisible);
});

function refreshWhenVisible() {
  if (document.visibilityState === "visible") {
    void session.loadRemoteSession({ silent: true });
  }
}

function statusLabel(status: CourtStatus): string {
  if (status === "assigned") return "시작 전";
  if (status === "inProgress") return "진행 중";
  return "비어 있음";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
</script>

<template>
  <main class="screen board-screen">
    <AppHeader />

    <label class="search-box">
      <Search :size="20" />
      <input v-model="searchText" type="search" placeholder="내 이름" />
    </label>

    <div class="data-note" :class="{ error: Boolean(session.syncError) }">
      <span>{{ syncLabel }}</span>
    </div>

    <section class="court-board" aria-label="코트 현황">
      <div class="section-title">
        <span>코트 현황</span>
        <strong>{{ session.courts.length }}코트</strong>
      </div>

      <div class="court-list">
        <article
          v-for="court in session.courts"
          :key="court.courtNumber"
          class="court-card"
          :class="`status-${court.status}`"
        >
          <header class="court-card-header">
            <strong>{{ court.courtNumber }}코트</strong>
            <span>{{ statusLabel(court.status) }}</span>
          </header>

          <div v-if="court.match" class="court-match">
            <div class="team-line public">
              <span>{{ court.match.teamA.players.map((player) => player.name).join(" / ") }}</span>
            </div>
            <div class="versus">vs</div>
            <div class="team-line public">
              <span>{{ court.match.teamB.players.map((player) => player.name).join(" / ") }}</span>
            </div>
          </div>

          <div v-else class="court-empty">
            <span>현재 배정 없음</span>
            <small>먼저 비는 코트에 대기 순서대로 배정됩니다.</small>
          </div>
        </article>
      </div>
    </section>

    <section class="waiting-panel" aria-label="대기">
      <div class="section-title">
        <span>대기</span>
        <strong>{{ session.waitingQueue.length }}명</strong>
      </div>
      <div v-if="waitingPlayers.length" class="waiting-list">
        <span v-for="player in waitingPlayers" :key="player.id">{{ player.name }}</span>
      </div>
      <div v-else class="empty-state">대기 중인 회원이 없습니다</div>
    </section>
  </main>
</template>
