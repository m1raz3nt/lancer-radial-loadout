import { MODULE_ID, SLOT_COUNT, SLOT_COLORS, DEFAULT_COLOR } from "./constants.js";

/**
 * Normalise a stored slot to { uuid, color }. A bare string is the pre-colour
 * format, so existing loadouts survive the upgrade without a flag migration.
 */
export function normSlot(entry) {
  if ( !entry ) return null;
  if ( typeof entry === "string" ) return { uuid: entry, color: DEFAULT_COLOR };
  if ( typeof entry === "object" && entry.uuid ) {
    return {
      uuid: entry.uuid,
      color: entry.color in SLOT_COLORS ? entry.color : DEFAULT_COLOR
    };
  }
  return null;
}

export function readSlots(actor) {
  const raw = actor.getFlag(MODULE_ID, "slots");
  const arr = (Array.isArray(raw) ? raw.slice(0, SLOT_COUNT) : []).map(normSlot);
  while ( arr.length < SLOT_COUNT ) arr.push(null);
  return arr;
}

export async function writeSlot(actor, index, entry) {
  const slots = readSlots(actor);
  slots[index] = normSlot(entry);
  try {
    await actor.setFlag(MODULE_ID, "slots", slots);
    return true;
  } catch ( err ) {
    console.error(`${MODULE_ID} | writeSlot`, err, actor);
    ui.notifications.error(game.i18n.format("LANCER_RADIAL.Error.SaveSlot", { actor: actor.name }));
    return false;
  }
}

/** Remaining uses for items carrying the Limited tag, or null when unlimited. */
export function getUses(item) {
  const u = item.system?.uses;
  if ( u && typeof u === "object" && Number(u.max) > 0 ) {
    return { value: Math.max(0, Number(u.value ?? u.min ?? 0)), max: Number(u.max) };
  }
  return null;
}

/** Manual counter nudge that deliberately skips the flow, so nothing is rolled. */
export async function adjustUses(item, delta) {
  const cur = getUses(item);
  if ( !cur ) return;
  const next = Math.min(cur.max, Math.max(0, cur.value + delta));
  if ( next === cur.value ) return;
  try {
    await item.update({ "system.uses.value": next });
  } catch ( err ) {
    console.error(`${MODULE_ID} | adjustUses`, err, item);
    ui.notifications.error(game.i18n.format("LANCER_RADIAL.Error.AdjustUses", { item: item.name }));
  }
}

/** Field names drift between LANCER versions, so check the lot. */
export function isDestroyed(item) {
  const s = item.system ?? {};
  return Boolean(s.destroyed || s.broken || s.cascading);
}

export function warnNoPermission(actor) {
  ui.notifications.warn(game.i18n.format("LANCER_RADIAL.Error.NoPermission", { actor: actor.name }));
}
