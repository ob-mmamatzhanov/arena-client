<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";
import LobbyModal from "./LobbyModal.vue";
import { getLeaderboard, type LeaderRow } from "../../api";

// Рейтинг: лучшие за всё время (GET /leaderboard?n=10) — та же таблица, что в игре
// между раундами. me — ник игрока, чтобы подсветить его строку.
defineProps<{ me: string }>();
const emit = defineEmits<{ close: [] }>();

const rows = ref<LeaderRow[] | null>(null);
const error = ref("");
const ctl = new AbortController();
async function load() {
  error.value = "";
  rows.value = null;
  try { rows.value = await getLeaderboard(10, ctl.signal); }
  catch (e) { if (!ctl.signal.aborted) error.value = (e as Error).message; }
}
onMounted(load);
onUnmounted(() => ctl.abort());
</script>

<template>
  <LobbyModal title="Рейтинг игроков" wide @close="emit('close')">
    <p class="sub">Лучшие за всё время — очки за победы над другими игроками на арене.</p>
    <div v-if="error" class="state err">
      {{ error }} <button type="button" class="retry" @click="load">Повторить</button>
    </div>
    <div v-else-if="rows === null" class="state">Загрузка…</div>
    <div v-else-if="!rows.length" class="state">Пока пусто — сыграй первым!</div>
    <ol v-else class="board">
      <li v-for="(r, i) in rows" :key="i" :class="{ me: r.name === me.trim(), top: i < 3 }">
        <span class="place">
          <Icon v-if="i === 0" name="crown" :size="18" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="name">{{ r.name }}<em v-if="r.name === me.trim()"> (вы)</em></span>
        <span class="score">{{ r.score }}</span>
      </li>
    </ol>
  </LobbyModal>
</template>

<style scoped>
.sub { margin: -6px 0 14px; color: var(--muted); font-size: 14px; }
.state { padding: 18px 0; color: var(--muted); }
.err { color: var(--danger); }
.retry { margin-left: 8px; border: 1px solid var(--border); background: none; color: var(--text); border-radius: 8px;
         padding: 4px 10px; cursor: pointer; }
.board { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.board li { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 10px;
            background: rgba(255, 255, 255, 0.04); border: 1px solid transparent; }
.board li.top { background: rgba(255, 47, 168, 0.1); }
.board li.me { border-color: var(--border-hot); box-shadow: 0 0 14px rgba(255, 47, 168, 0.25); }
.place { width: 26px; display: grid; place-items: center; font-weight: 800; color: var(--muted); font-variant-numeric: tabular-nums; }
.top .place { color: #ffc531; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.name em { font-style: normal; color: var(--muted); }
.score { font-weight: 800; font-variant-numeric: tabular-nums; }
</style>
