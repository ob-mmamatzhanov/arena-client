// Эффекты: частицы, вспышка экрана, тряска камеры и синтезированный звук.
// Ничего не знает о сети: получает снапшоты через fx.onSnapshot и рисует по вызовам из рендера.
// Один экземпляр на страницу: AudioContext и обработчики звука живут между сессиями.
import { WEAPONS, weaponKey, pelletOffset } from "./weapons.js";

// Насколько дуло дальше пистолетного (длина ствола в sprites.js makeHeldWeapon минус 12).
const MUZZLE_EXTRA = { shotgun: 7, smg: 4, rifle: 14 };

export const fx = (function () {
  // ---------------- Частицы ----------------
  // Каждая частица: {x, y, vx, vy, life, color}; life — оставшиеся секунды.
  // maxLife и size — для затухания и размера, drag — торможение.
  let particles = [];
  const DRAG = 3.5; // доля скорости, теряемая за секунду (экспоненциально)

  function burst(x, y, n, opts) {
    const { speed = [80, 220], life = [0.25, 0.5], size = [1.5, 3], colors = ["#fff"],
            angle = null, spreadAngle = Math.PI * 2 } = opts;
    for (let i = 0; i < n; i++) {
      const a = angle === null ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * spreadAngle;
      const v = rand(speed), l = rand(life);
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: l, maxLife: l, size: rand(size),
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  const rand = ([lo, hi]) => lo + Math.random() * (hi - lo);

  function updateParticles(dt) {
    const k = Math.exp(-DRAG * dt);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= k; p.vy *= k;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0); // старые удаляются
  }

  // ---------------- Кольца респауна ----------------
  // Расходятся из точки появления: радиус от r до r + RING_GROW, прозрачность гаснет.
  const RING_MS = 600, RING_GROW = 45;
  let rings = []; // {x, y, r, at}

  function drawRings(ctx, now) {
    rings = rings.filter(g => now - g.at < RING_MS);
    for (const g of rings) {
      const t = (now - g.at) / RING_MS;
      const e = 1 - (1 - t) * (1 - t); // ease-out: быстро вылетает, медленно гаснет
      ctx.strokeStyle = `rgba(140,220,255,${0.9 * (1 - t)})`;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r + RING_GROW * e, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // view — видимая область мира {x0, y0, x1, y1} (уже с запасом); за ней частицы не рисуем.
  function drawParticles(ctx, now, view) {
    drawRings(ctx, now);
    for (const p of particles) {
      if (view && (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1)) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- Вспышка и тряска ----------------
  const FLASH_MS = 150, FLASH_ALPHA = 0.3;
  const SHAKE_MS = 200, SHAKE_PX = 6;
  let flashAt = -Infinity, shakeAt = -Infinity;

  // Смещение камеры в экранных пикселях: случайный вектор, амплитуда линейно гаснет.
  function shakeOffset(now) {
    const t = (now - shakeAt) / SHAKE_MS;
    if (t >= 1) return { x: 0, y: 0 };
    const amp = SHAKE_PX * (1 - t), a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * amp, y: Math.sin(a) * amp };
  }

  function drawScreen(ctx, w, h, now) {
    const t = (now - flashAt) / FLASH_MS;
    if (t < 1) {
      ctx.fillStyle = `rgba(255,0,0,${FLASH_ALPHA * (1 - t)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------------- Звук (Web Audio, без файлов) ----------------
  let audio = null, master = null, noiseBuf = null;
  let muted = false;
  const NOISE_SEC = 0.5;

  // Браузер не даёт запустить AudioContext без жеста пользователя — создаём по первому.
  function ensureAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = new AC();
      master = audio.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(audio.destination);
      // Белый шум на 0.5 с — один буфер на все звуки; короткие останавливаются раньше.
      noiseBuf = audio.createBuffer(1, Math.ceil(audio.sampleRate * NOISE_SEC), audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (audio.state === "suspended") audio.resume();
  }
  window.addEventListener("pointerdown", ensureAudio);
  // Выключенный звук помнится между визитами: его можно переключить и в лобби (настройки).
  const MUTE_KEY = "arena.muted";
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* без сохранения */ }
  const muteListeners = new Set();
  function setMuted(v) {
    muted = !!v;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, audio.currentTime, 0.01);
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* без сохранения */ }
    for (const f of muteListeners) f(muted);
  }
  window.addEventListener("keydown", (e) => {
    ensureAudio();
    // В поле ввода (экран входа) «м» — буква имени, а не звук.
    if (e.code === "KeyM" && !e.repeat && !(e.target instanceof HTMLInputElement)) setMuted(!muted);
  });

  const canPlay = () => audio && audio.state === "running" && !muted;

  // Шум через фильтр с экспоненциальным спадом: основа всех выстрелов.
  // q — добротность (для bandpass); offset — сдвиг по буферу, чтобы наложенные
  // слои одного выстрела не были одним и тем же шумом.
  function noise(start, dur, type, freq, peak, q = 1, offset = 0) {
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = audio.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f).connect(g).connect(master);
    src.start(start, Math.min(offset, NOISE_SEC - dur));
    src.stop(start + dur);
  }

  // Выстрел — у каждого оружия свой:
  //   пистолет — шум 60 мс через lowpass 1200 Гц (как был);
  //   дробовик — ниже и длиннее: lowpass 650 Гц на 0.3 с и глухой удар 90 → 40 Гц;
  //   автомат — короче и выше: 35 мс полосы 2.2 кГц, тише (стреляет очередями);
  //   винтовка — резкий щелчок 10 мс на 4.5 кГц и хвост lowpass 900 Гц на 0.45 с.
  function playShot(volume = 1, weapon = "pistol") {
    if (!canPlay()) return;
    const t = audio.currentTime;
    switch (weapon) {
      case "shotgun":
        noise(t, 0.3, "lowpass", 650, 0.65 * volume);
        noise(t, 0.05, "lowpass", 1800, 0.35 * volume, 1, 0.2);
        sweep(90, 40, t, 0.22, 0.55 * volume);
        break;
      case "smg":
        noise(t, 0.035, "bandpass", 2200, 0.55 * volume, 0.9);
        break;
      case "rifle":
        noise(t, 0.01, "bandpass", 4500, 0.9 * volume, 1.5);
        noise(t, 0.45, "lowpass", 900, 0.3 * volume, 1, 0.05);
        sweep(220, 70, t, 0.12, 0.25 * volume);
        break;
      default:
        noise(t, 0.06, "lowpass", 1200, 0.5 * volume);
    }
  }

  // Синус, съезжающий f0 → f1 за dur: «удар» выстрела и поломки.
  function sweep(f0, f1, start, dur, peak) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, start);
    osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
    const g = audio.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.01);
  }

  function tone(freq, start, dur, peak) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = audio.createGain();
    g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur);
  }

  // Попадание: синус 180 Гц, 100 мс, резкий спад.
  function playHit() {
    if (!canPlay()) return;
    tone(180, audio.currentTime, 0.1, 0.6);
  }

  // Подбор: два коротких тона вверх.
  function playPickup() {
    if (!canPlay()) return;
    const t = audio.currentTime;
    tone(660, t, 0.07, 0.35);
    tone(990, t + 0.075, 0.09, 0.35);
  }

  // Сухой щелчок пустого магазина: 15 мс шума через полосовой 3.5 кГц
  // и тихий короткий «тук» 900 Гц — сухо и без хвоста, не путается с выстрелом.
  function playDryClick() {
    if (!canPlay()) return;
    const t = audio.currentTime;
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3500;
    bp.Q.value = 2;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.02);
    const osc = audio.createOscillator();
    osc.type = "square";
    osc.frequency.value = 900;
    const og = audio.createGain();
    og.gain.setValueAtTime(0.08, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + 0.015);
  }

  // Дерево: шум через lowpass (глухо, без металлического звона) + низкий тон
  // корпуса. Попадание — короткий «тук», поломка — длиннее и ниже, с треском.
  function playWood(broken) {
    if (!canPlay()) return;
    const t = audio.currentTime, dur = broken ? 0.06 : 0.04;
    for (let k = 0; k < (broken ? 3 : 1); k++) { // поломка — три щелчка подряд, треск
      const at = t + k * 0.035;
      const src = audio.createBufferSource();
      src.buffer = noiseBuf;
      const lp = audio.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = broken ? 900 : 650;
      const g = audio.createGain();
      g.gain.setValueAtTime(broken ? 0.55 : 0.4, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      src.connect(lp).connect(g).connect(master);
      src.start(at);
      src.stop(at + dur);
    }
    tone(broken ? 95 : 150, t, broken ? 0.18 : 0.07, broken ? 0.5 : 0.3);
  }

  const WOOD = ["#a8743f", "#c8935a", "#7a4f26", "#e0b47c"];

  // Убит зомби: низкий глухой «бульк» — синус, съезжающий 110 → 55 Гц, и
  // приглушённый шум поверх. Короче и ниже попадания (180 Гц), не путается с ним.
  function playZombieKill() {
    if (!canPlay()) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.17);
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const lp = audio.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    const ng = audio.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(lp).connect(ng).connect(master);
    src.start(t);
    src.stop(t + 0.06);
  }

  const ZOMBIE_GORE = ["#8fae7a", "#5f8a3e", "#a5d66b", "#3e5f2a"];

  // ---------------- События снапшота ----------------
  // ctx: {myId, radius, players: Map id → {x, y, angle}} — состояние на момент события.
  // now — performance.now() получения снапшота (та же шкала, что у кадров).
  function onSnapshot(snap, now, c) {
    const events = snap.events || []; // поле omitempty: в тике без событий его нет
    // У kill нет координат — берём точку hit по той же цели из этого же тика
    // (сервер шлёт hit перед kill).
    const hitPos = new Map();
    for (const e of events) if (e.type === "hit") hitPos.set(e.targetId, e);

    for (const e of events) {
      switch (e.type) {
        case "shot": {
          // x, y — центр стрелка; дуло — на краю круга по направлению взгляда.
          // Частицы: вспышка у дула и по искре на каждую дробину — вдоль её
          // направления в веере (у дробовика — 6 искр веером, у остальных — одна).
          const p = c.players.get(e.playerId);
          const a = p ? p.angle : 0;
          const key = weaponKey(e.weapon), w = WEAPONS[key];
          const reach = c.radius + 3 + (MUZZLE_EXTRA[key] || 0);
          const mx = e.x + Math.cos(a) * reach, my = e.y + Math.sin(a) * reach;
          burst(mx, my, 1 + (Math.random() < 0.5 ? 1 : 0), {
            angle: a, spreadAngle: 0.9, speed: [120, 260], life: [0.08, 0.16], size: [1.2, 2],
            colors: ["#fff6c8", "#ffd54a"],
          });
          for (let k = 0; k < w.pellets; k++) {
            burst(mx, my, 1, {
              angle: a + pelletOffset(w, k, w.pellets), spreadAngle: 0.15,
              speed: [180, 320], life: [0.1, 0.18], size: [1.2, 2], colors: ["#fff6c8", "#ffd54a"],
            });
          }
          playShot(e.playerId === c.myId ? 1 : 0.45, key);
          break;
        }
        case "bulletHit":
          burst(e.x, e.y, 6 + ((Math.random() * 3) | 0), {
            speed: [60, 180], life: [0.2, 0.4], size: [1.2, 2.2], colors: ["#d8d8d8", "#ffb070", "#999"],
          });
          break;
        case "hit": {
          // Цвет цели (PALETTE[color]) + белые искры; без colorOf — старые красные.
          const col = c.colorOf && c.colorOf(e.targetId);
          burst(e.x, e.y, 10, {
            speed: [80, 240], life: [0.25, 0.5], size: [1.5, 3],
            colors: col ? [col, col, "#ffffff"] : ["#ff3b3b", "#c41d1d", "#ff7070"],
          });
          // По мне — красная вспышка и тряска; так же и укус зомби (hit с shooterId 0).
          if (e.targetId === c.myId) { flashAt = now; shakeAt = now; }
          playHit();
          break;
        }
        case "kill": {
          const h = hitPos.get(e.targetId) || c.players.get(e.targetId);
          if (!h) break;
          burst(h.x, h.y, 20, {
            speed: [100, 380], life: [0.4, 0.9], size: [2.5, 5], colors: ["#ff5a1f", "#ffd54a", "#ff2d2d", "#fff1b0"],
          });
          break;
        }
        case "pickup":
          if (e.playerId === c.myId) playPickup();
          break;
        case "respawn":
          rings.push({ x: e.x, y: e.y, r: c.radius, at: now });
          break;
        case "crateHit": // пуля погасла о ящик: щепки из точки попадания
          burst(e.x, e.y, 5 + ((Math.random() * 3) | 0), {
            speed: [60, 200], life: [0.25, 0.5], size: [1.2, 2.4], colors: WOOD,
          });
          if (e.hp > 0) playWood(false); // ломающему попаданию звук даст crateBroken
          break;
        case "crateBroken": // ящик разлетелся: крупные обломки из центра
          burst(e.x, e.y, 26, { speed: [80, 320], life: [0.5, 1.0], size: [2, 4.5], colors: WOOD });
          burst(e.x, e.y, 10, { speed: [20, 90], life: [0.6, 1.2], size: [1, 2], colors: ["#5a3a1c", "#3d2812"] }); // пыль
          playWood(true);
          break;
        case "zombieKill": // зомби убит: зелёные брызги там, где он стоял
          burst(e.x, e.y, 12, { speed: [70, 240], life: [0.3, 0.6], size: [1.5, 3.2], colors: ZOMBIE_GORE });
          playZombieKill();
          break;
      }
    }
  }

  return {
    onSnapshot,
    update: updateParticles,
    drawWorld: drawParticles,
    drawScreen,
    shakeOffset,
    playDryClick,
    muted: () => muted,
    setMuted,
    /** Подписка на смену «звук выкл.»; возвращает отписку. */
    onMuteChange: (f) => { muteListeners.add(f); return () => muteListeners.delete(f); },
    audioReady: () => !!audio && audio.state === "running",
    particleCount: () => particles.length,
  };
})();
