<script setup lang="ts">
import { Play, Plus, RefreshCw, Square } from "@lucide/vue";

import PlayCountBadge from "@/components/PlayCountBadge.vue";
import { useSessionStore } from "@/stores/session";
import type { CourtState } from "@/shared/domain";

const session = useSessionStore();

function statusLabel(status: CourtState["status"]): string {
  if (status === "assigned") return "배정됨";
  if (status === "inProgress") return "진행중";
  return "비어있음";
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
          <small>대기 4명 이상이면 다음 경기를 넣을 수 있어요.</small>
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
            v-if="court.status === 'assigned'"
            class="command"
            type="button"
            @click="session.assignSingleCourt(court.courtNumber)"
          >
            <RefreshCw :size="18" />
            <span>재배정</span>
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
            :disabled="session.waitingQueue.length < 4"
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
