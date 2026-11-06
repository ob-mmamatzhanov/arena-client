// Эффекты: частицы, вспышка экрана, тряска камеры и синтезированный звук.
// Ничего не знает о сети: получает снапшоты через fx.onSnapshot и рисует по вызовам из рендера.
(function () {
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

  function drawParticles(ctx, now) {
    drawRings(ctx, now);
    for (const p of particles) {
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

  // Браузер не даёт запустить AudioContext без жеста пользователя — создаём по первому.
  function ensureAudio() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = new AC();
      master = audio.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(audio.destination);
      // Белый шум на 60 мс — один буфер на все выстрелы.
      noiseBuf = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.06), audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (audio.state === "suspended") audio.resume();
  }
  window.addEventListener("pointerdown", ensureAudio);
  window.addEventListener("keydown", (e) => {
    ensureAudio();
    if (e.code === "KeyM" && !e.repeat) {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, audio.currentTime, 0.01);
    }
  });

  const canPlay = () => audio && audio.state === "running" && !muted;

  // Выстрел: шум 60 мс через lowpass 1200 Гц с быстрым спадом громкости.
  function playShot(volume = 1) {
    if (!canPlay()) return;
    const t = audio.currentTime;
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const lp = audio.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.5 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(lp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.06);
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
          const p = c.players.get(e.playerId);
          const a = p ? p.angle : 0;
          const mx = e.x + Math.cos(a) * (c.radius + 3), my = e.y + Math.sin(a) * (c.radius + 3);
          burst(mx, my, 2 + (Math.random() < 0.5 ? 1 : 0), {
            angle: a, spreadAngle: 0.9, speed: [120, 260], life: [0.08, 0.16], size: [1.2, 2],
            colors: ["#fff6c8", "#ffd54a"],
          });
          playShot(e.playerId === c.myId ? 1 : 0.45);
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
      }
    }
  }

  window.fx = {
    onSnapshot,
    update: updateParticles,
    drawWorld: drawParticles,
    drawScreen,
    shakeOffset,
    playDryClick,
    muted: () => muted,
    audioReady: () => !!audio && audio.state === "running",
    particleCount: () => particles.length,
  };
})();
