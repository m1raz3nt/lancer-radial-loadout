export const MODULE_ID = "lancer-radial-loadout";

/** How many circles sit around the token. */
export const SLOT_COUNT = 8;

/**
 * Minimum layout radius in scene px. The real radius grows with the token:
 * a fixed value put the circles on top of the artwork of larger mechs.
 */
export const RADIUS = 96;

/** How far the safe zone reaches past the outermost circle, in scene px. */
export const SAFE_PAD = 52;

/** Grace period before the radial hides once the cursor leaves, in ms. */
export const HIDE_DELAY = 180;

/** Actor types the radial is offered on. */
export const ALLOWED_ACTOR_TYPES = ["mech", "npc", "pilot"];

/** Item types worth putting in a slot. */
export const ASSIGNABLE_TYPES = [
  "mech_weapon",
  "mech_system",
  "npc_feature",
  "pilot_weapon",
  "pilot_gear"
];

export const DEFAULT_COLOR = "default";

/**
 * Slot palette. The key is what lands in the actor flags, the hex feeds the
 * --slot-color CSS variable. Adding a colour means adding a line here plus its
 * label in lang/.
 */
export const SLOT_COLORS = {
  default: { label: "LANCER_RADIAL.Color.Default", hex: "#8ab4ff" },
  red:     { label: "LANCER_RADIAL.Color.Red",     hex: "#ff6b6b" },
  green:   { label: "LANCER_RADIAL.Color.Green",   hex: "#5ad18a" },
  blue:    { label: "LANCER_RADIAL.Color.Blue",    hex: "#4a86ff" },
  pink:    { label: "LANCER_RADIAL.Color.Pink",    hex: "#ff7ac8" },
  gray:    { label: "LANCER_RADIAL.Color.Gray",    hex: "#9aa3b2" }
};

export function colorHex(key) {
  return (SLOT_COLORS[key] ?? SLOT_COLORS[DEFAULT_COLOR]).hex;
}
