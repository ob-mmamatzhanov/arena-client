<script setup lang="ts">
import { ref, watch } from "vue";
import Lobby from "./components/Lobby.vue";
import Game from "./components/Game.vue";
import { API_URL, WS_URL, isMode, normalizeCode, type GameOpts, type Mode, type PlayTarget } from "./api";
import { playerKey, saveName } from "./net.js";

const session = ref<GameOpts | null>(null);
const lobbyError = ref("");
// Выбранный режим живёт здесь, чтобы пережить уход в игру, и запоминается между визитами.
const MODE_KEY = "arena.mode";
const mode = ref<Mode>(readMode());
function readMode(): Mode {
  try { const m = localStorage.getItem(MODE_KEY); return isMode(m) ? m : "arena"; } catch { return "arena"; }
}
watch(mode, (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* без сохранения */ } });

// ?join=<code> — приглашение в приватную комнату: код подставляется в лобби один раз.
// Из адреса убираем, чтобы после выхода из игры он не подставлялся снова.
const params = new URLSearchParams(location.search);
const joinCode = ref(normalizeCode(params.get("join") ?? ""));
if (params.has("join")) {
  params.delete("join");
  const q = params.toString();
  history.replaceState(null, "", location.pathname + (q ? `?${q}` : "") + location.hash);
}

function play(name: string, target: PlayTarget) {
  saveName(name);
  lobbyError.value = "";
  joinCode.value = "";
  session.value = { name: name.trim(), playerKey: playerKey(), wsUrl: WS_URL, apiUrl: API_URL, ...target };
}

// Выход из игры: по кнопке (без ошибки) или когда вход не удался / комнаты нет (с текстом).
function exit(error?: string) {
  // Не вошли по коду (комната полная или удалена) — панель кода откроется с тем же кодом,
  // чтобы повторить, не набирая заново.
  const s = session.value;
  if (error && s && "code" in s && s.code) joinCode.value = s.code;
  session.value = null;
  lobbyError.value = error ?? "";
}
</script>

<template>
  <Game v-if="session" :opts="session" @exit="exit" />
  <Lobby v-else v-model:mode="mode" :error="lobbyError" :join-code="joinCode" @play="play" />
</template>
