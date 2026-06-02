<script setup lang="ts">
import { Copy, Play, Sparkles } from "@lucide/vue";

import AppHeader from "@/components/AppHeader.vue";
import CourtBoard from "@/components/CourtBoard.vue";
import FrequencyPreferenceControl from "@/components/FrequencyPreferenceControl.vue";
import PlayCountBadge from "@/components/PlayCountBadge.vue";
import { PLAY_FREQUENCY_LABELS, effectiveGamesPlayed } from "@/shared/domain";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
</script>

<template>
  <main class="screen">
    <AppHeader />

    <section class="toolbar" aria-label="세션 설정">
      <label class="court-control">
        <span>코트</span>
        <input
          :value="session.courtCount"
          inputmode="numeric"
          min="1"
          type="number"
          @input="session.setCourtCount(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </section>

    <section class="status-strip" aria-label="오늘 상태">
      <div>
        <span>참석</span>
        <strong>{{ session.selectedCount }}</strong>
      </div>
      <div>
        <span>배정</span>
        <strong>{{ session.playingCount }}</strong>
      </div>
      <div>
        <span>완료</span>
        <strong>{{ session.completedGameCount }}</strong>
      </div>
      <div>
        <span>대기</span>
        <strong>{{ session.waitingCount }}</strong>
      </div>
    </section>

    <div class="primary-actions">
      <button class="command primary" :disabled="session.hasInProgressCourt" type="button" @click="session.assignInitialCourts">
        <Play :size="20" />
        <span>첫 코트 배정</span>
      </button>
      <button class="icon-command" title="공유 링크" type="button">
        <Copy :size="21" />
      </button>
    </div>

    <CourtBoard />

    <section class="waiting-panel" aria-label="대기 큐">
      <div class="section-title">
        <span>대기 큐</span>
        <strong>{{ session.waitingQueue.length }}명</strong>
      </div>

      <div v-if="session.waitingQueue.length" class="queue-list">
        <article v-for="(player, index) in session.waitingQueue" :key="player.id" class="queue-row">
          <div class="queue-order">{{ index + 1 }}</div>
          <div class="queue-body">
            <strong>{{ player.name }}</strong>
            <span>
              <PlayCountBadge :count="player.playCount" />
              {{ PLAY_FREQUENCY_LABELS[player.playFrequencyPreference] }}
            </span>
          </div>
          <div class="queue-actions">
            <button
              :aria-pressed="player.queueStatus === 'priority'"
              :class="{ active: player.queueStatus === 'priority' }"
              type="button"
              @click="session.setQueueStatus(player.id, 'priority')"
            >
              우선
            </button>
            <button
              :aria-pressed="player.queueStatus === 'hold'"
              :class="{ active: player.queueStatus === 'hold' }"
              type="button"
              @click="session.setQueueStatus(player.id, 'hold')"
            >
              보류
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">대기자가 없습니다</div>
    </section>

    <section class="member-panel" aria-label="참석자">
      <div class="section-title">
        <span>참석자</span>
        <strong>{{ session.selectedCount }}명</strong>
      </div>

      <div class="member-list">
        <article v-for="attendee in session.attendees" :key="attendee.id" class="attendee-row">
          <div class="attendee-main">
            <strong>{{ attendee.name }}</strong>
            <span>{{ attendee.gender }} · {{ attendee.level || "급수 없음" }} · {{ attendee.skillScore ?? "-" }}점</span>
          </div>
          <div class="attendee-count">
            <PlayCountBadge :count="attendee.playCount" />
            <small>보정 {{ effectiveGamesPlayed(attendee).toFixed(1) }}</small>
          </div>
          <FrequencyPreferenceControl
            :model-value="attendee.playFrequencyPreference"
            @update:model-value="session.setFrequencyPreference(attendee.id, $event)"
          />
        </article>
      </div>

      <div class="data-note">
        <Sparkles :size="17" />
        <span>지금은 로컬 샘플 참석자입니다. 회원명단 API를 연결하면 같은 화면에 실제 참석자가 들어옵니다.</span>
      </div>
    </section>
  </main>
</template>
