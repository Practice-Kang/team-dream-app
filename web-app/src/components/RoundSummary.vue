<script setup lang="ts">
import type { Round } from "@/shared/domain";

defineProps<{
  round: Round | null;
}>();
</script>

<template>
  <section class="round-summary" aria-label="현재 라운드">
    <div class="section-title">
      <span>현재 경기</span>
      <strong>{{ round?.matches.length ?? 0 }}게임</strong>
    </div>

    <div v-if="round && round.matches.length > 0" class="match-list">
      <article v-for="match in round.matches" :key="match.courtNumber" class="match-row">
        <div class="court-badge">{{ match.courtNumber }}코트</div>
        <div class="teams">
          <p>{{ match.teamA.players.map((player) => player.name).join(" / ") }}</p>
          <span>vs</span>
          <p>{{ match.teamB.players.map((player) => player.name).join(" / ") }}</p>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">대기 중</div>
  </section>
</template>
