import { ALLOWED_ACTOR_TYPES } from "./constants.js";
import { setting } from "./settings.js";

/**
 * The pilot linked to a mech. In LANCER these are separate actors with separate
 * ownership, so a player who owns their pilot may still not own the mech.
 */
export function getPilot(actor) {
  if ( actor?.type !== "mech" ) return null;
  const ref = actor.system?.pilot;
  const cand = ref?.value ?? ref?.uuid ?? ref?.id ?? ref ?? null;
  if ( cand instanceof Actor ) return cand;
  if ( typeof cand === "string" ) {
    try {
      return fromUuidSync(/[./]/.test(cand) ? cand : `Actor.${cand}`) ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Whether a given user drives this actor — directly, or through its pilot. */
export function playerControls(user, actor) {
  if ( actor.testUserPermission(user, "OWNER") ) return true;
  const pilot = getPilot(actor);
  return Boolean(pilot && pilot.testUserPermission(user, "OWNER"));
}

/**
 * Showing the radial and writing to the actor are different rights: ownership of
 * the pilot is enough to draw it, but setFlag on the mech is not covered. The
 * write side is gated separately, in the slot buttons.
 */
export function shouldShow(token) {
  const actor = token?.actor;
  if ( !actor || !ALLOWED_ACTOR_TYPES.includes(actor.type) ) return false;

  if ( game.user.isGM ) {
    if ( setting("gmSeesAll") ) return true;
    return game.users.some(u => !u.isGM && playerControls(u, actor));
  }

  return playerControls(game.user, actor);
}
