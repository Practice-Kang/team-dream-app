<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Search, X } from "@lucide/vue";

import PlayCountBadge from "@/components/PlayCountBadge.vue";
import type { Attendee, EditableMatchTarget, Match, MatchSlot, QueuedMatch } from "@/shared/domain";
import { useSessionStore } from "@/stores/session";

interface Candidate {
  player: Attendee;
  source: string;
}

const props = defineProps<{
  target: EditableMatchTarget | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const session = useSessionStore();
const selectedSlot = ref<MatchSlot>({ team: "teamA", playerIndex: 0 });
const searchText = ref("");

watch(
  () => props.target,
  () => {
    selectedSlot.value = { team: "teamA", playerIndex: 0 };
    searchText.value = "";
  },
);

const match = computed(() => {
  const target = props.target;
  if (!target) return null;

  if (target.type === "upcoming") {
    return session.upcomingMatches[target.index] ?? null;
  }

  const court = session.courts.find((candidate) => candidate.courtNumber === target.courtNumber);
  return court?.status === "assigned" ? court.match : null;
});

const title = computed(() => {
  if (!props.target) return "경기 수정";
  return props.target.type === "court" ? `${props.target.courtNumber}코트 수정` : "다음 1 수정";
});

const selectedPlayer = computed(
  () => match.value?.[selectedSlot.value.team].players[selectedSlot.value.playerIndex] ?? null,
);

const candidates = computed(() => {
  const keyword = searchText.value.trim();
  const seenIds = new Set<string>();
  const list: Candidate[] = [];

  const addPlayer = (player: Attendee, source: string) => {
    if (seenIds.has(player.id)) return;
    seenIds.add(player.id);
    if (keyword && !player.name.includes(keyword)) return;

    list.push({ player, source });
  };

  session.courts.forEach((court) => {
    if (court.status !== "assigned" || !court.match) return;
    playersOf(court.match).forEach((player) => addPlayer(player, `${court.courtNumber}코트`));
  });

  session.upcomingMatches.forEach((queuedMatch, index) => {
    playersOf(queuedMatch).forEach((player) => addPlayer(player, index === 0 ? "다음 1" : `다음 ${index + 1}`));
  });

  session.waitingQueue.forEach((player, index) => addPlayer(player, `대기 ${index + 1}`));

  return list;
});

function selectSlot(team: MatchSlot["team"], playerIndex: number) {
  selectedSlot.value = { team, playerIndex };
}

function selectCandidate(playerId: string) {
  if (!props.target) return;
  session.replaceEditableMatchPlayer(props.target, selectedSlot.value, playerId);
}

function playersOf(match: Pick<Match | QueuedMatch, "teamA" | "teamB">): Attendee[] {
  return [...match.teamA.players, ...match.teamB.players];
}
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="editor-backdrop" role="presentation" @click.self="emit('close')">
      <section class="match-editor" aria-label="경기 수정">
        <header class="editor-header">
          <div>
            <strong>{{ title }}</strong>
            <span>슬롯을 고르고 교체할 선수를 선택하세요</span>
          </div>
          <button class="icon-command editor-close" title="닫기" type="button" @click="emit('close')">
            <X :size="20" />
          </button>
        </header>

        <div v-if="match" class="editor-body">
          <div class="editor-teams">
            <section>
              <h3>A팀</h3>
              <button
                v-for="(player, index) in match.teamA.players"
                :key="player.id"
                class="editor-slot"
                :class="{ active: selectedSlot.team === 'teamA' && selectedSlot.playerIndex === index }"
                type="button"
                @click="selectSlot('teamA', index)"
              >
                <strong>{{ player.name }}</strong>
                <span>
                  <small v-if="player.isGuest" class="inline-chip">게스트</small>
                  {{ player.gender }} · {{ player.skillScore ?? "-" }}점
                </span>
              </button>
            </section>

            <section>
              <h3>B팀</h3>
              <button
                v-for="(player, index) in match.teamB.players"
                :key="player.id"
                class="editor-slot"
                :class="{ active: selectedSlot.team === 'teamB' && selectedSlot.playerIndex === index }"
                type="button"
                @click="selectSlot('teamB', index)"
              >
                <strong>{{ player.name }}</strong>
                <span>
                  <small v-if="player.isGuest" class="inline-chip">게스트</small>
                  {{ player.gender }} · {{ player.skillScore ?? "-" }}점
                </span>
              </button>
            </section>
          </div>

          <label class="editor-search">
            <Search :size="18" />
            <input v-model="searchText" type="search" placeholder="교체 선수 검색" />
          </label>

          <div class="candidate-list">
            <button
              v-for="candidate in candidates"
              :key="candidate.player.id"
              class="candidate-row"
              :class="{ active: candidate.player.id === selectedPlayer?.id }"
              type="button"
              @click="selectCandidate(candidate.player.id)"
            >
              <span class="candidate-main">
                <strong>
                  {{ candidate.player.name }}
                  <small v-if="candidate.player.isGuest" class="inline-chip">게스트</small>
                </strong>
                <small>
                  {{ candidate.player.gender }} · {{ candidate.player.level || "급수 없음" }} ·
                  {{ candidate.player.skillScore ?? "-" }}점
                </small>
              </span>
              <span class="candidate-meta">
                <PlayCountBadge :count="candidate.player.playCount" />
                <small>{{ candidate.source }}</small>
              </span>
            </button>
          </div>
        </div>

        <div v-else class="empty-state">수정할 수 있는 경기 상태가 아닙니다</div>
      </section>
    </div>
  </Teleport>
</template>
