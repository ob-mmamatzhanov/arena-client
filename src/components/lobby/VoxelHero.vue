<script setup lang="ts">
import { computed } from "vue";

// Герой лобби: воксельный персонаж на фоне неонового замка, всё — SVG из блоков
// (своя рисовка, без чужих персонажей и без растровых ассетов). В режиме «Зомби»
// герой зеленеет, глаза краснеют, руки вытянуты вперёд. Декоративный: aria-hidden.
const props = defineProps<{ mode: string }>();
const zombie = computed(() => props.mode === "zombie");

type Box = { x: number; y: number; w: number; h: number; d?: number; c: string };
type Face = { pts: string; fill: string };

// Цвет с осветлением/затемнением: k > 0 — к белому, k < 0 — к чёрному.
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Блок в «кабинетной» проекции: лицевая грань, верх и правый бок со сдвигом глубины.
function faces(b: Box): Face[] {
  const d = b.d ?? 16, dx = d * 0.7, dy = d * 0.55;
  const { x, y, w, h } = b;
  return [
    { pts: `${x},${y} ${x + dx},${y - dy} ${x + w + dx},${y - dy} ${x + w},${y}`, fill: shade(b.c, 0.22) },
    { pts: `${x + w},${y} ${x + w + dx},${y - dy} ${x + w + dx},${y + h - dy} ${x + w},${y + h}`, fill: shade(b.c, -0.3) },
    { pts: `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`, fill: b.c },
  ];
}
const draw = (boxes: Box[]) => boxes.flatMap(faces);

const palette = computed(() => zombie.value
  ? { skin: "#8fae7a", cloth: "#3b3944", pants: "#26242c", hair: "#2a3324", accent: "#7dff6a" }
  : { skin: "#f4b39c", cloth: "#24142f", pants: "#1b1022", hair: "#1a1020", accent: "#ff2fa8" });

// Тело и ноги — общие для обоих вариантов.
const body = computed(() => {
  const p = palette.value;
  return draw([
    { x: 156, y: 352, w: 46, h: 104, c: p.pants }, // левая нога
    { x: 206, y: 352, w: 46, h: 104, c: p.pants }, // правая нога
    { x: 150, y: 446, w: 54, h: 20, c: "#120a18" }, // кроссовки
    { x: 204, y: 446, w: 54, h: 20, c: "#120a18" },
    { x: 140, y: 214, w: 128, h: 146, d: 30, c: p.cloth }, // худи
  ]);
});
// Руки: в обычном виде левая опущена, правая поднята жестом «вперёд»;
// у зомби обе вытянуты к зрителю-вправо.
const armLeft = computed(() => draw([
  { x: 98, y: 220, w: 42, h: 104, d: 22, c: palette.value.cloth },
  { x: 98, y: 318, w: 42, h: 34, d: 22, c: palette.value.skin },
]));
const armRight = computed(() => draw([
  { x: 268, y: 220, w: 42, h: 96, d: 22, c: palette.value.cloth },
  { x: 268, y: 310, w: 42, h: 36, d: 22, c: palette.value.skin },
]));
const head = computed(() => {
  const p = palette.value;
  const hair: Box[] = zombie.value
    ? [ // клочья
        { x: 150, y: 84, w: 40, h: 16, d: 30, c: p.hair },
        { x: 214, y: 80, w: 32, h: 14, d: 30, c: p.hair },
      ]
    : [ // торчащие пряди
        { x: 146, y: 78, w: 116, h: 26, d: 34, c: p.hair },
        { x: 150, y: 58, w: 30, h: 22, d: 26, c: p.hair },
        { x: 186, y: 50, w: 30, h: 30, d: 26, c: p.hair },
        { x: 222, y: 56, w: 30, h: 24, d: 26, c: p.hair },
        { x: 136, y: 96, w: 18, h: 40, d: 30, c: p.hair },
      ];
  return draw([{ x: 146, y: 96, w: 116, h: 112, d: 34, c: p.skin }, ...hair]);
});
</script>

<template>
  <svg class="hero-art" viewBox="0 0 520 520" aria-hidden="true">
    <defs>
      <radialGradient id="hero-glow" cx="50%" cy="55%" r="50%">
        <stop offset="0" :stop-color="zombie ? '#3cff7a' : '#ff2fa8'" stop-opacity="0.55" />
        <stop offset="0.55" :stop-color="zombie ? '#1f7a4a' : '#8a2be2'" stop-opacity="0.22" />
        <stop offset="1" stop-color="#14051f" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="castle" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5b2a8f" />
        <stop offset="1" stop-color="#2a1145" />
      </linearGradient>
      <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>

    <!-- Фон: свечение и замок из блоков с неоновым «O!» на башне -->
    <circle cx="300" cy="270" r="250" fill="url(#hero-glow)" />
    <g class="castle" opacity="0.85">
      <rect x="330" y="70" width="150" height="330" fill="url(#castle)" />
      <rect x="330" y="50" width="30" height="24" fill="#5b2a8f" /><rect x="390" y="50" width="30" height="24" fill="#5b2a8f" />
      <rect x="450" y="50" width="30" height="24" fill="#5b2a8f" />
      <rect x="20" y="170" width="110" height="230" fill="url(#castle)" opacity="0.7" />
      <rect x="20" y="150" width="24" height="22" fill="#4a2277" opacity="0.7" /><rect x="66" y="150" width="24" height="22" fill="#4a2277" opacity="0.7" />
      <text x="405" y="175" text-anchor="middle" class="tower-mark" filter="url(#neon)"
            :fill="zombie ? '#7dff6a' : '#ff4fbf'">O!</text>
    </g>
    <!-- Плавающие кубики -->
    <g class="cubes" :fill="zombie ? '#3cff7a' : '#ff2fa8'">
      <rect class="cube c1" x="92" y="70" width="26" height="26" rx="3" transform="rotate(18 105 83)" />
      <rect class="cube c2" x="462" y="300" width="34" height="34" rx="4" transform="rotate(-14 479 317)" />
      <rect class="cube c3" x="40" y="360" width="20" height="20" rx="3" transform="rotate(30 50 370)" />
      <rect class="cube c4" x="300" y="30" width="16" height="16" rx="2" transform="rotate(-25 308 38)" />
    </g>

    <!-- Герой -->
    <g transform="translate(40 20)"><g class="hero" :class="{ zombie }">
      <ellipse cx="208" cy="470" rx="110" ry="16" fill="#000" opacity="0.35" />
      <g class="arm-left" :style="{ transform: zombie ? 'rotate(-80deg)' : 'rotate(8deg)' }">
        <polygon v-for="(f, i) in armLeft" :key="i" :points="f.pts" :fill="f.fill" />
      </g>
      <polygon v-for="(f, i) in body" :key="'b' + i" :points="f.pts" :fill="f.fill" />
      <!-- худи: карман, шнурки, логотип -->
      <rect x="168" y="300" width="72" height="34" rx="4" :fill="palette.cloth" stroke="rgba(255,255,255,0.08)" />
      <line x1="190" y1="214" x2="186" y2="262" stroke="#d9d0e6" stroke-width="3" stroke-linecap="round" />
      <line x1="218" y1="214" x2="222" y2="262" stroke="#d9d0e6" stroke-width="3" stroke-linecap="round" />
      <text v-if="!zombie" x="204" y="292" text-anchor="middle" class="chest-mark" fill="#ff2fa8">O!</text>
      <g v-else fill="#8fae7a"><!-- прорехи -->
        <polygon points="150,350 162,334 172,352" /><polygon points="232,352 246,330 256,352" />
        <rect x="200" y="270" width="14" height="10" />
      </g>
      <g class="arm-right" :style="{ transform: zombie ? 'rotate(-80deg)' : 'rotate(-52deg)' }">
        <polygon v-for="(f, i) in armRight" :key="i" :points="f.pts" :fill="f.fill" />
      </g>
      <polygon v-for="(f, i) in head" :key="'h' + i" :points="f.pts" :fill="f.fill" />
      <!-- лицо -->
      <template v-if="!zombie">
        <rect x="156" y="132" width="98" height="26" rx="6" fill="#0d0710" />
        <rect x="166" y="137" width="30" height="7" rx="3" fill="#5d4a70" opacity="0.8" />
        <rect x="214" y="137" width="30" height="7" rx="3" fill="#5d4a70" opacity="0.8" />
        <path d="M180 178 Q204 196 228 176 Z" fill="#fff" stroke="#3a1420" stroke-width="3" stroke-linejoin="round" />
      </template>
      <template v-else>
        <rect x="170" y="134" width="18" height="16" fill="#ff2a2a" filter="url(#neon)" />
        <rect x="222" y="134" width="18" height="16" fill="#ff2a2a" filter="url(#neon)" />
        <path d="M176 182 l8 -6 8 6 8 -6 8 6 8 -6 8 6" fill="none" stroke="#2a3324" stroke-width="4" stroke-linejoin="round" />
        <rect x="150" y="160" width="14" height="12" fill="#6f8f5d" />
      </template>
    </g></g>
  </svg>
</template>

<style scoped>
.hero-art { display: block; width: 100%; height: 100%; overflow: visible; }
.tower-mark { font: 900 76px "Rubik", system-ui, sans-serif; letter-spacing: -2px; }
.chest-mark { font: 900 40px "Rubik", system-ui, sans-serif; }
/* Руки крутятся вокруг плеча; переход режима — плавный. */
.arm-left { transform-box: view-box; transform-origin: 119px 228px; transition: transform 0.5s cubic-bezier(.3,1.4,.5,1); }
.arm-right { transform-box: view-box; transform-origin: 289px 228px; transition: transform 0.5s cubic-bezier(.3,1.4,.5,1); }
.hero { animation: bob 4.5s ease-in-out infinite; }
.hero.zombie { animation-duration: 2.6s; }
.cube { animation: float 6s ease-in-out infinite; transform-box: fill-box; }
.c2 { animation-delay: -1.5s; } .c3 { animation-delay: -3s; } .c4 { animation-delay: -4.5s; }
polygon, rect, path { transition: fill 0.4s; }
@keyframes bob { 50% { transform: translateY(10px); } }
@keyframes float { 50% { translate: 0 -14px; } }
@media (prefers-reduced-motion: reduce) {
  .hero, .cube { animation: none; }
  .arm-left, .arm-right { transition: none; }
}
</style>
