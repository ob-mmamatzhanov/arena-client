<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";

// Модальное окно лобби: стеклянная карточка поверх затемнения. Закрывается
// крестиком, Esc и кликом по фону; фокус уходит внутрь и возвращается на место.
defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const card = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

function onKey(e: KeyboardEvent) { if (e.key === "Escape") emit("close"); }
onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  document.addEventListener("keydown", onKey);
  nextTick(() => {
    // Фокус — на поле с autofocus, иначе на само окно: первая кнопка с рамкой
    // фокуса выглядела бы выбранной (например, карточка режима).
    (card.value?.querySelector<HTMLElement>("[autofocus]") ?? card.value)?.focus();
  });
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKey);
  returnFocus?.focus?.();
});
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section ref="card" class="modal glass" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="x" aria-label="Закрыть" @click="emit('close')"><Icon name="close" :size="20" /></button>
      </header>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
            background: rgba(8, 2, 16, 0.66); animation: fade 0.18s ease-out; }
.modal { width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 22px 24px 24px;
         background: var(--glass-strong); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(255, 47, 168, 0.15);
         animation: pop 0.22s cubic-bezier(.2, 1.3, .5, 1); outline: none; }
.modal.wide { width: min(560px, 100%); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h2 { margin: 0; font-size: 22px; font-weight: 800; }
.x { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border);
     background: none; color: var(--muted); cursor: pointer; }
.x:hover { color: #fff; border-color: var(--border-hot); }
@keyframes fade { from { opacity: 0; } }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } }
</style>
