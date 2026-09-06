import { MODULE_ID, SLOT_COLORS, BUILTIN_ACTIONS } from "./constants.js";
import { registerSettings } from "./settings.js";
import { activateOverlay } from "./overlay.js";
import { readSlots, writeSlot } from "./slots.js";
import { activateItem, runBuiltin } from "./flows.js";
import { shouldShow } from "./visibility.js";

Hooks.once("init", () => {
  registerSettings();

  game.modules.get(MODULE_ID).api = {
    readSlots,
    writeSlot,
    activateItem,
    runBuiltin,
    shouldShow,
    colors: Object.keys(SLOT_COLORS),
    builtins: Object.keys(BUILTIN_ACTIONS)
  };
});

Hooks.once("ready", () => {
  activateOverlay();
  console.log(`${MODULE_ID} | готов. game.lancer =`, game.lancer);
});
