<script setup lang="ts">
import { computed } from "vue";

// Аватар игрока: воксельная голова в стиле героя лобби. Цвет волос и фона —
// по нику (детерминированно), чтобы у разных ников аватары различались.
const props = defineProps<{ name: string; size?: number }>();
const HUES = [320, 285, 260, 200, 170, 25, 345];
const hue = computed(() => {
  let h = 0;
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
});
</script>

<template>
  <svg class="avatar" :width="size ?? 40" :height="size ?? 40" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="20" :fill="`hsl(${hue} 70% 22%)`" />
    <rect x="9" y="12" width="22" height="22" rx="2" fill="#f4b39c" />
    <rect x="31" y="14" width="3" height="20" fill="#c98a76" />
    <rect x="8" y="8" width="25" height="7" rx="1.5" :fill="`hsl(${hue} 55% 14%)`" />
    <rect x="12" y="5" width="6" height="5" :fill="`hsl(${hue} 55% 14%)`" />
    <rect x="20" y="4" width="6" height="6" :fill="`hsl(${hue} 55% 14%)`" />
    <rect x="11" y="19" width="18" height="5" rx="1.5" fill="#0d0710" />
    <path d="M15 28q5 3.5 10 0" fill="none" stroke="#3a1420" stroke-width="1.6" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.avatar { display: block; flex: none; border-radius: 50%; }
</style>
