<script setup lang="ts">
import { Search } from "@lucide/vue";

import AppHeader from "@/components/AppHeader.vue";
import { useSessionStore } from "@/stores/session";
import type { CourtStatus } from "@/shared/domain";

const session = useSessionStore();

function statusLabel(status: CourtStatus): string {
  if (status === "assigned") return "시작 전";
  if (status === "inProgress") return "진행중";
  return "비어있음";
}
</script>

<template>
  <main class="screen board-screen">
    <AppHeader />

    <label class="search-box">
      <Search :size="20" />
      <input type="search" placeholder="내 이름" />
    </label>

    <section class="court-board" aria-label="코트 현황">
      <div class="section-title">
        <span>코트 현황</span>
        <strong>{{ session.courts.length }}코트</strong>
      </div>

      <div class="court-list">
        <article v-for="court in session.courts" :key="court.courtNumber" class="court-card">
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
        <strong>{{ session.currentRound?.waiting.length ?? 0 }}명</strong>
      </div>
      <div class="waiting-list" v-if="session.currentRound?.waiting.length">
        <span v-for="player in session.currentRound.waiting" :key="player.id">{{ player.name }}</span>
      </div>
      <div v-else class="empty-state">대기 중</div>
    </section>
  </main>
</template>
