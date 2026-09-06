import { ASSIGNABLE_TYPES, SLOT_COLORS, DEFAULT_COLOR } from "./constants.js";
import { readSlots, writeSlot, getUses } from "./slots.js";
import { getPilot } from "./visibility.js";

/**
 * Pick an item and a colour for one slot.
 *
 * Only items are on offer: the basic LANCER actions live in the hub at the top
 * of the ring, always available, so listing them here as well only padded the
 * dropdown and spent a slot on something already one hover away.
 *
 * Returns true when the slot actually changed, so the caller can redraw. It
 * deliberately does not touch the overlay itself — that would make the two
 * modules import each other.
 */
export async function openAssignDialog(actor, slotIndex) {
  const current = readSlots(actor)[slotIndex];
  const currentUuid = current?.uuid ?? "";
  const currentColor = current?.color ?? DEFAULT_COLOR;

  const option = i => {
    const u = getUses(i);
    const uses = u ? ` [${u.value}/${u.max}]` : "";
    const selected = i.uuid === currentUuid ? " selected" : "";
    return `<option value="${i.uuid}"${selected}>${foundry.utils.escapeHTML(i.name)} — ${i.type}${uses}</option>`;
  };

  const listing = source => source.items
    .filter(i => ASSIGNABLE_TYPES.includes(i.type))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(option)
    .join("");

  const own = listing(actor);

  // Talents live on the pilot, not the mech, so a mech token would otherwise
  // never see them. Only talents are borrowed — the pilot's own gear belongs on
  // the pilot's own radial.
  const pilot = getPilot(actor);
  const talents = pilot
    ? pilot.items.filter(i => i.type === "talent").sort((a, b) => a.name.localeCompare(b.name)).map(option).join("")
    : "";

  const groups = [];
  if ( own ) groups.push(`<optgroup label="${game.i18n.localize("LANCER_RADIAL.Dialog.Items")}">${own}</optgroup>`);
  if ( talents ) groups.push(`<optgroup label="${game.i18n.format("LANCER_RADIAL.Dialog.PilotTalents", { pilot: pilot.name })}">${talents}</optgroup>`);
  const options = groups.join("");

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
      <label>${game.i18n.localize("LANCER_RADIAL.Dialog.Item")}</label>
      <select name="uuid" style="width:100%">
        <option value=""${currentUuid ? "" : " selected"}>${game.i18n.localize("LANCER_RADIAL.Dialog.Empty")}</option>
        ${options}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("LANCER_RADIAL.Dialog.Color")}</label>
      <div class="lrl-swatches">${swatches}</div>
    </div>`;

  // rejectClose keeps a dismissed dialog out of the reject path, so closing the
  // window resolves to null while picking "empty" resolves to an empty uuid.
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format("LANCER_RADIAL.Dialog.Title", { actor: actor.name, slot: slotIndex + 1 }) },
    content,
    ok: {
      label: game.i18n.localize("LANCER_RADIAL.Dialog.Save"),
      icon: "fas fa-check",
      // elements.color is a RadioNodeList; its value is the checked option.
      callback: (_event, button) => ({
        uuid: button.form?.elements?.uuid?.value ?? "",
        color: button.form?.elements?.color?.value || DEFAULT_COLOR
      })
    },
    rejectClose: false
  });

  if ( choice === null ) return false;

  const entry = choice.uuid ? { uuid: choice.uuid, color: choice.color } : null;
  return await writeSlot(actor, slotIndex, entry);
}
