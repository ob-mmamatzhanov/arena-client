// Адреса сервера и HTTP API комнат (internal/manager/http.go на сервере):
//   GET  /rooms                → [{id, mode, phase, players, maxPlayers}] (только публичные)
//   POST /rooms {mode, maxPlayers, private} → 201 {id, code?}
//   GET  /rooms/by-code/{code} → {id} | 404
// Если контракт поменяется — править только здесь.

export const WS_URL: string = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";
// Без VITE_API_URL — тот же хост, что у WS: ws(s)://host/ws → http(s)://host.
export const API_URL: string = (import.meta.env.VITE_API_URL || httpFromWs(WS_URL)).replace(/\/$/, "");

function httpFromWs(ws: string): string {
  const u = new URL(ws);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  u.pathname = u.pathname.replace(/\/ws\/?$/, "");
  u.search = "";
  return u.toString();
}

export const MODES = ["arena", "zombie"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (s: unknown): s is Mode => MODES.includes(s as Mode);
export const MODE_LABEL: Record<string, string> = { arena: "Арена", zombie: "Зомби" };
export const PHASE_LABEL: Record<string, string> = { play: "идёт бой", intermission: "перерыв", gameover: "все погибли" };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
// Код приватной комнаты: 4 заглавные буквы без O и I (manager.codeAlphabet).
export const CODE_LEN = 4;
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-HJ-NP-Z]/g, "").slice(0, CODE_LEN);

/** Куда входить: в конкретную комнату (code — если она приватная и код известен,
 *  чтобы показать его в игре) или быстрая игра в режиме. */
export type PlayTarget = { roomId: string; code?: string } | { mode: Mode };
/** Параметры сессии для Game.vue → net.js connect(). */
export type GameOpts = { name: string; playerKey: string; wsUrl: string; apiUrl: string } & PlayTarget;

/** Публичная комната из GET /rooms (manager.RoomInfo). */
export type RoomInfo = { id: string; mode: string; phase: string; players: number; maxPlayers: number };
/** Ответ POST /rooms: code есть только у приватной комнаты. */
export type CreatedRoom = { id: string; code?: string };
export type CreateOpts = { mode: Mode; maxPlayers: number; private: boolean };

/** Ошибка API с текстом для игрока. */
export class ApiError extends Error {
  readonly status: number; // 0 — сеть/таймаут
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 5000;

async function request<T>(path: string, init: RequestInit, messages: Record<number, string>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  init.signal?.addEventListener("abort", () => ctl.abort());
  let res: Response;
  try {
    res = await fetch(API_URL + path, { cache: "no-store", ...init, signal: ctl.signal });
  } catch {
    throw new ApiError("Сервер недоступен", 0);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).trim();
    throw new ApiError(messages[res.status] ?? (text || `Ошибка сервера (${res.status})`), res.status);
  }
  return (await res.json()) as T;
}

export async function listRooms(signal?: AbortSignal): Promise<RoomInfo[]> {
  const data = await request<unknown>("/rooms", { signal }, {});
  // Голый массив или {rooms: [...]} — принимаем оба.
  const rows = Array.isArray(data) ? data : (data as { rooms?: unknown })?.rooms;
  return Array.isArray(rows) ? (rows as RoomInfo[]) : [];
}

export function createRoom(opts: CreateOpts): Promise<CreatedRoom> {
  return request<CreatedRoom>("/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  }, {
    400: "Неверные параметры комнаты",
    403: "Сервер не принимает запросы с этого адреса",
    429: "Слишком много новых комнат — попробуйте позже", // лимит на IP
    503: "На сервере нет мест для комнат — попробуйте позже", // manager.MaxRooms
  });
}

/** id комнаты по коду. Сейчас сервер отдаёт только {id}; если добавит players/maxPlayers —
 *  лобби сразу скажет «заполнена», иначе это сообщит сокет (close 1013). */
export function roomByCode(code: string): Promise<CreatedRoom & Partial<RoomInfo>> {
  return request(`/rooms/by-code/${encodeURIComponent(code)}`, {}, {
    404: `Комната ${code} не найдена`,
    409: "Комната заполнена",
  });
}

/** Ссылка-приглашение в приватную комнату: текущая страница с ?join=<code>. */
export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("join", code);
  return u.toString();
}
