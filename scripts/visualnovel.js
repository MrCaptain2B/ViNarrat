const _AppBase = foundry.applications?.api?.Application || foundry.applications?.api?.ApplicationV2;
if (!_AppBase) {
  console.error("FreeVisualNovel | Application class not found.");
} else {
  _defineModule(_AppBase);
}

function _defineModule(AppBase) {

/* ─────────────── Data Store ─────────────── */
const DATA_KEY = "vndata";

function _defaultData() {
  return {
    locations: [],
    portraits: [],
    presets: [],
    nextLocId: 1,
    nextPortId: 1,
    nextPresetId: 1
  };
}

async function _loadData() {
  let data = game.settings?.get("free-visual-novel", DATA_KEY);
  if (!data) data = _defaultData();
  return data;
}

async function _saveData(data) {
  await game.settings?.set("free-visual-novel", DATA_KEY, data);
}

/* ─────────────── Main VN App ─────────────── */
class VisualNovelApp extends AppBase {
  static DEFAULT_OPTIONS = {
    id: "free-visual-novel",
    title: "Free Visual Dialogs",
    template: "modules/free-visual-novel/templates/visualnovel.hbs",
    window: {
      width: window.innerWidth,
      height: window.innerHeight,
      positioned: true,
      minimizable: false,
      resizable: false,
      frame: false,
      controls: []
    },
    classes: ["free-visual-novel", "vn-fullscreen"],
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  constructor(options = {}) {
    super(options);
    this._ready = false;
    this._data = null;

    this._bg = "";
    this._portraits = [];
    this._speaker = "";
    this._requests = [];
    this._saving = false;
    this._hideBg = false;
    this._hideUI = false;
    this._showPanel = null;
    this._dragState = null;
    this._dragCleanup = null;
    this._selectedPortraitIdx = null;
    this._currentLocationId = null;
    this._broadcasting = false;
    this._locGroupFilter = "";
    this._portGroupFilter = "";
  }

  /* ── Init ── */
  async _initialize() {
    this._data = await _loadData();
    this._ready = true;
  }

  /* ── Context ── */
  async _prepareContext() {
    if (!this._ready) await this._initialize();

    const portraits = this._portraits.map((p, i) => ({
      ...p,
      index: i,
      speaking: this._speaker === p.id,
      selected: this._selectedPortraitIdx === i
    }));

    const speakerPortrait = this._portraits.find(p => p.id === this._speaker);
    const selPort = this._selectedPortraitIdx !== null ? portraits[this._selectedPortraitIdx] : null;
    const allLocations = this._data?.locations || [];
    const allPortraits = this._data?.portraits || [];
    const locGroups = [...new Set(allLocations.map(l => l.group || "").filter(Boolean))];
    const portGroups = [...new Set(allPortraits.map(p => p.group || "").filter(Boolean))];
    const role = game.user?.role || 0;
    const canManage = role >= 3;
    return {
      bg: this._hideBg ? "" : this._bg,
      hideUI: this._hideUI,
      portraits,
      speaker: speakerPortrait ? speakerPortrait.name : "",
      speakerId: this._speaker,
      broadcasting: this._broadcasting,
      requests: this._requests,
      isGM: game.user?.isGM,
      canManage,
      showPanel: this._showPanel,
      locations: allLocations,
      allPortraits,
      locGroupFilter: this._locGroupFilter,
      portGroupFilter: this._portGroupFilter,
      locGroups,
      portGroups,
      presets: this._data?.presets || [],
      selectedPortrait: selPort
    };
  }

  async _renderHTML(context, options) {
    const path = "modules/free-visual-novel/templates/visualnovel.hbs";
    const resp = await fetch(path);
    const source = await resp.text();
    const template = Handlebars.compile(source);
    return template(context);
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    this._contentEl = content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._adjustForSidebar();
    if (this._showPanel === "locations") this._bindLocationPanel();
    else if (this._showPanel === "portraits") this._bindPortraitPanel();
    else if (this._showPanel === "scene") this._bindScenePanel();
    else if (this._showPanel === "presets") this._bindPresetsPanel();
    else this._bindMainUI();
  }

  _adjustForSidebar() {
    const sidebar = document.getElementById("sidebar");
    const w = sidebar && !sidebar.classList.contains("collapsed") ? "300px" : "0px";
    this.element?.style.setProperty("--sidebar-w", w);
  }

  _el() {
    return this._contentEl || this.element;
  }

  /* ─────────────── MAIN UI ─────────────── */
  _bindMainUI() {
    const html = this._el();

    if (game.user?.role >= 3) {
      html.querySelector(".vn-btn-locations")?.addEventListener("click", () => {
        this._showPanel = "locations";
        this.render();
      });
      html.querySelector(".vn-btn-portraits")?.addEventListener("click", () => {
        this._showPanel = "portraits";
        this.render();
      });
      html.querySelector(".vn-btn-scene")?.addEventListener("click", () => {
        this._showPanel = "scene";
        this.render();
      });
      html.querySelector(".vn-btn-toggle-bg")?.addEventListener("click", () => {
        this._hideBg = !this._hideBg;
        this.render();
      });
      html.querySelector(".vn-btn-presets")?.addEventListener("click", () => {
        this._showPanel = "presets";
        this.render();
      });
      // html.querySelector(".vn-btn-save-preset")?.addEventListener("click", async () => {
      //   const name = prompt("Preset name:");
      //   if (!name) return;
      //   await this._savePreset(name);
      //   ui.notifications?.info(`Preset "${name}" saved`);
      //   this.render();
      // });
      html.querySelector(".vn-btn-toggle-ui")?.addEventListener("click", () => {
        this._hideUI = !this._hideUI;
        this.render();
      });
      html.querySelector(".vn-btn-broadcast")?.addEventListener("click", () => {
        this._broadcasting = !this._broadcasting;
        if (this._broadcasting) {
          _broadcastVNState(this, true);
        } else {
          game.socket?.emit(SOCKET, { type: "stop" });
        }
        this.render();
      });
    }

    html.querySelector(".vn-btn-close")?.addEventListener("click", () => this.close());

    this._bindPortraitDrag(html);

    // Speaker selector (GM only)
    html.querySelectorAll(".vn-speaker-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._speaker = this._speaker === id ? "" : id;
        this.render();
        this._broadcast();
      });
    });

    // Portrait hover controls (managers only)
    html.querySelectorAll(".vn-port-scale-inline").forEach(slider => {
      const idx = parseInt(slider.dataset.portIdx);
      slider.addEventListener("input", (ev) => {
        const val = parseFloat(ev.currentTarget.value);
        if (this._portraits[idx]) {
          this._portraits[idx].scale = val;
          const el = html.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) {
            const flip = this._portraits[idx].flip ? "scaleX(-1)" : "";
            el.style.transform = `scale(${val}) ${flip}`;
          }
        }
      });
    });
    html.querySelectorAll(".vn-port-lock").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (this._portraits[idx]) {
          this._portraits[idx].locked = !this._portraits[idx].locked;
          this.render();
        }
      });
    });
    html.querySelectorAll(".vn-port-bring-forward").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (idx < this._portraits.length - 1) {
          [this._portraits[idx], this._portraits[idx+1]] = [this._portraits[idx+1], this._portraits[idx]];
          this.render();
          this._broadcast();
        }
      });
    });
    html.querySelectorAll(".vn-port-send-backward").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (idx > 0) {
          [this._portraits[idx-1], this._portraits[idx]] = [this._portraits[idx], this._portraits[idx-1]];
          this.render();
          this._broadcast();
        }
      });
    });
    html.querySelectorAll(".vn-port-remove").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        this._portraits.splice(idx, 1);
        this.render();
        this._broadcast();
      });
    });

    // Request resolve
    html.querySelectorAll(".vn-request-resolve")?.forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._requests = this._requests.filter(r => r.id !== id);
        this.render();
      });
    });
  }

  _broadcast() {
    _broadcastVNState(this);
  }

  async _savePreset(name) {
    const preset = {
      id: String(this._data.nextPresetId++),
      name,
      bg: this._bg,
      portraits: JSON.parse(JSON.stringify(this._portraits)),
      speaker: this._speaker
    };
    this._data.presets.push(preset);
    await _saveData(this._data);
  }

  _loadPreset(id) {
    const preset = this._data?.presets.find(p => p.id === id);
    if (!preset) return false;
    this._bg = preset.bg || "";
    this._portraits = JSON.parse(JSON.stringify(preset.portraits || []));
    this._speaker = preset.speaker || "";
    this._showPanel = null;
    return true;
  }

  /* ─────────────── LOCATION PANEL ─────────────── */
  _bindLocationPanel() {
    const html = this._el();

    const searchInput = html.querySelector(".vn-loc-search");
    if (searchInput) {
      searchInput.addEventListener("input", (ev) => {
        const q = ev.target.value.toLowerCase();
        html.querySelectorAll(".vn-loc-item").forEach(el => {
          const match = el.dataset.search?.toLowerCase().includes(q);
          el.style.display = match ? "" : "none";
        });
      });
    }

    const groupSelect = html.querySelector(".vn-loc-group-filter");
    if (groupSelect) {
      groupSelect.value = this._locGroupFilter;
      groupSelect.addEventListener("change", (ev) => {
        this._locGroupFilter = ev.target.value;
        this.render();
      });
    }

    html.querySelectorAll(".vn-loc-select").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const loc = this._data?.locations.find(l => l.id === id);
        if (loc) {
          this._bg = loc.background || "";
          this._showPanel = null;
          this._currentLocationId = id;
          this.render();
          this._broadcast();
        }
      });
    });

    html.querySelectorAll(".vn-loc-delete").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!id) return;
        this._data.locations = this._data.locations.filter(l => l.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });

    html.querySelector(".vn-loc-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    this._bindAddLocation(html);
  }

  _bindAddLocation(html) {
    const form = html.querySelector(".vn-loc-form");
    if (!form) return;
    form.querySelector(".vn-loc-save")?.addEventListener("click", async () => {
      if (this._saving) return;
      this._saving = true;
      const name = form.querySelector(".vn-loc-f-name")?.value?.trim();
      if (!name) { this._saving = false; return ui.notifications?.warn("Enter location name"); }
      const loc = {
        id: String(this._data.nextLocId++),
        name,
        background: form.querySelector(".vn-loc-f-bg")?.value?.trim() || "",
        group: form.querySelector(".vn-loc-f-group")?.value?.trim() || "",
        tags: (form.querySelector(".vn-loc-f-tags")?.value?.trim() || "").split(",").map(s => s.trim()).filter(Boolean),
        parent: form.querySelector(".vn-loc-f-parent")?.value?.trim() || "",
        weather: form.querySelector(".vn-loc-f-weather")?.value?.trim() || ""
      };
      this._data.locations.push(loc);
      await _saveData(this._data);
      form.querySelector(".vn-loc-f-name").value = "";
      form.querySelector(".vn-loc-f-bg").value = "";
      form.querySelector(".vn-loc-f-tags").value = "";
      form.querySelector(".vn-loc-f-parent").value = "";
      form.querySelector(".vn-loc-f-weather").value = "";
      this._saving = false;
      this.render();
    });
    form.querySelector(".vn-loc-fp")?.addEventListener("click", () => {
      try {
        const fp = new FilePicker({ type: "image", current: "", callback: (path) => {
          form.querySelector(".vn-loc-f-bg").value = path;
        }});
        fp.render(true);
      } catch(e) { console.error("FilePicker error:", e); }
    });
  }

  /* ─────────────── PORTRAIT PANEL ─────────────── */
  _bindPortraitPanel() {
    const html = this._el();

    const searchInput = html.querySelector(".vn-port-search");
    if (searchInput) {
      searchInput.addEventListener("input", (ev) => {
        const q = ev.target.value.toLowerCase();
        html.querySelectorAll(".vn-port-item").forEach(el => {
          const match = el.dataset.search?.toLowerCase().includes(q);
          el.style.display = match ? "" : "none";
        });
      });
    }

    const groupSelect = html.querySelector(".vn-port-group-filter");
    if (groupSelect) {
      groupSelect.value = this._portGroupFilter;
      groupSelect.addEventListener("change", (ev) => {
        this._portGroupFilter = ev.target.value;
        this.render();
      });
    }

    html.querySelectorAll(".vn-port-add-to-stage").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const port = this._data?.portraits.find(p => p.id === id);
        if (port && this._portraits.length < 10) {
          this._portraits.push({
            ...port,
            x: 50 + this._portraits.length * 180,
            y: 200,
            scale: 1,
            flip: false,
            locked: false
          });
          this._showPanel = null;
          this.render();
          this._broadcast();
        }
      });
    });

    html.querySelectorAll(".vn-port-delete").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!id) return;
        this._data.portraits = this._data.portraits.filter(p => p.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });

    html.querySelector(".vn-port-import")?.addEventListener("click", () => {
      _importActorPortraits();
    });

    html.querySelector(".vn-port-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    this._bindAddPortrait(html);
  }

  _bindAddPortrait(html) {
    const form = html.querySelector(".vn-port-form");
    if (!form) return;
    form.querySelector(".vn-port-save")?.addEventListener("click", async () => {
      if (this._saving) return;
      this._saving = true;
      const name = form.querySelector(".vn-port-f-name")?.value?.trim();
      if (!name) { this._saving = false; return ui.notifications?.warn("Enter portrait name"); }
      const port = {
        id: String(this._data.nextPortId++),
        name,
        title: form.querySelector(".vn-port-f-title")?.value?.trim() || "",
        group: form.querySelector(".vn-port-f-group")?.value?.trim() || "",
        image: form.querySelector(".vn-port-f-img")?.value?.trim() || "",
        actorId: form.querySelector(".vn-port-f-actor")?.value?.trim() || ""
      };
      this._data.portraits.push(port);
      await _saveData(this._data);
      this._saving = false;
      form.querySelector(".vn-port-f-name").value = "";
      form.querySelector(".vn-port-f-title").value = "";
      form.querySelector(".vn-port-f-img").value = "";
      form.querySelector(".vn-port-f-actor").value = "";
      this.render();
    });
    form.querySelector(".vn-port-fp")?.addEventListener("click", () => {
      try {
        const fp = new FilePicker({ type: "image", current: "", callback: (path) => {
          form.querySelector(".vn-port-f-img").value = path;
        }});
        fp.render(true);
      } catch(e) { console.error("FilePicker error:", e); }
    });
  }

  /* ─────────────── SCENE PANEL ─────────────── */
  _bindScenePanel() {
    const html = this._el();

    html.querySelector(".vn-scene-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    // Stage portrait management (in scene panel)
    html.querySelectorAll(".vn-scene-port-row").forEach(el => {
      const idx = parseInt(el.dataset.idx);
      const port = this._portraits[idx];
      if (!port) return;

      el.querySelector(".vn-scene-port-remove")?.addEventListener("click", () => {
        this._portraits.splice(idx, 1);
        this.render();
        this._broadcast();
      });

      el.querySelector(".vn-scene-port-flip")?.addEventListener("click", () => {
        this._portraits[idx].flip = !this._portraits[idx].flip;
        this.render();
        this._broadcast();
      });

      el.querySelector(".vn-scene-port-scale")?.addEventListener("input", (ev) => {
        this._portraits[idx].scale = parseFloat(ev.target.value) || 1;
      });

      el.querySelector(".vn-scene-port-left")?.addEventListener("click", () => {
        if (idx > 0) {
          [this._portraits[idx-1], this._portraits[idx]] = [this._portraits[idx], this._portraits[idx-1]];
          this.render();
          this._broadcast();
        }
      });

      el.querySelector(".vn-scene-port-right")?.addEventListener("click", () => {
        if (idx < this._portraits.length - 1) {
          [this._portraits[idx], this._portraits[idx+1]] = [this._portraits[idx+1], this._portraits[idx]];
          this.render();
          this._broadcast();
        }
      });
    });

    // Presets
    html.querySelector(".vn-preset-save")?.addEventListener("click", async () => {
      const name = html.querySelector(".vn-preset-name-input")?.value?.trim();
      if (!name) return ui.notifications?.warn("Enter a preset name");
      await this._savePreset(name);
      ui.notifications?.info(`Preset "${name}" saved`);
      this.render();
    });

    html.querySelectorAll(".vn-preset-load").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!this._loadPreset(btn.dataset.id)) return;
        this.render();
        this._broadcast();
      });
    });

    html.querySelectorAll(".vn-preset-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        this._data.presets = this._data.presets.filter(p => p.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });
  }

  /* ─────────────── PRESETS PANEL ─────────────── */
  _bindPresetsPanel() {
    const html = this._el();

    html.querySelector(".vn-presets-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    html.querySelector(".vn-presets-save-btn")?.addEventListener("click", async () => {
      const name = html.querySelector(".vn-presets-name-input")?.value?.trim();
      if (!name) return ui.notifications?.warn("Enter a preset name");
      await this._savePreset(name);
      ui.notifications?.info(`Preset "${name}" saved`);
      this.render();
    });

    html.querySelectorAll(".vn-presets-load").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!this._loadPreset(btn.dataset.id)) return;
        this.render();
        this._broadcast();
      });
    });

    html.querySelectorAll(".vn-presets-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        this._data.presets = this._data.presets.filter(p => p.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });
  }

  /* ─────────────── PORTRAIT DRAG ─────────────── */
  _bindPortraitDrag(html) {
    if (this._dragCleanup) this._dragCleanup();
    if (this._showPanel) return;

    const container = html;

    const onClick = (ev) => {
      if (ev.target.closest(".vn-portrait-controls")) return;
      const el = ev.target.closest(".vn-portrait");
      if (!el) {
        this._selectedPortraitIdx = null;
        this.render();
        return;
      }
      const idx = parseInt(el.dataset.portIdx);
      this._selectedPortraitIdx = this._selectedPortraitIdx === idx ? null : idx;
      this.render();
    };

    const onDown = (ev) => {
      const el = ev.target.closest(".vn-portrait");
      if (!el) return;
      const idx = parseInt(el.dataset.portIdx);
      if (isNaN(idx)) return;
      const portrait = this._portraits[idx];
      if (!portrait) return;
      if (portrait.locked) return;
      if (ev.target.closest(".vn-portrait-controls")) return;
      ev.preventDefault();
      const rect = container.getBoundingClientRect();
      this._dragState = {
        index: idx,
        ox: ev.clientX - rect.left - portrait.x,
        oy: ev.clientY - rect.top - portrait.y
      };
    };
    const onMove = (ev) => {
      if (!this._dragState) return;
      const rect = container.getBoundingClientRect();
      const p = this._portraits[this._dragState.index];
      if (!p) return;
      p.x = Math.round(ev.clientX - rect.left - this._dragState.ox);
      p.y = Math.round(ev.clientY - rect.top - this._dragState.oy);
      const el = container.querySelector(`.vn-portrait[data-port-idx="${this._dragState.index}"]`);
      if (el) {
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
      }
    };
    const onUp = () => { this._dragState = null; };
    container.addEventListener("click", onClick);
    container.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    this._dragCleanup = () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }

  /* ─────────────── REQUESTS (GM) ─────────────── */
  addRequest(text, priority = "normal") {
    this._requests.push({
      id: foundry.utils.randomID(),
      playerId: game.user?.id || "",
      playerName: game.user?.name || "Unknown",
      text,
      priority,
      timestamp: Date.now()
    });
    if (this.rendered) this.render();
  }

  /* ─────────────── EXTERNAL API ─────────────── */
  setBackground(path) {
    this._bg = path;
    if (this.rendered) { this.render(); this._broadcast(); }
  }

  addPortraitToStage(portraitId) {
    const port = this._data?.portraits.find(p => p.id === portraitId);
    if (port && this._portraits.length < 10) {
      this._portraits.push({
        ...port,
        x: 50 + this._portraits.length * 180,
        y: 150,
        scale: 1.5,
        flip: false,
        locked: false
      });
      if (this.rendered) { this.render(); this._broadcast(); }
    }
  }

  clearStage() {
    this._bg = "";
    this._portraits = [];
    this._speaker = "";
    if (this.rendered) { this.render(); this._broadcast(); }
  }

  /* ── Lifecycle ── */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element?.classList.add("vn-fullscreen-active");
    this._onRender(context, options);
  }

  _onClose(options) {
    if (this._dragCleanup) this._dragCleanup();
    this.element?.classList.remove("vn-fullscreen-active");
  }
}

/* ─────────────── Socket Broadcast ─────────────── */
const SOCKET = "module.free-visual-novel";

function _broadcastVNState(app, force) {
  if (!game.user || game.user.role < 3) return;
  if (!app._broadcasting && !force) return;
  game.socket?.emit(SOCKET, {
    type: "state",
    broadcasting: app._broadcasting,
    bg: app._bg,
    portraits: app._portraits,
    speaker: app._speaker
  });
}

function _applyVNState(data) {
  if (!game.user || game.user.role >= 3) return;
  if (!data.broadcasting) {
    ui.freevisualnovel?.close();
    return;
  }
  let app = ui.freevisualnovel;
  if (!app) {
    app = new VisualNovelApp();
    ui.freevisualnovel = app;
  }
  app._bg = data.bg || "";
  app._portraits = data.portraits || [];
  app._speaker = data.speaker || "";
  app.render(true);
}

/* ─────────────── Handlebars Helpers ─────────────── */
Handlebars.registerHelper("eq", function(v1, v2) {
  return v1 === v2;
});

/* ─────────────── Hooks ─────────────── */
Hooks.once("init", async function() {
  game.settings?.register("free-visual-novel", DATA_KEY, {
    scope: "world",
    type: Object,
    default: _defaultData(),
    config: false
  });

  game.settings?.register("free-visual-novel", "defaultPortraitFolder", {
    scope: "world",
    type: String,
    default: "",
    config: true,
    name: "Default Portrait Folder",
    hint: "Path to folder containing actor portraits for auto-import (e.g. worlds/my-world/portraits)"
  });

  const hasEpicRolls = game.modules?.get("epic-rolls")?.active ?? false;
  const hasSequencer = game.modules?.get("sequencer")?.active ?? false;

  game.socket?.on(SOCKET, (data) => {
    if (data?.type === "state") _applyVNState(data);
    else if (data?.type === "stop") { ui.freevisualnovel?.close(); }
  });

  game.freevisualnovel = {
    _hasEpicRolls: hasEpicRolls,
    _hasSequencer: hasSequencer,
    open() {
      _openVN();
    },
    close() {
      ui.freevisualnovel?.close();
    },
    setBackground(path) {
      ui.freevisualnovel?.setBackground(path);
    },
    addPortrait(id) {
      ui.freevisualnovel?.addPortraitToStage(id);
    },
    addRequest(text, priority) {
      ui.freevisualnovel?.addRequest(text, priority);
    },
    clearStage() {
      ui.freevisualnovel?.clearStage();
    },
    importActorPortraits(folderPath) {
      _importActorPortraits(folderPath);
    }
  };
});

/* ─────────────── Mass Import ─────────────── */
async function _importActorPortraits(folderPath) {
  if (!folderPath) {
    folderPath = game.settings?.get("free-visual-novel", "defaultPortraitFolder");
  }
  if (!folderPath) {
    try {
      const fp = new FilePicker({ type: "folder", current: "", callback: (path) => {
        _importActorPortraits(path);
      }});
      fp.render(true);
    } catch(e) { console.error("FilePicker error:", e); }
    return;
  }

  let fileList;
  try {
    const result = await FilePicker.browse("data", folderPath);
    fileList = result.files || [];
  } catch(e) {
    ui.notifications?.error(`Cannot browse folder: ${folderPath}`);
    return;
  }
  if (!fileList.length) {
    ui.notifications?.info("No files found in the portrait folder");
    return;
  }

  const data = await _loadData();
  let count = 0;

  // Build a lookup: normalize file basename -> file path
  const fileMap = {};
  for (const f of fileList) {
    const base = f.replace(/^.*[\\\/]/, "").replace(/\.[^.]+$/, "").toLowerCase();
    fileMap[base] = f;
  }

  for (const actor of game.actors) {
    if (data.portraits.some(p => p.actorId === actor.id)) continue;

    const searchName = actor.name.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]/g, "");
    const foundPath = fileMap[searchName] || fileMap[actor.name.toLowerCase()];

    if (!foundPath) continue;

    data.portraits.push({
      id: String(data.nextPortId++),
      name: actor.name,
      title: "",
      image: foundPath,
      actorId: actor.id
    });
    count++;
  }

  if (count > 0) {
    await _saveData(data);
    ui.notifications?.info(`Imported ${count} actor portrait(s)`);
    ui.freevisualnovel?.render(true);
  } else {
    ui.notifications?.info("No new portraits found to import");
  }
}

/* ─────────────── Chat Command ─────────────── */
Hooks.on("chatMessage", (message, text) => {
  if (text.startsWith("/vnreq ")) {
    const reqText = text.slice(7).trim();
    if (reqText && ui.freevisualnovel) {
      ui.freevisualnovel.addRequest(reqText, "normal");
    }
    return false;
  }
  if (text === "/vnreq" || text === "/vnrequest") {
    ui.notifications?.info("Usage: /vnreq <your request text>");
    return false;
  }
});

let _vnOpening = false;
function _openVN() {
  if (_vnOpening) return;
  _vnOpening = true;
  if (ui.freevisualnovel?.rendered) {
    ui.freevisualnovel.render(true);
    _vnOpening = false;
    return;
  }
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    app.render(true);
  } catch(e) {
    console.error("FreeVisualNovel | Failed to open:", e);
    ui.notifications?.error("Free Visual Novel: failed to open");
  }
  _vnOpening = false;
}

/* function _showPresetPicker() {
  _loadData().then(data => {
    if (!data.presets.length) {
      ui.notifications?.warn("No presets available. Open New Dialogue and save a preset first.");
      return;
    }
    const items = data.presets.map(p =>
      `<button class="vn-preset-pick" data-id="${p.id}" style="display:block;width:100%;margin:4px 0;padding:6px 12px;text-align:left">${p.name}</button>`
    ).join("");
    const dialog = new Dialog({
      title: "Load Preset",
      content: `<div style="padding:8px;max-height:400px;overflow-y:auto">${items}</div>`,
      buttons: { close: { label: "Cancel" } },
      default: "close",
      render: (html) => {
        html[0].querySelectorAll(".vn-preset-pick").forEach(el => {
          el.addEventListener("click", async () => {
            const id = el.dataset.id;
            dialog.close();
            if (ui.freevisualnovel?.rendered) {
              const app = ui.freevisualnovel;
              if (app._loadPreset(id)) {
                app.render(true);
                app._broadcast();
                ui.notifications?.info("Preset loaded");
              }
            } else {
              try {
                const app = new VisualNovelApp();
                await app._initialize();
                if (app._loadPreset(id)) {
                  ui.freevisualnovel = app;
                  app.render(true);
                  app._broadcast();
                }
              } catch(e) {
                console.error("FreeVisualNovel | Failed to open preset:", e);
                ui.notifications?.error("Failed to load preset");
              }
            }
          });
        });
      }
    });
    dialog.render(true);
  });
} */

Hooks.on("getSceneControlButtons", (t) => {
  if (!canvas) return;
  const group = {
    name: "freevisualnovel",
    title: "Free Visual Dialogs",
    icon: "fas fa-comment-dots",
    layer: "Canvas",
    order: 90,
    tools: {
      launch: {
        name: "launch",
        title: "New Dialogue",
        icon: "fas fa-play",
        button: true,
        visible: true,
        onClick: () => _openVN()
      },
      // presets: {
      //   name: "presets",
      //   title: "Presets",
      //   icon: "fas fa-bookmark",
      //   button: true,
      //   visible: true,
      //   onClick: () => _showPresetPicker()
      // }
    }
  };
  t.freevisualnovel = group;
});

} // end _defineModule
