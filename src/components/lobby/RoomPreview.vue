<script setup lang="ts">
import { computed } from "vue";

// Превью карты для карточки комнаты: арена сверху в стиле игры — пол, кирпичные
// стены и ящики, симметричные поворотом на 180°, как настоящие карты сервера.
// Точную карту комнаты API не отдаёт, поэтому раскладка — декоративная, но
// детерминированная по id: у каждой комнаты своё превью, и оно не «пляшет».
// В режиме зомби — тёмная палитра и красные глаза в темноте.
const props = defineProps<{ id: string; mode: string; large?: boolean }>();

const W = 160, H = 90;

function rng(seed: string) {
  let a = 0;
  for (const ch of seed) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rect = { x: number; y: number; w: number; h: number };
const layout = computed(() => {
  const r = rng(props.id);
  const walls: Rect[] = [{ x: W / 2 - 12, y: H / 2 - 9, w: 24, h: 18 }]; // центральное укрытие
  const crates: Rect[] = [];
  const mirror = (o: Rect): Rect => ({ x: W - o.x - o.w, y: H - o.y - o.h, w: o.w, h: o.h });
  const n = props.large ? 4 : 3;
  for (let i = 0; i < n; i++) { // стены — пары, симметричные поворотом
    const horiz = r() < 0.6;
    const o = { x: 10 + r() * (W / 2 - 40), y: 8 + r() * (H - 30), w: horiz ? 18 + r() * 14 : 5, h: horiz ? 5 : 14 + r() * 10 };
    walls.push(o, mirror(o));
  }
  for (let i = 0; i < n + 1; i++) {
    const o = { x: 14 + r() * (W / 2 - 30), y: 10 + r() * (H - 26), w: 8, h: 8 };
    crates.push(o, mirror(o));
  }
  const eyes = Array.from({ length: 5 }, () => ({ x: 8 + r() * (W - 16), y: 8 + r() * (H - 16) }));
  return { walls, crates, eyes };
});
const zombie = computed(() => props.mode === "zombie");
const uid = computed(() => `rp-${props.id}`);
</script>

<template>
  <svg class="preview" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <pattern :id="`${uid}-floor`" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" :fill="zombie ? '#141a17' : '#241a35'" />
        <rect width="9.4" height="9.4" :fill="zombie ? '#19211c' : '#2c2042'" />
      </pattern>
      <radialGradient :id="`${uid}-light`" cx="50%" cy="45%" r="70%">
        <stop offset="0" :stop-color="zombie ? '#4dff88' : '#ff3fb4'" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0.55" />
      </radialGradient>
    </defs>
    <rect :width="W" :height="H" :fill="`url(#${uid}-floor)`" />
    <rect v-for="(o, i) in layout.walls" :key="'w' + i" :x="o.x" :y="o.y" :width="o.w" :height="o.h"
          :fill="zombie ? '#5a3a33' : '#8a4a3a'" stroke="#1a0f0c" stroke-width="0.8" />
    <g v-for="(o, i) in layout.crates" :key="'c' + i">
      <rect :x="o.x" :y="o.y" :width="o.w" :height="o.h" fill="#a0693a" stroke="#4a2c12" stroke-width="0.8" />
      <path :d="`M${o.x} ${o.y}l${o.w} ${o.h}M${o.x + o.w} ${o.y}l${-o.w} ${o.h}`" stroke="#5e3a1a" stroke-width="0.8" />
    </g>
    <rect :width="W" :height="H" :fill="`url(#${uid}-light)`" />
    <g v-if="zombie" fill="#ff3030">
      <g v-for="(e, i) in layout.eyes" :key="'e' + i">
        <rect :x="e.x" :y="e.y" width="1.6" height="1.6" /><rect :x="e.x + 3" :y="e.y" width="1.6" height="1.6" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.preview { display: block; width: 100%; height: 100%; }
</style>
