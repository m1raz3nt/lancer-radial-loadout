import { MODULE_ID } from "./constants.js";

export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function registerSettings() {
  // World scope: whether the GM sees other people's radials is a table-wide call,
  // not a per-client preference.
  game.settings.register(MODULE_ID, "gmSeesAll", {
    name: "LANCER_RADIAL.Settings.GmSeesAll.Name",
    hint: "LANCER_RADIAL.Settings.GmSeesAll.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "showUses", {
    name: "LANCER_RADIAL.Settings.ShowUses.Name",
    hint: "LANCER_RADIAL.Settings.ShowUses.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showSafeZone", {
    name: "LANCER_RADIAL.Settings.ShowSafeZone.Name",
    hint: "LANCER_RADIAL.Settings.ShowSafeZone.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}
