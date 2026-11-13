<script setup lang="ts">
// Подвал: слоган, онлайн и состояние связи с сервером.
// Общего счётчика онлайна сервер наружу не отдаёт (/metrics без CORS), поэтому
// online — сумма игроков в публичных комнатах из того же опроса GET /rooms
// и подписан именно так. link: ok — сервер ответил, error — нет, loading — ждём.
defineProps<{ online: number | null; link: "loading" | "ok" | "error" }>();
const LABEL = { loading: "Подключение…", ok: "Сервер на связи", error: "Нет связи с сервером" } as const;
</script>

<template>
  <footer class="footer">
    <div class="brand">
      <span class="slogan">O!Арена — играй. Побеждай. Вместе с O!</span>
    </div>
    <div class="status glass" role="status">
      <i class="dot" :class="link" />
      <span>{{ LABEL[link] }}</span>
      <template v-if="link === 'ok' && online !== null">
        <span class="sep small" />
        <span title="Сумма игроков во всех публичных комнатах">В публичных комнатах: <b>{{ online }}</b></span>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          padding: 18px 0 22px; margin-top: 8px; border-top: 1px solid rgba(255, 140, 225, 0.1); }
.brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.sep { width: 1px; height: 24px; background: rgba(255, 255, 255, 0.15); }
.sep.small { height: 14px; }
.slogan { color: var(--muted); font-size: 14px; }
.status { display: flex; align-items: center; gap: 10px; padding: 9px 16px; border-radius: 999px; font-size: 13px; color: var(--muted); }
.status b { color: var(--text); font-variant-numeric: tabular-nums; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--faint); }
.dot.ok { background: var(--ok); box-shadow: 0 0 10px var(--ok); }
.dot.error { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
.dot.loading { animation: blink 1s ease-in-out infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
</style>
