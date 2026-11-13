<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { NAME_MAX, NAME_MIN, savedName, validName } from "../net.js";
import {
  CODE_LEN, MAX_PLAYERS, MIN_PLAYERS,
  createRoom, inviteLink, listRooms, normalizeCode, roomByCode,
  type Mode, type PlayTarget, type RoomInfo,
} from "../api";
import Icon from "./lobby/Icon.vue";
import LobbyHeader from "./lobby/LobbyHeader.vue";
import LobbyFooter from "./lobby/LobbyFooter.vue";
import LobbyModal from "./lobby/LobbyModal.vue";
import LeaderboardModal from "./lobby/LeaderboardModal.vue";
import ModeSelector from "./lobby/ModeSelector.vue";
import PublicRooms from "./lobby/PublicRooms.vue";
import QuickPlayButton from "./lobby/QuickPlayButton.vue";
import VoxelHero from "./lobby/VoxelHero.vue";

// Лобби O!Арены. Логика входа прежняя: имя проверяется перед любым входом,
// быстрая игра — /ws?mode=, создание комнаты — POST /rooms, вход по коду —
// GET /rooms/by-code, список — опрос GET /rooms. Здесь — состояние и сценарии,
// внешний вид — в компонентах components/lobby/.
const props = defineProps<{ error?: string; joinCode?: string }>();
const mode = defineModel<Mode>("mode", { required: true });
const emit = defineEmits<{ play: [name: string, target: PlayTarget] }>();

// ---- Имя ----
const name = ref(savedName());
const nameInput = ref<HTMLInputElement | null>(null);
const nameTouched = ref(false); // ошибку под полем показываем после первой правки или попытки входа
const nameValid = computed(() => validName(name.value));
const nameLen = computed(() => [...name.value.trim()].length);
const showNameError = computed(() => nameTouched.value && !nameValid.value);
function editName() {
  nameInput.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  nameInput.value?.focus();
  nameInput.value?.select();
}

// ---- Тост: ошибки сверху, гаснут сами ----
const TOAST_MS = 5000;
const toast = ref("");
let toastTimer = 0;
function showToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => (toast.value = ""), TOAST_MS);
}

// Ошибка входа (вернулись из игры с текстом) — тост и красная главная кнопка.
const quickError = ref(false);
let quickErrorTimer = 0;
watch(() => props.error, (e) => {
  showToast(e ?? "");
  quickError.value = !!e;
  clearTimeout(quickErrorTimer);
  if (e) quickErrorTimer = setTimeout(() => (quickError.value = false), 6000);
}, { immediate: true });

const NAME_ERROR = `Ник — от ${NAME_MIN} до ${NAME_MAX} символов`;
watch(name, (n) => { if (toast.value === NAME_ERROR && validName(n)) showToast(""); });
function checkedName(): string | null {
  if (validName(name.value)) return name.value;
  nameTouched.value = true;
  showToast(NAME_ERROR);
  editName();
  return null;
}

// Вход в игру: лобби дальше размонтируется — «поиск» виден до первого кадра игры.
const entering = ref(false);
function enter(target: PlayTarget) {
  const n = checkedName();
  if (n === null) return;
  entering.value = true;
  emit("play", n, target);
}

// ---- Модальные окна ----
type View = "none" | "create" | "code" | "created";
const view = ref<View>("none");
const busy = ref(false); // идёт запрос к API — кнопки неактивны
function open(v: View) {
  // Созданная приватная комната не теряется: «Создать комнату» снова показывает её код,
  // новую можно создать кнопкой «Создать другую».
  if (v === "create" && created.value) v = "created";
  view.value = v;
}
const close = () => (view.value = "none");

// Быстрая игра: сервер сам подберёт или создаст комнату выбранного режима.
function quickPlay() {
  quickError.value = false;
  enter({ mode: mode.value });
}

// ---- Создать комнату ----
const form = ref({ mode: mode.value as Mode, maxPlayers: MAX_PLAYERS, private: false });
watch(mode, (m) => { if (view.value !== "create") form.value.mode = m; });
const created = ref<{ id: string; code: string } | null>(null);

async function submitCreate() {
  if (checkedName() === null) return; // проверяем до создания — иначе комната повиснет пустой
  busy.value = true;
  try {
    const r = await createRoom({ ...form.value });
    if (form.value.private && r.code) {
      created.value = { id: r.id, code: r.code };
      view.value = "created";
    } else {
      enter({ roomId: r.id });
    }
  } catch (e) {
    showToast((e as Error).message);
  } finally {
    busy.value = false;
  }
}

// Копирование: Clipboard API есть только в secure context (https, localhost).
const copied = ref<"" | "code" | "link">("");
async function copy(what: "code" | "link") {
  if (!created.value) return;
  const text = what === "code" ? created.value.code : inviteLink(created.value.code);
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    setTimeout(() => { if (copied.value === what) copied.value = ""; }, 1500);
  } catch {
    showToast("Не удалось скопировать — выделите и скопируйте вручную");
  }
}

// ---- Войти по коду ----
const code = ref("");
watch(code, (c) => { const n = normalizeCode(c); if (n !== c) code.value = n; });

async function submitCode() {
  if (code.value.length !== CODE_LEN) {
    showToast(`Код — ${CODE_LEN} буквы`);
    return;
  }
  if (checkedName() === null) { view.value = "none"; return; }
  busy.value = true;
  try {
    const r = await roomByCode(code.value);
    if (r.players != null && r.maxPlayers != null && r.players >= r.maxPlayers) showToast("Комната заполнена");
    else enter({ roomId: r.id, code: code.value });
  } catch (e) {
    showToast((e as Error).message);
  } finally {
    busy.value = false;
  }
}

// ---- Рейтинг (кнопка и меню профиля в шапке) ----
const ratingOpen = ref(false);

// ---- Список публичных комнат: каждые 3 с, пока лобби открыто и вкладка видна ----
const POLL_MS = 3000;
const rooms = ref<RoomInfo[] | null>(null); // null — ещё не загружали
const roomsError = ref("");
let pollTimer = 0;
let pollCtl: AbortController | null = null;
let alive = true;

async function poll() {
  if (!alive) return;
  if (!document.hidden) {
    pollCtl = new AbortController();
    try {
      rooms.value = await listRooms(pollCtl.signal);
      roomsError.value = "";
    } catch (e) {
      if (alive) roomsError.value = (e as Error).message;
    }
  }
  if (alive) pollTimer = setTimeout(poll, POLL_MS);
}
const link = computed(() => roomsError.value ? "error" : rooms.value === null ? "loading" : "ok");
const online = computed(() => rooms.value ? rooms.value.reduce((s, r) => s + r.players, 0) : null);

onMounted(() => {
  if (props.joinCode) { // открыли по ссылке ?join=<code>
    code.value = props.joinCode;
    view.value = "code";
  }
  poll();
  if (view.value === "none") nextTick(() => { nameInput.value?.focus(); nameInput.value?.select(); });
});
onUnmounted(() => {
  alive = false;
  clearTimeout(pollTimer);
  clearTimeout(toastTimer);
  clearTimeout(quickErrorTimer);
  pollCtl?.abort();
});
</script>

<template>
  <div class="page" :class="mode">
    <div class="bg-cubes" aria-hidden="true"><i v-for="i in 6" :key="i" /></div>

    <LobbyHeader class="area-header" :name="name" :name-valid="nameValid" :link="link"
                 @edit-name="editName" @rating="ratingOpen = true" />

    <main class="area-hero hero">
      <div class="hero-text">
        <h1>Добро пожаловать <br>в <span class="brand">O!Арену</span></h1>
        <p class="lead">Собирайся, выбирай режим и покажи, на что ты способен!</p>
        <i class="underline" aria-hidden="true" />

        <div class="field">
          <label for="lobby-name" class="label">Твой ник <Icon name="edit" :size="14" /></label>
          <input id="lobby-name" ref="nameInput" v-model="name" class="name" :class="{ invalid: showNameError }"
                 :maxlength="NAME_MAX" autocomplete="nickname" spellcheck="false"
                 :aria-invalid="showNameError" aria-describedby="name-hint"
                 @input="nameTouched = true" @keydown.enter="quickPlay">
          <div id="name-hint" class="hint" :class="{ bad: showNameError }">
            <Icon name="users" :size="14" />
            <span>{{ showNameError ? NAME_ERROR : `От ${NAME_MIN} до ${NAME_MAX} символов` }}</span>
            <span class="count">{{ nameLen }}/{{ NAME_MAX }}</span>
          </div>
        </div>

        <div class="label mode-label"><Icon name="bolt" :size="18" class="bolt" /> Режим</div>
        <ModeSelector v-model="mode" />

        <QuickPlayButton class="cta" :state="entering ? 'loading' : quickError ? 'error' : 'idle'"
                         :disabled="busy" @click="quickPlay" />

        <div class="room-actions">
          <button type="button" class="action" :disabled="busy || entering" @click="open('create')">
            <Icon name="users" :size="24" /> Создать комнату
          </button>
          <button type="button" class="action" :disabled="busy || entering" @click="open('code')">
            <Icon name="door" :size="24" /> Войти по коду
          </button>
        </div>
      </div>
      <div class="art-wrap"><VoxelHero :mode="mode" /></div>
    </main>

    <PublicRooms class="area-rooms" :rooms="rooms" :error="roomsError" :busy="busy || entering"
                 @join="(id) => enter({ roomId: id })" @create="open('create')" @quick="quickPlay" />
    <LobbyFooter class="area-footer" :online="online" :link="link" />

    <Transition name="toast">
      <div v-if="toast" class="toast" role="alert">
        <span>{{ toast }}</span>
        <button type="button" aria-label="Закрыть" @click="showToast('')"><Icon name="close" :size="16" /></button>
      </div>
    </Transition>

    <LobbyModal v-if="view === 'create'" title="Создать комнату" @close="close">
      <form class="form" @submit.prevent="submitCreate">
        <div class="label">Режим</div>
        <ModeSelector v-model="form.mode" compact />
        <label for="create-max" class="label row-between">
          <span>Игроков</span><b class="num">{{ form.maxPlayers }}</b>
        </label>
        <input id="create-max" v-model.number="form.maxPlayers" type="range" :min="MIN_PLAYERS" :max="MAX_PLAYERS" step="1">
        <label class="check">
          <input v-model="form.private" type="checkbox">
          <span><Icon name="lock" :size="16" /> Приватная — только по коду, не видна в списке</span>
        </label>
        <div class="buttons">
          <button type="button" class="btn ghost" @click="close">Отмена</button>
          <button type="submit" class="btn hot" :disabled="busy">{{ busy ? "Создание…" : "Создать" }}</button>
        </div>
      </form>
    </LobbyModal>

    <LobbyModal v-else-if="view === 'created' && created" title="Комната создана" @close="close">
      <div class="created">
        <div class="label">Код комнаты</div>
        <div class="code">{{ created.code }}</div>
        <div class="copy-row">
          <button type="button" class="btn ghost" @click="copy('code')">
            <Icon name="copy" :size="16" /> {{ copied === "code" ? "Скопировано" : "Код" }}
          </button>
          <button type="button" class="btn ghost" :title="inviteLink(created.code)" @click="copy('link')">
            <Icon name="link" :size="16" /> {{ copied === "link" ? "Скопировано" : "Ссылка-приглашение" }}
          </button>
        </div>
        <div class="hint">Пустая комната удаляется через 30 с — заходите сразу</div>
        <div class="buttons">
          <button type="button" class="btn ghost" @click="created = null; view = 'create'">Создать другую</button>
          <button type="button" class="btn hot" @click="enter({ roomId: created.id, code: created.code })">Войти в комнату</button>
        </div>
      </div>
    </LobbyModal>

    <LobbyModal v-else-if="view === 'code'" title="Войти по коду" @close="close">
      <form class="form" @submit.prevent="submitCode">
        <label for="join-code" class="label">Код приватной комнаты</label>
        <input id="join-code" v-model="code" class="code-input" :maxlength="CODE_LEN" autocomplete="off"
               spellcheck="false" placeholder="ABCD" autofocus>
        <div class="hint">{{ CODE_LEN }} буквы — их показывает создатель комнаты</div>
        <div class="buttons">
          <button type="button" class="btn ghost" @click="close">Отмена</button>
          <button type="submit" class="btn hot" :disabled="busy">{{ busy ? "Поиск…" : "Войти" }}</button>
        </div>
      </form>
    </LobbyModal>

    <LeaderboardModal v-if="ratingOpen" :me="name" @close="ratingOpen = false" />
  </div>
</template>

<style scoped>
/* Сетка лобби: шапка, герой, комнаты, подвал. */
.page { position: relative; width: min(1320px, 100%); padding: 0 28px; overflow-x: clip; display: grid;
        grid-template-columns: minmax(0, 1fr); grid-template-areas: "header" "hero" "rooms" "footer"; }
.area-header { grid-area: header; }
.area-hero { grid-area: hero; }
.area-rooms { grid-area: rooms; margin-top: 8px; }
.area-footer { grid-area: footer; }
/* Появление блоков по очереди (модальные окна и тост анимируются сами). */
.area-header, .area-hero, .area-rooms, .area-footer { animation: rise 0.6s cubic-bezier(.2, .8, .3, 1) both; }
.area-hero { animation-delay: 0.1s; }
.area-rooms { animation-delay: 0.2s; } .area-footer { animation-delay: 0.3s; }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } }

/* Декоративные кубики на фоне: только transform/opacity — дёшево для слабых машин. */
.bg-cubes { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.bg-cubes i { position: absolute; width: 22px; height: 22px; border-radius: 4px; background: var(--pink); opacity: 0.18;
              animation: drift 14s ease-in-out infinite; }
.bg-cubes i:nth-child(1) { left: 6%; top: 14%; }
.bg-cubes i:nth-child(2) { left: 46%; top: 6%; width: 14px; height: 14px; animation-delay: -3s; }
.bg-cubes i:nth-child(3) { left: 92%; top: 40%; width: 30px; height: 30px; animation-delay: -6s; background: var(--violet); }
.bg-cubes i:nth-child(4) { left: 3%; top: 70%; animation-delay: -9s; background: var(--violet); }
.bg-cubes i:nth-child(5) { left: 60%; top: 88%; width: 12px; height: 12px; animation-delay: -2s; }
.bg-cubes i:nth-child(6) { left: 80%; top: 8%; width: 16px; height: 16px; animation-delay: -11s; }
.zombie .bg-cubes i { background: #3ddc84; }
@keyframes drift { 50% { transform: translateY(-26px) rotate(40deg); } }

/* ---- Герой ---- */
.hero { position: relative; display: grid; grid-template-columns: minmax(0, 590px) minmax(0, 1fr); align-items: center;
        min-height: 620px; }
.hero-text { position: relative; z-index: 1; display: flex; flex-direction: column; padding: 26px 0 30px; }
h1 { margin: 0; font-size: clamp(34px, 4.2vw, 56px); line-height: 1.04; font-weight: 900; letter-spacing: -0.02em;
     text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); }
.brand { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
         filter: drop-shadow(0 0 16px rgba(255, 47, 168, 0.5)); }
.zombie .brand { background: linear-gradient(100deg, #7dff6a, #3ddc84 50%, #1fa86a); -webkit-background-clip: text;
                 background-clip: text; filter: drop-shadow(0 0 16px rgba(61, 220, 132, 0.45)); }
.lead { margin: 14px 0 0; max-width: 400px; font-size: 20px; color: #e3d5f7; }
.underline { display: block; width: 100px; height: 3px; margin: 16px 0 22px; border-radius: 2px; background: var(--grad);
             box-shadow: 0 0 12px rgba(255, 47, 168, 0.7); }

.label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 16px; margin-bottom: 8px; }
.mode-label { color: var(--text); font-weight: 700; margin: 20px 0 10px; }
.bolt { color: var(--pink); filter: drop-shadow(0 0 4px var(--pink)); }
.field { display: flex; flex-direction: column; max-width: 380px; }
.name { height: 52px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--border); background: rgba(14, 5, 26, 0.72);
        color: var(--text); font-size: 20px; font-weight: 500; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
.name:focus { border-color: var(--border-hot); box-shadow: var(--glow); }
.name.invalid { border-color: var(--danger); box-shadow: 0 0 16px rgba(255, 92, 122, 0.35); }
.hint { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; color: var(--faint); }
.hint.bad { color: var(--danger); }
.count { margin-left: auto; font-variant-numeric: tabular-nums; }

.cta { margin-top: 22px; }
.room-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
.action { display: flex; align-items: center; justify-content: center; gap: 12px; height: 58px; border-radius: 14px;
          border: 1px solid var(--border); background: rgba(30, 12, 52, 0.72); color: #e6d8fa; font-size: 17px; font-weight: 500;
          cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s, color 0.2s, transform 0.15s; }
.action:hover:not(:disabled) { color: #fff; border-color: var(--border-hot); box-shadow: var(--glow); }
.action:active:not(:disabled) { transform: scale(0.98); }
.action:disabled { opacity: 0.5; cursor: default; }

.art-wrap { position: relative; align-self: stretch; margin-left: -60px; margin-right: -28px; pointer-events: none; }
.art-wrap > :deep(svg) { position: absolute; inset: -20px 0 0 0; width: 100%; height: calc(100% + 20px); }

/* ---- Тост ---- */
.toast { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 60; display: flex; align-items: center;
         gap: 10px; max-width: min(520px, calc(100vw - 32px)); padding: 12px 14px 12px 18px; border-radius: 12px;
         background: rgba(70, 14, 40, 0.92); border: 1px solid rgba(255, 92, 122, 0.6); color: #ffd0da; font-size: 14px;
         box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 92, 122, 0.25); }
.toast span { flex: 1; }
.toast button { display: grid; place-items: center; border: 0; background: none; color: inherit; cursor: pointer; padding: 2px; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, -10px); }

/* ---- Формы в модальных окнах ---- */
.form, .created { display: flex; flex-direction: column; gap: 10px; }
.row-between { justify-content: space-between; margin: 8px 0 0; }
.num { color: var(--text); font-size: 18px; font-variant-numeric: tabular-nums; }
input[type="range"] { width: 100%; accent-color: var(--pink); }
.check { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; cursor: pointer; margin-top: 4px; }
.check span { display: flex; align-items: center; gap: 6px; }
.check input { width: 18px; height: 18px; accent-color: var(--pink); }
.buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 18px;
       border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; color: #fff; transition: 0.2s; }
.btn.ghost { border: 1px solid var(--border); background: rgba(30, 12, 52, 0.7); }
.btn.ghost:hover { border-color: var(--border-hot); }
.btn.hot { border: 0; background: var(--grad); }
.btn.hot:hover:not(:disabled) { box-shadow: var(--glow); }
.btn:disabled { opacity: 0.55; cursor: default; }
.code-input { height: 64px; border-radius: 12px; border: 1px solid var(--border); background: rgba(14, 5, 26, 0.72);
              color: #fff; font: 800 34px var(--font); letter-spacing: 0.4em; text-align: center; text-transform: uppercase;
              padding-left: 0.4em; outline: none; }
.code-input:focus { border-color: var(--border-hot); box-shadow: var(--glow); }
.created { align-items: center; text-align: center; }
.created .label { margin: 0; }
.code { font: 900 54px var(--font); letter-spacing: 0.3em; padding-left: 0.3em; color: #fff;
        text-shadow: 0 0 20px rgba(255, 47, 168, 0.7); }
.copy-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.created .buttons { align-self: stretch; }

/* ---- Адаптивность ---- */
@media (max-width: 1366px) { .hero { min-height: 560px; } }
/* Невысокие экраны (1366×768, 1280×720): весь блок входа — на первом экране. */
@media (max-height: 820px) and (min-width: 901px) {
  .hero { min-height: 0; }
  .hero-text { padding: 12px 0 18px; }
  h1 { font-size: clamp(32px, 3.6vw, 46px); }
  .lead { font-size: 17px; margin-top: 10px; }
  .underline { margin: 12px 0 14px; }
  .name { height: 46px; font-size: 18px; }
  .mode-label { margin: 14px 0 8px; }
  .page :deep(.mode) { height: 54px; font-size: 18px; }
  .cta { margin-top: 16px; }
  .page :deep(.quick) { height: 64px; font-size: 24px; }
  .room-actions { margin-top: 12px; }
  .action { height: 50px; }
}
@media (max-width: 1100px) {
  .page { padding: 0 20px; }
  .hero { grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); }
}
/* Узко: иллюстрация уходит за текст полупрозрачным фоном, навигация — вниз. */
@media (max-width: 900px) {
  .hero { grid-template-columns: minmax(0, 1fr); min-height: 0; }
  .art-wrap { position: absolute; inset: 0 -20px 0 35%; margin: 0; opacity: 0.35; }
  .field { max-width: none; }
}
@media (max-width: 720px) {
  .page { padding: 0 16px; }
  .art-wrap { inset: 0 -16px 0 30%; opacity: 0.25; }
  .lead { font-size: 17px; }
}
@media (max-width: 480px) {
  .room-actions { grid-template-columns: 1fr; gap: 10px; }
  .action { height: 52px; }
  .buttons { flex-direction: column-reverse; }
  .btn { width: 100%; }
}
</style>
