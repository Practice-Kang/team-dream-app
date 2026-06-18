<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Search } from "@lucide/vue";

import AppHeader from "@/components/AppHeader.vue";
import type { CourtStatus } from "@/shared/domain";
import { matchesKoreanText } from "@/shared/koreanSearch";
import { SESSION_POLL_INTERVAL_MS } from "@/shared/sessionSource";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const searchText = ref("");

let pollTimer: number | null = null;

const waitingPlayers = computed(() => {
  const keyword = searchText.value.trim();
  if (!keyword) return session.waitingQueue;

  return session.waitingQueue.filter((player) => matchesKoreanText(player.name, keyword));
});

const visibleUpcomingMatches = computed(() => {
  const keyword = searchText.value.trim();
  const matches = session.upcomingMatches.map((match, index) => ({ match, index }));
  if (!keyword) return matches;

  return matches.filter(({ match }) =>
    [...match.teamA.players, ...match.teamB.players].some((player) => matchesKoreanText(player.name, keyword)),
  );
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

function playerNames(players: { name: string }[]): string {
  return players.map((player) => player.name).join(" / ");
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
              <span>{{ playerNames(court.match.teamA.players) }}</span>
            </div>
            <div class="versus">vs</div>
            <div class="team-line public">
              <span>{{ playerNames(court.match.teamB.players) }}</span>
            </div>
          </div>

          <div v-else class="court-empty">
            <span>현재 배정 없음</span>
            <small>다음 경기 조가 먼저 비는 코트에 들어갑니다.</small>
          </div>
        </article>
      </div>
    </section>

    <section class="waiting-panel" aria-label="다음 경기">
      <div class="section-title">
        <span>다음 경기</span>
        <strong>{{ session.upcomingMatches.length ? "준비됨" : "없음" }}</strong>
      </div>

      <div v-if="visibleUpcomingMatches.length" class="match-list">
        <article v-for="{ match, index } in visibleUpcomingMatches" :key="match.id" class="match-row">
          <div class="court-badge">다음 {{ index + 1 }}</div>
          <div class="teams">
            <p>{{ playerNames(match.teamA.players) }}</p>
            <span>vs</span>
            <p>{{ playerNames(match.teamB.players) }}</p>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">아직 다음 경기 조가 없습니다</div>
    </section>

    <section class="waiting-panel" aria-label="이후 대기">
      <div class="section-title">
        <span>이후 대기</span>
        <strong>{{ session.waitingQueue.length }}명</strong>
      </div>
      <div v-if="waitingPlayers.length" class="waiting-list">
        <span v-for="player in waitingPlayers" :key="player.id">{{ player.name }}</span>
      </div>
      <div v-else class="empty-state">이후 대기 중인 회원이 없습니다</div>
    </section>
  </main>
</template>
