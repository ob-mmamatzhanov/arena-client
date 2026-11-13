<script setup lang="ts">
import Icon from "./Icon.vue";

// Главная кнопка лобби. Состояния: обычное, hover/нажатие (CSS), loading — вход
// начался, disabled — идёт другой запрос, error — последний вход не удался
// (кнопка краснеет и вздрагивает, текст ошибки показывает тост лобби).
defineProps<{ state?: "idle" | "loading" | "error"; disabled?: boolean }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button type="button" class="quick" :class="state ?? 'idle'" :disabled="disabled || state === 'loading'"
          :aria-busy="state === 'loading'" @click="$emit('click')">
    <span v-if="state === 'loading'" class="spinner" aria-hidden="true" />
    <Icon v-else name="play" :size="30" />
    <span>{{ state === "loading" ? "Поиск игры…" : state === "error" ? "Попробовать снова" : "Быстрая игра" }}</span>
  </button>
</template>

<style scoped>
.quick { position: relative; display: flex; align-items: center; justify-content: center; gap: 16px; width: 100%;
         height: 76px; border: 0; border-radius: 16px; background: var(--grad); color: #fff; cursor: pointer;
         font-size: 28px; font-weight: 800; letter-spacing: 0.01em; overflow: hidden; isolation: isolate;
         box-shadow: 0 0 28px rgba(255, 47, 168, 0.55), 0 10px 30px rgba(120, 10, 90, 0.45);
         transition: transform 0.15s, box-shadow 0.25s, filter 0.25s; animation: pulse 2.8s ease-in-out infinite; }
/* Блик, пробегающий по кнопке при наведении. */
.quick::before { content: ""; position: absolute; inset: 0; z-index: -1; transform: translateX(-120%);
                 background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.28) 50%, transparent 70%);
                 transition: transform 0.7s; }
.quick:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08);
                              box-shadow: 0 0 44px rgba(255, 47, 168, 0.75), 0 14px 34px rgba(120, 10, 90, 0.5); }
.quick:hover:not(:disabled)::before { transform: translateX(120%); }
.quick:active:not(:disabled) { transform: translateY(1px) scale(0.99); filter: brightness(0.95); }
.quick:disabled { cursor: default; animation: none; }
.quick.idle:disabled { filter: grayscale(0.6) brightness(0.7); box-shadow: none; }
.quick.loading { filter: saturate(0.85); }
.quick.error { background: linear-gradient(100deg, #ff5c7a, #d0245a 60%, #9b1f6e);
               animation: shake 0.45s 1, pulse-err 2.8s ease-in-out 0.45s infinite; }
.spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.35);
           border-top-color: #fff; animation: spin 0.8s linear infinite; }

@keyframes pulse { 50% { box-shadow: 0 0 40px rgba(255, 47, 168, 0.8), 0 10px 30px rgba(120, 10, 90, 0.45); } }
@keyframes pulse-err { 50% { box-shadow: 0 0 36px rgba(255, 92, 122, 0.75); } }
@keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) { .quick { height: 64px; font-size: 22px; } }
</style>
