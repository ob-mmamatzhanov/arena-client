// Оружие на клиенте — зеркало game.DefaultWeapons() сервера (internal/game/weapons.go).
// В welcome таблицы нет: при изменении на сервере поменяйте и здесь.
// Ключ — имя из снапшота (player.weapon, event.weapon); пикап оружия — "w_" + ключ.
//   pellets   — пуль за выстрел; spread — полуугол веера, рад (дробины от −spread до +spread)
//   cooldownMs — интервал между выстрелами (очередь клика в net.js)
export const WEAPONS = {
  pistol:  { label: "Пистолет", pellets: 1, spread: 0,   cooldownMs: 200 },
  shotgun: { label: "Дробовик", pellets: 6, spread: 0.17, cooldownMs: 650 },
  smg:     { label: "Автомат",  pellets: 1, spread: 0,    cooldownMs: 90 },
  rifle:   { label: "Винтовка", pellets: 1, spread: 0,    cooldownMs: 1300 },
};

// Имя оружия из снапшота; неизвестное (и старый сервер без поля) — пистолет.
export const weaponKey = (name) => (Object.hasOwn(WEAPONS, name) ? name : "pistol");
export const weaponInfo = (name) => WEAPONS[weaponKey(name)];

// Пикап оружия: "w_shotgun" → "shotgun", остальные пикапы → null.
export const pickupWeapon = (type) =>
  typeof type === "string" && type.startsWith("w_") && Object.hasOwn(WEAPONS, type.slice(2)) ? type.slice(2) : null;

// Отклонение k-й из n дробин от направления выстрела — как Weapon.pelletOffset.
export function pelletOffset(w, k, n) {
  return n <= 1 ? 0 : w.spread * ((2 * k) / (n - 1) - 1);
}

// Скорость пули винтовки 1100 ед./с, у остальных ≤ 600: так её узнаём без поля в снапшоте.
export const RIFLE_BULLET_MIN_SPEED = 800;
