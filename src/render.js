// Отрисовка мира, HUD и межраундового экрана на <canvas>. Перенесено из inline-скрипта index.html.
// Состояние рендера (следы пуль, анимации ходьбы, «+1») живёт в замыкании одной сессии.
import { buildSprites, drawPlayer, drawPickup, drawWall, PALETTE,
  PLAYER_SIZE, PLAYER_SCALE, PICKUP_SCALE, BULLET_SIZE, CRATE_TILE } from "./sprites.js";
import { fx } from "./fx.js";

// net — объект сессии из net.js; on(target, type, fn) — addEventListener с отпиской при закрытии.
// Возвращает функцию кадра draw(now); цикл requestAnimationFrame крутит net.js.
export function createRenderer(canvas, net, on) {
  const S = buildSprites(); // один раз при старте
  // Визуальный размер игрока (в ед. upright ≈ px спрайта). Серверный хитбокс не меняется.
  const PS = PLAYER_SCALE;
  const P_HALF = PLAYER_SIZE * PS / 2;

  const ctx = canvas.getContext("2d");
  let worldSx = 1, worldSy = 1; // масштаб мир → холст (логические px), обновляется в draw

  // ---- Логический размер и HiDPI ----
  // Вся раскладка — в логических px холста W×H (атрибуты width/height из разметки).
  // Буфер — W·dpr × H·dpr, базовое преобразование scale(dpr): на retina спрайты и текст
  // чёткие, а CSS-размер холста (вписывание в окно) от буфера не зависит.
  const W = canvas.width, H = canvas.height;
  let dpr = 0;
  function fitBackingStore() {
    const d = Math.min(window.devicePixelRatio || 1, 2); // выше 2 — лишняя нагрузка без видимой разницы
    if (d === dpr) return;
    dpr = d;
    canvas.width = Math.round(W * d);
    canvas.height = Math.round(H * d);
  }
  const resetTransform = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ---- Отладочная строка: F3 или ?debug в адресе ----
  let debug = new URLSearchParams(location.search).has("debug");
  on(window, "keydown", (e) => {
    if (e.code === "F3" && !net.typing(e)) { e.preventDefault(); debug = !debug; }
  });

  // ---- Пули: след из последних позиций ----
  const TRAIL_POINTS = 4;    // сколько последних позиций из снапшотов хранить на пулю
  const FLASH_MS = 150;      // белая вспышка игрока при попадании

  const bullets = new Map(); // bullet.id -> {hist: [{x, y}] (до 4, старые первыми), vx, vy, owner}
  const flashAt = new Map(); // playerId -> время последнего попадания

  net.onSnapshot = (snap, now) => {
    const seen = new Set();
    for (const b of snap.bullets || []) {
      seen.add(b.id);
      const v = bullets.get(b.id) || { hist: [] };
      v.hist.push({ x: b.x, y: b.y });
      if (v.hist.length > TRAIL_POINTS) v.hist.shift();
      Object.assign(v, { vx: b.vx, vy: b.vy, owner: b.owner });
      bullets.set(b.id, v);
    }
    for (const id of bullets.keys()) if (!seen.has(id)) bullets.delete(id);

    for (const e of snap.events || []) {
      if (e.type === "hit") flashAt.set(e.targetId, now);
      if (e.type === "kill" && e.shooterId === net.welcome.playerId && e.targetId !== e.shooterId) plusOnes.push(now);
    }

    fx.onSnapshot(snap, now, {
      myId: net.welcome.playerId,
      radius: net.welcome.radius,
      players: new Map((snap.players || []).map(p => [p.id, p])),
      colorOf: colorOfId, // цвет игрока из PALETTE — для частиц попадания
    });
  };

  // Нажатие огня при пустом магазине — сухой щелчок. Сервер в этом случае
  // просто не стреляет, события shot не будет.
  const isPlaying = (snap) => !snap.round || snap.round.phase === "play";
  net.onFireAttempt = () => {
    const me = net.me();
    if (me && !me.dead && me.ammo === 0 && isPlaying(net.latest)) fx.playDryClick();
  };

  function bulletColor(owner, alpha) {
    const mine = net.welcome && owner === net.welcome.playerId;
    // Светлые тона: прежние насыщенные (255,213,74 / 255,138,80 при α 0.4) сливались с кирпичом.
    return mine ? `rgba(255,240,170,${alpha})` : `rgba(255,205,160,${alpha})`;
  }
  const TRAIL_UNDERLAY = "rgba(20,12,8,0.45)"; // тёмная подложка — отделяет хвост от кирпича

  function drawBullets(now) {
    // Голова — последняя позиция, сдвинутая по скорости до текущего кадра (не дальше двух тиков).
    const ahead = Math.min((now - (net.latestAt || now)) / 1000, 2 / net.welcome.tickRate);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const v of bullets.values()) {
      const last = v.hist[v.hist.length - 1];
      const hx = last.x + v.vx * ahead, hy = last.y + v.vy * ahead;
      if (v.hist.length > 1) {
        ctx.beginPath();
        ctx.moveTo(v.hist[0].x, v.hist[0].y);
        for (let i = 1; i < v.hist.length; i++) ctx.lineTo(v.hist[i].x, v.hist[i].y);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = TRAIL_UNDERLAY; // тот же путь дважды: подложка шире, светлая линия поверх
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = bulletColor(v.owner, 0.85);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Голова — спрайт пули центром в позиции (S.bullet в 2×, поэтому размер задаём явно).
      // Пули рисуются после стен и до игроков — см. порядок в draw().
      upright(hx, hy, 0, () => ctx.drawImage(S.bullet, -BULLET_SIZE / 2, -BULLET_SIZE / 2, BULLET_SIZE, BULLET_SIZE));
    }
  }

  // ---- Пикапы ----
  function drawPickups(snap, now) {
    for (const pk of snap.pickups || []) {
      // Сдвиг фазы по id, чтобы соседние пикапы не качались синхронно.
      if (!S.pickups[pk.type]) continue;
      upright(pk.x, pk.y, 0, () => drawPickup(ctx, S, pk.type, 0, 0, now + pk.id * 137, PICKUP_SCALE));
    }
  }

  // ---- Индикатор рывка: дуга вокруг своего игрока (в системе upright) ----
  const DASH_RING_R = P_HALF + 5;
  function drawDashIndicator() {
    const cd = net.dashCooldown(), max = net.dashCooldownMax;
    const ready = cd <= 0;
    const frac = ready ? 1 : 1 - cd / max;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (!ready) { // подложка — полный круг, поверх — сколько уже восстановилось
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.arc(0, 0, DASH_RING_R, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = ready ? "rgba(110,200,255,0.85)" : "rgba(110,200,255,0.55)";
    ctx.beginPath();
    ctx.arc(0, 0, DASH_RING_R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // ---- Интерполяция других игроков ----
  const RENDER_DELAY = 100;  // мс: рисуем мир с этой задержкой
  let interpOn = true;
  let interpOk = false;      // нашлась ли пара снапшотов вокруг renderTime в этом кадре

  on(window, "keydown", (e) => {
    if (e.code === "KeyI" && debug && !e.repeat && !net.typing(e)) interpOn = !interpOn; // отладочная клавиша
  });

  const lerp = (a, b, t) => a + (b - a) * t;
  // Кратчайший путь по окружности: из 3.1 в -3.1 — это +0.08, а не -6.2.
  function lerpAngle(a, b, t) {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }

  // Игроки для отрисовки: список и hp/score — из последнего снапшота,
  // x/y/angle — интерполированы между снапшотами вокруг now − RENDER_DELAY.
  function renderPlayers(now, latest) {
    interpOk = false;
    if (!interpOn) return latest.players || [];
    const pair = net.bracket(now - RENDER_DELAY);
    if (!pair) return latest.players || []; // снапшотов не хватает — рисуем последний как есть
    interpOk = true;

    const [a, b] = pair;
    const t = b.t > a.t ? (now - RENDER_DELAY - a.t) / (b.t - a.t) : 1;
    const from = new Map((a.snap.players || []).map(p => [p.id, p]));
    const to = new Map((b.snap.players || []).map(p => [p.id, p]));

    return (latest.players || []).map(p => {
      const pa = from.get(p.id), pb = to.get(p.id);
      // Мёртв на любом конце интервала — скрываем: иначе после респауна игрок
      // на ~RENDER_DELAY проехал бы от точки смерти к точке появления.
      if ((pa && pa.dead) || (pb && pb.dead)) return { ...p, dead: true };
      if (pa && pb) {
        return { ...p, x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), angle: lerpAngle(pa.angle, pb.angle, t) };
      }
      if (pb) return { ...p, x: pb.x, y: pb.y, angle: pb.angle }; // только что появился
      return p; // в момент renderTime ещё не было — показываем последнюю позицию
    });
  }

  // ---- Препятствия ----
  // Вид препятствия — поле kind из welcome: "crate" — ящик, остальное (и пустое) — стена.
  // Сломанный ящик (hp 0, см. net.js applyCrates) не рисуется; у повреждённого — трещины.
  function drawObstacles(wel) {
    wel.obstacles.forEach((o, i) => {
      if (o.kind !== "crate") drawWall(ctx, S.wall, o.x, o.y, o.w, o.h);
      else if (net.solid(o)) drawCrate(o, i, wel.crateHits);
    });
  }

  // Ящик — тайлами CRATE_TILE целиком, без паттерна, плюс тёмная кромка 1 px.
  // Ящики кратны 32; если нет — крайний тайл обрезается (не растягивается).
  function drawCrate(o, i, full) {
    const k = S.crate.width / CRATE_TILE; // тайл нарисован в 2×
    for (let ty = 0; ty < o.h; ty += CRATE_TILE) {
      for (let tx = 0; tx < o.w; tx += CRATE_TILE) {
        const w = Math.min(CRATE_TILE, o.w - tx), h = Math.min(CRATE_TILE, o.h - ty);
        ctx.drawImage(S.crate, 0, 0, w * k, h * k, o.x + tx, o.y + ty, w, h);
      }
    }
    const damage = full > 0 && typeof o.hp === "number" ? full - o.hp : 0;
    if (damage > 0) drawCrateDamage(o, i, damage, full);
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1); // +0.5 — линия ровно в 1 px, без размытия
  }

  // Трещины: по одной на каждое попадание, форма постоянна для ящика (сид — его
  // индекс), поэтому при каждом кадре не «пляшет». Плюс ящик темнеет.
  const crackCache = new Map(); // индекс ящика → [[{x, y}, …], …] в долях ширины/высоты
  function cracksOf(i, n) {
    let list = crackCache.get(i);
    if (!list || list.length < n) {
      let a = Math.imul(i + 1, 0x9e3779b1) >>> 0; // mulberry32: детерминированно по индексу
      const rnd = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      list = [];
      for (let c = 0; c < n; c++) {
        // Старт у случайной грани (чуть внутри — линия с круглым концом не вылезает
        // за кромку), дальше 3 излома внутрь ящика.
        const side = Math.floor(rnd() * 4), t = 0.2 + rnd() * 0.6;
        let p = [{ x: t, y: 0.04 }, { x: 0.96, y: t }, { x: t, y: 0.96 }, { x: 0.04, y: t }][side];
        const pts = [p];
        const dir = [[0, 1], [-1, 0], [0, -1], [1, 0]][side];
        for (let s = 0; s < 3; s++) {
          p = {
            x: Math.min(0.95, Math.max(0.05, p.x + dir[0] * (0.12 + rnd() * 0.15) + (rnd() - 0.5) * 0.25)),
            y: Math.min(0.95, Math.max(0.05, p.y + dir[1] * (0.12 + rnd() * 0.15) + (rnd() - 0.5) * 0.25)),
          };
          pts.push(p);
        }
        list.push(pts);
      }
      crackCache.set(i, list);
    }
    return list.slice(0, n);
  }
  function drawCrateDamage(o, i, damage, full) {
    ctx.fillStyle = `rgba(20,10,0,${(0.35 * damage) / full})`;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pts of cracksOf(i, damage)) {
      ctx.beginPath();
      pts.forEach((q, j) => (j ? ctx.lineTo : ctx.moveTo).call(ctx, o.x + q.x * o.w, o.y + q.y * o.h));
      ctx.strokeStyle = "rgba(25,12,4,0.9)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,220,170,0.35)"; // светлый скол вдоль трещины
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // ---- Пол ----
  // Заливаем весь холст в экранных координатах (только сдвиг тряски): тайлы остаются
  // квадратными. Тот же приём, что в drawWall: тайл нарисован в 2×, сжимаем scale(1/2).
  const SPRITE_SCALE = S.floor.width / 32; // тайл пола — 32 логических px
  const SHAKE_MARGIN = 8;                  // запас под сдвиг тряски
  let floorPattern = null;
  function drawFloor() {
    floorPattern = floorPattern || ctx.createPattern(S.floor, "repeat");
    ctx.save();
    ctx.scale(1 / SPRITE_SCALE, 1 / SPRITE_SCALE);
    ctx.fillStyle = floorPattern;
    ctx.fillRect(-SHAKE_MARGIN * SPRITE_SCALE, -SHAKE_MARGIN * SPRITE_SCALE,
      (W + 2 * SHAKE_MARGIN) * SPRITE_SCALE, (H + 2 * SHAKE_MARGIN) * SPRITE_SCALE);
    ctx.restore();
  }

  // ---- Движение по кадрам: ходьба и след рывка ----
  // По id храним отображаемую (интерполированную/предсказанную) позицию прошлого кадра
  // и короткую историю позиций для следа рывка.
  const WALK_MIN_PX = 0.5;    // сдвиг на экране за кадр, после которого игрок «идёт»
  const WALK_HOLD_MS = 120;   // см. walkFrame
  const DASH_MIN_SPEED = 450; // ед./с: обычный бег 200, с ускорением 320, первый тик рывка ~580
  const TELEPORT_DIST = 60;   // скачок больше этого за кадр — респаун/коррекция, не рывок
  const DASH_TRAIL_MS = 160;  // сколько держится след после обнаружения рывка
  const HIST_MS = 100;
  const motion = new Map();   // id -> {x, y, t, movedAt, dashAt, hist: [{x, y, t}]}

  function track(p, now) {
    let s = motion.get(p.id);
    if (!s) motion.set(p.id, s = { x: p.x, y: p.y, t: now, movedAt: -Infinity, dashAt: -Infinity, hist: [] });
    const m = ctx.getTransform();
    const dx = p.x - s.x, dy = p.y - s.y;
    const d = Math.hypot(dx, dy), dt = (now - s.t) / 1000;
    if (Math.hypot(dx * m.a, dy * m.d) > WALK_MIN_PX * dpr) s.movedAt = now; // m — в пикселях буфера
    if (dt > 0 && d < TELEPORT_DIST && d / dt > DASH_MIN_SPEED) s.dashAt = now;
    if (d >= TELEPORT_DIST) s.hist = [];
    s.x = p.x; s.y = p.y; s.t = now;
    s.hist.push({ x: p.x, y: p.y, t: now });
    while (s.hist.length && s.hist[0].t < now - HIST_MS) s.hist.shift();
    return s;
  }

  // Кадр ходьбы. Удержание WALK_HOLD_MS: когда пары снапшотов нет (или интерполяция
  // выключена), чужой игрок сдвигается только раз в тик, и без удержания ноги
  // мигали бы между шагом и стойкой.
  function walkFrame(s, now) {
    return now - s.movedAt < WALK_HOLD_MS ? Math.floor(now / 120) % 4 : 0;
  }

  // Позиция из истории примерно ago мс назад (ближайшая не новее).
  function pastPos(s, now, ago) {
    for (let i = s.hist.length - 1; i >= 0; i--) if (s.hist[i].t <= now - ago) return s.hist[i];
    return s.hist[0];
  }

  // Убираем записи ушедших игроков.
  function pruneMotion(players) {
    const ids = new Set(players.map(p => p.id));
    for (const id of motion.keys()) if (!ids.has(id)) motion.delete(id);
  }

  // Мир растянут неравномерно (1000×1000 → 800×600): повёрнутый спрайт в таком
  // преобразовании скашивается. Поэтому спрайты рисуем в экранных координатах
  // с равномерным масштабом k, а угол переводим в экранный — ствол смотрит на курсор.
  function upright(x, y, angle, fn) {
    const m = ctx.getTransform(); // текущий мировой: тряска + масштаб, без поворота
    const k = Math.sqrt(m.a * m.d);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, m.a * x + m.e, m.d * y + m.f);
    fn(Math.atan2(Math.sin(angle) * m.d, Math.cos(angle) * m.a));
    ctx.restore();
  }

  // Цвет и имя — только из снапшота: color — индекс в PALETTE, назначает сервер.
  const NO_COLOR = "#9e9e9e"; // игрока уже нет в снапшоте (вышел) или color некорректен
  const playerColor = (p) => (Number.isInteger(p.color) && p.color >= 0 && p.color < PALETTE.length ? p.color : 0);
  const paletteColor = (p) => (Number.isInteger(p.color) && PALETTE[p.color]) || NO_COLOR;
  // Цвет по id — для round.scores и частиц, где под рукой только id: ищем игрока в снапшоте.
  function colorOfId(id) {
    const p = net.latest && (net.latest.players || []).find(q => q.id === id);
    return p ? paletteColor(p) : NO_COLOR;
  }
  const playerName = (p) => p.name || "";

  // hp-полоска под игроком (24×3 при масштабе 1, растёт вместе со спрайтом),
  // от зелёного (100) к красному (0); при полном hp не рисуем.
  const HP_MAX = 100;
  const HP_W = 24 * PS, HP_H = 3 * PS, HP_Y = P_HALF + 2;
  function drawHpBar(hp) {
    if (hp >= HP_MAX) return;
    const f = Math.max(0, Math.min(1, hp / HP_MAX));
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-HP_W / 2 - 1, HP_Y - 1, HP_W + 2, HP_H + 2);
    ctx.fillStyle = `hsl(${Math.round(120 * f)},85%,50%)`;
    ctx.fillRect(-HP_W / 2, HP_Y, HP_W * f, HP_H);
  }

  // Один игрок в экранной системе upright: (0,0) — центр, 1 ед. ≈ 1 px спрайта.
  function drawPlayerSprite(p, s, angle, now, mine) {
    const frames = S.players[playerColor(p)];
    const frame = walkFrame(s, now);

    if (now - s.dashAt < DASH_TRAIL_MS) { // рывок — две полупрозрачные копии позади
      const m = ctx.getTransform(); // upright: масштаб k, центр игрока
      [[60, 0.15], [30, 0.3]].forEach(([ago, alpha]) => {
        const q = pastPos(s, now, ago);
        ctx.save();
        ctx.globalAlpha = alpha;
        // смещение в мировых ед. → экранные px → ед. upright
        drawPlayer(ctx, frames, (q.x - p.x) * worldSx * dpr / m.a, (q.y - p.y) * worldSy * dpr / m.d, angle, frame, PS);
        ctx.restore();
      });
    }

    if (p.boosted) { // ускорение от пикапа — светящийся контур
      ctx.save();
      ctx.shadowColor = "#ffd54a";
      ctx.shadowBlur = 14 + 4 * Math.sin(now / 120);
      ctx.strokeStyle = "#ffe27a";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 18 * PS, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (mine) { // свой — белое кольцо под спрайтом (радиус 16 при масштабе 1)
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5 * PS;
      ctx.beginPath(); ctx.arc(0, 0, 16 * PS, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.save();
    if (p.invuln) ctx.globalAlpha = Math.floor(now / 110) % 2 ? 0.35 : 0.9; // неуязвим — мигание
    drawPlayer(ctx, frames, 0, 0, angle, frame, PS);
    ctx.restore();

    if (now - (flashAt.get(p.id) ?? -Infinity) < FLASH_MS) { // попадание — белая вспышка
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath(); ctx.arc(0, 0, 12 * PS, 0, Math.PI * 2); ctx.fill();
    }
    if (mine) drawDashIndicator();

    // Имя над игроком, hp-полоска под ним.
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(playerName(p), 0, -P_HALF - 4);
    ctx.fillStyle = paletteColor(p);
    ctx.fillText(playerName(p), 0, -P_HALF - 4);
    if (p.hp != null) drawHpBar(p.hp); // hp = 0 — валидное значение
  }

  // ---- Прицел с разбросом ----
  // Сервер отклоняет пулю равномерно в ±heat·MAX_SPREAD рад (protocol.go, поле heat).
  // На расстоянии d до курсора это ±d·tan(heat·MAX_SPREAD) — таким и рисуем радиус круга.
  const MAX_SPREAD = 0.25;
  const CROSS_MIN_PX = 6;

  function drawCrosshair(snap, wel, sx, sy) {
    const m = net.mouse();
    if (!m || !net.predictionReady()) return;
    const me = (snap.players || []).find(p => p.id === wel.playerId);
    const heat = me && typeof me.heat === "number" ? Math.min(Math.max(me.heat, 0), 1) : 0;
    const from = net.renderPos();
    const d = Math.hypot(m.x - from.x, m.y - from.y);
    const rPx = Math.max(CROSS_MIN_PX, d * Math.tan(heat * MAX_SPREAD) * (sx + sy) / 2);

    // Рисуем в экранных координатах: мир растянут неравномерно, и круг стал бы эллипсом.
    const cx = m.x * sx, cy = m.y * sy;
    const g = Math.round(255 - 140 * heat), b = Math.round(255 - 215 * heat);
    ctx.strokeStyle = `rgb(255,${g},${b})`; // от белого к оранжево-красному по мере перегрева
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // центр — маленький крест
    ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  }

  // ---- Раунды ----
  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  // Таймер и патроны — по центру верхнего и нижнего края: все точки спавна карты
  // стоят у углов и боковых краёв (за угловыми стенами), и игрок не появляется под HUD.
  // Если свой игрок всё же зашёл под надпись — она бледнеет, чтобы не закрывать его.
  const HUD_FADE = 0.3;
  function hudAlpha(x0, y0, x1, y1) {
    if (!myDrawPos || !net.welcome) return 1;
    const px = myDrawPos.x * worldSx, py = myDrawPos.y * worldSy, r = P_HALF + 6; // + имя/hp-полоска
    return px + r > x0 && px - r < x1 && py + r > y0 && py - r < y1 ? HUD_FADE : 1;
  }

  function drawRoundTimer(round) {
    ctx.save();
    ctx.globalAlpha = hudAlpha(W / 2 - 40, 0, W / 2 + 40, 32);
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(fmtTime(round.timeLeft), W / 2, 22);
    ctx.fillStyle = round.timeLeft <= 10 ? "#ff6b6b" : "#e8e8e8";
    ctx.fillText(fmtTime(round.timeLeft), W / 2, 22);
    ctx.restore();
  }

  // ---- Табло по удержанию Tab ----
  // В раунде — счёт игроков, в intermission — таблица лидеров.
  // preventDefault и на keydown, и на keyup: иначе Tab уводит фокус с холста.
  let tabHeld = false;
  on(window, "keydown", (e) => { if (e.code === "Tab") { e.preventDefault(); tabHeld = true; } });
  on(window, "keyup", (e) => { if (e.code === "Tab") { e.preventDefault(); tabHeld = false; } });
  on(window, "blur", () => { tabHeld = false; }); // отпустили Tab вне окна

  function drawScoreOverlay(snap, wel) {
    const rows = (snap.players || []).slice().sort((a, b) => b.score - a.score || a.id - b.id);
    const rowH = 28, w = 300, padTop = 52;
    const h = padTop + rows.length * rowH + 16;
    const x0 = (W - w) / 2, y0 = Math.max(40, (H - h) / 2);

    ctx.fillStyle = "rgba(10,10,14,0.72)";
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("Счёт", x0 + w / 2, y0 + 24);
    ctx.font = "12px monospace";
    ctx.fillStyle = "#888";
    ctx.textAlign = "left";  ctx.fillText("игрок", x0 + 36, y0 + 44);
    ctx.textAlign = "right"; ctx.fillText("счёт", x0 + w - 14, y0 + 44);

    let y = y0 + padTop;
    for (const p of rows) {
      const isMe = p.id === wel.playerId;
      if (isMe) { // свой — подсветка строки и жирный шрифт
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(x0 + 4, y, w - 8, rowH - 2);
      }
      const col = paletteColor(p);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x0 + 20, y + rowH / 2 - 1, 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = isMe ? "bold 15px monospace" : "15px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${playerName(p)}${isMe ? " (вы)" : ""}`, x0 + 36, y + 19);
      ctx.textAlign = "right";
      ctx.fillText(String(p.score), x0 + w - 14, y + 19);
      y += rowH;
    }
  }

  // ---- «+1» над своим игроком за свой фраг ----
  const PLUS_MS = 800, PLUS_RISE = 22;
  let plusOnes = []; // моменты (performance.now) своих kill
  function drawPlusOnes(now) {
    plusOnes = plusOnes.filter(at => now - at < PLUS_MS);
    if (!plusOnes.length || !myDrawPos) return;
    upright(myDrawPos.x, myDrawPos.y, 0, () => {
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      // Верхние спавны у самого края: если над игроком не хватает места
      // (с запасом на подъём и стопку), «+1» всплывает под ним — вниз.
      const m = ctx.getTransform(); // upright: m.f — экранный y центра, m.d — масштаб
      const reach = P_HALF + 18 + PLUS_RISE + 14 * (plusOnes.length - 1) + 16;
      const dir = m.f - reach * m.d < 0 ? -1 : 1; // 1 — вверх, -1 — вниз
      plusOnes.forEach((at, i) => {
        const t = (now - at) / PLUS_MS;
        const off = P_HALF + 18 + PLUS_RISE * (1 - (1 - t) * (1 - t)) + i * 14; // ease-out
        const y = dir > 0 ? -off : off + 12; // +12 — высота текста, при движении вниз базовая линия ниже
        ctx.globalAlpha = 1 - t * t; // держится, потом быстро гаснет
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.strokeText("+1", 0, y);
        ctx.fillStyle = "#ffe27a";
        ctx.fillText("+1", 0, y);
      });
    });
  }
  let myDrawPos = null; // где в этом кадре нарисован свой игрок (мир), null — не нарисован

  // Ячейка имени: обрезаем по ширине, чтобы не налезть на счёт.
  function fitText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  // Межраундовый экран: слева итоги раунда (round.scores, имена в цветах игроков),
  // справа — таблица лидеров за всё время с сервера.
  function drawIntermission(round, snap, wel) {
    ctx.fillStyle = "rgba(10,10,14,0.72)";
    ctx.fillRect(0, 0, W, H);

    // scores приходят только в intermission; на всякий случай — запасной вариант из игроков.
    const rows = (round.scores || snap.players || [])
      .map(r => ({ id: r.id, name: r.name, score: r.score }))
      .sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 10); // топ-10
    const winner = round.winnerId || 0; // 0 — ничья / никто не набрал очков
    const winnerRow = (round.scores || []).find(r => r.id === winner);

    const cx = W / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("Раунд окончен", cx, 80);
    ctx.font = "18px sans-serif";
    ctx.fillStyle = winner ? colorOfId(winner) : "#bbb";
    const winnerName = winnerRow && winnerRow.name ? winnerRow.name : "—";
    ctx.fillText(winner ? `Победитель: ${winnerName}${winner === wel.playerId ? " (вы)" : ""}` : "Ничья", cx, 112);

    const rowH = 30, w = 340, top = 172;
    // Итоги раунда
    const x0 = 30;
    let y = top;
    ctx.font = "bold 15px sans-serif"; ctx.fillStyle = "#ddd"; ctx.textAlign = "left";
    ctx.fillText("Раунд", x0, y - 24);
    ctx.font = "14px monospace"; ctx.fillStyle = "#888";
    ctx.textAlign = "left";  ctx.fillText("#  игрок", x0 + 12, y);
    ctx.textAlign = "right"; ctx.fillText("счёт", x0 + w - 12, y);
    y += 12;
    rows.forEach((r, i) => {
      const isWinner = r.id === winner, isMe = r.id === wel.playerId;
      ctx.fillStyle = isWinner ? "rgba(255,213,74,0.25)" : i % 2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x0, y, w, rowH);
      if (isWinner) { ctx.strokeStyle = "#ffd54a"; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y + 1, w - 2, rowH - 2); }
      ctx.font = isWinner || isMe ? "bold 16px monospace" : "16px monospace";
      ctx.fillStyle = colorOfId(r.id); // цвет игрока, как у его спрайта
      ctx.beginPath(); ctx.arc(x0 + 44, y + rowH / 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, x0 + 12, y + 21);
      const suffix = `${isMe ? " (вы)" : ""}${isWinner ? " ★" : ""}`;
      ctx.fillText(fitText(r.name || "—", w - 56 - 50 - ctx.measureText(suffix).width) + suffix, x0 + 56, y + 21);
      ctx.textAlign = "right";
      ctx.fillText(String(r.score), x0 + w - 12, y + 21);
      y += rowH;
    });
    const roundBottom = y;

    // Лидеры за всё время
    const lbBottom = drawLeaderboardTable(W - 30 - w, top, w);

    ctx.textAlign = "center";
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#ccc";
    ctx.fillText(`Следующий раунд через ${Math.max(0, Math.ceil(round.timeLeft))} с`, cx,
      Math.min(H - 24, Math.max(roundBottom, lbBottom) + 40));
  }

  // Таблица лидеров (net.leaderboard: GET /leaderboard?n=10, кэш 10 с).
  // Цвета нет: в таблице и те, кто сейчас не в игре. Возвращает нижнюю границу.
  function drawLeaderboardTable(x0, y, w) {
    const lb = net.leaderboard();
    const rowH = 30;
    ctx.font = "bold 15px sans-serif"; ctx.fillStyle = "#ddd"; ctx.textAlign = "left";
    ctx.fillText("Лучшие за всё время", x0, y - 24);
    ctx.font = "14px monospace"; ctx.fillStyle = "#888";
    ctx.textAlign = "left";  ctx.fillText("#  игрок", x0 + 12, y);
    ctx.textAlign = "right"; ctx.fillText("очки", x0 + w - 12, y);
    y += 12;
    if (lb.state !== "ok" || !lb.rows.length) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x0, y, w, rowH);
      ctx.font = "15px sans-serif"; ctx.textAlign = "center";
      ctx.fillStyle = lb.state === "error" ? "#ff8a80" : "#999";
      ctx.fillText(lb.state === "error" ? "Таблица лидеров недоступна" : lb.state === "loading" ? "Загрузка…" : "Пока пусто",
        x0 + w / 2, y + 20);
      return y + rowH;
    }
    lb.rows.slice(0, 10).forEach((r, i) => {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x0, y, w, rowH);
      ctx.font = "16px monospace";
      ctx.fillStyle = "#e8e8e8";
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, x0 + 12, y + 21);
      ctx.fillText(fitText(r.name, w - 44 - 70), x0 + 44, y + 21);
      ctx.textAlign = "right";
      ctx.fillText(String(r.score), x0 + w - 12, y + 21);
      y += rowH;
    });
    return y;
  }

  // Tab в intermission — таблица лидеров крупно, поверх межраундового экрана.
  function drawLeaderboardOverlay() {
    const lb = net.leaderboard();
    const n = lb.state === "ok" ? Math.max(1, Math.min(10, lb.rows.length)) : 1;
    const w = 380, x0 = (W - w) / 2, h = 64 + 12 + n * 30 + 24;
    const y0 = Math.max(20, (H - h) / 2);
    ctx.fillStyle = "rgba(10,10,14,0.94)";
    ctx.fillRect(x0 - 20, y0, w + 40, h);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 19.5, y0 + 0.5, w + 39, h - 1);
    drawLeaderboardTable(x0, y0 + 64, w);
  }

  // ---- Патроны и смерть ----
  // Счётчик в правом нижнем углу; на нуле мигает красным.
  function drawAmmo(me, now) {
    if (typeof me.ammo !== "number") return; // старый сервер без патронов
    const empty = me.ammo === 0;
    const y = H - 14;
    const num = String(me.ammo);
    ctx.save();
    ctx.font = "bold 22px monospace";
    const wNum = ctx.measureText(num).width;
    ctx.font = "12px sans-serif";
    const wLabel = ctx.measureText("патроны").width;
    // «патроны 12» одной строкой по центру нижнего края.
    const x0 = W / 2 - (wLabel + 8 + wNum) / 2;
    ctx.globalAlpha = hudAlpha(x0 - 6, H - 36, x0 + wLabel + 8 + wNum + 6, H);
    ctx.textAlign = "left";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    const color = !empty ? "#e8e8e8" : Math.floor(now / 250) % 2 ? "#ff3b3b" : "#5a1d1d";
    ctx.strokeText("патроны", x0, y - 2);
    ctx.fillStyle = empty ? color : "#aaa";
    ctx.fillText("патроны", x0, y - 2);
    ctx.font = "bold 22px monospace";
    ctx.strokeText(num, x0 + wLabel + 8, y);
    ctx.fillStyle = color;
    ctx.fillText(num, x0 + wLabel + 8, y);
    ctx.restore();
  }

  // Затемнение и крупный отсчёт до респауна. respawnIn приходит раз в тик —
  // между снапшотами досчитываем по времени, чтобы цифра не залипала.
  function drawDeath(me, now) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, H);
    const left = Math.max(0, (me.respawnIn || 0) - (now - (net.latestAt || now)) / 1000);
    const cx = W / 2, cy = H / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff6b6b";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("Вы убиты", cx, cy - 70);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 96px sans-serif";
    ctx.fillText(String(Math.max(1, Math.ceil(left))), cx, cy + 30);
    ctx.fillStyle = "#bbb";
    ctx.font = "16px sans-serif";
    ctx.fillText("респаун", cx, cy + 62);
  }

  // Левый верхний угол: игроку — только состояние звука, и то лишь когда он выключен или
  // ещё не запущен; отладка (сокет, тик, интерполяция, pending) — по F3.
  function drawStatusLine(snap) {
    const lines = [];
    if (debug) {
      const interp = !interpOn ? "interp OFF" : interpOk ? `interp ON ${RENDER_DELAY}ms` : "interp ON (нет пары)";
      lines.push(`${net.status}${snap ? "  tick " + snap.tick : ""}  ${interp}  [I]  pending ${net.pendingCount()}  [F3]`);
    }
    if (debug || fx.muted() || !fx.audioReady()) {
      lines.push(fx.muted() ? "звук выключен  [M]" : fx.audioReady() ? "звук ON  [M]" : "звук: кликните по игре");
    }
    if (!lines.length) return;
    ctx.save();
    ctx.font = "12px monospace";
    const wMax = Math.max(...lines.map((t) => ctx.measureText(t).width));
    ctx.globalAlpha = hudAlpha(0, 0, 8 + wMax, 8 + lines.length * 16);
    ctx.textAlign = "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.fillStyle = "#bbb";
    lines.forEach((t, i) => { ctx.strokeText(t, 8, 16 + i * 16); ctx.fillText(t, 8, 16 + i * 16); });
    ctx.restore();
  }

  let lastFrame = 0;

  function draw(now) {
    net.update(now);
    const frameDt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    fx.update(frameDt);

    fitBackingStore(); // dpr меняется при переносе окна на другой монитор и при зуме страницы
    resetTransform();
    ctx.clearRect(0, 0, W, H);

    const snap = net.latest;
    const wel = net.welcome;

    // Тряска: сдвиг камеры (в экранных px) — для пола и мира.
    const sh = wel ? fx.shakeOffset(now) : { x: 0, y: 0 };
    ctx.translate(sh.x, sh.y);
    drawFloor(); // фон — паттерн на весь холст, до масштаба мира

    if (wel) {
      worldSx = W / wel.width;
      worldSy = H / wel.height;
      ctx.scale(worldSx, worldSy);
      drawObstacles(wel); // под пулями и игроками
    }

    if (snap && wel) {
      drawPickups(snap, now);
      drawBullets(now);

      // Игроки
      const meNow = net.me();
      const list = renderPlayers(now, snap);
      pruneMotion(list);
      myDrawPos = null;
      for (let p of list) {
        const mine = p.id === wel.playerId;
        // Мёртвых не рисуем. Себя — по последнему снапшоту, без задержки интерполяции:
        // свой игрок и так рисуется по предсказанию.
        if (mine ? meNow && meNow.dead : p.dead) { motion.delete(p.id); continue; }
        // Своего игрока рисуем по предсказанию (без задержки), остальных — интерполированными.
        if (mine && net.predictionReady()) {
          const rp = net.renderPos();
          p = { ...p, x: rp.x, y: rp.y, angle: net.myAngle() };
        }
        const s = track(p, now);
        upright(p.x, p.y, p.angle, (a) => drawPlayerSprite(p, s, a, now, mine));
        if (mine) myDrawPos = { x: p.x, y: p.y };
      }

      fx.drawWorld(ctx, now); // кольца и частицы поверх спрайтов
      drawPlusOnes(now);      // «+1» — поверх всех игроков и частиц
    }

    // HUD и экранные эффекты — без тряски и масштаба
    resetTransform();
    fx.drawScreen(ctx, W, H, now);
    drawStatusLine(snap);

    const round = snap && snap.round;
    const me = snap && wel ? net.me() : null;
    if (snap && wel && isPlaying(snap)) {
      if (round) drawRoundTimer(round); // у старого сервера раундов нет
      if (me && me.dead) {
        drawDeath(me, now);
      } else {
        if (me) drawAmmo(me, now);
        drawCrosshair(snap, wel, W / wel.width, H / wel.height);
      }
      if (tabHeld) drawScoreOverlay(snap, wel); // последним — поверх экрана смерти тоже
    } else if (round && wel && round.phase === "intermission") {
      drawIntermission(round, snap, wel);
      if (tabHeld) drawLeaderboardOverlay();
    }
  }
  return draw;
}
