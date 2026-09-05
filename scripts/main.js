/**
 * Lancer Radial Loadout
 * Радиальные слоты ПОЯВЛЯЮТСЯ ПРИ НАВЕДЕНИИ на токен (не при выборе).
 *   ЛКМ по слоту          — активировать предмет (Lancer Flow API)
 *   ПКМ по слоту          — назначить/сменить предмет
 *   Shift+ЛКМ / Shift+ПКМ — счётчик расходов -1 / +1 (без броска)
 *
 * «Безопасная зона» — прозрачное кольцо вокруг токена по внешнему краю кружков:
 * пока курсор в нём (или на кружке), слоты не исчезают. Плюс запас 180 мс.
 *
 * Хранение: actor.flags["lancer-radial-loadout"].slots = (string|null)[]  (uuid предметов)
 */

const MODULE = "lancer-radial-loadout";
const SLOT_COUNT = 8;    // сколько кружков по кругу
const RADIUS = 96;       // радиус раскладки кружков, px (в координатах слоя #hud)
const SAFE_PAD = 52;     // насколько кольцо-«ловушка» выходит за кружки, px
const HIDE_DELAY = 180;  // запас перед скрытием, мс

const ALLOWED_ACTOR_TYPES = ["mech", "npc", "pilot"];
const ASSIGNABLE_TYPES = ["mech_weapon", "mech_system", "npc_feature", "pilot_weapon", "pilot_gear"];

/* -------------------------------------------- */
/*  Настройки                                   */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE, "gmSeesAll", {
    name: "GM видит кружки на всех актёрах",
    hint: "Выкл (по умолчанию): GM видит слоты только на токенах, которыми управляет игрок (напрямую или через пилота). Вкл: на всех мехах/NPC/пилотах.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE, "showUses", {
    name: "Показывать счётчик расходов",
    hint: "Бейдж «текущее/максимум» для предметов с ограниченным числом использований (Limited).",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE, "showSafeZone", {
    name: "Подсвечивать безопасную зону",
    hint: "Едва заметное кольцо вокруг токена, в котором кружки не пропадают.",
    scope: "client", config: true, type: Boolean, default: false
  });
});

/* -------------------------------------------- */
/*  Кому показывать                             */
/* -------------------------------------------- */

/** Связанный пилот для меха (в Lancer это отдельный актёр с раздельным Ownership). */
function getPilot(actor) {
  if (actor?.type !== "mech") return null;
  const ref = actor.system?.pilot;
  const cand = ref?.value ?? ref?.uuid ?? ref?.id ?? ref ?? null;
  if (cand instanceof Actor) return cand;
  if (typeof cand === "string") {
    try {
      return fromUuidSync(/[.\/]/.test(cand) ? cand : `Actor.${cand}`) ?? null;
    } catch { return null; }
  }
  return null;
}

/** Владеет ли конкретный игрок актёром — напрямую или через связанного пилота. */
function playerControls(user, actor) {
  if (actor.testUserPermission(user, "OWNER")) return true;
  const pilot = getPilot(actor);
  return Boolean(pilot && pilot.testUserPermission(user, "OWNER"));
}

function shouldShow(token) {
  const actor = token?.actor;
  if (!actor || !ALLOWED_ACTOR_TYPES.includes(actor.type)) return false;

  if (game.user.isGM) {
    if (game.settings.get(MODULE, "gmSeesAll")) return true;
    return game.users.some(u => !u.isGM && playerControls(u, actor));
  }

  // Игрок: свой токен — напрямую или через пилота связанного меха.
  return playerControls(game.user, actor);
}

/* -------------------------------------------- */
/*  Жизненный цикл оверлея                      */
/* -------------------------------------------- */

let hideTimer = null;
let currentToken = null;

// Геометрия безопасной зоны. sceneOuter/sceneTokenW — в координатах сцены,
// geomCache — то же в экранных px (зависит от зума, сбрасывается при панораме).
let sceneTokenW = 0;
let sceneOuter = 0;
let geomCache = null;

function ensureOverlay() {
  let el = document.getElementById("lrl-hud");
  if (!el) {
    el = document.createElement("div");
    el.id = "lrl-hud";
    el.innerHTML = `<div class="lrl-safezone"></div><div class="lrl-ring"></div>`;
  }
  const parent =
    document.getElementById("hud") ??
    document.getElementById("interface") ??
    document.body;
  if (el.parentElement !== parent) parent.appendChild(el);
  el.classList.toggle("lrl-show-zone", game.settings.get(MODULE, "showSafeZone"));
  return el;
}

function cancelHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}
/** Не перезапускает уже идущий таймер: иначе непрерывное движение мыши
 *  вне зоны бесконечно откладывало бы скрытие. */
function scheduleHide() {
  if (hideTimer) return;
  hideTimer = setTimeout(hideOverlay, HIDE_DELAY);
}
function hideOverlay() {
  cancelHide();
  document.getElementById("lrl-hud")?.classList.remove("active");
  currentToken = null;
  geomCache = null;
}

/** Центр и внешний радиус безопасной зоны в экранных px. */
function getGeom() {
  if (geomCache) return geomCache;
  const el = document.getElementById("lrl-hud");
  if (!el || !currentToken || !sceneTokenW) return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width) return null;
  const scale = rect.width / sceneTokenW;
  geomCache = {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    outer: sceneOuter * scale
  };
  return geomCache;
}

/**
 * Безопасная зона отслеживается по координатам курсора, а не через
 * pointerenter/leave на элементах. Так она, во-первых, не перехватывает клики
 * по канвасу, во-вторых, переживает перерисовку слотов: при replaceChildren()
 * элемент под курсором исчезал, слал pointerleave и гасил всю радиаль.
 */
function onPointerMove(ev) {
  if (!currentToken) return;
  const g = getGeom();
  if (!g) return;
  const dx = ev.clientX - g.cx;
  const dy = ev.clientY - g.cy;
  if (dx * dx + dy * dy <= g.outer * g.outer) cancelHide();
  else scheduleHide();
}

function showFor(token) {
  const el = ensureOverlay();
  currentToken = token;
  positionOverlay(token);
  renderSlots(token);
  el.classList.add("active");
  cancelHide();
}

function positionOverlay(token) {
  const el = document.getElementById("lrl-hud");
  if (!el) return;

  const gs = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
  const x = token.document?.x ?? token.x;
  const y = token.document?.y ?? token.y;
  const w = (token.document?.width ?? 1) * gs;
  const h = (token.document?.height ?? 1) * gs;

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  // Радиус зависит от габарита токена: при фиксированных 96px на мехе размера 2
  // кружки ложились поверх модельки, а на размере 3+ «дырка» donut'а становилась
  // больше внешнего круга и безопасная зона схлопывалась.
  const half = Math.max(w, h) / 2;
  const radius = Math.max(RADIUS, Math.round(half + 40));
  const inner = Math.round(half + 4);
  const outer = radius + SAFE_PAD;

  sceneTokenW = w;
  sceneOuter = outer;
  geomCache = null;

  el.querySelector(".lrl-ring")?.style.setProperty("--radius", `${radius}px`);

  const c = outer;
  const sz = el.querySelector(".lrl-safezone");
  if (sz) {
    sz.style.width = sz.style.height = `${outer * 2}px`;
    sz.style.marginLeft = sz.style.marginTop = `${-outer}px`;
    sz.style.clipPath =
      `path(evenodd,"` +
      `M ${c} ${c} m ${-outer} 0 a ${outer} ${outer} 0 1 0 ${outer * 2} 0 a ${outer} ${outer} 0 1 0 ${-outer * 2} 0 Z ` +
      `M ${c} ${c} m ${-inner} 0 a ${inner} ${inner} 0 1 0 ${inner * 2} 0 a ${inner} ${inner} 0 1 0 ${-inner * 2} 0 Z` +
      `")`;
  }
}

function renderSlots(token) {
  const actor = token.actor;
  const ring = document.getElementById("lrl-hud")?.querySelector(".lrl-ring");
  if (!ring || !actor) return;
  ring.replaceChildren();

  const slots = readSlots(actor);
  const showUses = game.settings.get(MODULE, "showUses");
  // Показывать радиаль можем и через пилота, а писать — только настоящему владельцу.
  const canEdit = actor.isOwner;

  slots.forEach((uuid, i) => {
    const angle = (360 / SLOT_COUNT) * i - 90;
    const item = uuid ? fromUuidSync(uuid) : null;
    const uses = item && showUses ? getUses(item) : null;

    const btn = document.createElement("div");
    btn.className = `lrl-slot ${item ? "filled" : "empty"}`;
    btn.style.setProperty("--angle", `${angle}deg`);
    btn.style.setProperty("--i", i);

    if (item) {
      btn.style.backgroundImage = `url("${encodeURI(item.img ?? "")}")`;
      btn.title =
        `${item.name}${uses ? `  [${uses.value}/${uses.max}]` : ""}\n` +
        `ЛКМ — активировать, ПКМ — сменить` +
        (uses ? `\nShift+ЛКМ / Shift+ПКМ — счётчик -1 / +1` : "");
      if (isDestroyed(item)) btn.classList.add("destroyed");
      if (uses && uses.value <= 0) btn.classList.add("depleted");
      if (uses) {
        const badge = document.createElement("span");
        badge.className = "lrl-badge";
        badge.textContent = `${uses.value}/${uses.max}`;
        btn.appendChild(badge);
      }
    } else {
      btn.title = "Пустой слот — клик, чтобы назначить";
      btn.textContent = "+";
    }

    btn.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!item) return canEdit ? openAssignDialog(actor, i) : warnNoPermission(actor);
      if (ev.shiftKey && uses) return canEdit ? adjustUses(item, -1) : warnNoPermission(actor);
      activateItem(actor, item);
    });
    btn.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!canEdit) return warnNoPermission(actor);
      if (item && ev.shiftKey && uses) return adjustUses(item, +1);
      openAssignDialog(actor, i);
    });

    ring.appendChild(btn);
  });
}

/* -------------------------------------------- */
/*  Хуки наведения / жизни токена               */
/* -------------------------------------------- */

Hooks.on("hoverToken", (token, hovered) => {
  if (hovered) {
    if (shouldShow(token)) showFor(token);
  } else if (currentToken && token.id === currentToken.id) {
    scheduleHide();
  }
});

Hooks.on("updateToken", (doc, change) => {
  if (currentToken && doc.id === currentToken.id && ("x" in change || "y" in change)) hideOverlay();
});
Hooks.on("deleteToken", doc => {
  if (currentToken && doc.id === currentToken.id) hideOverlay();
});
// Позицию при панораме пересчитывать не нужно: #hud трансформируется вместе со
// сценой, а координаты выставлены в сценных единицах. Сбрасываем только кэш
// экранной геометрии — он завязан на зум.
Hooks.on("canvasPan", () => { geomCache = null; });
Hooks.on("canvasReady", () => { hideOverlay(); ensureOverlay(); });

Hooks.on("updateItem", item => {
  if (currentToken && item.parent?.id === currentToken.actor?.id) renderSlots(currentToken);
});
Hooks.on("updateActor", actor => {
  if (currentToken && actor.id === currentToken.actor?.id) renderSlots(currentToken);
});

/* -------------------------------------------- */
/*  Активация предмета через Lancer Flow API    */
/* -------------------------------------------- */

/**
 * Активация предмета через Lancer Flow API. Оставлены только проверенные вызовы:
 *   mech_weapon / pilot_weapon           -> item.beginWeaponAttackFlow()
 *   система с system.actions[]            -> item.beginActivationFlow("system.actions.0")
 *   mech_system / weapon_mod / npc_feature-> item.beginSystemFlow()
 *
 * @param {LancerActor} actor
 * @param {LancerItem}  item
 * @param {string|null} actionPath  напр. "system.actions.1" — привязка слота к конкретному действию
 */
async function activateItem(actor, item, actionPath = null) {
  try {
    const t = item.type;

    // Слот привязан к конкретному действию
    if (actionPath) return await item.beginActivationFlow(actionPath);

    // Оружие -> бросок атаки
    if (t === "mech_weapon" || t === "pilot_weapon") {
      return await item.beginWeaponAttackFlow();
    }

    // Система с действиями -> активация первого (нагрев, Limited, экономика действий)
    if (Array.isArray(item.system?.actions) && item.system.actions.length) {
      return await item.beginActivationFlow("system.actions.0");
    }

    // Система / мод / NPC-фича без действий -> карточка системы
    if (t === "mech_system" || t === "weapon_mod" || t === "npc_feature") {
      return await item.beginSystemFlow();
    }

    ui.notifications.warn(`«${item.name}» (${t}): не знаю, как активировать.`);
  } catch (err) {
    console.error(`${MODULE} | activateItem`, err, item);
    ui.notifications.error(`Ошибка активации «${item.name}» — см. консоль (F12).`);
  }
}

/* -------------------------------------------- */
/*  Расходные элементы (Limited / uses)         */
/* -------------------------------------------- */

function getUses(item) {
  const u = item.system?.uses;
  if (u && typeof u === "object" && Number(u.max) > 0) {
    return { value: Math.max(0, Number(u.value ?? u.min ?? 0)), max: Number(u.max) };
  }
  return null;
}

async function adjustUses(item, delta) {
  const cur = getUses(item);
  if (!cur) return;
  const next = Math.min(cur.max, Math.max(0, cur.value + delta));
  if (next === cur.value) return;
  try {
    await item.update({ "system.uses.value": next });
  } catch (err) {
    console.error(`${MODULE} | adjustUses`, err, item);
    ui.notifications.error(`Не удалось изменить счётчик «${item.name}» — скорее всего не хватает прав.`);
  }
}

function warnNoPermission(actor) {
  ui.notifications.warn(
    `Нет прав на изменение «${actor.name}». Нужен Owner на самом актёре, а не только на пилоте.`
  );
}

/* -------------------------------------------- */
/*  Диалог назначения предмета в слот           */
/* -------------------------------------------- */

async function openAssignDialog(actor, slotIndex) {
  const items = actor.items
    .filter(i => ASSIGNABLE_TYPES.includes(i.type))
    .sort((a, b) => a.name.localeCompare(b.name));

  const current = readSlots(actor)[slotIndex] ?? "";

  const opts = items.map(i => {
    const u = getUses(i);
    const sel = i.uuid === current ? " selected" : "";
    return `<option value="${i.uuid}"${sel}>${foundry.utils.escapeHTML(i.name)} — ${i.type}${u ? ` [${u.value}/${u.max}]` : ""}</option>`;
  }).join("");

  const title = `${actor.name}: слот #${slotIndex + 1}`;
  // Без обёртки <form>: DialogV2 сам заворачивает content в форму,
  // вложенная была бы невалидна. Legacy-ветка добавляет её сама.
  const content = `
    <div class="form-group">
      <label>Предмет</label>
      <select name="uuid" style="width:100%">
        <option value=""${current ? "" : " selected"}>— пусто —</option>${opts}
      </select>
    </div>`;

  // null — диалог закрыли, "" — выбрали «пусто», иначе uuid предмета.
  const choice = await promptForItem(title, content);
  if (choice === null) return;

  const saved = await writeSlot(actor, slotIndex, choice || null);
  if (saved && currentToken?.actor?.id === actor.id) renderSlots(currentToken);
}

/**
 * ApplicationV1 (`Dialog`) помечен deprecated в v13 и отдаёт в колбэки jQuery,
 * от которой Foundry уходит. Основной путь — DialogV2; старый оставлен запасным
 * для ранних сборок v12, где ApplicationV2 могло ещё не быть.
 */
async function promptForItem(title, content) {
  const DialogV2 = foundry.applications?.api?.DialogV2;

  if (DialogV2) {
    return await DialogV2.prompt({
      window: { title },
      content,
      ok: {
        label: "Сохранить",
        icon: "fas fa-check",
        callback: (_event, button) => button.form?.elements?.uuid?.value ?? ""
      },
      rejectClose: false
    });
  }

  return await new Promise(resolve => {
    let picked = false;
    new Dialog({
      title,
      content: `<form>${content}</form>`,
      default: "ok",
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>', label: "Сохранить",
          callback: html => { picked = true; resolve(html.find("[name=uuid]").val() ?? ""); }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Отмена" }
      },
      close: () => { if (!picked) resolve(null); }
    }).render(true);
  });
}

/* -------------------------------------------- */
/*  flag'и / утилиты                            */
/* -------------------------------------------- */

function readSlots(actor) {
  const raw = actor.getFlag(MODULE, "slots");
  const arr = Array.isArray(raw) ? raw.slice(0, SLOT_COUNT) : [];
  while (arr.length < SLOT_COUNT) arr.push(null);
  return arr;
}

async function writeSlot(actor, index, uuid) {
  const slots = readSlots(actor);
  slots[index] = uuid;
  try {
    await actor.setFlag(MODULE, "slots", slots);
    return true;
  } catch (err) {
    console.error(`${MODULE} | writeSlot`, err, actor);
    ui.notifications.error(`Не удалось сохранить слот на «${actor.name}» — скорее всего не хватает прав.`);
    return false;
  }
}

function isDestroyed(item) {
  const s = item.system ?? {};
  return Boolean(s.destroyed || s.broken || s.cascading);
}

/* -------------------------------------------- */

Hooks.once("ready", () => {
  ensureOverlay();
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  console.log(`${MODULE} | готов. game.lancer =`, game.lancer);
});
