// sprites.js — процедурные спрайты для арены.
// Все спрайты рисуются один раз в offscreen-холсты и дальше используются
// через ctx.drawImage как обычные картинки. Серверу про это знать не нужно.

export const PALETTE = [
  "#4fc3f7", // 0 голубой
  "#ff7043", // 1 оранжевый
  "#9ccc65", // 2 зелёный
  "#ffd54f", // 3 жёлтый
  "#ba68c8", // 4 фиолетовый
  "#f06292", // 5 розовый
  "#5c6bc0", // 6 индиго (бирюзовый путался с голубым, коралловый — с оранжевым и розовым)
  "#e0e0e0", // 7 светло-серый
];

const SCALE = 2; // рисуем в 2× и уменьшаем при drawImage — края выходят чище

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w * SCALE;
  c.height = h * SCALE;
  const ctx = c.getContext("2d");
  ctx.scale(SCALE, SCALE);
  return [c, ctx];
}

function shade(hex, amount) {
  // amount: -1..1, отрицательный — темнее
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// --- Персонаж ---------------------------------------------------------------
// Вид сверху, смотрит вправо (угол 0). 32×32. Голова по центру, плечи по бокам,
// оружие вперёд, ноги видны при ходьбе. Кадры: 0 — стоит, 1..3 — шаг.

export const PLAYER_SIZE = 32;

export function makePlayer(colorIndex, frames = 4) {
  const color = PALETTE[colorIndex % PALETTE.length];
  const skin = "#f5c9a2";
  // Контур почти чёрный, а не shade(color): тёмный оттенок оранжевого/розового
  // уходит в цвет кирпича, и силуэт на стене пропадает.
  const outline = "rgba(15,12,10,0.85)";
  // Волосы темнее тела: светлый оттенок почти совпадал с плечами, и затылок сливался.
  const hair = shade(color, -0.35);
  const out = [];

  for (let f = 0; f < frames; f++) {
    const [c, ctx] = canvas(PLAYER_SIZE, PLAYER_SIZE);
    const cx = 16, cy = 16;
    // фаза шага: ноги двигаются противофазно
    const t = f === 0 ? 0 : Math.sin((f / frames) * Math.PI * 2);
    const legSwing = t * 4;

    // ноги (под телом, видны спереди и сзади по оси движения)
    ctx.fillStyle = "#3b3b3b";
    rounded(ctx, cx - 3 + legSwing, cy - 8, 6, 5, 2);
    rounded(ctx, cx - 3 - legSwing, cy + 3, 6, 5, 2);

    // плечи/тело — широкий овал поперёк направления взгляда
    ctx.fillStyle = outline;
    ellipse(ctx, cx - 1, cy, 9.5, 12.5);
    ctx.fillStyle = color;
    ellipse(ctx, cx - 1, cy, 8, 11);

    // руки с оружием вперёд
    ctx.fillStyle = skin;
    ellipse(ctx, cx + 6, cy - 5, 3, 3);
    ellipse(ctx, cx + 6, cy + 5, 3, 3);
    // Оружие светлое с тёмной кромкой: #2b2b2b на тёмном полу было не видно,
    // а по нему читается направление взгляда.
    ctx.fillStyle = "#111";
    rounded(ctx, cx + 4.5, cy - 2.5, 12, 5, 1.5);
    ctx.fillStyle = "#6d7380";
    rounded(ctx, cx + 5, cy - 2, 11, 4, 1);
    ctx.fillStyle = "#b8bec8";
    rounded(ctx, cx + 12, cy - 1, 4, 2, 1);

    // голова — тёмная обводка отделяет её от плеч
    ctx.fillStyle = "rgba(40,25,15,0.9)";
    circle(ctx, cx, cy, 6);
    ctx.fillStyle = skin;
    circle(ctx, cx - 0.5, cy - 0.5, 5.5);
    // «волосы»/шапка в цвет команды — усиливает читаемость цвета сверху
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx - 1, cy, 5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.fill();

    out.push(c);
  }
  return out;
}

// --- Кирпичная стена ----------------------------------------------------------
// Бесшовный тайл 32×32: 4 ряда по 2 кирпича со сдвигом в полкирпича.

export const WALL_TILE = 32;

export function makeWall(seed = 1) {
  const [c, ctx] = canvas(WALL_TILE, WALL_TILE);
  const rnd = mulberry32(seed);
  const mortar = "#2a2522";
  const base = "#8a4a3a";

  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, WALL_TILE, WALL_TILE);

  const rows = 4, rowH = WALL_TILE / rows, brickW = WALL_TILE / 2;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? brickW / 2 : 0;
    for (let i = -1; i <= 2; i++) {
      const x = i * brickW + offset;
      const y = r * rowH;
      const tone = (rnd() - 0.5) * 0.12;
      ctx.fillStyle = shade(base, tone);
      ctx.fillRect(x + 1, y + 1, brickW - 2, rowH - 2);
      // блик сверху-слева и тень снизу-справа — даёт объём
      ctx.fillStyle = shade(base, tone + 0.1);
      ctx.fillRect(x + 1, y + 1, brickW - 2, 1);
      ctx.fillStyle = shade(base, tone - 0.15);
      ctx.fillRect(x + 1, y + rowH - 2, brickW - 2, 1);
      // редкая выбоина
      if (rnd() < 0.15) {
        ctx.fillStyle = shade(base, tone - 0.25);
        ctx.fillRect(x + 3 + rnd() * 8, y + 2 + rnd() * 3, 2, 1);
      }
    }
  }
  return c;
}

// Заливка прямоугольника тайлом стены + тёмная кромка, чтобы стена читалась.
export function drawWall(ctx, wallTile, x, y, w, h) {
  const pat = ctx.createPattern(wallTile, "repeat");
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = pat;
  // паттерн в 2× масштабе — сжимаем до логического размера
  ctx.scale(1 / SCALE, 1 / SCALE);
  ctx.fillRect(0, 0, w * SCALE, h * SCALE);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

// --- Ящик ----------------------------------------------------------------------
// Тайл 32×32: доски, рамка, диагонали и гвозди. Ящики на карте кратны 32 —
// рисуются тайлами целиком, без паттерна.

export const CRATE_TILE = 32;

export function makeCrate(seed = 3) {
  const [c, ctx] = canvas(CRATE_TILE, CRATE_TILE);
  const rnd = mulberry32(seed);
  const wood = "#a0693a", dark = shade(wood, -0.3), light = shade(wood, 0.12);

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, CRATE_TILE, CRATE_TILE);
  // четыре горизонтальные доски
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = shade(wood, (rnd() - 0.5) * 0.1);
    ctx.fillRect(1, 1 + i * 8, CRATE_TILE - 2, 6);
    ctx.fillStyle = light;
    ctx.fillRect(1, 1 + i * 8, CRATE_TILE - 2, 1);
    // волокна
    ctx.fillStyle = shade(wood, -0.12);
    for (let k = 0; k < 2; k++) ctx.fillRect(3 + rnd() * 20, 3 + i * 8 + rnd() * 3, 6 + rnd() * 6, 1);
  }
  // рамка и диагональ — классический «ящик»
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, CRATE_TILE, 3); ctx.fillRect(0, CRATE_TILE - 3, CRATE_TILE, 3);
  ctx.fillRect(0, 0, 3, CRATE_TILE); ctx.fillRect(CRATE_TILE - 3, 0, 3, CRATE_TILE);
  ctx.strokeStyle = dark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(CRATE_TILE - 2, CRATE_TILE - 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CRATE_TILE - 2, 2); ctx.lineTo(2, CRATE_TILE - 2); ctx.stroke();
  // гвозди по углам
  ctx.fillStyle = "#d9d9d9";
  for (const [x, y] of [[4,4],[27,4],[4,27],[27,27]]) ctx.fillRect(x, y, 2, 2);
  return c;
}

// --- Пикапы --------------------------------------------------------------------

export const PICKUP_SIZE = 16;

export const PICKUP_GLOW = {
  health: "rgba(102,187,106,0.5)",
  ammo: "rgba(79,195,247,0.5)",
  speed: "rgba(255,213,79,0.5)",
};

export function makePickup(type) {
  const [c, ctx] = canvas(PICKUP_SIZE, PICKUP_SIZE);
  const cx = 8, cy = 8;
  switch (type) {
    case "health": {
      ctx.fillStyle = "#eeeeee";
      rounded(ctx, 2, 3, 12, 10, 2);
      ctx.fillStyle = "#e53935";
      ctx.fillRect(cx - 1.5, 5, 3, 6);
      ctx.fillRect(5, cy - 1.5, 6, 3);
      break;
    }
    case "ammo": {
      ctx.fillStyle = "#5d4037";
      rounded(ctx, 2, 6, 12, 8, 1);
      ctx.fillStyle = "#d4a24c";
      for (let i = 0; i < 3; i++) rounded(ctx, 4 + i * 3.2, 2, 2, 6, 1);
      break;
    }
    case "speed": {
      ctx.fillStyle = "#ffd54f";
      ctx.beginPath();
      ctx.moveTo(9, 1); ctx.lineTo(4, 9); ctx.lineTo(8, 9);
      ctx.lineTo(7, 15); ctx.lineTo(12, 7); ctx.lineTo(8, 7);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  return c;
}

// --- Пуля и прочее ---------------------------------------------------------------

// Ядро радиусом 2.5 и свечение 5: при 2/4 пуля терялась на кирпиче.
export const BULLET_SIZE = 10;

export function makeBullet() {
  const [c, ctx] = canvas(BULLET_SIZE, BULLET_SIZE);
  const m = BULLET_SIZE / 2;
  ctx.fillStyle = "rgba(255,241,118,0.5)";
  circle(ctx, m, m, 5);
  ctx.fillStyle = "#fff59d";
  circle(ctx, m, m, 2.5);
  return c;
}

// Плитка пола: спокойная, темнее стены по контрасту не должна спорить.
export const FLOOR_TILE = 32;

export function makeFloor(seed = 7) {
  const [c, ctx] = canvas(FLOOR_TILE, FLOOR_TILE);
  const rnd = mulberry32(seed);
  ctx.fillStyle = "#23262e";
  ctx.fillRect(0, 0, FLOOR_TILE, FLOOR_TILE);
  ctx.fillStyle = "#2a2e37";
  ctx.fillRect(0, 0, FLOOR_TILE - 1, FLOOR_TILE - 1);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
    ctx.fillRect(rnd() * 30, rnd() * 30, 2, 2);
  }
  return c;
}

// --- Сборка всех спрайтов за один вызов -----------------------------------------

export function buildSprites() {
  return {
    players: PALETTE.map((_, i) => makePlayer(i)),
    wall: makeWall(),
    crate: makeCrate(),
    floor: makeFloor(),
    bullet: makeBullet(),
    pickups: {
      health: makePickup("health"),
      ammo: makePickup("ammo"),
      speed: makePickup("speed"),
    },
  };
}

// Рисует персонажа с поворотом. frame — индекс кадра ходьбы.
// scale — только визуал: спрайт PLAYER_SIZE·scale, центр и поворот те же.
export const PLAYER_SCALE = 1.0; // мир 800×600 рисуется 1:1 — спрайт 32 px при хитбоксе 24

export function drawPlayer(ctx, frames, x, y, angle, frame = 0, scale = PLAYER_SCALE) {
  const img = frames[frame % frames.length];
  const size = PLAYER_SIZE * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// Пикап: текстура PICKUP_SIZE, на экран — PICKUP_SIZE·scale; свечение радиусом 14·scale.
// timeMs задаёт фазу покачивания — сдвигайте её по id, чтобы пикапы не качались синхронно.
export const PICKUP_SCALE = 1.5;

export function drawPickup(ctx, sprites, type, x, y, timeMs, scale = PICKUP_SCALE) {
  const bob = Math.sin(timeMs / 300) * 2 * scale;
  const size = PICKUP_SIZE * scale;
  ctx.fillStyle = PICKUP_GLOW[type] || "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(x, y + 4 * scale, 14 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(sprites.pickups[type], x - size / 2, y - size / 2 + bob, size, size);
}

// --- Утилиты ---------------------------------------------------------------------

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// Детерминированный rand, чтобы стена выглядела одинаково у всех.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
