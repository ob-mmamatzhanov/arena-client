<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { connect, type GameOver, type Phase, type ZombieOver } from "../net.js";
import { MODE_LABEL, inviteLink, type GameOpts } from "../api";

// Мир, ввод и цикл отрисовки живут в net.js вне реактивности;
// сюда приходят только колбэки, по которым показываем оверлеи и панель под холстом.
// opts: имя, ключ, адреса и цель — roomId (/ws?room=) или mode (/ws?mode=);
// code — код приватной комнаты, если он известен (создали или вошли по коду).
const props = defineProps<{ opts: GameOpts }>();
const emit = defineEmits<{ exit: [error?: string] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const phase = ref<Phase>("connecting");
const lost = ref<string | null>(null);       // причина обрыва, пока идёт реконнект
const result = ref<GameOver | null>(null);   // итоги последнего раунда
const mode = ref("mode" in props.opts ? props.opts.mode : ""); // уточняется по welcome
const code = "code" in props.opts ? props.opts.code ?? "" : "";
const room = ref("");                        // id комнаты из welcome — для «Ещё раз»
const zombieResult = ref<ZombieOver | null>(null); // итог игры режима zombie (фаза gameover)

let session: { close: () => void } | null = null;

function start(opts: GameOpts) {
  session = connect(canvas.value!, { ...opts }, {
    onJoin(info) {
      if (info.mode) mode.value = info.mode;
      if (info.room) room.value = info.room;
    },
    onPhase(p) {
      phase.value = p;
      if (p !== "connecting") lost.value = null; // снова в игре — связь восстановлена
      if (p === "play") { result.value = null; zombieResult.value = null; }
    },
    onDisconnect({ reason, code, reconnecting }) {
      if (reconnecting) lost.value = reason;
      else emit("exit", exitMessage(code, reason)); // обратно в лобби с текстом ошибки
    },
    onGameOver(r) {
      result.value = r;
    },
    onZombieOver(r) {
      zombieResult.value = r;
      restartAt.value = performance.now() + r.restartIn * 1000;
    },
  });
}

onMounted(() => {
  start(props.opts);
  on(window, "keydown", onKeyCapture, true);
  on(window, "keydown", onKey);
});

onUnmounted(() => {
  session?.close();
  session = null;
  clearInterval(clock);
  for (const off of offs.splice(0)) off();
});

// ---- Конец игры в режиме zombie ----
// Сервер сам начинает новую игру с первой волны через restartIn секунд — тогда фаза
// станет play и оверлей закроется. «Ещё раз» — переподключение в ту же комнату.
const restartAt = ref(0);
const now = ref(performance.now());
const clock = setInterval(() => (now.value = performance.now()), 250);
const restartLeft = computed(() => Math.max(0, Math.ceil((restartAt.value - now.value) / 1000)));
const isZombie = computed(() => mode.value === "zombie");

function playAgain() {
  if (!room.value) return;
  session?.close();
  zombieResult.value = null;
  phase.value = "connecting";
  start({ ...props.opts, roomId: room.value });
}

const offs: (() => void)[] = [];
function on(t: EventTarget, type: string, fn: (e: KeyboardEvent) => void, capture = false) {
  const h = fn as EventListener;
  t.addEventListener(type, h, capture);
  offs.push(() => t.removeEventListener(type, h, capture));
}

// Текст для лобби по close-коду (internal/manager/http.go): 4004 — комнаты нет,
// 4000 — неизвестный режим, 1013 (TryAgainLater) — нет мест (в комнате или свободных
// комнат для быстрой игры), 1001 (GoingAway) — комната/сервер останавливается.
function exitMessage(code: number, reason: string): string {
  switch (code) {
    case 4004: return "Комната не найдена или уже закрыта";
    case 4000: return "Неизвестный режим игры";
    case 1013: return /no free rooms/i.test(reason) ? "Нет свободных комнат — попробуйте позже" : "Комната заполнена";
    case 1001: return "Комната закрылась";
    // 1006 — соединение оборвалось без close-кода. Браузер получает его и тогда, когда
    // сервер отказал во входе (полная или удалённая комната): close-код до него не доходит.
    case 1006: return "roomId" in props.opts ? "Комната заполнена или уже закрыта" : reason;
    default: return reason;
  }
}

// ---- Меню по Esc ----
// Игра не ставится на паузу (она общая), поэтому меню только подсказывает и даёт выйти.
// Пока меню открыто, нажатия не доходят до игры (перехват в фазе capture); отпускания
// клавиш проходят, чтобы зажатая до открытия клавиша не залипла.
const menu = ref(false);
const menuFirst = ref<HTMLButtonElement | null>(null);
function openMenu(v: boolean) {
  menu.value = v;
  if (v) nextTick(() => menuFirst.value?.focus());
  else (document.activeElement as HTMLElement | null)?.blur();
}
// Tab тоже не пропускаем в игру: иначе табло отменило бы переход фокуса между кнопками меню.
function onKeyCapture(e: KeyboardEvent) {
  if (menu.value && e.code !== "Escape") e.stopImmediatePropagation();
}
function onKey(e: KeyboardEvent) {
  if (e.code !== "Escape" || e.repeat || phase.value === "gameover") return; // у gameover свой оверлей с кнопками
  e.preventDefault();
  openMenu(!menu.value);
}

// Кнопки под холстом не держат фокус: иначе Enter/пробел в игре нажимали бы их.
function blurAfter(e: MouseEvent, fn: () => void) {
  (e.currentTarget as HTMLElement).blur();
  fn();
}

// ---- Код приватной комнаты ----
const copied = ref(false);
async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink(code));
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch { /* без Clipboard API ссылку видно в подсказке кнопки */ }
}

// Итог раунда для панели: ничья — отдельно, иначе место и очки.
const summary = computed(() => {
  const r = result.value;
  if (!r) return "Раунд окончен";
  if (!r.winnerId) return "Ничья";
  if (r.winnerId === r.myId) return "Вы победили!";
  const i = r.scores.findIndex((s) => s.id === r.myId);
  return i < 0 ? "Раунд окончен" : `Ваше место: ${i + 1} из ${r.scores.length} · очки: ${r.scores[i]!.score}`;
});
</script>

<template>
  <div class="game">
    <div class="stage">
      <canvas ref="canvas" width="800" height="600"></canvas>

      <div v-if="lost !== null" class="overlay">
        <div class="panel">
          <div class="title">Связь потеряна</div>
          <div class="sub">{{ lost }} — переподключение…</div>
          <button type="button" class="primary" @click="emit('exit')">В лобби</button>
        </div>
      </div>
      <div v-else-if="phase === 'connecting'" class="overlay">
        <div class="panel"><div class="title">Подключение…</div></div>
      </div>
      <div v-else-if="phase === 'gameover' && zombieResult" class="overlay">
        <div class="panel">
          <div class="title">Все погибли</div>
          <div class="stats">
            <div><span>волна</span><b>{{ zombieResult.wave }}</b></div>
            <div><span>убито зомби</span><b>{{ zombieResult.kills }}</b></div>
            <div><span>из них вами</span><b>{{ zombieResult.myKills }}</b></div>
          </div>
          <div v-if="restartLeft > 0" class="sub">Новая игра с первой волны через {{ restartLeft }} с</div>
          <div class="row">
            <button type="button" class="primary" :disabled="!room" @click="playAgain">Ещё раз</button>
            <button type="button" @click="emit('exit')">В лобби</button>
          </div>
        </div>
      </div>
      <div v-else-if="menu" class="overlay" @click.self="openMenu(false)">
        <div class="panel menu">
          <div class="title">Меню</div>
          <div class="sub">Игра продолжается — вас могут атаковать</div>
          <ul class="keys">
            <li><b>WASD</b> / стрелки — движение</li>
            <li><b>мышь</b> — прицел, <b>ЛКМ</b> / <b>пробел</b> — огонь</li>
            <li><b>Shift</b> — рывок, <b>Tab</b> — {{ isZombie ? "игроки" : "счёт" }}, <b>M</b> — звук</li>
          </ul>
          <div class="row">
            <button ref="menuFirst" type="button" class="primary" @click="openMenu(false)">Продолжить</button>
            <button type="button" @click="emit('exit')">Выйти в лобби</button>
          </div>
        </div>
      </div>
    </div>

    <div class="bar">
      <span v-if="mode" class="badge">{{ MODE_LABEL[mode] ?? mode }}</span>
      <span v-if="code" class="room">
        Комната <b>{{ code }}</b>
        <button type="button" class="small" :title="inviteLink(code)" @click="blurAfter($event, copyLink)">
          {{ copied ? "Скопировано" : "Ссылка" }}
        </button>
      </span>
      <span v-if="phase === 'intermission' && lost === null" class="summary">{{ summary }}</span>
      <span v-else class="hint">Esc — меню · Tab — {{ isZombie ? "игроки" : "счёт" }}</span>
      <button type="button" class="small exit" @click="blurAfter($event, () => emit('exit'))">В лобби</button>
    </div>
  </div>
</template>

<style scoped>
/* Холст вписывается в окно: не шире 800 px и с запасом по высоте под панель. Координаты
   мыши net.js пересчитывает через getBoundingClientRect, так что CSS-масштаб безопасен. */
.game { width: min(800px, calc(100vw - 32px), calc((100vh - 96px) * 4 / 3)); min-width: 320px; margin-top: 16px; }
.stage { position: relative; }
canvas { display: block; width: 100%; height: auto; background: #1e1e24; cursor: none; } /* прицел рисуем сами */
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
           background: rgba(10, 10, 14, 0.78); cursor: default; }
.panel { min-width: 280px; max-width: 90%; box-sizing: border-box; padding: 24px; background: #1b1b22;
         border: 1px solid #333; border-radius: 8px; display: flex; flex-direction: column; gap: 12px;
         align-items: center; text-align: center; }
.title { font-size: 20px; color: #fff; }
.sub { color: #aaa; }
.keys { margin: 0; padding: 0; list-style: none; color: #bbb; font-size: 13px; line-height: 1.7; }
.keys b { color: #ddd; }
.row { display: flex; gap: 8px; }
.stats { display: flex; gap: 22px; }
.stats div { display: flex; flex-direction: column; gap: 2px; }
.stats span { color: #888; font-size: 12px; }
.stats b { color: #c5e1a5; font: bold 26px monospace; }
button:disabled { opacity: 0.5; cursor: default; }

.bar { margin: 8px 0; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 6px 10px;
       background: #1b1b22; border: 1px solid #333; border-radius: 6px; color: #ccc; font-size: 13px; }
.badge { padding: 2px 8px; border-radius: 10px; background: #343a66; color: #fff; font-size: 12px; }
.room { display: flex; align-items: center; gap: 6px; }
.room b { color: #fff; font-family: monospace; font-size: 15px; letter-spacing: 0.15em; }
.summary { color: #fff; font-weight: bold; }
.hint { color: #888; }
.exit { margin-left: auto; }

button { font: 14px sans-serif; padding: 7px 14px; border: 1px solid #3a3a48; border-radius: 4px;
         background: #262631; color: #ddd; cursor: pointer; }
button:hover { background: #2f2f3c; }
button.primary { background: #5c6bc0; border-color: #5c6bc0; color: #fff; font-weight: bold; }
button.primary:hover { background: #6b79cc; }
button.small { padding: 3px 10px; font-size: 12px; }
</style>
