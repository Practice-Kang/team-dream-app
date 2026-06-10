<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  CirclePause,
  Copy,
  Database,
  LogOut,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Undo2,
  Users,
  X,
} from "@lucide/vue";
import { useRouter } from "vue-router";

import AppHeader from "@/components/AppHeader.vue";
import CourtBoard from "@/components/CourtBoard.vue";
import FrequencyPreferenceControl from "@/components/FrequencyPreferenceControl.vue";
import GuestAddForm from "@/components/GuestAddForm.vue";
import MatchEditorSheet from "@/components/MatchEditorSheet.vue";
import PlayCountBadge from "@/components/PlayCountBadge.vue";
import { PLAY_FREQUENCY_LABELS, effectiveGamesPlayed, type Attendee, type EditableMatchTarget } from "@/shared/domain";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const auth = useAuthStore();
const router = useRouter();
const editTarget = ref<EditableMatchTarget | null>(null);
const companionPlayerAId = ref("");
const companionPlayerBId = ref("");

const canReloadAttendees = computed(() => !session.attendeesLoading);
const hasSessionStateToReset = computed(
  () =>
    session.hasAssignedCourt ||
    session.completedGameCount > 0 ||
    session.upcomingMatches.length > 0 ||
    session.waitingQueue.length > 0,
);
const pairedPlayerIds = computed(
  () => new Set(session.companionPairs.flatMap((pair) => [pair.playerAId, pair.playerBId])),
);
const companionPlayerAOptions = computed(() =>
  session.attendees.filter(
    (attendee) =>
      !attendee.isDisabled && (!pairedPlayerIds.value.has(attendee.id) || attendee.id === companionPlayerAId.value),
  ),
);
const companionPlayerBOptions = computed(() =>
  session.attendees.filter(
    (attendee) =>
      !attendee.isDisabled &&
      attendee.id !== companionPlayerAId.value &&
      (!pairedPlayerIds.value.has(attendee.id) || attendee.id === companionPlayerBId.value),
  ),
);
const canAddCompanionPair = computed(
  () =>
    Boolean(companionPlayerAId.value && companionPlayerBId.value) &&
    companionPlayerAId.value !== companionPlayerBId.value,
);

onMounted(async () => {
  const loadedRemoteSession = await session.loadRemoteSession({ silent: true });

  if (!loadedRemoteSession && session.selectedCount === 0) {
    void session.loadTodayAttendees();
  }
});

function reloadTodayAttendees() {
  if (
    hasSessionStateToReset.value &&
    !window.confirm("현재 경기판을 초기화하고 출석기록을 다시 불러올까요?")
  ) {
    return;
  }

  void session.loadTodayAttendees({ resetSession: true });
}

function openCourtEditor(courtNumber: number) {
  editTarget.value = {
    type: "court",
    courtNumber,
  };
}

function openUpcomingEditor(index: number) {
  editTarget.value = {
    type: "upcoming",
    index,
  };
}

async function logout() {
  await auth.logout();
  await router.replace("/login");
}

function playerNames(players: { name: string }[]): string {
  return players.map((player) => player.name).join(" / ");
}

function updateGuestSkillScore(attendeeId: string, rawValue: string) {
  session.setGuestSkillScore(attendeeId, Number(rawValue));
}

function addCompanionPair() {
  if (!canAddCompanionPair.value) return;

  const added = session.addCompanionPair(companionPlayerAId.value, companionPlayerBId.value);
  if (!added) {
    window.alert("이미 우선동반에 포함된 참석자가 있어 등록할 수 없습니다.");
    return;
  }

  companionPlayerAId.value = "";
  companionPlayerBId.value = "";
}

function companionPlayerName(playerId: string): string {
  return session.attendees.find((attendee) => attendee.id === playerId)?.name ?? "알 수 없음";
}

function companionNameFor(attendeeId: string): string | null {
  const pair = session.companionPairs.find(
    (candidate) => candidate.playerAId === attendeeId || candidate.playerBId === attendeeId,
  );
  if (!pair) return null;

  return companionPlayerName(pair.playerAId === attendeeId ? pair.playerBId : pair.playerAId);
}

function isInProgressAttendee(attendeeId: string): boolean {
  return session.courts.some(
    (court) =>
      court.status === "inProgress" &&
      court.match &&
      [...court.match.teamA.players, ...court.match.teamB.players].some((player) => player.id === attendeeId),
  );
}

function toggleAttendeeDisabled(attendee: Attendee) {
  const disabled = !attendee.isDisabled;
  const changed = session.setAttendeeDisabled(attendee.id, disabled);

  if (!changed) {
    window.alert("진행 중 경기이거나 교체할 대기자가 부족해서 지금은 변경할 수 없습니다.");
  }
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
        <RefreshCw :class="{ spinning: session.attendeesLoading }" :size="17" />
        <span>{{ session.attendeesLoading ? "불러오는 중" : "초기화" }}</span>
      </button>
      <button
        class="toolbar-command"
        :disabled="!session.canUndo || session.syncStatus === 'saving'"
        :title="session.lastUndoLabel ? `${session.lastUndoLabel}으로 되돌리기` : '되돌릴 변경 없음'"
        type="button"
        @click="session.undoLastChange"
      >
        <Undo2 :size="17" />
        <span>되돌리기</span>
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
        :disabled="session.hasInProgressCourt || session.attendeesLoading || session.activeAttendeeCount < 4"
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

    <GuestAddForm />

    <section class="companion-panel" aria-label="우선동반">
      <div class="section-title">
        <span>우선동반</span>
        <strong>{{ session.companionPairCount }}쌍</strong>
      </div>

      <div class="companion-form">
        <label class="companion-select">
          <span>A</span>
          <select v-model="companionPlayerAId">
            <option value="">선택</option>
            <option v-for="attendee in companionPlayerAOptions" :key="attendee.id" :value="attendee.id">
              {{ attendee.name }}
            </option>
          </select>
        </label>
        <label class="companion-select">
          <span>B</span>
          <select v-model="companionPlayerBId">
            <option value="">선택</option>
            <option v-for="attendee in companionPlayerBOptions" :key="attendee.id" :value="attendee.id">
              {{ attendee.name }}
            </option>
          </select>
        </label>
        <button
          class="command companion-add-command"
          :disabled="!canAddCompanionPair"
          type="button"
          @click="addCompanionPair"
        >
          <Users :size="18" />
          <span>추가</span>
        </button>
      </div>

      <div v-if="session.companionPairs.length" class="companion-list">
        <article v-for="pair in session.companionPairs" :key="pair.id" class="companion-row">
          <strong>{{ companionPlayerName(pair.playerAId) }} / {{ companionPlayerName(pair.playerBId) }}</strong>
          <button
            class="icon-command companion-remove-command"
            title="우선동반 삭제"
            type="button"
            @click="session.removeCompanionPair(pair.id)"
          >
            <X :size="18" />
          </button>
        </article>
      </div>

      <div v-else class="empty-state">등록된 우선동반이 없습니다</div>
    </section>

    <CourtBoard @edit-court="openCourtEditor" />

    <section class="waiting-panel" aria-label="다음 경기">
      <div class="section-title">
        <span>다음 1</span>
        <strong>{{ session.upcomingMatches.length ? "준비됨" : "없음" }}</strong>
      </div>

      <div v-if="session.upcomingMatches.length" class="match-list">
        <article v-for="(match, index) in session.upcomingMatches" :key="match.id" class="match-row editable">
          <div class="court-badge">다음 1</div>
          <div class="teams">
            <p>{{ playerNames(match.teamA.players) }}</p>
            <span>vs</span>
            <p>{{ playerNames(match.teamB.players) }}</p>
          </div>
          <button
            class="icon-command match-edit-command"
            title="다음 경기 수정"
            type="button"
            @click="openUpcomingEditor(index)"
          >
            <Pencil :size="18" />
          </button>
        </article>
      </div>

      <div v-else class="empty-state">아직 미리 짜둔 다음 경기가 없습니다</div>
    </section>

    <section class="waiting-panel" aria-label="이후 대기">
      <div class="section-title">
        <span>이후 대기</span>
        <strong>{{ session.waitingQueue.length }}명</strong>
      </div>

      <div v-if="session.waitingQueue.length" class="queue-list">
        <article v-for="(player, index) in session.waitingQueue" :key="player.id" class="queue-row">
          <div class="queue-order">{{ index + 1 }}</div>
          <div class="queue-body">
            <strong>
              {{ player.name }}
              <small v-if="player.isGuest" class="inline-chip">게스트</small>
            </strong>
            <span>
              <PlayCountBadge :count="player.playCount" />
              {{ PLAY_FREQUENCY_LABELS[player.playFrequencyPreference] }}
            </span>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">이후 대기자가 없습니다</div>
    </section>

    <section class="member-panel" aria-label="참석자">
      <div class="section-title">
        <span>오늘 참석자</span>
        <strong>
          {{ session.activeAttendeeCount }}명 가능
          <span v-if="session.disabledCount"> · 쉼 {{ session.disabledCount }}</span>
        </strong>
      </div>

      <div v-if="session.attendeesLoading && session.selectedCount === 0" class="empty-state">출석기록 불러오는 중</div>
      <div v-else-if="session.attendeesError && session.selectedCount === 0" class="empty-state">
        {{ session.attendeesError }}
      </div>
      <div v-else-if="session.selectedCount === 0" class="empty-state">
        오늘 출석기록에 체크된 참석자가 없습니다.
      </div>
      <div v-else class="member-list">
        <article
          v-for="attendee in session.attendees"
          :key="attendee.id"
          class="attendee-row"
          :class="{ disabled: attendee.isDisabled }"
        >
          <div class="attendee-main">
            <strong>
              {{ attendee.name }}
              <small v-if="attendee.isGuest" class="inline-chip">게스트</small>
              <small v-if="attendee.isDisabled" class="inline-chip paused">쉬는중</small>
              <small v-if="companionNameFor(attendee.id)" class="inline-chip companion">
                동반 {{ companionNameFor(attendee.id) }}
              </small>
            </strong>
            <template v-if="attendee.isGuest">
              <span>{{ attendee.gender }} · 게스트</span>
              <label class="guest-score-field">
                <span>점수</span>
                <input
                  :value="attendee.skillScore ?? ''"
                  inputmode="numeric"
                  max="100"
                  min="0"
                  type="number"
                  @change="updateGuestSkillScore(attendee.id, ($event.target as HTMLInputElement).value)"
                />
              </label>
            </template>
            <span v-else>{{ attendee.gender }} · {{ attendee.level || "급수 없음" }} · {{ attendee.skillScore ?? "-" }}점</span>
          </div>
          <div class="attendee-count">
            <PlayCountBadge :count="attendee.playCount" />
            <small>보정 {{ effectiveGamesPlayed(attendee).toFixed(1) }}</small>
          </div>
          <div class="attendee-actions">
            <button
              class="attendee-toggle-command"
              :class="{ active: attendee.isDisabled }"
              :disabled="isInProgressAttendee(attendee.id)"
              :title="
                isInProgressAttendee(attendee.id)
                  ? '진행 중 경기는 종료 후 변경 가능'
                  : attendee.isDisabled
                    ? '다시 매칭에 포함'
                    : '미래 매칭에서 잠시 제외'
              "
              type="button"
              @click="toggleAttendeeDisabled(attendee)"
            >
              <RotateCcw v-if="attendee.isDisabled" :size="16" />
              <CirclePause v-else :size="16" />
              <span>{{ attendee.isDisabled ? "복귀" : "쉬기" }}</span>
            </button>
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
        <button
          v-if="(session.attendeesError || session.unmatchedAttendanceNames.length) && canReloadAttendees"
          type="button"
          @click="reloadTodayAttendees"
        >
          다시 시도
        </button>
      </div>
    </section>

    <div v-if="session.attendeesLoading" class="loading-overlay" role="status" aria-live="polite">
      <div class="loading-panel">
        <RefreshCw class="spinning" :size="28" />
        <strong>출석기록 불러오는 중</strong>
        <span>경기판을 다시 맞추고 있습니다.</span>
      </div>
    </div>

    <MatchEditorSheet :target="editTarget" @close="editTarget = null" />
  </main>
</template>
