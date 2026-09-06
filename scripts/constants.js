export const MODULE_ID = "lancer-radial-loadout";

/**
 * How many assignable circles sit around the token. They are offset by half a
 * step so the top of the ring stays clear for the action hub.
 */
export const SLOT_COUNT = 6;

/**
 * Minimum layout radius in scene px. The real radius grows with the token:
 * a fixed value put the circles on top of the artwork of larger mechs.
 */
export const RADIUS = 96;

/** How far the safe zone reaches past the outermost circle, in scene px. */
export const SAFE_PAD = 52;

/** Grace period before the radial hides once the cursor leaves, in ms. */
export const HIDE_DELAY = 180;

/** Where the hub sits: straight up, in the gap the slot offset leaves open. */
export const HUB_ANGLE = -90;

/** How much further out than the ring the fanned-out actions land, in scene px. */
export const FAN_GAP = 64;

/** Widest arc a fan may span, centred on whatever opened it, in degrees. */
export const FAN_SPREAD = 190;

/** Angle between neighbouring fan circles until the spread caps out. */
export const FAN_STEP = 22;

/**
 * Grace period before the fan folds back once the cursor leaves it, in ms.
 * Deliberately twice the radial's own: the fanned circles sit further out and
 * are smaller, so reaching one takes longer and overshooting is easier.
 */
export const FAN_DELAY = 440;

/** Pointer travel between press and release still counted as a click, in px. */
export const CLICK_SLOP = 6;

/** Actor types the radial is offered on. */
export const ALLOWED_ACTOR_TYPES = ["mech", "npc", "pilot"];

/** Item types worth putting in a slot. */
export const ASSIGNABLE_TYPES = [
  "mech_weapon",
  "mech_system",
  "npc_feature",
  "pilot_weapon",
  "pilot_gear",
  "talent"
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

/**
 * LANCER actions that live on the actor rather than on an item. Improvised
 * Attack is why this exists: the rules give it to every mech, so there is no
 * item to drop into a slot. `actors` narrows which actor types offer the entry.
 */
export const BUILTIN_ACTIONS = {
  improvisedAttack: { label: "LANCER_RADIAL.Builtin.ImprovisedAttack", icon: "fa-solid fa-hand-back-fist" },
  basicAttack:      { label: "LANCER_RADIAL.Builtin.BasicAttack",      icon: "fa-solid fa-crosshairs" },
  techAttack:       { label: "LANCER_RADIAL.Builtin.TechAttack",       icon: "fa-solid fa-satellite-dish", actors: ["mech", "npc"] },
  damage:           { label: "LANCER_RADIAL.Builtin.Damage",           icon: "fa-solid fa-burst" },
  overcharge:       { label: "LANCER_RADIAL.Builtin.Overcharge",       icon: "fa-solid fa-bolt",  actors: ["mech"] },
  stabilize:        { label: "LANCER_RADIAL.Builtin.Stabilize",        icon: "fa-solid fa-kit-medical" },
  structure:        { label: "LANCER_RADIAL.Builtin.Structure",        icon: "fa-solid fa-heart-crack", actors: ["mech", "npc"] },
  overheat:         { label: "LANCER_RADIAL.Builtin.Overheat",         icon: "fa-solid fa-temperature-arrow-up", actors: ["mech", "npc"] },
  burn:             { label: "LANCER_RADIAL.Builtin.Burn",             icon: "fa-solid fa-fire" },
  scan:             { label: "LANCER_RADIAL.Builtin.Scan",             icon: "fa-solid fa-magnifying-glass" },
  fullRepair:       { label: "LANCER_RADIAL.Builtin.FullRepair",       icon: "fa-solid fa-screwdriver-wrench" }
};

/** Built-ins on offer for a given actor type. */
export function builtinsFor(actorType) {
  return Object.entries(BUILTIN_ACTIONS)
    .filter(([, def]) => !def.actors || def.actors.includes(actorType));
}

/**
 * Glyphs per LANCER activation type, so a fanned-out item action shows at a
 * glance what it costs. Black Thumb, for one, is a quick action at rank 1 and a
 * protocol at rank 2.
 */
export const ACTIVATION_ICONS = {
  "Quick": "fa-solid fa-forward",
  "Full": "fa-solid fa-forward-fast",
  "Quick Tech": "fa-solid fa-wifi",
  "Full Tech": "fa-solid fa-tower-broadcast",
  "Invade": "fa-solid fa-virus",
  "Protocol": "fa-solid fa-terminal",
  "Reaction": "fa-solid fa-reply",
  "Free": "fa-solid fa-feather",
  "Passive": "fa-solid fa-circle-half-stroke"
};

export function activationIcon(type) {
  return ACTIVATION_ICONS[type] ?? "fa-solid fa-play";
}
