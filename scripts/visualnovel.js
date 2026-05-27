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
    nextLocId: 1,
    nextPortId: 1
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
    title: "Visual Novel Dialogues",
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
    this._dialogue = "";
    this._speaker = "";
    this._choices = [];
    this._requests = [];
    this._hideBg = false;
    this._hideUI = false;
    this._showPanel = null; // "locations" | "portraits" | "scene"
    this._dragState = null;
    this._dragCleanup = null;
    this._selectedPortrait = null;
    this._currentLocationId = null;
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
      speaking: this._speaker === p.id
    }));

    return {
      bg: this._hideBg ? "" : this._bg,
      hideUI: this._hideUI,
      portraits,
      speaker: this._speaker,
      dialogue: this._dialogue,
      choices: this._choices,
      requests: this._requests,
      isGM: game.user?.isGM,
      showPanel: this._showPanel,
      locations: this._data?.locations || [],
      allPortraits: this._data?.portraits || [],
      selectedPortrait: this._selectedPortrait
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
    this._onRender();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    if (this._showPanel === "locations") this._bindLocationPanel();
    else if (this._showPanel === "portraits") this._bindPortraitPanel();
    else if (this._showPanel === "scene") this._bindScenePanel();
    else this._bindMainUI();
  }

  _el() {
    return this._contentEl || this.element;
  }

  /* ─────────────── MAIN UI ─────────────── */
  _bindMainUI() {
    const html = this._el();

    if (game.user?.isGM) {
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
      html.querySelector(".vn-btn-toggle-ui")?.addEventListener("click", () => {
        this._hideUI = !this._hideUI;
        this.render();
      });
    }

    html.querySelector(".vn-btn-close")?.addEventListener("click", () => this.close());

    this._bindPortraitDrag(html);

    html.querySelectorAll(".vn-choice").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.index);
        const choice = this._choices[idx];
        if (choice && choice.callback) {
          try { new Function(choice.callback)(); } catch(e) { console.error(e); }
        }
      });
    });

    html.querySelectorAll(".vn-request-resolve")?.forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._requests = this._requests.filter(r => r.id !== id);
        this.render();
      });
    });
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

    html.querySelectorAll(".vn-loc-select").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const loc = this._data?.locations.find(l => l.id === id);
        if (loc) {
          this._bg = loc.background || "";
          this._showPanel = null;
          // Store current location in scene state
          this._currentLocationId = id;
          this.render();
        }
      });
    });

    html.querySelector(".vn-loc-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    this._bindAddLocation(html);
  }

  _bindAddLocation(html) {
    const btn = html.querySelector(".vn-loc-add");
    const form = html.querySelector(".vn-loc-form");
    if (!btn || !form) return;
    btn.addEventListener("click", () => {
      form.style.display = form.style.display === "none" ? "block" : "none";
    });
    form.querySelector(".vn-loc-save")?.addEventListener("click", async () => {
      const name = form.querySelector(".vn-loc-f-name")?.value?.trim();
      if (!name) return ui.notifications?.warn("Enter location name");
      const loc = {
        id: String(this._data.nextLocId++),
        name,
        background: form.querySelector(".vn-loc-f-bg")?.value?.trim() || "",
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
      form.style.display = "none";
      this.render();
    });
    form.querySelector(".vn-loc-fp")?.addEventListener("click", () => {
      new FilePicker({ type: "image", current: "", callback: (path) => {
        form.querySelector(".vn-loc-f-bg").value = path;
      }}).render(true);
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
            flip: false
          });
          this._showPanel = null;
          this.render();
        }
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
    const btn = html.querySelector(".vn-port-add");
    const form = html.querySelector(".vn-port-form");
    if (!btn || !form) return;
    btn.addEventListener("click", () => {
      form.style.display = form.style.display === "none" ? "block" : "none";
    });
    form.querySelector(".vn-port-save")?.addEventListener("click", async () => {
      const name = form.querySelector(".vn-port-f-name")?.value?.trim();
      if (!name) return ui.notifications?.warn("Enter portrait name");
      const port = {
        id: String(this._data.nextPortId++),
        name,
        title: form.querySelector(".vn-port-f-title")?.value?.trim() || "",
        image: form.querySelector(".vn-port-f-img")?.value?.trim() || "",
        actorId: form.querySelector(".vn-port-f-actor")?.value?.trim() || ""
      };
      this._data.portraits.push(port);
      await _saveData(this._data);
      form.querySelector(".vn-port-f-name").value = "";
      form.querySelector(".vn-port-f-title").value = "";
      form.querySelector(".vn-port-f-img").value = "";
      form.querySelector(".vn-port-f-actor").value = "";
      form.style.display = "none";
      this.render();
    });
    form.querySelector(".vn-port-fp")?.addEventListener("click", () => {
      new FilePicker({ type: "image", current: "", callback: (path) => {
        form.querySelector(".vn-port-f-img").value = path;
      }}).render(true);
    });
  }

  /* ─────────────── SCENE PANEL ─────────────── */
  _bindScenePanel() {
    const html = this._el();

    html.querySelector(".vn-scene-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    const dialogueInput = html.querySelector(".vn-scene-dialogue");
    if (dialogueInput) {
      dialogueInput.value = this._dialogue;
      dialogueInput.addEventListener("input", (ev) => {
        this._dialogue = ev.target.value;
      });
    }

    const speakerSelect = html.querySelector(".vn-scene-speaker");
    if (speakerSelect) {
      speakerSelect.innerHTML = '<option value="">(narrator)</option>';
      this._portraits.forEach(p => {
        speakerSelect.innerHTML += `<option value="${p.id}" ${this._speaker === p.id ? "selected" : ""}>${p.name}</option>`;
      });
      speakerSelect.addEventListener("change", (ev) => {
        this._speaker = ev.target.value;
      });
    }

    html.querySelector(".vn-scene-apply")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    html.querySelectorAll(".vn-scene-port-remove").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        this._portraits.splice(idx, 1);
        this.render();
      });
    });

    html.querySelectorAll(".vn-scene-port-left, .vn-scene-port-right").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        const dir = ev.currentTarget.classList.contains("vn-scene-port-left") ? -1 : 1;
        const newIdx = Math.max(0, Math.min(this._portraits.length - 1, idx + dir));
        [this._portraits[idx], this._portraits[newIdx]] = [this._portraits[newIdx], this._portraits[idx]];
        this.render();
      });
    });

    html.querySelectorAll(".vn-scene-port-flip").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        this._portraits[idx].flip = !this._portraits[idx].flip;
        this.render();
      });
    });

    html.querySelectorAll(".vn-scene-port-scale").forEach(slider => {
      slider.addEventListener("input", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        this._portraits[idx].scale = parseFloat(ev.currentTarget.value);
        const el = this.element?.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
        if (el) {
          const flip = this._portraits[idx].flip ? "scaleX(-1)" : "";
          el.style.transform = `scale(${this._portraits[idx].scale}) ${flip}`;
        }
      });
    });

    // Choice management
    const choiceInput = html.querySelector(".vn-scene-choice-text");
    const choiceAddBtn = html.querySelector(".vn-scene-choice-add");
    if (choiceInput && choiceAddBtn) {
      choiceAddBtn.addEventListener("click", () => {
        const text = choiceInput.value.trim();
        if (!text) return;
        this._choices.push({ text, callback: "" });
        choiceInput.value = "";
        this.render();
      });
    }

    html.querySelectorAll(".vn-scene-choice-remove").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        this._choices.splice(idx, 1);
        this.render();
      });
    });

    html.querySelectorAll(".vn-scene-choice-cb").forEach(input => {
      input.addEventListener("input", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.idx);
        this._choices[idx].callback = ev.target.value;
      });
    });
  }

  /* ─────────────── PORTRAIT DRAG ─────────────── */
  _bindPortraitDrag(html) {
    if (this._dragCleanup) this._dragCleanup();
    if (this._showPanel) return;

    const container = html;
    const onDown = (ev) => {
      const el = ev.target.closest(".vn-portrait");
      if (!el) return;
      const idx = parseInt(el.dataset.portIdx);
      if (isNaN(idx)) return;
      const portrait = this._portraits[idx];
      if (!portrait) return;
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
    container.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    this._dragCleanup = () => {
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
    if (this.rendered) this.render();
  }

  addPortraitToStage(portraitId) {
    const port = this._data?.portraits.find(p => p.id === portraitId);
    if (port && this._portraits.length < 10) {
      this._portraits.push({
        ...port,
        x: 50 + this._portraits.length * 180,
        y: 200,
        scale: 1,
        flip: false
      });
      if (this.rendered) this.render();
    }
  }

  clearStage() {
    this._bg = "";
    this._portraits = [];
    this._dialogue = "";
    this._speaker = "";
    this._choices = [];
    if (this.rendered) this.render();
  }

  /* ── Lifecycle ── */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element?.classList.add("vn-fullscreen-active");
  }

  _onClose(options) {
    if (this._dragCleanup) this._dragCleanup();
    this.element?.classList.remove("vn-fullscreen-active");
  }
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
    ui.notifications?.warn("Set a default portrait folder in module settings first");
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

function _openVN() {
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    app.render(true);
  } catch(e) {
    console.error("FreeVisualNovel | Failed to open:", e);
    ui.notifications?.error("Free Visual Novel: failed to open");
  }
}

Hooks.on("getSceneControlButtons", (t) => {
  if (!canvas) return;
  const group = {
    name: "freevisualnovel",
    title: "Visual Novel Dialogues",
    icon: "fas fa-comment-dots",
    layer: "Canvas",
    order: 90,
    tools: {
      launch: {
        name: "launch",
        title: "Open Visual Novel Dialogues",
        icon: "fas fa-play",
        button: true,
        visible: true
      }
    },
    activeTool: "launch",
    onChange: (_event, active) => {
      if (active === false) return;
      _openVN();
    }
  };
  t.freevisualnovel = group;
});

} // end _defineModule
