<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import RoomPreview from "./RoomPreview.vue";
import { MODE_LABEL, PHASE_LABEL, type RoomInfo } from "../../api";

// Карточка публичной комнаты (данные — GET /rooms как есть). Названия у комнат
// на сервере нет: показываем режим и короткий номер из id.
const props = defineProps<{ room: RoomInfo; disabled?: boolean }>();
defineEmits<{ join: [] }>();

const LARGE_MAP_MIN_PLAYERS = 5; // game.LargeMapMinPlayers: с 5 мест — большая карта
const full = computed(() => props.room.players >= props.room.maxPlayers);
const fill = computed(() => Math.min(1, props.room.players / Math.max(1, props.room.maxPlayers)));
const title = computed(() => `${MODE_LABEL[props.room.mode] ?? props.room.mode} #${props.room.id.slice(0, 4).toUpperCase()}`);
const status = computed(() => props.room.players === 0 ? "ждёт игроков" : PHASE_LABEL[props.room.phase] ?? props.room.phase);
</script>

<template>
  <article class="room glass" :class="[room.mode, { full }]">
    <div class="thumb">
      <RoomPreview :id="room.id" :mode="room.mode" :large="room.maxPlayers >= LARGE_MAP_MIN_PLAYERS" />
      <span class="count" :title="`Игроков: ${room.players} из ${room.maxPlayers}`">
        <Icon name="users" :size="15" /> {{ room.players }} / {{ room.maxPlayers }}
      </span>
      <span class="mode-chip"><Icon :name="room.mode === 'zombie' ? 'skull' : 'swords'" :size="13" />{{ MODE_LABEL[room.mode] ?? room.mode }}</span>
    </div>
    <div class="body">
      <div class="title-row">
        <h3>{{ title }}</h3>
        <span class="status" :class="room.phase">{{ status }}</span>
      </div>
      <div class="bar" role="meter" :aria-valuenow="room.players" aria-valuemin="0" :aria-valuemax="room.maxPlayers"
           :aria-label="`Заполненность: ${room.players} из ${room.maxPlayers}`">
        <i :style="{ width: `${fill * 100}%` }" />
      </div>
      <button type="button" class="join" :disabled="full || disabled" @click="$emit('join')">
        {{ full ? "Комната заполнена" : "Присоединиться" }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.room { display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s; }
.room:hover { transform: translateY(-3px); border-color: rgba(255, 79, 191, 0.45); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4), 0 0 18px rgba(255, 47, 168, 0.18); }
.thumb { position: relative; aspect-ratio: 16 / 8; overflow: hidden; }
.thumb :deep(.preview) { transition: transform 0.5s; }
.room:hover .thumb :deep(.preview) { transform: scale(1.07); }
.thumb::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 45%, rgba(18, 5, 31, 0.85)); }
.count { position: absolute; right: 8px; bottom: 8px; z-index: 1; display: flex; align-items: center; gap: 5px; padding: 3px 9px;
         border-radius: 8px; background: rgba(10, 4, 18, 0.75); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.mode-chip { position: absolute; left: 8px; top: 8px; z-index: 1; display: flex; align-items: center; gap: 4px; padding: 2px 8px;
             border-radius: 999px; font-size: 11px; font-weight: 700; background: rgba(255, 47, 168, 0.85); }
.room.zombie .mode-chip { background: rgba(48, 160, 96, 0.9); }
.body { display: flex; flex-direction: column; gap: 9px; padding: 10px 12px 12px; }
.title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
h3 { margin: 0; font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { flex: none; font-size: 12px; color: var(--muted); }
.bar { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; background: var(--grad); transition: width 0.4s; }
.full .bar i { background: var(--danger); }
.join { height: 38px; border: 0; border-radius: 10px; background: var(--grad); color: #fff; font-size: 14px; font-weight: 700;
        cursor: pointer; transition: box-shadow 0.2s, filter 0.2s; }
.join:hover:not(:disabled) { box-shadow: var(--glow); filter: brightness(1.08); }
.join:disabled { cursor: default; background: rgba(255, 255, 255, 0.08); color: var(--faint); }
</style>
