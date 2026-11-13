<script setup lang="ts">
// Иконки лобби: один стиль — контур 2 px на сетке 24×24, скругления. Своих SVG
// хватает на весь набор, библиотека иконок ради десятка значков не нужна.
export type IconName =
  | "chart" | "trophy" | "gear" | "users" | "door"
  | "play" | "swords" | "skull" | "flame" | "chevron-right" | "chevron-down" | "arrow-right"
  | "edit" | "bolt" | "sound" | "sound-off" | "close" | "copy" | "link" | "lock" | "crown";

defineProps<{ name: IconName; size?: number }>();

// Заливка — только там, где контур не читается (треугольник «играть»).
const FILLED = new Set<IconName>(["play", "bolt"]);
const PATHS: Record<IconName, string[]> = {
  chart: ["M4 20h16", "M6.5 16v-4", "M11 16V8", "M15.5 16v-6", "M20 16V5"],
  trophy: ["M8 4h8v5a4 4 0 0 1-8 0V4Z", "M8 5.5H5v1.5a3 3 0 0 0 3 3", "M16 5.5h3v1.5a3 3 0 0 1-3 3", "M12 13v3.5", "M8.5 20h7l-.8-3.5H9.3Z"],
  gear: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7", "M12 6.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z"],
  users: ["M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Z", "M3 19.5c.4-3.4 2.7-5.5 6-5.5s5.6 2.1 6 5.5", "M15.5 10.6a2.8 2.8 0 1 0-.9-5.4", "M17 14.2c2.3.5 3.7 2.4 4 5.3"],
  door: ["M5 20.5V4.5a1 1 0 0 1 1-1h8v17", "M14 3.5l5 1.5v14l-5 1.5", "M3 20.5h18", "M11 12.5h.01"],
  play: ["M7 4.8v14.4a1 1 0 0 0 1.5.9l11.4-7.2a1 1 0 0 0 0-1.8L8.5 3.9A1 1 0 0 0 7 4.8Z"],
  swords: ["M4 4l9.5 9.5", "M4 4h3.5l9 9", "M20 4l-9.5 9.5", "M20 4h-3.5l-3 3", "M7 17l-2.5 2.5M5.5 14.5l4 4", "M17 17l2.5 2.5M18.5 14.5l-4 4"],
  skull: ["M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.5 1.2 4.2 3 5.2V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3.3c1.8-1 3-2.7 3-5.2 0-4-3.1-7-7.5-7Z", "M9 11.5h.01M15 11.5h.01", "M10.5 20v-2.5M13.5 20v-2.5", "M11.2 15h1.6"],
  flame: ["M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.4 1.8 1.4 3 2.6 3.7C11.5 6.7 13 4.5 15 3c-.3 3 2.5 5.4 3.3 8 .4 1.1.7 2.4.7 3.8 0 3.6-3 6.2-7 6.2Z", "M12 21c-1.7 0-3-1.2-3-3 0-1.9 1.6-2.9 2.3-4.6.9 1 1.3 1.4 2.2 1.6.5-.6.8-1.3.9-2 1 1.1 1.6 2.4 1.6 3.8 0 2.4-1.7 4.2-4 4.2Z"],
  "chevron-right": ["m9.5 5.5 6.5 6.5-6.5 6.5"],
  "chevron-down": ["m6 9.5 6 6 6-6"],
  "arrow-right": ["M4.5 12h15", "m13.5 6 6 6-6 6"],
  bolt: ["M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6l1.5-8Z"],
  edit: ["M15.5 4.5l4 4L9 19H5v-4L15.5 4.5Z", "M13.5 6.5l4 4"],
  sound: ["M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Z", "M15.5 9a4 4 0 0 1 0 6", "M18 6.5a7.5 7.5 0 0 1 0 11"],
  "sound-off": ["M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4Z", "m16 9.5 5 5M21 9.5l-5 5"],
  close: ["M6 6l12 12M18 6 6 18"],
  copy: ["M9 9h10.5v10.5H9z", "M15 9V4.5H4.5V15H9"],
  link: ["M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2", "M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"],
  lock: ["M6 10.5h12v9.5H6z", "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5", "M12 14.5v2"],
  crown: ["M4 8l4 4 4-6.5 4 6.5 4-4-1.5 10h-13L4 8Z", "M5.5 20.5h13"],
};
</script>

<template>
  <svg class="icon" :width="size ?? 22" :height="size ?? 22" viewBox="0 0 24 24" aria-hidden="true"
       :fill="FILLED.has(name) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path v-for="(d, i) in PATHS[name]" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.icon { display: block; flex: none; }
</style>
