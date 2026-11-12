/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес игрового сервера (WebSocket), например ws://localhost:8080/ws. */
  readonly VITE_WS_URL?: string;
  /** HTTP API того же сервера (комнаты, лидеры), например http://localhost:8080. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
