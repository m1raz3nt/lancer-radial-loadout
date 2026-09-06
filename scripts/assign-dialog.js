import { ASSIGNABLE_TYPES, SLOT_COLORS, DEFAULT_COLOR, builtinsFor } from "./constants.js";
import { readSlots, writeSlot, getUses } from "./slots.js";

/** Slot targets are namespaced so an action key can never collide with a uuid. */
const BUILTIN_PREFIX = "builtin:";

function currentTarget(entry) {
  if ( entry?.builtin ) return `${BUILTIN_PREFIX}${entry.builtin}`;
  return entry?.uuid ?? "";
}

function buildOptions(actor, selected) {
  const mark = value => (value === selected ? " selected" : "");

  const builtins = builtinsFor(actor.type).map(([key, def]) => {
    const value = `${BUILTIN_PREFIX}${key}`;
    return `<option value="${value}"${mark(value)}>${game.i18n.localize(def.label)}</option>`;
  }).join("");

  const items = actor.items
    .filter(i => ASSIGNABLE_TYPES.includes(i.type))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => {
      const u = getUses(i);
      const uses = u ? ` [${u.value}/${u.max}]` : "";
      return `<option value="${i.uuid}"${mark(i.uuid)}>${foundry.utils.escapeHTML(i.name)} — ${i.type}${uses}</option>`;
    }).join("");

  const groups = [`<option value=""${mark("")}>${game.i18n.localize("LANCER_RADIAL.Dialog.Empty")}</option>`];
  if ( builtins ) {
    groups.push(`<optgroup label="${game.i18n.localize("LANCER_RADIAL.Dialog.Builtins")}">${builtins}</optgroup>`);
  }
  if ( items ) {
    groups.push(`<optgroup label="${game.i18n.localize("LANCER_RADIAL.Dialog.Items")}">${items}</optgroup>`);
  }
  return groups.join("");
}

/**
 * Pick a target and a colour for one slot.
 *
 * Returns true when the slot actually changed, so the caller can redraw. It
 * deliberately does not touch the overlay itself — that would make the two
 * modules import each other.
 */
export async function openAssignDialog(actor, slotIndex) {
  const current = readSlots(actor)[slotIndex];
  const selected = currentTarget(current);
  const currentColor = current?.color ?? DEFAULT_COLOR;

  const swatches = Object.entries(SLOT_COLORS).map(([key, { label, hex }]) => {
    const checked = key === currentColor ? " checked" : "";
    const title = game.i18n.localize(label);
    return `
      <label class="lrl-swatch" style="--c:${hex}" title="${title}">
        <input type="radio" name="color" value="${key}"${checked}>
        <span></span>
      </label>`;
  }).join("");

  // No <form> wrapper: DialogV2 supplies one, and nesting forms is invalid.
  const content = `
    <div class="form-group">
      <label>${game.i18n.localize("LANCER_RADIAL.Dialog.Target")}</label>
      <select name="target" style="width:100%">${buildOptions(actor, selected)}</select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("LANCER_RADIAL.Dialog.Color")}</label>
      <div class="lrl-swatches">${swatches}</div>
    </div>`;

  // rejectClose keeps a dismissed dialog out of the reject path, so closing the
  // window resolves to null while picking "empty" resolves to an empty target.
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format("LANCER_RADIAL.Dialog.Title", { actor: actor.name, slot: slotIndex + 1 }) },
    content,
    ok: {
      label: game.i18n.localize("LANCER_RADIAL.Dialog.Save"),
      icon: "fas fa-check",
      // elements.color is a RadioNodeList; its value is the checked option.
      callback: (_event, button) => ({
        target: button.form?.elements?.target?.value ?? "",
        color: button.form?.elements?.color?.value || DEFAULT_COLOR
      })
    },
    rejectClose: false
  });

  if ( choice === null ) return false;

  let entry = null;
  if ( choice.target.startsWith(BUILTIN_PREFIX) ) {
    entry = { builtin: choice.target.slice(BUILTIN_PREFIX.length), color: choice.color };
  } else if ( choice.target ) {
    entry = { uuid: choice.target, color: choice.color };
  }

  return await writeSlot(actor, slotIndex, entry);
}
