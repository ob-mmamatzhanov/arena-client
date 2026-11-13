<script setup lang="ts">
import Icon, { type IconName } from "./Icon.vue";
import { MODES, MODE_LABEL, type Mode } from "../../api";

// Выбор режима: две крупные карточки. Значение — тот же v-model, что и раньше
// (App.vue хранит и запоминает режим).
const mode = defineModel<Mode>({ required: true });
defineProps<{ compact?: boolean }>();
const ICON: Record<Mode, IconName> = { arena: "swords", zombie: "skull" };
</script>

<template>
  <div class="modes" :class="{ compact }" role="radiogroup" aria-label="Режим">
    <button v-for="m in MODES" :key="m" type="button" role="radio" class="mode" :class="[m, { on: mode === m }]"
            :aria-checked="mode === m" @click="mode = m">
      <Icon :name="ICON[m]" :size="compact ? 20 : 28" />
      <span>{{ MODE_LABEL[m] }}</span>
    </button>
  </div>
</template>

<style scoped>
.modes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mode { display: flex; align-items: center; justify-content: center; gap: 12px; height: 64px; border-radius: 14px;
        border: 1px solid var(--border); background: rgba(30, 12, 52, 0.7); color: #cdb9ea; font-size: 20px;
        font-weight: 500; cursor: pointer; transition: border-color 0.25s, box-shadow 0.25s, background 0.25s, color 0.25s, transform 0.15s; }
.mode:hover:not(.on) { color: #fff; border-color: rgba(255, 79, 191, 0.45); background: rgba(48, 18, 80, 0.8); }
.mode:active { transform: scale(0.98); }
.mode.on { color: #fff; font-weight: 700; border-color: var(--border-hot);
           background: linear-gradient(180deg, rgba(255, 47, 168, 0.32), rgba(139, 43, 226, 0.22));
           box-shadow: var(--glow), inset 0 0 18px rgba(255, 47, 168, 0.25); }
.mode.zombie.on { border-color: rgba(125, 255, 106, 0.7);
                  background: linear-gradient(180deg, rgba(61, 220, 132, 0.25), rgba(30, 90, 60, 0.25));
                  box-shadow: 0 0 22px rgba(61, 220, 132, 0.35), inset 0 0 18px rgba(61, 220, 132, 0.18); }
.compact .mode { height: 44px; font-size: 15px; }
@media (max-width: 480px) { .mode { height: 56px; font-size: 17px; } }
</style>
