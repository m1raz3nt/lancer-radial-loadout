import { MODULE_ID } from "./constants.js";

/**
 * Hand an item to the LANCER flow that fits it. Only calls verified against the
 * system are here — `beginAttackFlow`, which the older docs advertise, does not
 * exist and silently did nothing.
 *
 * @param {Actor}       actor
 * @param {Item}        item
 * @param {string|null} actionPath  e.g. "system.actions.1" to pin a slot to one action
 */
export async function activateItem(actor, item, actionPath = null) {
  try {
    const t = item.type;

    if ( actionPath ) return await item.beginActivationFlow(actionPath);

    // Weapons roll an attack.
    if ( t === "mech_weapon" || t === "pilot_weapon" ) {
      return await item.beginWeaponAttackFlow();
    }

    // Anything carrying its own actions activates the first one, which is what
    // applies heat, spends Limited uses and books the action economy.
    if ( Array.isArray(item.system?.actions) && item.system.actions.length ) {
      return await item.beginActivationFlow("system.actions.0");
    }

    // Systems and features without actions just post their card.
    if ( t === "mech_system" || t === "weapon_mod" || t === "npc_feature" ) {
      return await item.beginSystemFlow();
    }

    ui.notifications.warn(game.i18n.format("LANCER_RADIAL.Error.NoFlow", { item: item.name, type: t }));
  } catch ( err ) {
    console.error(`${MODULE_ID} | activateItem`, err, item);
    ui.notifications.error(game.i18n.format("LANCER_RADIAL.Error.Activate", { item: item.name }));
  }
}
