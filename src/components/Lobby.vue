<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { NAME_MAX, NAME_MIN, savedName, validName } from "../net.js";
import {
  CODE_LEN, MAX_PLAYERS, MIN_PLAYERS, MODES, MODE_LABEL, PHASE_LABEL,
  createRoom, inviteLink, listRooms, normalizeCode, roomByCode,
  type Mode, type PlayTarget, type RoomInfo,
} from "../api";

const props = defineProps<{ error?: string; joinCode?: string }>();
const mode = defineModel<Mode>("mode", { required: true });
const emit = defineEmits<{ play: [name: string, target: PlayTarget] }>();

// ---- Имя ----
const name = ref(savedName());
const nameInput = ref<HTMLInputElement | null>(null);

// ---- Тост: ошибки над формой, гаснут сами ----
const TOAST_MS = 5000;
const toast = ref("");
let toastTimer = 0;
function showToast(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  if (msg) toastTimer = setTimeout(() => (toast.value = ""), TOAST_MS);
}
watch(() => props.error, (e) => showToast(e ?? ""), { immediate: true });

// Имя проверяем перед любым входом в игру; исправили — ошибка про имя гаснет.
const NAME_ERROR = `Имя — от ${NAME_MIN} до ${NAME_MAX} символов`;
watch(name, (n) => { if (toast.value === NAME_ERROR && validName(n)) showToast(""); });
function checkedName(): string | null {
  if (validName(name.value)) return name.value;
  showToast(NAME_ERROR);
  nameInput.value?.focus();
  return null;
}
function enter(target: PlayTarget) {
  const n = checkedName();
  if (n !== null) emit("play", n, target);
}

// ---- Панели под кнопками действий ----
type View = "none" | "create" | "code" | "created";
const view = ref<View>("none");
const busy = ref(false); // идёт запрос к API — кнопки неактивны

function toggle(v: View) {
  // Созданная приватная комната не теряется: «Создать комнату» снова показывает её код,
  // новую можно создать кнопкой «Создать другую».
  if (v === "create" && created.value) v = "created";
  view.value = view.value === v ? "none" : v;
  if (v === "code" && view.value === "code") nextTick(() => codeInput.value?.focus());
}

// Быстрая игра: сервер сам подберёт или создаст комнату выбранного режима.
function quickPlay() {
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
const codeInput = ref<HTMLInputElement | null>(null);
watch(code, (c) => { const n = normalizeCode(c); if (n !== c) code.value = n; });

async function submitCode() {
  if (code.value.length !== CODE_LEN) {
    showToast(`Код — ${CODE_LEN} буквы`);
    codeInput.value?.focus();
    return;
  }
  if (checkedName() === null) return;
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
const isFull = (r: RoomInfo) => r.players >= r.maxPlayers;

onMounted(() => {
  if (props.joinCode) { // открыли по ссылке ?join=<code>
    code.value = props.joinCode;
    view.value = "code";
  }
  poll();
  nextTick(() => {
    const el = view.value === "code" ? codeInput.value : nameInput.value;
    el?.focus();
    if (el === nameInput.value) el?.select();
  });
});
onUnmounted(() => {
  alive = false;
  clearTimeout(pollTimer);
  clearTimeout(toastTimer);
  pollCtl?.abort();
});
</script>

<template>
  <div class="lobby">
    <section class="card">
      <h1>Arena</h1>

      <div v-if="toast" class="toast" role="alert">
        <span>{{ toast }}</span>
        <button type="button" class="close" aria-label="Закрыть" @click="showToast('')">×</button>
      </div>

      <label for="lobby-name">Имя</label>
      <input id="lobby-name" ref="nameInput" v-model="name" :maxlength="NAME_MAX"
             autocomplete="nickname" spellcheck="false" @keydown.enter="quickPlay">
      <div class="hint">От {{ NAME_MIN }} до {{ NAME_MAX }} символов</div>

      <div class="label">Режим</div>
      <div class="segmented" role="group" aria-label="Режим">
        <button v-for="m in MODES" :key="m" type="button" :class="{ on: mode === m }"
                :aria-pressed="mode === m" @click="mode = m">{{ MODE_LABEL[m] }}</button>
      </div>

      <div class="actions">
        <button type="button" class="primary" :disabled="busy" @click="quickPlay">Быстрая игра</button>
        <button type="button" :class="{ on: view === 'create' }" :disabled="busy" @click="toggle('create')">
          Создать комнату
        </button>
        <button type="button" :class="{ on: view === 'code' }" :disabled="busy" @click="toggle('code')">
          Войти по коду
        </button>
      </div>

      <form v-if="view === 'create'" class="panel" @submit.prevent="submitCreate">
        <div class="row">
          <span class="label">Режим</span>
          <div class="segmented">
            <button v-for="m in MODES" :key="m" type="button" :class="{ on: form.mode === m }"
                    :aria-pressed="form.mode === m" @click="form.mode = m">{{ MODE_LABEL[m] }}</button>
          </div>
        </div>
        <div class="row">
          <label for="create-max" class="label">Игроков</label>
          <input id="create-max" v-model.number="form.maxPlayers" type="range"
                 :min="MIN_PLAYERS" :max="MAX_PLAYERS" step="1">
          <span class="num">{{ form.maxPlayers }}</span>
        </div>
        <label class="row check">
          <input v-model="form.private" type="checkbox">
          <span>Приватная — только по коду, не видна в списке</span>
        </label>
        <div class="row end">
          <button type="button" @click="view = 'none'">Отмена</button>
          <button type="submit" class="primary" :disabled="busy">{{ busy ? "Создание…" : "Создать" }}</button>
        </div>
      </form>

      <div v-else-if="view === 'created' && created" class="panel created">
        <div class="label">Код комнаты</div>
        <div class="code">{{ created.code }}</div>
        <button type="button" @click="copy('code')">{{ copied === "code" ? "Скопировано" : "Скопировать" }}</button>
        <div class="link">
          <a :href="inviteLink(created.code)">{{ inviteLink(created.code) }}</a>
          <button type="button" class="small" @click="copy('link')">
            {{ copied === "link" ? "Скопировано" : "Ссылка" }}
          </button>
        </div>
        <div class="hint">Пустая комната удаляется через 30 с — заходите сразу</div>
        <div class="row end">
          <button type="button" @click="created = null; view = 'create'">Создать другую</button>
          <button type="button" @click="view = 'none'">Скрыть</button>
          <button type="button" class="primary" @click="enter({ roomId: created.id, code: created.code })">
            Войти в комнату
          </button>
        </div>
      </div>

      <form v-else-if="view === 'code'" class="panel" @submit.prevent="submitCode">
        <div class="row">
          <label for="join-code" class="label">Код</label>
          <input id="join-code" ref="codeInput" v-model="code" class="code-input" :maxlength="CODE_LEN"
                 autocomplete="off" spellcheck="false" placeholder="ABCD">
          <button type="submit" class="primary" :disabled="busy">{{ busy ? "Поиск…" : "Войти" }}</button>
          <button type="button" @click="view = 'none'">Отмена</button>
        </div>
      </form>
    </section>

    <section class="card rooms">
      <div class="rooms-head">
        <h2>Публичные комнаты</h2>
        <span v-if="roomsError" class="err">{{ roomsError }}</span>
      </div>
      <div v-if="rooms === null && !roomsError" class="empty">Загрузка…</div>
      <div v-else-if="rooms && !rooms.length" class="empty">Пока нет — создайте свою или нажмите «Быстрая игра»</div>
      <table v-else-if="rooms">
        <tbody>
          <tr v-for="r in rooms" :key="r.id">
            <td>{{ MODE_LABEL[r.mode] ?? r.mode }}</td>
            <td class="muted">{{ r.players === 0 ? "ждёт игроков" : PHASE_LABEL[r.phase] ?? r.phase }}</td>
            <td class="num" :class="{ full: isFull(r) }">{{ r.players }}/{{ r.maxPlayers }}</td>
            <td class="end">
              <button type="button" class="small" :disabled="isFull(r)"
                      :title="isFull(r) ? 'Комната заполнена' : ''" @click="enter({ roomId: r.id })">
                Войти
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.lobby { width: 800px; max-width: calc(100vw - 32px); margin: 16px 0; display: flex; flex-direction: column;
         align-items: center; gap: 16px; }
.card { width: 480px; max-width: 100%; box-sizing: border-box; padding: 20px 24px; background: #1b1b22;
        border: 1px solid #333; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
h1 { margin: 0 0 4px; font-size: 22px; color: #fff; text-align: center; }
h2 { margin: 0; font-size: 15px; color: #ddd; }
label, .label { color: #bbb; }
.hint { font-size: 12px; color: #888; margin-top: -4px; }
input { font: 16px sans-serif; padding: 8px 10px; border-radius: 4px; border: 1px solid #444;
        background: #111; color: #eee; outline: none; min-width: 0; }
input:focus { border-color: #5c6bc0; }
input[type="range"] { flex: 1; padding: 0; accent-color: #5c6bc0; }
input[type="checkbox"] { accent-color: #5c6bc0; }

button { font: 14px sans-serif; padding: 8px 12px; border: 1px solid #3a3a48; border-radius: 4px;
         background: #262631; color: #ddd; cursor: pointer; }
button:hover:not(:disabled) { background: #2f2f3c; }
button:disabled { opacity: 0.45; cursor: default; }
button.on { border-color: #5c6bc0; color: #fff; }
button.primary { background: #5c6bc0; border-color: #5c6bc0; color: #fff; font-weight: bold; }
button.primary:hover:not(:disabled) { background: #6b79cc; }
button.small { padding: 4px 10px; font-size: 13px; }

.segmented { display: flex; }
.segmented button { flex: 1; border-radius: 0; }
.segmented button:first-child { border-radius: 4px 0 0 4px; }
.segmented button:last-child { border-radius: 0 4px 4px 0; }
.segmented button.on { background: #343a66; }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.actions .primary { grid-column: 1 / -1; padding: 10px; font-size: 16px; }

/* Тост поверх заголовка карточки: появление и исчезновение не сдвигают форму под курсором. */
.card:first-child { position: relative; }
.toast { position: absolute; top: 12px; left: 16px; right: 16px; z-index: 1; display: flex; align-items: center;
         gap: 8px; padding: 8px 10px; border-radius: 4px; background: #3a1d22; border: 1px solid #7a2e38;
         color: #ffb3b3; font-size: 13px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); }
.toast span { flex: 1; }
.toast .close { padding: 0 6px; border: 0; background: none; color: #ffb3b3; font-size: 18px; line-height: 1; }

.panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; margin-top: 4px;
         background: #15151b; border: 1px solid #2c2c36; border-radius: 6px; }
.row { display: flex; align-items: center; gap: 10px; }
.row .label { min-width: 64px; }
.row .segmented { flex: 1; }
.row.end { justify-content: flex-end; }
.check { cursor: pointer; font-size: 13px; }
.num { min-width: 2.5em; text-align: right; font-variant-numeric: tabular-nums; }

.created { align-items: center; text-align: center; }
.code { font: bold 44px monospace; letter-spacing: 0.3em; padding-left: 0.3em; color: #fff; }
.link { display: flex; align-items: center; gap: 8px; max-width: 100%; font-size: 12px; }
.link a { color: #9fa8da; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.created .row.end { align-self: stretch; }
.code-input { width: 5.5em; flex: none; font: bold 18px monospace; letter-spacing: 0.2em; text-transform: uppercase; }

.rooms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.err { font-size: 12px; color: #ff8a80; }
.empty { color: #888; font-size: 13px; padding: 8px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 6px 8px; border-top: 1px solid #2a2a33; }
td.muted { color: #999; }
td.full { color: #ff8a80; }
td.end { text-align: right; width: 1%; }
</style>
