// Сетевой слой, ввод и client-side prediction своего игрока.
(function () {
  // Адрес сервера по умолчанию зависит от того, откуда открыт клиент:
  // локально (localhost, 127.0.0.1, ::1, file://) — локальный бэкенд ws://localhost:8080/ws,
  // иначе (прод) — стенд wss://arena-ob.fly.dev/ws.
  // ?server=host[:port] или полный ?server=wss://host/path переопределяет выбор.
  const LOCAL_WS = "ws://localhost:8080/ws";
  const PROD_WS = "wss://arena-ob.fly.dev/ws";
  const WS_URL = (function () {
    const param = new URLSearchParams(location.search).get("server");
    if (!param) {
      const h = location.hostname;
      const local = h === "" || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
      return local ? LOCAL_WS : PROD_WS;
    }
    if (/^wss?:\/\//.test(param)) return param;
    const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(param);
    return (local ? "ws://" : "wss://") + param + "/ws";
  })();

  // HTTP-адрес того же сервера: ws(s)://host/ws → http(s)://host/<path>.
  function httpUrl(path, search) {
    const u = new URL(WS_URL);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    u.pathname = u.pathname.replace(/\/ws\/?$/, "") + path;
    u.search = search || "";
    return u.toString();
  }
  const LEADERBOARD_URL = httpUrl("/leaderboard", "n=10");

  // Значения по умолчанию на случай старого сервера без speed/radius в welcome.
  const DEFAULT_SPEED = 200;  // единиц в секунду
  const DEFAULT_RADIUS = 16;

  // Сглаживание коррекций: доля ошибки, остающаяся через секунду,
  // и порог, после которого считаем, что это телепорт, и не сглаживаем.
  const ERROR_DECAY_PER_SEC = 0.0001;
  const SNAP_DISTANCE = 100;

  const net = {
    connected: false,
    welcome: null,   // {playerId, name, color, tickRate, width, height, ...}
    latest: null,    // последний snapshot
    status: "idle",  // состояние сокета: idle (до входа) / connecting / connected / disconnected
  };
  window.net = net;

  // ---- Профиль: имя и постоянный ключ игрока в localStorage ----
  // localStorage может быть недоступен (приватный режим, file://) — тогда
  // работаем без сохранения: ключ живёт до перезагрузки страницы.
  const NAME_KEY = "arena.name", PLAYER_KEY = "arena.playerKey";
  function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* без сохранения */ } }

  let memKey = null;
  function playerKey() {
    let k = storageGet(PLAYER_KEY) || memKey;
    if (!k) {
      k = crypto.randomUUID ? crypto.randomUUID() : fallbackUUID();
      storageSet(PLAYER_KEY, k);
    }
    return (memKey = k);
  }
  // crypto.randomUUID есть только в secure context (https, localhost); по LAN-IP — нет.
  function fallbackUUID() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Имя: 2–16 символов (кодовых точек, как руны на сервере) после обрезки пробелов.
  net.NAME_MIN = 2;
  net.NAME_MAX = 16;
  net.savedName = () => storageGet(NAME_KEY) || "";
  net.validName = (raw) => {
    const n = [...String(raw).trim()].length;
    return n >= net.NAME_MIN && n <= net.NAME_MAX;
  };

  // ---- Сокет, join и реконнект ----
  // Первое сообщение после open — {type:"join", name, playerKey}; без него сервер
  // через 5 с закрывает соединение и welcome не шлёт.
  // Первый вход (после «Играть»): если сокет закрылся до welcome или welcome не
  // пришёл за WELCOME_TIMEOUT_MS после open — вход не удался, net.onJoinFailed.
  // После первого welcome обрывы лечатся реконнектом, join шлётся снова с теми же данными.
  // Статус отражает только текущий сокет: события старого сокета (его close/error
  // могут прийти уже после открытия нового) игнорируются — иначе статус залипал бы
  // на disconnected при живом соединении.
  const RECONNECT_MIN_MS = 500, RECONNECT_MAX_MS = 5000;
  const WELCOME_TIMEOUT_MS = 5000;
  let ws = null;
  let join = null;         // {type, name, playerKey} — что шлём при каждом подключении
  let joined = false;      // был ли welcome с момента «Играть»
  let reconnectDelay = RECONNECT_MIN_MS;
  let reconnectTimer = 0;
  let welcomeTimer = 0;

  // Вход: имя уже проверено экраном входа. Сохраняем его и подключаемся.
  net.start = function (name) {
    name = String(name).trim();
    storageSet(NAME_KEY, name);
    join = { type: "join", name, playerKey: playerKey() };
    joined = false;
    reconnectDelay = RECONNECT_MIN_MS;
    connect();
  };

  function failJoin(reason) {
    clearTimeout(welcomeTimer);
    clearTimeout(reconnectTimer);
    const sock = ws;
    ws = null; // дальнейшие события этого сокета игнорируются
    if (sock) sock.close();
    net.connected = false;
    net.status = "idle";
    if (net.onJoinFailed) net.onJoinFailed(reason);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    clearTimeout(welcomeTimer);
    const sock = new WebSocket(WS_URL);
    ws = sock;
    net.status = "connecting";
    sock.onopen = () => {
      if (sock !== ws) return;
      net.status = "connected";
      sock.send(JSON.stringify(join));
      if (!joined) {
        welcomeTimer = setTimeout(() => {
          if (sock === ws) failJoin("Сервер не ответил за 5 с");
        }, WELCOME_TIMEOUT_MS);
      }
    };
    sock.onerror = () => {
      if (sock !== ws) return;
      net.status = "disconnected"; // за error всегда следует close — там и реконнект
    };
    sock.onclose = (ev) => {
      if (sock !== ws) return;
      net.connected = false;
      net.status = "disconnected";
      if (!joined) {
        failJoin(ev.reason ? `Сервер закрыл соединение: ${ev.reason}` : "Не удалось подключиться к серверу");
        return;
      }
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };
    sock.onmessage = (ev) => { if (sock === ws) onMessage(ev); };
  }

  function onMessage(ev) {
    net.status = "connected"; // пришли данные — сокет точно жив
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "welcome") {
      clearTimeout(welcomeTimer);
      joined = true;
      reconnectDelay = RECONNECT_MIN_MS;
      // Сервер заменяет некорректный ключ своим — сохраняем, что он вернул.
      if (typeof msg.playerKey === "string" && msg.playerKey && msg.playerKey !== join.playerKey) {
        join.playerKey = memKey = msg.playerKey;
        storageSet(PLAYER_KEY, msg.playerKey);
      }
      // Новое подключение (в том числе после реконнекта): новый playerId,
      // старые предсказания и буфер снапшотов к нему не относятся.
      resetSession();
      net.welcome = {
        playerId: msg.playerId,
        name: msg.name,
        color: msg.color,
        tickRate: msg.tickRate,
        width: msg.width,
        height: msg.height,
        speed: typeof msg.speed === "number" ? msg.speed : DEFAULT_SPEED,
        radius: typeof msg.radius === "number" ? msg.radius : DEFAULT_RADIUS,
        obstacles: Array.isArray(msg.obstacles) ? msg.obstacles : [],
      };
      net.connected = true;
    } else if (msg.type === "snapshot") {
      net.latest = msg;
      net.latestAt = performance.now();
      pushSnapshot(msg, net.latestAt);
      reconcile(msg);
      // Попадания есть только в снапшоте своего тика — отдаём каждый снапшот,
      // а не только последний к кадру, чтобы события не терялись.
      if (net.onSnapshot) net.onSnapshot(msg, net.latestAt);
    }
  }

  // ---- Буфер снапшотов для интерполяции ----
  // Храним не два, а все снапшоты за последнюю секунду: при 20 Гц два последних
  // получены за последние ~50–100 мс, и момент now − renderDelay оказался бы старше обоих.
  const SNAPSHOT_KEEP_MS = 1000;
  net.snapshots = []; // [{snap, t}] по возрастанию t

  // Время снапшота считаем по tick, а не по моменту получения: пачка снапшотов,
  // пришедшая после лага, иначе получила бы почти одинаковое t, и интерполяция
  // проскочила бы пропущенный отрезок рывком.
  //   t = clockOffset + tick * tickMs
  // clockOffset привязывает серверные тики к локальным часам. Берём минимум
  // (receivedAt − tick·tickMs): это самый быстрый из доставленных снапшотов, задержки
  // его только увеличивают. Вверх offset ползёт медленно — чтобы подстроиться под
  // дрейф часов и рост пинга, но не дёргаться от разового лага.
  const OFFSET_RISE = 0.01; // доля разницы, на которую offset поднимается за снапшот
  let clockOffset = null;
  let lastTick = -1;

  function pushSnapshot(snap, receivedAt) {
    const tickMs = 1000 / net.welcome.tickRate;
    if (snap.tick <= lastTick) {
      // Тик не растёт — сервер перезапустился или комната новая: старая шкала неверна.
      net.snapshots = [];
      clockOffset = null;
    }
    lastTick = snap.tick;

    const sample = receivedAt - snap.tick * tickMs;
    if (clockOffset === null || sample < clockOffset) clockOffset = sample;
    else clockOffset += (sample - clockOffset) * OFFSET_RISE;

    net.snapshots.push({ snap, t: 0 });
    // Пересчитываем всю шкалу с текущим offset (≤ ~20 записей), чтобы интервалы
    // между снапшотами всегда были ровно (Δtick · tickMs).
    for (const s of net.snapshots) s.t = clockOffset + s.snap.tick * tickMs;
    const t = net.snapshots[net.snapshots.length - 1].t;
    // Чистим по времени (не по количеству); последние два оставляем всегда.
    while (net.snapshots.length > 2 && net.snapshots[0].t < t - SNAPSHOT_KEEP_MS) {
      net.snapshots.shift();
    }
  }

  // Два соседних снапшота a, b с a.t <= renderTime <= b.t, или null, если таких нет.
  net.bracket = function (renderTime) {
    const s = net.snapshots;
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i - 1].t <= renderTime && renderTime <= s[i].t) return [s[i - 1], s[i]];
    }
    return null;
  };

  // ---- Ввод ----
  const KEYS = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
    Space: "fire",
  };

  const input = { up: false, down: false, left: false, right: false, fire: false, angle: 0 };
  // Нажатие огня запоминается до ближайшего тика: клик короче 50 мс иначе не дошёл бы до сервера.
  let fireLatched = false;
  let dashLatched = false;
  const mouse = { x: 0, y: 0, has: false };
  let seq = 0;

  // Нажатие огня (не удержание) — для «сухого щелчка» при пустом магазине.
  function fireAttempt() { if (net.onFireAttempt) net.onFireAttempt(); }

  // Пока фокус в поле ввода (экран входа), клавиши — тексту, а не игре.
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  net.typing = typing;

  window.addEventListener("keydown", (e) => {
    if (typing(e)) return;
    // Shift — одноразовый запрос рывка: уходит в ближайшем Input, удерживать не нужно.
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      if (!e.repeat) dashLatched = true;
      return;
    }
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    input[k] = true;
    if (k === "fire") {
      fireLatched = true;
      if (!e.repeat) fireAttempt();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (typing(e)) return;
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    input[k] = false;
  });
  // Сбрасываем клавиши при потере фокуса, чтобы игрок не "залип".
  window.addEventListener("blur", () => {
    input.up = input.down = input.left = input.right = input.fire = false;
  });

  net.attachCanvas = function (canvas) {
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      const w = net.welcome ? net.welcome.width : canvas.width;
      const h = net.welcome ? net.welcome.height : canvas.height;
      mouse.x = (e.clientX - r.left) * (w / r.width);
      mouse.y = (e.clientY - r.top) * (h / r.height);
      mouse.has = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { input.fire = true; fireLatched = true; fireAttempt(); }
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) input.fire = false; });
  };

  // ---- Симуляция (зеркало game.World.Update на сервере) ----
  function moveVector(i) {
    let x = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    let y = (i.down ? 1 : 0) - (i.up ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Зеркало game.sweepAxis: ограничивает движение круга радиуса r по одной оси
  // (from → to), чтобы он не вошёл в прямоугольник [lo, hi] × [oLo, oHi].
  // Касание (расстояние ровно r) — не коллизия, чтобы можно было скользить вдоль стены.
  const CONTACT_EPS = 1e-9;
  function sweepAxis(from, to, other, lo, hi, oLo, oHi, r) {
    let gap = 0;
    if (other < oLo) gap = oLo - other;
    else if (other > oHi) gap = other - oHi;
    if (gap >= r) return to;
    const reach = Math.sqrt(r * r - gap * gap);
    if (to > from) {
      const c = lo - reach;
      if (from <= c + CONTACT_EPS && to > c) return c;
    } else if (to < from) {
      const c = hi + reach;
      if (from >= c - CONTACT_EPS && to < c) return c;
    }
    return to;
  }

  // Рывок и ускорение — зеркало game/dash.go и pickups.go. В welcome этих
  // параметров нет, поэтому значения взяты из game.DefaultConfig(): при их
  // изменении на сервере поменяйте и здесь (или отдавайте их в welcome).
  const DASH_SPEED = 700;      // ед./с в начале рывка
  const DASH_DURATION = 0.15;  // с; скорость линейно падает до нуля
  const DASH_COOLDOWN = 3;     // с
  const SPEED_MULTIPLIER = 1.6; // пикап speed
  const TIME_EPS = 1e-9;

  // Локальное состояние рывка (на сервере dashLeft/dashDir в снапшот не попадают).
  const dash = { left: 0, cd: 0, dir: { x: 0, y: 0 } };
  let boostFactor = 1; // из player.boosted последнего снапшота

  // Путь рывка за тик — точный интеграл v(τ) = DASH_SPEED·τ/DASH_DURATION на [τ−dt, τ].
  function dashStepDist(dt) {
    const left = dash.left, next = Math.max(left - dt, 0);
    dash.left = next;
    return DASH_SPEED * (left * left - next * next) / (2 * DASH_DURATION);
  }

  // Зеркало game.World.move: края мира и препятствия, оси раздельно — сначала X,
  // затем Y с уже новым X (упёршись в стену, игрок скользит вдоль неё).
  // Во время рывка обычное управление не действует: смещение — cmd.dashMove.
  function step(pos, cmd, dt) {
    const w = net.welcome;
    const r = w.radius;
    const rx = Math.min(r, w.width / 2), ry = Math.min(r, w.height / 2);
    const v = w.speed * boostFactor;
    const dx = cmd.dashMove ? cmd.dashMove.x : cmd.moveX * v * dt;
    const dy = cmd.dashMove ? cmd.dashMove.y : cmd.moveY * v * dt;
    if (dx !== 0) {
      let x = clamp(pos.x + dx, rx, w.width - rx);
      for (const o of w.obstacles) x = sweepAxis(pos.x, x, pos.y, o.x, o.x + o.w, o.y, o.y + o.h, r);
      pos.x = x;
    }
    if (dy !== 0) {
      let y = clamp(pos.y + dy, ry, w.height - ry);
      for (const o of w.obstacles) y = sweepAxis(pos.y, y, pos.x, o.y, o.y + o.h, o.x, o.x + o.w, r);
      pos.y = y;
    }
  }

  // В intermission сервер отбрасывает ввод целиком и lastSeq не растёт.
  const frozen = () => net.latest && net.latest.round && net.latest.round.phase === "intermission";

  // ---- Prediction / reconciliation ----
  const pred = {
    ready: false,          // есть ли уже серверная позиция своего игрока
    pos: { x: 0, y: 0 },   // предсказанная позиция после последнего клиентского тика
    prev: { x: 0, y: 0 },  // позиция до последнего тика — для интерполяции в кадре
    err: { x: 0, y: 0 },   // визуальная ошибка после коррекции, плавно гасится
  };
  let pending = [];        // отправленные, но ещё не подтверждённые сервером команды
  let lastCorrection = 0;  // расхождение предсказания с сервером при последней сверке (для отладки)
  let acc = 0;             // накопитель времени для фиксированного шага
  let lastFrame = 0;
  // Пока свой игрок мёртв, сервер отбрасывает его ввод (lastSeq не растёт):
  // не предсказываем движение и не копим pending — иначе после респауна был бы рывок.
  let meDead = false;

  // Сброс состояния сессии при новом welcome (реконнект или перезапуск сервера).
  function resetSession() {
    net.latest = null;
    net.snapshots = [];
    clockOffset = null;
    lastTick = -1;
    pred.ready = false;
    pred.err.x = pred.err.y = 0;
    pending = [];
    acc = 0;
    meDead = false;
    dash.left = 0; dash.cd = 0;
    boostFactor = 1;
  }

  function serverMe(snap) {
    if (!net.welcome) return null;
    return (snap.players || []).find(p => p.id === net.welcome.playerId) || null;
  }

  function reconcile(snap) {
    const me = serverMe(snap);
    if (!me) return;
    const dt = 1 / net.welcome.tickRate;

    if (me.dead) {
      meDead = true;
      pending = [];
      dash.left = 0;
      pred.pos = { x: me.x, y: me.y };
      pred.prev = { ...pred.pos };
      pred.err.x = pred.err.y = 0;
      pred.ready = true;
      return;
    }
    // Первый снапшот после респауна: позиция новая, сглаживать от точки смерти нечего.
    const respawned = meDead;
    meDead = false;

    // Всё, что сервер уже применил, больше не нужно. В intermission сервер
    // ввод не применит никогда — переигрывать нечего, игрок стоит.
    pending = snap.round && snap.round.phase === "intermission" ? [] : pending.filter(c => c.seq > me.lastSeq);

    boostFactor = me.boosted ? SPEED_MULTIPLIER : 1;
    // Кулдаун рывка сверяем с сервером: после применения pending он уменьшится ещё на
    // pending.length тиков. Если рывок начат в неподтверждённой команде — сервер о нём
    // ещё не знает, верим локальному состоянию.
    if (typeof me.dashCd === "number" && !pending.some(c => c.dashStart)) {
      dash.cd = Math.max(0, me.dashCd - pending.length * dt);
      if (!pending.some(c => c.dashMove)) dash.left = 0;
    }

    // Переигрываем неподтверждённые команды поверх authoritative-позиции.
    const fixed = { x: me.x, y: me.y };
    for (const c of pending) step(fixed, c, dt);

    if (!pred.ready || respawned) {
      pred.err.x = pred.err.y = 0;
      pred.pos = { ...fixed };
      pred.prev = { ...fixed };
      pred.ready = true;
      return;
    }

    const dx = pred.pos.x - fixed.x;
    const dy = pred.pos.y - fixed.y;
    lastCorrection = Math.hypot(dx, dy); // насколько предсказание разошлось с сервером
    if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
      pred.err.x = pred.err.y = 0;           // телепорт/респаун — прыгаем сразу
    } else {
      pred.err.x += dx;                      // сохраняем экранную позицию, гасим ошибку постепенно
      pred.err.y += dy;
    }
    pred.prev.x -= dx; pred.prev.y -= dy;    // prev сдвигаем вместе с pos, чтобы не было рывка
    pred.pos = fixed;
  }

  // Один клиентский тик: формируем команду, шлём, сразу применяем локально.
  function clientTick(dt) {
    const m = moveVector(input);
    const msg = {
      seq: ++seq,
      moveX: m.x, moveY: m.y,
      angle: input.angle,
      fire: input.fire || fireLatched,
      dash: dashLatched, // одноразово: true только в одном Input после нажатия Shift
      // Эти булевы поля сервер игнорирует; оставлены для совместимости/отладки.
      up: input.up, down: input.down, left: input.left, right: input.right,
    };
    fireLatched = false;
    dashLatched = false;
    ws.send(JSON.stringify(msg)); // шлём и в intermission — это ещё и heartbeat

    pred.prev = { ...pred.pos };
    if (frozen()) {
      dash.left = 0; dash.cd = 0; // новый раунд на сервере сбрасывает рывок
      return;
    }
    if (meDead) return; // ввод мёртвого сервер не применит


    // Порядок как в game.displacement: кулдаун тикает, затем старт рывка, затем шаг.
    const cmd = { seq: msg.seq, moveX: m.x, moveY: m.y };
    dash.cd = Math.max(dash.cd - dt, 0);
    if (msg.dash && dash.left <= TIME_EPS && dash.cd <= TIME_EPS) {
      const l = Math.hypot(m.x, m.y);
      dash.dir = l > 0 ? { x: m.x / l, y: m.y / l } : { x: Math.cos(input.angle), y: Math.sin(input.angle) };
      dash.left = DASH_DURATION;
      dash.cd = DASH_COOLDOWN;
      cmd.dashStart = true;
    }
    if (dash.left > TIME_EPS) {
      const d = dashStepDist(dt);
      cmd.dashMove = { x: dash.dir.x * d, y: dash.dir.y * d }; // запоминаем для переигрывания
    }
    pending.push(cmd);
    step(pred.pos, cmd, dt);
  }

  // Вызывается из requestAnimationFrame. Возвращает позицию своего игрока для отрисовки.
  net.update = function (now) {
    const frameDt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0;
    lastFrame = now;

    if (!net.connected || !pred.ready || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Угол — от отображаемой позиции своего игрока к курсору.
    if (mouse.has) {
      const p = net.renderPos();
      input.angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    }

    const dt = 1 / net.welcome.tickRate;
    acc += frameDt;
    while (acc >= dt) {
      clientTick(dt);
      acc -= dt;
    }

    const k = Math.pow(ERROR_DECAY_PER_SEC, frameDt);
    pred.err.x *= k;
    pred.err.y *= k;
  };

  net.renderPos = function () {
    const a = net.welcome ? acc * net.welcome.tickRate : 1;
    return {
      x: pred.prev.x + (pred.pos.x - pred.prev.x) * a + pred.err.x,
      y: pred.prev.y + (pred.pos.y - pred.prev.y) * a + pred.err.y,
    };
  };

  net.predictionReady = () => pred.ready;
  net.me = () => (net.latest ? serverMe(net.latest) : null); // свой игрок из последнего снапшота
  net.myAngle = () => input.angle;
  net.dashCooldown = () => dash.cd;      // секунд до готовности рывка (предсказано)
  net.dashCooldownMax = DASH_COOLDOWN;
  net.lastCorrection = () => lastCorrection;
  net.mouse = () => (mouse.has ? { x: mouse.x, y: mouse.y } : null); // в координатах мира
  net.pendingCount = () => pending.length;

  // ---- Таблица лидеров: GET /leaderboard?n=10 того же сервера, кэш 10 с ----
  // net.leaderboard() не ждёт сети: отдаёт то, что есть, и при устаревшем кэше
  // запускает фоновый запрос. state: "loading" (ещё не было ответа) / "ok" / "error".
  const LEADERBOARD_TTL_MS = 10000, LEADERBOARD_TIMEOUT_MS = 4000;
  const lb = { state: "loading", rows: [], at: -Infinity, inFlight: false };
  function fetchLeaderboard() {
    lb.inFlight = true;
    lb.at = performance.now(); // и при ошибке: следующая попытка — через TTL, не каждый кадр
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), LEADERBOARD_TIMEOUT_MS);
    fetch(LEADERBOARD_URL, { signal: ctl.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(data => {
        if (!Array.isArray(data)) throw new Error("bad leaderboard");
        lb.rows = data
          .filter(e => e && typeof e.score === "number")
          .map(e => ({ name: typeof e.name === "string" && e.name ? e.name : "—", score: e.score }));
        lb.state = "ok";
      })
      .catch(() => { lb.state = "error"; })
      .finally(() => { clearTimeout(t); lb.inFlight = false; lb.at = performance.now(); });
  }
  net.leaderboard = function () {
    if (!lb.inFlight && performance.now() - lb.at >= LEADERBOARD_TTL_MS) fetchLeaderboard();
    return lb;
  };
})();
