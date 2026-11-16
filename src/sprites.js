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

    // руки вперёд; само оружие — отдельный слой (makeHeldWeapon), его рисует drawPlayer
    ctx.fillStyle = skin;
    ellipse(ctx, cx + 6, cy - 5, 3, 3);
    ellipse(ctx, cx + 6, cy + 5, 3, 3);

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

// --- Оружие в руках -------------------------------------------------------------
// Вид сверху, ствол вправо. Слой HELD_W×HELD_H рисуется поверх тела: левый край —
// в HELD_X от центра игрока, по вертикали — по центру. Длина и толщина ствола у
// каждого оружия свои, чтобы его было видно издалека. Светлый металл с тёмной
// кромкой: тёмный ствол на тёмном полу терялся, а по нему читается направление взгляда.

export const HELD_W = 30, HELD_H = 10, HELD_X = 4.5;

export function makeHeldWeapon(type) {
  const [c, ctx] = canvas(HELD_W, HELD_H);
  const m = HELD_H / 2; // ось ствола
  const edge = "#111", metal = "#6d7380", light = "#b8bec8", dark = "#3c4049";
  // Ствол: кромка, тело, светлый срез дула. len — длина, th — толщина.
  const barrel = (len, th, tip = 4) => {
    ctx.fillStyle = edge;
    rounded(ctx, 0, m - th / 2, len, th, 1.5);
    ctx.fillStyle = metal;
    rounded(ctx, 0.5, m - th / 2 + 0.5, len - 1, th - 1, 1);
    ctx.fillStyle = light;
    rounded(ctx, len - tip, m - Math.min(1, th / 2 - 1), tip, Math.min(2, th - 2), 0.8);
  };
  switch (type) {
    case "shotgun": // короткий и толстый, два ствола рядом
      barrel(19, 7, 3);
      ctx.fillStyle = dark;
      ctx.fillRect(9, m - 0.4, 9.5, 0.8); // шов между стволами
      ctx.fillStyle = light;
      circle(ctx, 18, m - 1.6, 0.9); circle(ctx, 18, m + 1.6, 0.9); // два дула
      break;
    case "smg": // средний, с магазином вбок
      ctx.fillStyle = edge;
      rounded(ctx, 6, m + 1.5, 3.5, 4.5, 1); // магазин
      ctx.fillStyle = dark;
      rounded(ctx, 6.5, m + 2, 2.5, 3.5, 0.8);
      barrel(16, 5);
      break;
    case "rifle": // длинный и тонкий, с прицелом
      barrel(26, 3.5, 3);
      ctx.fillStyle = edge;
      rounded(ctx, 4, m - 2.5, 9, 5, 2);
      ctx.fillStyle = dark;
      rounded(ctx, 4.5, m - 2, 8, 4, 1.6);
      ctx.fillStyle = "#7fd3ff"; // блик линзы
      ctx.fillRect(11, m - 1, 1, 2);
      break;
    default: // пистолет — как был у спрайта игрока
      barrel(12, 5);
  }
  return c;
}

// --- Пикап оружия ---------------------------------------------------------------
// 24×12: тёмный силуэт оружия сбоку на светлой подложке — отличается от
// квадратных пикапов здоровья, патронов и скорости и читается на любом полу.

export const WEAPON_PICKUP_W = 24, WEAPON_PICKUP_H = 12;

export function makeWeaponPickup(type) {
  const [c, ctx] = canvas(WEAPON_PICKUP_W, WEAPON_PICKUP_H);
  ctx.fillStyle = "rgba(20,22,28,0.85)";
  rounded(ctx, 0, 0, WEAPON_PICKUP_W, WEAPON_PICKUP_H, 3);
  ctx.fillStyle = "#e9ecf1";
  rounded(ctx, 0.75, 0.75, WEAPON_PICKUP_W - 1.5, WEAPON_PICKUP_H - 1.5, 2.5);
  ctx.fillStyle = "#22262d";
  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  switch (type) {
    case "shotgun":
      poly([[2, 5.5], [8, 4.5], [8, 7.5], [3.5, 9.5], [2, 9]]); // приклад
      ctx.fillRect(8, 4, 5, 3.5);                                // ствольная коробка
      ctx.fillRect(13, 4, 9, 2);                                 // ствол
      ctx.fillRect(13.5, 6.2, 5.5, 1.8);                         // цевьё-помпа
      ctx.fillRect(9.5, 7.5, 1.5, 2);                            // спуск
      break;
    case "smg":
      ctx.fillRect(3, 4.5, 4, 1.5); ctx.fillRect(2.5, 4.5, 1.5, 4); // складной приклад
      ctx.fillRect(7, 3.5, 9, 4);                                    // корпус
      ctx.fillRect(16, 4.5, 4.5, 1.8);                               // короткий ствол
      poly([[10, 7.5], [12.5, 7.5], [13, 10.5], [10.5, 10.5]]);      // магазин
      ctx.fillRect(7.5, 7.5, 1.6, 2.5);                              // рукоять
      break;
    case "rifle":
      poly([[1.5, 5.5], [7, 5], [7, 7.5], [2.5, 9], [1.5, 8.5]]); // приклад
      ctx.fillRect(7, 5, 6, 2.5);                                  // коробка
      ctx.fillRect(13, 5.5, 9.5, 1.2);                             // длинный тонкий ствол
      ctx.fillRect(8, 2.5, 6, 1.8);                                // прицел
      ctx.fillRect(9.5, 4.2, 1, 1); ctx.fillRect(12, 4.2, 1, 1);   // крепления прицела
      ctx.fillRect(9, 7.5, 1.5, 2);                                // спуск
      break;
  }
  return c;
}

// --- Зомби ----------------------------------------------------------------------
// Тот же силуэт 32×32, что у игрока, смотрит вправо. Кожа серо-зелёная, одежда
// тёмная и рваная, оружия нет — обе руки вытянуты вперёд. Кадры — шарканье:
// ноги и руки покачиваются противофазно.

export const ZOMBIE_SKIN = "#8fae7a";
export const ZOMBIE_CLOTH = "#4a4a52";

export function makeZombie(frames = 2) {
  const skin = ZOMBIE_SKIN, cloth = ZOMBIE_CLOTH;
  const outline = "rgba(15,12,10,0.85)";
  const out = [];

  for (let f = 0; f < frames; f++) {
    const [c, ctx] = canvas(PLAYER_SIZE, PLAYER_SIZE);
    const cx = 16, cy = 16;
    const s = f % 2 ? 1 : -1; // фаза шарканья
    const legSwing = s * 4;

    // ноги — короткий шаркающий шаг
    ctx.fillStyle = "#2e2e33";
    rounded(ctx, cx - 3 + legSwing, cy - 8, 6, 5, 2);
    rounded(ctx, cx - 3 - legSwing, cy + 3, 6, 5, 2);

    // тело — тот же овал, что у игрока
    ctx.fillStyle = outline;
    ellipse(ctx, cx - 1, cy, 9.5, 12.5);
    ctx.fillStyle = cloth;
    ellipse(ctx, cx - 1, cy, 8, 11);
    // рваньё: светлые прорехи и клочья по краю одежды
    ctx.fillStyle = shade(cloth, 0.12);
    rounded(ctx, cx - 6, cy - 7, 3, 2, 1);
    rounded(ctx, cx - 4, cy + 5, 4, 1.5, 0.7);
    ctx.fillStyle = shade(cloth, -0.18);
    for (const [x, y] of [[cx - 9, cy - 4], [cx - 9.5, cy + 2], [cx - 7, cy + 8], [cx - 7, cy - 9]]) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 1.5); ctx.lineTo(x, y + 3); ctx.fill();
    }
    ctx.fillStyle = skin; // кожа сквозь дыру
    circle(ctx, cx - 3, cy + 2, 1.4);

    // руки вытянуты вперёд — рукава и кисти; в шаге одна рука выдвигается дальше
    // другой (в такт ногам), и чуть сходятся/расходятся
    for (const [ay, reach] of [[cy - 6 + s * 0.8, s * 1.5], [cy + 6 - s * 0.8, -s * 1.5]]) {
      const x0 = cx + 1 + reach;
      ctx.fillStyle = outline;
      rounded(ctx, x0, ay - 2.5, 13, 5, 2.5);
      ctx.fillStyle = cloth;
      rounded(ctx, x0 + 0.5, ay - 2, 7, 4, 2);
      ctx.fillStyle = skin;
      rounded(ctx, x0 + 7, ay - 2, 5.5, 4, 2);
      ctx.fillStyle = shade(skin, -0.25); // пальцы
      ctx.fillRect(x0 + 11.5, ay - 1.5, 1, 1); ctx.fillRect(x0 + 11.5, ay + 0.5, 1, 1);
    }

    // голова — без волос, с тёмными пятнами
    ctx.fillStyle = "rgba(25,35,20,0.9)";
    circle(ctx, cx, cy, 6);
    ctx.fillStyle = skin;
    circle(ctx, cx - 0.5, cy - 0.5, 5.5);
    ctx.fillStyle = shade(skin, -0.22);
    circle(ctx, cx - 2.5, cy + 1.5, 1.6);
    circle(ctx, cx + 1, cy - 3, 1.1);
    ctx.fillStyle = "#c62828"; // глаза
    ctx.fillRect(cx + 3, cy - 2.5, 1.2, 1.2);
    ctx.fillRect(cx + 3, cy + 1.3, 1.2, 1.2);

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

// Цвет свечения (r,g,b); альфу задаёт радиальный градиент в drawPickup.
export const PICKUP_GLOW = {
  health: "102,187,106",
  ammo: "79,195,247",
  speed: "255,213,79",
  w_shotgun: "236,240,246",
  w_smg: "236,240,246",
  w_rifle: "236,240,246",
};
const PICKUP_GLOW_DEFAULT = "255,255,255";
const PICKUP_GLOW_ALPHA = 0.45; // в центре; к краю — 0

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
    zombie: makeZombie(),
    wall: makeWall(),
    crate: makeCrate(),
    floor: makeFloor(),
    bullet: makeBullet(),
    pickups: {
      health: makePickup("health"),
      ammo: makePickup("ammo"),
      speed: makePickup("speed"),
      w_shotgun: makeWeaponPickup("shotgun"),
      w_smg: makeWeaponPickup("smg"),
      w_rifle: makeWeaponPickup("rifle"),
    },
    held: {
      pistol: makeHeldWeapon("pistol"),
      shotgun: makeHeldWeapon("shotgun"),
      smg: makeHeldWeapon("smg"),
      rifle: makeHeldWeapon("rifle"),
    },
  };
}

// Рисует персонажа с поворотом. frame — индекс кадра ходьбы.
// scale — только визуал: спрайт PLAYER_SIZE·scale, центр и поворот те же.
// weapon — слой оружия в руках (sprites.held[...]), поверх тела; null — без оружия (зомби).
export const PLAYER_SCALE = 1.0; // мир рисуется 1:1 — спрайт 32 px при хитбоксе 24

export function drawPlayer(ctx, frames, x, y, angle, frame = 0, scale = PLAYER_SCALE, weapon = null) {
  const img = frames[frame % frames.length];
  const size = PLAYER_SIZE * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  if (weapon) ctx.drawImage(weapon, HELD_X * scale, -HELD_H * scale / 2, HELD_W * scale, HELD_H * scale);
  ctx.restore();
}

// Пикап: текстура PICKUP_SIZE (оружие — WEAPON_PICKUP_W×H), на экран — ×scale;
// свечение радиусом 12·scale (у оружия — по полуширине).
// timeMs задаёт фазу покачивания — сдвигайте её по id, чтобы пикапы не качались синхронно.
export const PICKUP_SCALE = 1.5;
export const WEAPON_PICKUP_SCALE = 1.2;

export function drawPickup(ctx, sprites, type, x, y, timeMs, scale = PICKUP_SCALE) {
  const img = sprites.pickups[type];
  const bob = Math.sin(timeMs / 300) * 2 * scale;
  const w = (img.width / SCALE) * scale, h = (img.height / SCALE) * scale;
  // Свечение — радиальный градиент от центра пикапа (α 0.45) к краю (α 0).
  const rgb = PICKUP_GLOW[type] || PICKUP_GLOW_DEFAULT;
  const r = Math.max(12 * scale, w / 2 + 6);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${PICKUP_GLOW_ALPHA})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Спрайт — поверх градиента.
  ctx.drawImage(img, x - w / 2, y - h / 2 + bob, w, h);
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
