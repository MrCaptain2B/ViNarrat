export function registerRegionBehavior() {

  const { StringField } = foundry.data.fields;
  const { RegionBehaviorType } = foundry.data.regionBehaviors;

  class FVNTriggerRegionBehaviorType extends RegionBehaviorType {

    static defineSchema() {
      const schema = super.defineSchema();
      schema.scriptId = new StringField({ required: true, blank: false, label: "ViNarrat Script ID", hint: "The ViNarrat script to play when a token enters this region" });
      return schema;
    }

    static get events() {
      return {
        tokenEnter: FVNTriggerRegionBehaviorType.#onTokenEnter
      };
    }

    static async #onTokenEnter(event) {
      const scriptId = this.scriptId;
      if (!scriptId) return;
      const consumed = this.behavior.getFlag("free-visual-novel", "consumed");
      if (consumed) return;
      const token = event.token;
      if (!token?.document?.actor) return;
      const isPlayerControlled = token.document.actor.hasPlayerOwner;
      if (!isPlayerControlled) return;
      const data = await game.settings?.get("free-visual-novel", "vndata");
      if (!data) return;
      const script = (data.scripts || []).find(s => s.id === scriptId);
      if (!script) {
        ui.notifications?.warn(`ViNarrat Region: Script "${scriptId}" not found`);
        return;
      }
      await this.behavior.setFlag("free-visual-novel", "consumed", true);
      const app = ui.freevisualnovel;
      if (app && typeof app._startPlayback === "function") {
        app._startPlayback(script);
      } else {
        _openAndPlay(script);
      }
    }

    async _handleRegionEvent(event) {
      const handler = FVNTriggerRegionBehaviorType.events[event.type];
      if (handler) await handler.call(this, event);
    }
  }

  CONFIG.RegionBehavior.typeDataModels.fvnScript = FVNTriggerRegionBehaviorType;
}

async function _openAndPlay(script) {
  if (ui.freevisualnovel?.rendered) {
    ui.freevisualnovel._startPlayback(script);
    return;
  }
  const module = await import('./app.js');
  const app = new module.default();
  ui.freevisualnovel = app;
  app._startPlayback(script);
  app.render(true);
}

Hooks.on("renderRegionBehaviorConfig", (app, html) => {
  if (app.document.type !== "fvnScript") return;
  const scriptId = app.document.scriptId || "";
  const form = html.querySelector("form");
  if (!form) return;
  const field = form.querySelector('[name="scriptId"]');
  if (!field) return;
  const wrapper = field.closest(".form-group") || field.parentElement;
  if (!wrapper) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fvn-script-picker";
  btn.textContent = "Select Script";
  btn.style.marginTop = "4px";
  const nameDisplay = document.createElement("span");
  nameDisplay.className = "fvn-script-name";
  nameDisplay.style.marginLeft = "8px";
  nameDisplay.style.color = "var(--color-text-light-secondary)";
  btn.addEventListener("click", async () => {
    const data = await game.settings?.get("free-visual-novel", "vndata");
    const scripts = data?.scripts || [];
    const choices = scripts.map(s => ({ label: `${s.name} (${s.steps?.length || 0} steps)`, value: s.id }));
    if (!choices.length) {
      ui.notifications?.warn("No ViNarrat scripts found. Create one first in the ViNarrat panel.");
      return;
    }
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Select ViNarrat Script" },
      content: `<div class="fvn-script-dialog">
        <p>Choose a script to play when a token enters this region:</p>
        <select class="fvn-script-select" style="width:100%;padding:6px;">
          ${choices.map(c => `<option value="${c.value}">${c.label}</option>`).join("")}
        </select>
      </div>`,
      rejectClose: false,
      ok: { label: "Select" },
      buttons: [{ action: "cancel", label: "Cancel" }]
    });
    if (!result || result === "cancel") return;
    const select = document.querySelector(".fvn-script-dialog .fvn-script-select");
    if (!select) return;
    const selectedId = select.value;
    const selectedScript = scripts.find(s => s.id === selectedId);
    field.value = selectedId;
    nameDisplay.textContent = selectedScript ? selectedScript.name : "";
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  wrapper.appendChild(btn);
  wrapper.appendChild(nameDisplay);
  const syncName = async () => {
    const val = field.value;
    if (!val) { nameDisplay.textContent = ""; return; }
    const data = await game.settings?.get("free-visual-novel", "vndata");
    const script = (data?.scripts || []).find(s => s.id === val);
    nameDisplay.textContent = script ? script.name : "(not found)";
  };
  field.addEventListener("change", syncName);
  syncName();
});
