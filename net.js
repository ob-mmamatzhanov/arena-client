// Сетевой слой, ввод и client-side prediction своего игрока.
(function () {
  const WS_URL = "ws://localhost:8080/ws";

  // Значения по умолчанию на случай старого сервера без speed/radius в welcome.
  const DEFAULT_SPEED = 200;  // единиц в секунду
  const DEFAULT_RADIUS = 16;

  // Сглаживание коррекций: доля ошибки, остающаяся через секунду,
  // и порог, после которого считаем, что это телепорт, и не сглаживаем.
  const ERROR_DECAY_PER_SEC = 0.0001;
  const SNAP_DISTANCE = 100;

  const net = {
    connected: false,
    welcome: null,   // {playerId, tickRate, width, height}
    latest: null,    // последний snapshot
    status: "connecting...",
  };
  window.net = net;

  const ws = new WebSocket(WS_URL);

  ws.onopen = () => { net.status = "waiting for welcome..."; };
  ws.onclose = () => { net.connected = false; net.status = "disconnected"; };
  ws.onerror = () => { net.status = "connection error"; };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "welcome") {
      net.welcome = {
        playerId: msg.playerId,
        tickRate: msg.tickRate,
        width: msg.width,
        height: msg.height,
        speed: typeof msg.speed === "number" ? msg.speed : DEFAULT_SPEED,
        radius: typeof msg.radius === "number" ? msg.radius : DEFAULT_RADIUS,
        obstacles: Array.isArray(msg.obstacles) ? msg.obstacles : [],
      };
      net.connected = true;
      net.status = "connected";
    } else if (msg.type === "snapshot") {
      net.latest = msg;
      net.latestAt = performance.now();
      pushSnapshot(msg, net.latestAt);
      reconcile(msg);
      // Попадания есть только в снапшоте своего тика — отдаём каждый снапшот,
      // а не только последний к кадру, чтобы события не терялись.
      if (net.onSnapshot) net.onSnapshot(msg, net.latestAt);
    }
  };

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
  const mouse = { x: 0, y: 0, has: false };
  let seq = 0;

  window.addEventListener("keydown", (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    input[k] = true;
    if (k === "fire") fireLatched = true;
  });
  window.addEventListener("keyup", (e) => {
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
      if (e.button === 0) { input.fire = true; fireLatched = true; }
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

  // Зеркало game.World.move: края мира и препятствия, оси раздельно — сначала X,
  // затем Y с уже новым X (упёршись в стену, игрок скользит вдоль неё).
  function step(pos, cmd, dt) {
    const w = net.welcome;
    const r = w.radius;
    const rx = Math.min(r, w.width / 2), ry = Math.min(r, w.height / 2);
    const dx = cmd.moveX * w.speed * dt, dy = cmd.moveY * w.speed * dt;
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
  let acc = 0;             // накопитель времени для фиксированного шага
  let lastFrame = 0;

  function serverMe(snap) {
    if (!net.welcome) return null;
    return (snap.players || []).find(p => p.id === net.welcome.playerId) || null;
  }

  function reconcile(snap) {
    const me = serverMe(snap);
    if (!me) return;
    const dt = 1 / net.welcome.tickRate;

    // Всё, что сервер уже применил, больше не нужно. В intermission сервер
    // ввод не применит никогда — переигрывать нечего, игрок стоит.
    pending = snap.round && snap.round.phase === "intermission" ? [] : pending.filter(c => c.seq > me.lastSeq);

    // Переигрываем неподтверждённые команды поверх authoritative-позиции.
    const fixed = { x: me.x, y: me.y };
    for (const c of pending) step(fixed, c, dt);

    if (!pred.ready) {
      pred.pos = { ...fixed };
      pred.prev = { ...fixed };
      pred.ready = true;
      return;
    }

    const dx = pred.pos.x - fixed.x;
    const dy = pred.pos.y - fixed.y;
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
    const cmd = {
      seq: ++seq,
      moveX: m.x, moveY: m.y,
      angle: input.angle,
      fire: input.fire || fireLatched,
      // Эти булевы поля сервер игнорирует; оставлены для совместимости/отладки.
      up: input.up, down: input.down, left: input.left, right: input.right,
    };
    fireLatched = false;
    ws.send(JSON.stringify(cmd)); // шлём и в intermission — это ещё и heartbeat

    pred.prev = { ...pred.pos };
    if (frozen()) return;
    pending.push(cmd);
    step(pred.pos, cmd, dt);
  }

  // Вызывается из requestAnimationFrame. Возвращает позицию своего игрока для отрисовки.
  net.update = function (now) {
    const frameDt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.25) : 0;
    lastFrame = now;

    if (!net.connected || !pred.ready || ws.readyState !== WebSocket.OPEN) return;

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
  net.myAngle = () => input.angle;
  net.mouse = () => (mouse.has ? { x: mouse.x, y: mouse.y } : null); // в координатах мира
  net.pendingCount = () => pending.length;
})();
