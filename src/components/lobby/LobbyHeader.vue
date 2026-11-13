<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";
import Logo from "./Logo.vue";
import VoxelAvatar from "./VoxelAvatar.vue";
import { fx } from "../../fx.js";

// Шапка лобби: знак слева; справа профиль (аватар, ник, меню), рейтинг и настройки.
// Профиля на сервере нет — ник и аватар берутся из поля ника лобби.
// link — связь с сервером (опрос комнат): точка на аватаре зелёная, только когда сервер отвечает.
const props = defineProps<{ name: string; nameValid: boolean; link: "loading" | "ok" | "error" }>();
const emit = defineEmits<{ editName: []; rating: [] }>();

// Одно открытое меню за раз; закрывается кликом мимо и Esc.
const open = ref<"" | "profile" | "settings">("");
const root = ref<HTMLElement | null>(null);
function toggle(m: "profile" | "settings") { open.value = open.value === m ? "" : m; }
function onDocClick(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = ""; }
function onKey(e: KeyboardEvent) { if (e.key === "Escape") open.value = ""; }

// Звук игры (fx.js) — тот же переключатель, что клавиша M в игре.
const muted = ref(fx.muted());
let offMute: (() => void) | null = null;
onMounted(() => {
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);
  offMute = fx.onMuteChange((m: boolean) => (muted.value = m));
});
onUnmounted(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
  offMute?.();
});

function pick(action: () => void) { open.value = ""; action(); }
const shownName = () => (props.nameValid ? props.name.trim() : "Без имени");
</script>

<template>
  <header ref="root" class="header">
    <Logo text="Арена" crown />
    <div class="right">
      <div class="menu-wrap">
        <button type="button" class="profile" :aria-expanded="open === 'profile'" aria-haspopup="menu"
                @click="toggle('profile')">
          <span class="ava"><VoxelAvatar :name="name || '?'" :size="38" /><i class="online" :class="link" :title="link === 'ok' ? 'На связи' : link === 'error' ? 'Нет связи с сервером' : 'Подключение…'" /></span>
          <span class="nick">{{ shownName() }}</span>
          <Icon name="chevron-down" :size="18" class="chev" :class="{ up: open === 'profile' }" />
        </button>
        <Transition name="drop">
          <div v-if="open === 'profile'" class="dropdown glass" role="menu">
            <button type="button" role="menuitem" @click="pick(() => emit('editName'))">
              <Icon name="edit" :size="18" /> Изменить ник
            </button>
            <button type="button" role="menuitem" @click="pick(() => emit('rating'))">
              <Icon name="chart" :size="18" /> Рейтинг игроков
            </button>
          </div>
        </Transition>
      </div>
      <button type="button" class="icon-btn" title="Рейтинг" aria-label="Рейтинг" @click="emit('rating')">
        <Icon name="trophy" :size="24" />
      </button>
      <div class="menu-wrap">
        <button type="button" class="icon-btn" title="Настройки" aria-label="Настройки"
                :aria-expanded="open === 'settings'" aria-haspopup="menu" @click="toggle('settings')">
          <Icon name="gear" :size="24" />
        </button>
        <Transition name="drop">
          <div v-if="open === 'settings'" class="dropdown glass settings" role="menu">
            <button type="button" role="menuitemcheckbox" :aria-checked="!muted" @click="fx.setMuted(!muted)">
              <Icon :name="muted ? 'sound-off' : 'sound'" :size="18" />
              <span class="grow">Звук в игре</span>
              <span class="switch" :class="{ on: !muted }"><i /></span>
            </button>
            <div class="note">В игре — клавиша M</div>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0 10px; }
.right { display: flex; align-items: center; gap: 10px; }
.menu-wrap { position: relative; }

.profile { display: flex; align-items: center; gap: 10px; padding: 5px 12px 5px 5px; border-radius: 999px;
           border: 1px solid var(--border); background: var(--glass); color: var(--text); cursor: pointer;
           font-weight: 500; transition: border-color 0.2s, box-shadow 0.2s; }
.profile:hover { border-color: var(--border-hot); box-shadow: var(--glow); }
.ava { position: relative; }
.online { position: absolute; right: 0; bottom: 0; width: 10px; height: 10px; border-radius: 50%;
          background: var(--faint); border: 2px solid var(--bg); }
.online.ok { background: var(--ok); }
.online.error { background: var(--danger); }
.nick { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { transition: transform 0.2s; color: var(--muted); }
.chev.up { transform: rotate(180deg); }

.icon-btn { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 12px; cursor: pointer;
            border: 1px solid transparent; background: transparent; color: #d9c6f5; transition: 0.2s; }
.icon-btn:hover { color: #fff; background: var(--glass); border-color: var(--border-hot); box-shadow: var(--glow); }

.dropdown { position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; min-width: 220px; padding: 6px;
            display: flex; flex-direction: column; background: var(--glass-strong); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
.dropdown button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 8px;
                   background: none; color: var(--text); font-size: 14px; text-align: left; cursor: pointer; }
.dropdown button:hover { background: rgba(255, 47, 168, 0.14); }
.grow { flex: 1; }
.note { padding: 2px 12px 8px 40px; font-size: 12px; color: var(--faint); }
.switch { width: 34px; height: 20px; border-radius: 10px; background: #3a2a52; position: relative; transition: 0.2s; }
.switch i { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #bba; transition: 0.2s; }
.switch.on { background: var(--pink); }
.switch.on i { left: 17px; background: #fff; }

.drop-enter-active, .drop-leave-active { transition: opacity 0.15s, transform 0.15s; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 640px) {
  .header :deep(.logo.lg) { font-size: 26px; }
  .nick, .chev { display: none; }
  .profile { padding: 4px; }
  .icon-btn { width: 40px; height: 40px; }
}
</style>
