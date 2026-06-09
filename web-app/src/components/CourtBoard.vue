<script setup lang="ts">
import { Play, Plus, Square } from "@lucide/vue";

import PlayCountBadge from "@/components/PlayCountBadge.vue";
import type { CourtState } from "@/shared/domain";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();

function statusLabel(status: CourtState["status"]): string {
  if (status === "assigned") return "배정됨";
  if (status === "inProgress") return "진행 중";
  return "비어 있음";
}
</script>

<template>
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
          <div class="team-line">
            <span v-for="player in court.match.teamA.players" :key="player.id">
              {{ player.name }}
              <PlayCountBadge :count="player.playCount" />
            </span>
          </div>
          <div class="versus">vs</div>
          <div class="team-line">
            <span v-for="player in court.match.teamB.players" :key="player.id">
              {{ player.name }}
              <PlayCountBadge :count="player.playCount" />
            </span>
          </div>
        </div>

        <div v-else class="court-empty">
          <span>현재 배정 없음</span>
          <small>다음 경기 조가 있으면 먼저 비는 코트에 바로 들어갑니다.</small>
        </div>

        <div class="court-actions">
          <button
            v-if="court.status === 'assigned'"
            class="command primary"
            type="button"
            @click="session.startCourt(court.courtNumber)"
          >
            <Play :size="18" />
            <span>시작</span>
          </button>
          <button
            v-if="court.status === 'inProgress'"
            class="command danger"
            type="button"
            @click="session.finishCourt(court.courtNumber)"
          >
            <Square :size="17" />
            <span>종료</span>
          </button>
          <button
            v-if="court.status === 'empty'"
            class="command"
            :disabled="session.upcomingMatches.length === 0 && session.waitingQueue.length < 4"
            type="button"
            @click="session.assignSingleCourt(court.courtNumber)"
          >
            <Plus :size="18" />
            <span>배정</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
