<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Copy, Database, LogOut, Play, RefreshCw } from "@lucide/vue";
import { useRouter } from "vue-router";

import AppHeader from "@/components/AppHeader.vue";
import CourtBoard from "@/components/CourtBoard.vue";
import FrequencyPreferenceControl from "@/components/FrequencyPreferenceControl.vue";
import PlayCountBadge from "@/components/PlayCountBadge.vue";
import { PLAY_FREQUENCY_LABELS, effectiveGamesPlayed } from "@/shared/domain";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const auth = useAuthStore();
const router = useRouter();

const canReloadAttendees = computed(
  () => !session.hasAssignedCourt && session.completedGameCount === 0 && !session.attendeesLoading,
);

onMounted(() => {
  if (session.selectedCount === 0) {
    void session.loadTodayAttendees();
  }
});

function reloadTodayAttendees() {
  void session.loadTodayAttendees();
}

async function logout() {
  await auth.logout();
  await router.replace("/login");
}

function formatFetchedAt(value: string | null): string {
  if (!value) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>

<template>
  <main class="screen">
    <AppHeader />

    <section class="toolbar" aria-label="세션 설정">
      <span class="mode-badge">운영자</span>
      <button class="toolbar-command" :disabled="!canReloadAttendees" type="button" @click="reloadTodayAttendees">
        <RefreshCw :size="17" />
        <span>출석기록</span>
      </button>
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
      <button class="toolbar-command icon-only" title="로그아웃" type="button" @click="logout">
        <LogOut :size="18" />
      </button>
    </section>

    <section class="status-strip" aria-label="오늘 상태">
      <div>
        <span>출석</span>
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
      <button
        class="command primary"
        :disabled="session.hasInProgressCourt || session.attendeesLoading || session.selectedCount < 4"
        type="button"
        @click="session.assignInitialCourts"
      >
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
        <span>오늘 참석자</span>
        <strong>{{ session.selectedCount }}명</strong>
      </div>

      <div v-if="session.attendeesLoading && session.selectedCount === 0" class="empty-state">출석기록 불러오는 중</div>
      <div v-else-if="session.attendeesError && session.selectedCount === 0" class="empty-state">
        {{ session.attendeesError }}
      </div>
      <div v-else-if="session.selectedCount === 0" class="empty-state">
        오늘 출석기록에 체크된 참석자가 없습니다.
      </div>
      <div v-else class="member-list">
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

      <div class="data-note" :class="{ error: Boolean(session.attendeesError || session.unmatchedAttendanceNames.length) }">
        <Database :size="17" />
        <span v-if="session.attendeesError">{{ session.attendeesError }}</span>
        <span v-else-if="session.attendeesLoading">출석기록을 불러오는 중입니다.</span>
        <span v-else-if="session.unmatchedAttendanceNames.length">
          회원명단에 없는 출석자: {{ session.unmatchedAttendanceNames.join(", ") }}
        </span>
        <span v-else>
          출석기록 {{ session.attendanceDate }} · 참석 {{ session.selectedCount }}명 · 회원 {{ session.sourceMembersCount }}명 ·
          {{ formatFetchedAt(session.attendeesFetchedAt) }}
        </span>
        <button v-if="(session.attendeesError || session.unmatchedAttendanceNames.length) && canReloadAttendees" type="button" @click="reloadTodayAttendees">
          다시 시도
        </button>
      </div>
    </section>
  </main>
</template>
