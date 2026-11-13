<script setup lang="ts">
// Словесный знак: «O!» фирменным градиентом + название. Шрифтом, без растровых логотипов.
defineProps<{ text: string; crown?: boolean; size?: "lg" | "sm" }>();
</script>

<template>
  <span class="logo" :class="size ?? 'lg'">
    <span class="o">O!</span><span class="name">{{ text }}</span>
    <svg v-if="crown" class="crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" fill="#ffc531" stroke="#c98a00" stroke-width="1.2" stroke-linejoin="round" />
    </svg>
  </span>
</template>

<style scoped>
.logo { position: relative; display: inline-flex; align-items: baseline; font-weight: 900; letter-spacing: -0.02em;
        line-height: 1; white-space: nowrap; user-select: none; }
.lg { font-size: 34px; }
.sm { font-size: 22px; }
.o { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
     filter: drop-shadow(0 0 10px rgba(255, 47, 168, 0.45)); padding-right: 0.06em; }
.name { color: var(--text); }
.crown { position: absolute; right: -0.35em; top: -0.55em; width: 0.7em; height: 0.7em; transform: rotate(18deg); }
</style>
