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
  game.settings.register(MODULE, "onlyAssigned", {
    name: "Только у своих токенов",
    hint: "Игрок видит слоты лишь на токенах, которыми владеет. GM — только на токенах, назначенных игрокам.",
    scope: "world", config: true, type: Boolean, default: true
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

function shouldShow(token) {
  const actor = token?.actor;
  if (!actor || !ALLOWED_ACTOR_TYPES.includes(actor.type)) return false;
  if (!actor.isOwner) return false;
  if (game.settings.get(MODULE, "onlyAssigned") && game.user.isGM) {
    const ownedByPlayer = game.users.some(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
    if (!ownedByPlayer) return false;
  }
  return true;
}

/* -------------------------------------------- */
/*  Жизненный цикл оверлея                      */
/* -------------------------------------------- */

let hideTimer = null;
let currentToken = null;

function ensureOverlay() {
  let el = document.getElementById("lrl-hud");
  if (!el) {
    el = document.createElement("div");
    el.id = "lrl-hud";
    el.innerHTML = `<div class="lrl-safezone"></div><div class="lrl-ring"></div>`;
    const sz = el.querySelector(".lrl-safezone");
    sz.addEventListener("pointerenter", cancelHide);
    sz.addEventListener("pointerleave", scheduleHide);
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
function scheduleHide() {
  cancelHide();
  hideTimer = setTimeout(hideOverlay, HIDE_DELAY);
}
function hideOverlay() {
  cancelHide();
  document.getElementById("lrl-hud")?.classList.remove("active");
  currentToken = null;
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

  // Кольцо-«ловушка»: donut через clip-path, дырка = габарит токена + 4px.
  const inner = Math.round(Math.max(w, h) / 2 + 4);
  const outer = RADIUS + SAFE_PAD;
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

  slots.forEach((uuid, i) => {
    const angle = (360 / SLOT_COUNT) * i - 90;
    const item = uuid ? fromUuidSync(uuid) : null;
    const uses = item && showUses ? getUses(item) : null;

    const btn = document.createElement("div");
    btn.className = `lrl-slot ${item ? "filled" : "empty"}`;
    btn.style.setProperty("--angle", `${angle}deg`);
    btn.style.setProperty("--radius", `${RADIUS}px`);
    btn.style.setProperty("--i", i);
    btn.addEventListener("pointerenter", cancelHide);
    btn.addEventListener("pointerleave", scheduleHide);

    if (item) {
      btn.style.backgroundImage = `url("${item.img}")`;
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
      if (!item) return openAssignDialog(actor, i);
      if (ev.shiftKey && uses) return adjustUses(item, -1);
      activateItem(actor, item);
    });
    btn.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
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
Hooks.on("canvasPan", () => { if (currentToken) positionOverlay(currentToken); });
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

async function activateItem(actor, item) {
  try {
    if (typeof item.beginAttackFlow === "function" &&
        ["mech_weapon", "pilot_weapon", "npc_feature"].includes(item.type)) {
      return await item.beginAttackFlow(game.user.targets);
    }
    if (typeof item.beginActivationFlow === "function") return await item.beginActivationFlow();
    if (typeof item.beginSystemFlow === "function") return await item.beginSystemFlow();
    if (typeof item.beginItemChatFlow === "function") return await item.beginItemChatFlow();
    ui.notifications.warn(`Не знаю, как активировать «${item.name}». Проверь game.lancer API.`);
  } catch (err) {
    console.error(`${MODULE} | ошибка активации`, err);
    ui.notifications.error(`Ошибка активации «${item.name}» — см. консоль.`);
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
  const clamp = Math.clamp ?? Math.clamped;
  const next = clamp(cur.value + delta, 0, cur.max);
  if (next !== cur.value) await item.update({ "system.uses.value": next });
}

/* -------------------------------------------- */
/*  Диалог назначения предмета в слот           */
/* -------------------------------------------- */

async function openAssignDialog(actor, slotIndex) {
  const items = actor.items
    .filter(i => ASSIGNABLE_TYPES.includes(i.type))
    .sort((a, b) => a.name.localeCompare(b.name));

  const opts = items.map(i => {
    const u = getUses(i);
    return `<option value="${i.uuid}">${foundry.utils.escapeHTML(i.name)} — ${i.type}${u ? ` [${u.value}/${u.max}]` : ""}</option>`;
  }).join("");

  const current = readSlots(actor)[slotIndex] ?? "";

  new Dialog({
    title: `${actor.name}: слот #${slotIndex + 1}`,
    content: `
      <form><div class="form-group">
        <label>Предмет</label>
        <select name="uuid" style="width:100%">
          <option value="">— пусто —</option>${opts}
        </select>
      </div></form>`,
    default: "ok",
    buttons: {
      ok: {
        icon: '<i class="fas fa-check"></i>', label: "Сохранить",
        callback: async html => {
          await writeSlot(actor, slotIndex, html.find("[name=uuid]").val() || null);
          if (currentToken?.actor?.id === actor.id) renderSlots(currentToken);
        }
      },
      cancel: { icon: '<i class="fas fa-times"></i>', label: "Отмена" }
    },
    render: html => html.find("[name=uuid]").val(current)
  }).render(true);
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
  await actor.setFlag(MODULE, "slots", slots);
}

function isDestroyed(item) {
  const s = item.system ?? {};
  return Boolean(s.destroyed || s.broken || s.cascading);
}

/* -------------------------------------------- */

Hooks.once("ready", () => {
  ensureOverlay();
  console.log(`${MODULE} | готов. game.lancer =`, game.lancer);
});
