import { MODULE_ID, BUILTIN_ACTIONS } from "./constants.js";

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

/**
 * Run one of the actor-level LANCER flows. Improvised Attack is a basic attack
 * with a name: the system rolls it through beginBasicAttackFlow and takes the
 * title straight from us, so the chat card says what was thrown.
 *
 * Note that a basic attack only rolls to hit — damage (1d6 kinetic for an
 * improvised attack) is its own flow, which is why "damage" is on the list too.
 */
export async function runBuiltin(actor, key) {
  const def = BUILTIN_ACTIONS[key];
  if ( !def ) {
    ui.notifications.warn(game.i18n.format("LANCER_RADIAL.Error.NoBuiltin", { key }));
    return;
  }
  const title = game.i18n.localize(def.label);
  try {
    switch ( key ) {
      case "improvisedAttack":
      case "basicAttack": return await actor.beginBasicAttackFlow(title);
      case "techAttack":  return await actor.beginBasicTechAttackFlow(title);
      case "damage":      return await actor.beginDamageFlow(title);
      case "stabilize":   return await actor.beginStabilizeFlow(title);
      case "fullRepair":  return await actor.beginFullRepairFlow(title);
      case "burn":        return await actor.beginBurnFlow(title);
      case "overcharge":  return await actor.beginOverchargeFlow();
      case "structure":   return await actor.beginStructureFlow();
      case "overheat":    return await actor.beginOverheatFlow();
      case "scan":        return await actor.beginScanFlow(game.user.targets.first());
    }
  } catch ( err ) {
    console.error(`${MODULE_ID} | runBuiltin`, err, key, actor);
    ui.notifications.error(game.i18n.format("LANCER_RADIAL.Error.Activate", { item: title }));
  }
}
