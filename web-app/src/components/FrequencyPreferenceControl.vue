<script setup lang="ts">
import { PLAY_FREQUENCY_LABELS } from "@/shared/domain";
import type { PlayFrequencyPreference } from "@/shared/domain";

const options: PlayFrequencyPreference[] = ["high", "normal", "low"];

defineProps<{
  modelValue: PlayFrequencyPreference;
}>();

defineEmits<{
  "update:modelValue": [value: PlayFrequencyPreference];
}>();
</script>

<template>
  <div class="frequency-control" aria-label="참여 빈도">
    <button
      v-for="option in options"
      :key="option"
      :aria-pressed="modelValue === option"
      :class="{ active: modelValue === option }"
      type="button"
      @click="$emit('update:modelValue', option)"
    >
      {{ PLAY_FREQUENCY_LABELS[option] }}
    </button>
  </div>
</template>
