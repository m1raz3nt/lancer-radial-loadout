import { MODULE_ID, SLOT_COUNT, SLOT_COLORS, DEFAULT_COLOR, BUILTIN_ACTIONS } from "./constants.js";

/**
 * Normalise a stored slot. A slot holds either an item ({ uuid }) or one of the
 * actor-level LANCER actions ({ builtin }), plus its colour. A bare string is
 * the original pre-colour format, so old loadouts survive without a migration.
 */
export function normSlot(entry) {
  if ( !entry ) return null;
  if ( typeof entry === "string" ) return { uuid: entry, color: DEFAULT_COLOR };
  if ( typeof entry !== "object" ) return null;

  const color = entry.color in SLOT_COLORS ? entry.color : DEFAULT_COLOR;
  if ( entry.builtin && entry.builtin in BUILTIN_ACTIONS ) return { builtin: entry.builtin, color };
  if ( entry.uuid ) return { uuid: entry.uuid, color };
  return null;
}

export function readSlots(actor) {
  const raw = actor.getFlag(MODULE_ID, "slots");
  const arr = (Array.isArray(raw) ? raw.slice(0, SLOT_COUNT) : []).map(normSlot);
  while ( arr.length < SLOT_COUNT ) arr.push(null);
  return arr;
}

/**
 * Writes against the raw flag rather than the padded read, so entries past
 * SLOT_COUNT survive. Dropping the ring from eight circles to six would
 * otherwise quietly delete whatever sat in the last two.
 */
export async function writeSlot(actor, index, entry) {
  const raw = actor.getFlag(MODULE_ID, "slots");
  const slots = Array.isArray(raw) ? raw.slice() : [];
  while ( slots.length <= index ) slots.push(null);
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
