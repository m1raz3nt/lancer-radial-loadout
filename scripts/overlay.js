import { MODULE_ID, SLOT_COUNT, RADIUS, SAFE_PAD, HIDE_DELAY, colorHex } from "./constants.js";
import { setting } from "./settings.js";
import { shouldShow } from "./visibility.js";
import { readSlots, getUses, adjustUses, isDestroyed, warnNoPermission } from "./slots.js";
import { activateItem } from "./flows.js";
import { openAssignDialog } from "./assign-dialog.js";

const ELEMENT_ID = "lrl-hud";

let hideTimer = null;
let currentToken = null;

// Safe-zone geometry. sceneTokenW/sceneOuter are scene units; geomCache holds
// the same figures in screen px and therefore has to die whenever zoom changes.
let sceneTokenW = 0;
let sceneOuter = 0;
let geomCache = null;

function overlayEl() {
  return document.getElementById(ELEMENT_ID);
}

/**
 * The overlay lives in Foundry's #hud layer, which is transformed along with the
 * canvas — that is what keeps it glued to the token through pan and zoom without
 * any per-frame work on our side.
 */
function ensureOverlay() {
  let el = overlayEl();
  if ( !el ) {
    el = document.createElement("div");
    el.id = ELEMENT_ID;
    el.innerHTML = `<div class="lrl-safezone"></div><div class="lrl-ring"></div>`;
  }
  const parent = document.getElementById("hud")
    ?? document.getElementById("interface")
    ?? document.body;
  if ( el.parentElement !== parent ) parent.appendChild(el);
  el.classList.toggle("lrl-show-zone", setting("showSafeZone"));
  return el;
}

/* -------------------------------------------- */
/*  Show / hide                                 */
/* -------------------------------------------- */

function cancelHide() {
  if ( hideTimer ) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

/**
 * Never restarts a running timer: pointermove fires continuously, so resetting
 * it on every event outside the zone would postpone hiding forever.
 */
function scheduleHide() {
  if ( hideTimer ) return;
  hideTimer = setTimeout(hideOverlay, HIDE_DELAY);
}

function hideOverlay() {
  cancelHide();
  overlayEl()?.classList.remove("active");
  currentToken = null;
  geomCache = null;
}

function showFor(token) {
  const el = ensureOverlay();
  currentToken = token;
  positionOverlay(token);
  renderSlots(token);
  el.classList.add("active");
  cancelHide();
}

function refresh() {
  if ( currentToken ) renderSlots(currentToken);
}

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

/** Centre and outer radius of the safe zone, in screen px. */
function getGeom() {
  if ( geomCache ) return geomCache;
  const el = overlayEl();
  if ( !el || !currentToken || !sceneTokenW ) return null;
  const rect = el.getBoundingClientRect();
  if ( !rect.width ) return null;
  const scale = rect.width / sceneTokenW;
  geomCache = {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    outer: sceneOuter * scale
  };
  return geomCache;
}

/**
 * The safe zone is tested against cursor coordinates rather than pointerenter /
 * pointerleave on elements. That buys two things: the ring stops swallowing
 * clicks meant for the canvas, and the radial survives a redraw — replacing the
 * slot nodes used to destroy the element under the cursor, which fired
 * pointerleave and hid everything mid-interaction.
 */
function onPointerMove(ev) {
  if ( !currentToken ) return;
  const g = getGeom();
  if ( !g ) return;
  const dx = ev.clientX - g.cx;
  const dy = ev.clientY - g.cy;
  if ( dx * dx + dy * dy <= g.outer * g.outer ) cancelHide();
  else scheduleHide();
}

function positionOverlay(token) {
  const el = overlayEl();
  if ( !el ) return;

  const gs = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
  const x = token.document?.x ?? token.x;
  const y = token.document?.y ?? token.y;
  const w = (token.document?.width ?? 1) * gs;
  const h = (token.document?.height ?? 1) * gs;

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  // Radius follows the token. Pinned at 96px the circles landed on the artwork
  // of a size 2 mech, and on size 3 the donut hole outgrew the outer circle,
  // collapsing the safe zone entirely.
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
  if ( sz ) {
    sz.style.width = sz.style.height = `${outer * 2}px`;
    sz.style.marginLeft = sz.style.marginTop = `${-outer}px`;
    sz.style.clipPath =
      `path(evenodd,"` +
      `M ${c} ${c} m ${-outer} 0 a ${outer} ${outer} 0 1 0 ${outer * 2} 0 a ${outer} ${outer} 0 1 0 ${-outer * 2} 0 Z ` +
      `M ${c} ${c} m ${-inner} 0 a ${inner} ${inner} 0 1 0 ${inner * 2} 0 a ${inner} ${inner} 0 1 0 ${-inner * 2} 0 Z` +
      `")`;
  }
}

/* -------------------------------------------- */
/*  Slots                                       */
/* -------------------------------------------- */

function slotTooltip(item, uses) {
  const head = uses ? `${item.name}  [${uses.value}/${uses.max}]` : item.name;
  const lines = [head, game.i18n.localize("LANCER_RADIAL.Tooltip.Actions")];
  if ( uses ) lines.push(game.i18n.localize("LANCER_RADIAL.Tooltip.Uses"));
  return lines.join("\n");
}

function renderSlots(token) {
  const actor = token.actor;
  const ring = overlayEl()?.querySelector(".lrl-ring");
  if ( !ring || !actor ) return;
  ring.replaceChildren();

  const slots = readSlots(actor);
  const showUses = setting("showUses");
  // Ownership of the pilot is enough to draw the radial, but every write below
  // targets the mech actor itself.
  const canEdit = actor.isOwner;

  slots.forEach((entry, i) => {
    const angle = (360 / SLOT_COUNT) * i - 90;
    const item = entry?.uuid ? fromUuidSync(entry.uuid) : null;
    const uses = item && showUses ? getUses(item) : null;

    const btn = document.createElement("div");
    btn.className = `lrl-slot ${item ? "filled" : "empty"}`;
    btn.style.setProperty("--angle", `${angle}deg`);
    btn.style.setProperty("--i", i);

    if ( item ) {
      btn.style.setProperty("--slot-color", colorHex(entry.color));
      btn.style.backgroundImage = `url("${encodeURI(item.img ?? "")}")`;
      btn.title = slotTooltip(item, uses);
      if ( isDestroyed(item) ) btn.classList.add("destroyed");
      if ( uses && uses.value <= 0 ) btn.classList.add("depleted");
      if ( uses ) {
        const badge = document.createElement("span");
        badge.className = "lrl-badge";
        badge.textContent = `${uses.value}/${uses.max}`;
        btn.appendChild(badge);
      }
    } else {
      btn.title = game.i18n.localize("LANCER_RADIAL.Tooltip.Empty");
      btn.textContent = "+";
    }

    btn.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if ( !item ) {
        if ( !canEdit ) return warnNoPermission(actor);
        if ( await openAssignDialog(actor, i) ) refresh();
        return;
      }
      if ( ev.shiftKey && uses ) {
        if ( !canEdit ) return warnNoPermission(actor);
        return adjustUses(item, -1);
      }
      activateItem(actor, item);
    });

    btn.addEventListener("contextmenu", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if ( !canEdit ) return warnNoPermission(actor);
      if ( item && ev.shiftKey && uses ) return adjustUses(item, +1);
      if ( await openAssignDialog(actor, i) ) refresh();
    });

    ring.appendChild(btn);
  });
}

/* -------------------------------------------- */
/*  Wiring                                      */
/* -------------------------------------------- */

export function activateOverlay() {
  ensureOverlay();
  document.addEventListener("pointermove", onPointerMove, { passive: true });

  Hooks.on("hoverToken", (token, hovered) => {
    if ( hovered ) {
      if ( shouldShow(token) ) showFor(token);
    } else if ( currentToken && token.id === currentToken.id ) {
      scheduleHide();
    }
  });

  Hooks.on("updateToken", (doc, change) => {
    if ( currentToken && doc.id === currentToken.id && ("x" in change || "y" in change) ) hideOverlay();
  });

  Hooks.on("deleteToken", doc => {
    if ( currentToken && doc.id === currentToken.id ) hideOverlay();
  });

  // Position needs no recomputing on pan — #hud is transformed with the scene and
  // our coordinates are in scene units. Only the screen-space cache is zoom-bound.
  Hooks.on("canvasPan", () => {
    geomCache = null;
  });

  Hooks.on("canvasReady", () => {
    hideOverlay();
    ensureOverlay();
  });

  Hooks.on("updateItem", item => {
    if ( currentToken && item.parent?.id === currentToken.actor?.id ) refresh();
  });

  Hooks.on("updateActor", actor => {
    if ( currentToken && actor.id === currentToken.actor?.id ) refresh();
  });

  console.log(`${MODULE_ID} | overlay active`);
}
