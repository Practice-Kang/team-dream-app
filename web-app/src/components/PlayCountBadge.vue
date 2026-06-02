<script setup lang="ts">
defineProps<{
  count: number;
}>();
</script>

<template>
  <span class="play-count-badge">{{ count }}게임</span>
</template>
