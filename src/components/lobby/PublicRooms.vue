<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import RoomCard from "./RoomCard.vue";
import type { RoomInfo } from "../../api";

// Публичные комнаты из GET /rooms (опрос — в Lobby.vue). По умолчанию — лента
// с прокруткой и стрелкой; «Смотреть все» разворачивает сетку со всеми комнатами.
const props = defineProps<{ rooms: RoomInfo[] | null; error: string; busy?: boolean }>();
const emit = defineEmits<{ join: [id: string]; create: []; quick: [] }>();

const expanded = ref(false);
const strip = ref<HTMLElement | null>(null);
const list = computed(() => props.rooms ?? []);
function scrollNext() {
  const el = strip.value;
  if (!el) return;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + el.clientWidth * 0.8, behavior: "smooth" });
}
</script>

<template>
  <section class="rooms glass" aria-labelledby="rooms-title">
    <div class="head">
      <h2 id="rooms-title"><Icon name="flame" :size="24" class="flame" /> Публичные комнаты
        <span v-if="list.length" class="n">{{ list.length }}</span></h2>
      <span v-if="error" class="err" role="status">{{ error }}</span>
      <button v-if="list.length > 1" type="button" class="all" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? "Свернуть" : "Смотреть все" }} <Icon :name="expanded ? 'chevron-down' : 'arrow-right'" :size="16" />
      </button>
    </div>

    <div v-if="rooms === null && !error" class="strip" aria-busy="true">
      <div v-for="i in 4" :key="i" class="skeleton" />
    </div>

    <div v-else-if="!list.length" class="empty">
      <svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true">
        <rect x="22" y="30" width="30" height="30" rx="3" fill="#3a1a5c" /><rect x="52" y="22" width="38" height="38" rx="3" fill="#4d2178" />
        <rect x="64" y="10" width="14" height="14" rx="2" fill="#ff2fa8" opacity="0.8" />
        <rect x="30" y="16" width="10" height="10" rx="2" fill="#a52be0" opacity="0.7" />
        <text x="71" y="48" text-anchor="middle" font-size="18" font-weight="900" fill="#ff4fbf" font-family="Rubik, sans-serif">O!</text>
      </svg>
      <div>
        <div class="empty-title">Пока нет активных комнат</div>
        <div class="empty-sub">Создай свою комнату или попробуй быструю игру</div>
      </div>
      <div class="empty-actions">
        <button type="button" class="ghost" :disabled="busy" @click="emit('create')"><Icon name="users" :size="18" /> Создать комнату</button>
        <button type="button" class="hot" :disabled="busy" @click="emit('quick')"><Icon name="play" :size="16" /> Быстрая игра</button>
      </div>
    </div>

    <div v-else class="list-wrap">
      <div ref="strip" class="strip" :class="{ grid: expanded }">
        <RoomCard v-for="r in list" :key="r.id" :room="r" :disabled="busy" @join="emit('join', r.id)" />
      </div>
      <button v-if="!expanded && list.length > 1" type="button" class="next" aria-label="Следующие комнаты" @click="scrollNext">
        <Icon name="chevron-right" :size="22" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.rooms { padding: 18px 20px 20px; }
.head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 14px; }
h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 20px; font-weight: 700; }
.flame { color: var(--pink); filter: drop-shadow(0 0 6px rgba(255, 47, 168, 0.7)); }
.n { font-size: 13px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: rgba(255, 47, 168, 0.18); color: #ffb3e3; }
.err { font-size: 13px; color: var(--danger); }
.all { margin-left: auto; flex: none; white-space: nowrap; display: flex; align-items: center; gap: 6px; border: 0; background: none; color: var(--muted);
       font-size: 14px; cursor: pointer; }
.all:hover { color: #fff; }

.list-wrap { position: relative; }
.strip { display: grid; grid-auto-flow: column; grid-auto-columns: calc((100% - 3 * 16px) / 4); gap: 16px;
         overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; padding: 4px 2px 6px; }
.strip::-webkit-scrollbar { display: none; }
.strip > * { scroll-snap-align: start; }
.strip.grid { grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); grid-auto-columns: auto; overflow: visible; }
.next { position: absolute; right: -14px; top: 30%; display: grid; place-items: center; width: 44px; height: 44px;
        border-radius: 50%; border: 1px solid var(--border-hot); background: var(--glass-strong); color: #fff; cursor: pointer;
        box-shadow: var(--glow); transition: transform 0.2s; }
.next:hover { transform: scale(1.08); }
.skeleton { height: 220px; border-radius: 14px; background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04));
            background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }

.empty { display: flex; align-items: center; gap: 22px; padding: 18px 8px; flex-wrap: wrap; }
.empty-art { width: 120px; height: 80px; flex: none; }
.empty-title { font-size: 18px; font-weight: 700; }
.empty-sub { color: var(--muted); margin-top: 2px; }
.empty-actions { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; }
.empty-actions button { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; border-radius: 10px;
                        font-size: 14px; font-weight: 700; cursor: pointer; color: #fff; transition: 0.2s; }
.ghost { border: 1px solid var(--border); background: rgba(30, 12, 52, 0.7); }
.ghost:hover:not(:disabled) { border-color: var(--border-hot); box-shadow: var(--glow); }
.hot { border: 0; background: var(--grad); }
.hot:hover:not(:disabled) { box-shadow: var(--glow); }
.empty-actions button:disabled { opacity: 0.5; cursor: default; }

@media (max-width: 1280px) { .strip { grid-auto-columns: calc((100% - 2 * 16px) / 3); } }
@media (max-width: 900px) { .strip { grid-auto-columns: calc((100% - 16px) / 2); } }
@media (max-width: 560px) {
  .rooms { padding: 14px; }
  h2 { font-size: 17px; white-space: nowrap; }
  .all { font-size: 13px; }
  .strip { grid-auto-columns: 78%; }
  .next { display: none; }
  .empty-actions { margin-left: 0; width: 100%; }
  .empty-actions button { flex: 1; justify-content: center; }
}
</style>
