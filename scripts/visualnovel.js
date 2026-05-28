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
    nextPresetId: 1,
    themeBg: "#0d0d1a",
    themeAccent: "#f0c040"
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
    this._locSearch = "";
    this._locTagSearch = "";
    this._locGroupFilter = "";
    this._locListLimit = 30;
    this._editingLocId = null;
    this._editingPortId = null;
    this._portSearch = "";
    this._portTagSearch = "";
    this._portGroupFilter = "";
    this._portListLimit = 30;
    this._bgBrightness = 1;
    this._themeBg = "#0d0d1a";
    this._themeAccent = "#f0c040";
    this._claimed = {};
    this._inviteMode = "all";
    this._showBroadcastMenu = false;
    this._dialog = {
      width: 65,
      height: 160,
      opacity: 0.85,
      align: "left",
      text: "",
      showSpeaker: true,
      fontSize: 16
    };
  }

  /* ── Init ── */
  async _initialize() {
    this._data = await _loadData();
    this._themeBg = game.settings?.get("free-visual-novel", "themeBg") || this._data.themeBg || "#0d0d1a";
    this._themeAccent = game.settings?.get("free-visual-novel", "themeAccent") || this._data.themeAccent || "#f0c040";
    this._dialog = {
      width: parseInt(game.settings?.get("free-visual-novel", "dialogWidth")) || 65,
      height: parseInt(game.settings?.get("free-visual-novel", "dialogHeight")) || 160,
      opacity: parseFloat(game.settings?.get("free-visual-novel", "dialogOpacity")) || 0.85,
      align: game.settings?.get("free-visual-novel", "dialogAlign") || "left",
      text: "",
      showSpeaker: game.settings?.get("free-visual-novel", "dialogShowSpeaker") !== false,
      fontSize: parseInt(game.settings?.get("free-visual-novel", "dialogFontSize")) || 16
    };
    this._speakerFontSize = parseInt(game.settings?.get("free-visual-novel", "speakerFontSize")) || 20;
    this._ready = true;
  }

  /* ── Context ── */
  async _prepareContext() {
    if (!this._ready) await this._initialize();

    const playableEnabled = game.settings?.get("free-visual-novel", "playablePortraits") !== false;
    const portraits = this._portraits.map((p, i) => ({
      ...p,
      index: i,
      speaking: this._speaker === p.id,
      selected: this._selectedPortraitIdx === i,
      currentImg: (p.images && p.images.length) ? p.images[p._currentEmotion || 0] : p.image,
      hasEmotions: (p.images && p.images.length > 1),
      images: (p.images || []).slice(0, 6),
      emotionIdx: p._currentEmotion || 0,
      isMyPortrait: playableEnabled && p.userId === game.user?.id,
      isClaimed: !!this._claimed[p.id]
    }));

    const speakerPortrait = this._portraits.find(p => p.id === this._speaker);
    const selPort = this._selectedPortraitIdx !== null ? portraits[this._selectedPortraitIdx] : null;
    const allLocations = this._data?.locations || [];
    const allPortraits = this._data?.portraits || [];

    // Filter and paginate locations
    let filteredLocs = allLocations;
    if (this._locSearch) {
      const q = this._locSearch.toLowerCase();
      filteredLocs = filteredLocs.filter(l => (l.name + " " + (l.tags||[]).join(" ") + " " + (l.group||"")).toLowerCase().includes(q));
    }
    if (this._locTagSearch) {
      const q = this._locTagSearch.toLowerCase();
      filteredLocs = filteredLocs.filter(l => (l.tags||[]).join(" ").toLowerCase().includes(q));
    }
    if (this._locGroupFilter) {
      filteredLocs = filteredLocs.filter(l => l.group === this._locGroupFilter);
    }
    const locTotal = filteredLocs.length;
    const locRemaining = Math.max(0, locTotal - this._locListLimit);
    const locations = filteredLocs.slice(0, this._locListLimit);

    const role = game.user?.role || 0;
    const canManage = role >= 3;

    // Filter and paginate portraits
    let filteredPorts = allPortraits;
    if (!canManage) {
      filteredPorts = filteredPorts.filter(p => p.userId === game.user?.id);
    }
    if (this._portSearch) {
      const q = this._portSearch.toLowerCase();
      filteredPorts = filteredPorts.filter(p => (p.name + " " + (p.title||"") + " " + (p.tags||[]).join(" ") + " " + (p.group||"")).toLowerCase().includes(q));
    }
    if (this._portTagSearch) {
      const q = this._portTagSearch.toLowerCase();
      filteredPorts = filteredPorts.filter(p => (p.tags||[]).join(" ").toLowerCase().includes(q));
    }
    if (this._portGroupFilter) {
      filteredPorts = filteredPorts.filter(p => p.group === this._portGroupFilter);
    }
    const portTotal = filteredPorts.length;
    const portRemaining = Math.max(0, portTotal - this._portListLimit);
    const filteredPortraits = filteredPorts.slice(0, this._portListLimit);

    const locGroups = [...new Set(allLocations.map(l => l.group || "").filter(Boolean))];
    const portGroups = [...new Set(allPortraits.map(p => p.group || "").filter(Boolean))];
    const users = [...game.users].map(u => ({ id: u.id, name: u.name }));
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
      locations,
      locTotal,
      locRemaining,
      locSearchValue: this._locSearch,
      locTagSearchValue: this._locTagSearch,
      allPortraits: filteredPortraits,
      portTotal,
      portRemaining,
      portSearchValue: this._portSearch,
      portTagSearchValue: this._portTagSearch,
      editingLocId: this._editingLocId,
      editingPortId: this._editingPortId,
      locGroups,
      portGroups,
      presets: this._data?.presets || [],
      users,
      selectedPortrait: selPort,
      bgBrightness: this._bgBrightness,
      inviteMode: this._inviteMode,
      showBroadcastMenu: this._showBroadcastMenu,
      dialog: this._dialog,
      speakerFontSize: this._speakerFontSize,
      themeBg: this._themeBg,
      themeAccent: this._themeAccent
    };
  }

  _applyTheme() {
    const root = this.element?.querySelector(".vn-root") || this.element;
    if (root) {
      root.style.setProperty("--vn-bg", this._themeBg);
      root.style.setProperty("--vn-accent", this._themeAccent);
    }
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
    this._applyTheme();
    if (this._dragCleanup) this._dragCleanup();
    if (this._showPanel === "locations") this._bindLocationPanel();
    else if (this._showPanel === "portraits") this._bindPortraitPanel();
    else if (this._showPanel === "scene") this._bindScenePanel();
    else if (this._showPanel === "presets") this._bindPresetsPanel();
    else this._bindMainUI();
    this._ensureInteractiveLayer();
  }

  _ensureInteractiveLayer() {
    if (!this._interactiveEl) {
      const el = document.createElement("div");
      el.className = "vn-interactive-layer";
      document.body.appendChild(el);
      this._interactiveEl = el;
    }
    this._interactiveEl.innerHTML = "";
    const html = this._el();
    for (const sel of [".vn-gm-toolbar", ".vn-speaker-bar", ".vn-requests",
                       ".vn-panel", ".vn-portrait",
                       ".vn-dialog-box", ".vn-speaker-indicator"]) {
      for (const child of html.querySelectorAll(sel)) {
        this._interactiveEl.appendChild(child);
      }
    }
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
          this._claimed = {};
        }
        this._showBroadcastMenu = false;
        this.render();
      });
      html.querySelector(".vn-broadcast-toggle")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._showBroadcastMenu = !this._showBroadcastMenu;
        this.render();
      });
      html.querySelectorAll(".vn-broadcast-option").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          this._inviteMode = ev.currentTarget.dataset.mode;
          this._showBroadcastMenu = false;
          this.render();
        });
      });
      // Close menu on outside click
      const menuCloser = (ev) => {
        if (this._showBroadcastMenu && !ev.target.closest(".vn-broadcast-wrapper")) {
          this._showBroadcastMenu = false;
          this.render();
        }
      };
      this._broadcastMenuCleanup?.();
      setTimeout(() => document.addEventListener("click", menuCloser), 0);
      this._broadcastMenuCleanup = () => document.removeEventListener("click", menuCloser);
    }

    // Portraits button (all users)
    html.querySelector(".vn-btn-portraits")?.addEventListener("click", () => {
      this._showPanel = "portraits";
      this.render();
    });

    html.querySelector(".vn-btn-close")?.addEventListener("click", () => this.close());

    this._bindPortraitDrag(html);

    // Speaker selector (GM only) — also clears claim if selecting a claimed portrait
    html.querySelectorAll(".vn-speaker-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._speaker = this._speaker === id ? "" : id;
        if (id && this._speaker && this._claimed[id]) {
          delete this._claimed[id];
        }
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
    html.querySelectorAll(".vn-emotion-thumb").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const emo = parseInt(ev.currentTarget.dataset.emotion);
        if (this._portraits[idx] && !isNaN(emo)) {
          this._portraits[idx]._currentEmotion = emo;
          const frame = html.querySelector(`.vn-portrait[data-port-idx="${idx}"] .vn-portrait-frame`);
          const oldImg = frame?.querySelector(".vn-portrait-img");
          const imgs = this._portraits[idx].images || [this._portraits[idx].image];
          if (oldImg && imgs[emo]) {
            const overlay = document.createElement("img");
            overlay.className = "vn-portrait-overlay";
            overlay.src = imgs[emo];
            overlay.alt = oldImg.alt || "";
            frame.appendChild(overlay);
            requestAnimationFrame(() => {
              oldImg.style.opacity = 0;
              overlay.style.opacity = 1;
            });
            setTimeout(() => {
              oldImg.style.transition = "none";
              oldImg.src = imgs[emo];
              oldImg.style.opacity = 1;
              overlay.remove();
              oldImg.offsetHeight;
              oldImg.style.transition = "";
            }, 400);
          }
          if (game.user?.role >= 3) {
            this._broadcast();
          } else {
            const p = this._portraits[idx];
            if (p) game.socket?.emit(SOCKET, { type: "emotion", portraitId: p.id, emotionIdx: emo });
          }
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
    html.querySelectorAll(".vn-port-flip").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (this._portraits[idx]) {
          this._portraits[idx].flip = !this._portraits[idx].flip;
          const el = html.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) {
            const p = this._portraits[idx];
            el.style.transform = `scale(${p.scale}) ${p.flip ? "scaleX(-1)" : ""}`;
          }
          this._broadcast();
        }
      });
    });

    // Attention button (player claims attention)
    html.querySelectorAll(".vn-attention-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const p = this._portraits[idx];
        if (!p) return;
        const newClaim = !this._claimed[p.id];
        if (newClaim) {
          this._claimed[p.id] = true;
        } else {
          delete this._claimed[p.id];
        }
        this.render();
        // Notify GM about claim change
        game.socket?.emit(SOCKET, { type: "claim", portraitId: p.id, claimed: newClaim });
      });
    });

    // Approve button (GM accepts claim)
    html.querySelectorAll(".vn-approve-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const p = this._portraits[idx];
        if (!p) return;
        this._speaker = p.id;
        delete this._claimed[p.id];
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
    this._claimed = {};
    this._showPanel = null;
    return true;
  }

  /* ─────────────── LOCATION PANEL ─────────────── */
  _bindLocationPanel() {
    const html = this._el();

    const locGroup = html.querySelector(".vn-loc-group-filter");
    if (locGroup) locGroup.value = this._locGroupFilter;

    const _filterLocDOM = () => {
      const sq = this._locSearch.toLowerCase();
      const tq = this._locTagSearch.toLowerCase();
      const gv = this._locGroupFilter;
      html.querySelectorAll(".vn-loc-item").forEach(el => {
        const name = (el.dataset.name || "").toLowerCase();
        const tags = (el.dataset.tags || "").toLowerCase();
        const group = (el.dataset.group || "").toLowerCase();
        const sOk = !sq || name.includes(sq) || tags.includes(sq) || group.includes(sq);
        const tOk = !tq || tags.includes(tq);
        const gOk = !gv || group === gv;
        el.style.display = (sOk && tOk && gOk) ? "" : "none";
      });
    };
    html.querySelector(".vn-loc-search")?.addEventListener("input", (ev) => {
      this._locSearch = ev.target.value;
      _filterLocDOM();
    });
    html.querySelector(".vn-loc-tag-filter")?.addEventListener("input", (ev) => {
      this._locTagSearch = ev.target.value;
      _filterLocDOM();
    });
    locGroup?.addEventListener("change", (ev) => {
      this._locGroupFilter = ev.target.value;
      this.render();
    });
    html.querySelector(".vn-loc-show-more")?.addEventListener("click", () => {
      this._locListLimit += 30;
      this.render();
    });

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

    html.querySelectorAll(".vn-loc-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const loc = this._data?.locations.find(l => l.id === id);
        if (!loc) return;
        this._editingLocId = id;
        this.render();
      });
    });

    html.querySelector(".vn-loc-back")?.addEventListener("click", () => {
      this._editingLocId = null;
      this._showPanel = null;
      this.render();
    });

    // Populate form when editing
    if (this._editingLocId) {
      const loc = this._data?.locations.find(l => l.id === this._editingLocId);
      if (loc) {
        const f = html.querySelector(".vn-loc-form");
        if (f) {
          f.querySelector(".vn-loc-f-name").value = loc.name || "";
          f.querySelector(".vn-loc-f-group").value = loc.group || "";
          f.querySelector(".vn-loc-f-bg").value = loc.background || "";
          f.querySelector(".vn-loc-f-tags").value = (loc.tags || []).join(", ");
          f.querySelector(".vn-loc-f-parent").value = loc.parent || "";
          f.querySelector(".vn-loc-f-weather").value = loc.weather || "";
        }
      }
    }
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
      const data = {
        name,
        background: form.querySelector(".vn-loc-f-bg")?.value?.trim() || "",
        group: form.querySelector(".vn-loc-f-group")?.value?.trim() || "",
        tags: (form.querySelector(".vn-loc-f-tags")?.value?.trim() || "").split(",").map(s => s.trim()).filter(Boolean),
        parent: form.querySelector(".vn-loc-f-parent")?.value?.trim() || "",
        weather: form.querySelector(".vn-loc-f-weather")?.value?.trim() || ""
      };
      if (this._editingLocId) {
        const idx = this._data.locations.findIndex(l => l.id === this._editingLocId);
        if (idx !== -1) Object.assign(this._data.locations[idx], data);
        this._editingLocId = null;
      } else {
        this._data.locations.push({ id: String(this._data.nextLocId++), ...data });
      }
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

    const portGroup = html.querySelector(".vn-port-group-filter");
    if (portGroup) portGroup.value = this._portGroupFilter;

    const _filterPortDOM = () => {
      const sq = this._portSearch.toLowerCase();
      const tq = this._portTagSearch.toLowerCase();
      const gv = this._portGroupFilter;
      html.querySelectorAll(".vn-port-item").forEach(el => {
        const name = (el.dataset.name || "").toLowerCase();
        const tags = (el.dataset.tags || "").toLowerCase();
        const group = (el.dataset.group || "").toLowerCase();
        const sOk = !sq || name.includes(sq) || tags.includes(sq) || group.includes(sq);
        const tOk = !tq || tags.includes(tq);
        const gOk = !gv || group === gv;
        el.style.display = (sOk && tOk && gOk) ? "" : "none";
      });
    };
    html.querySelector(".vn-port-search")?.addEventListener("input", (ev) => {
      this._portSearch = ev.target.value;
      _filterPortDOM();
    });
    html.querySelector(".vn-port-tag-filter")?.addEventListener("input", (ev) => {
      this._portTagSearch = ev.target.value;
      _filterPortDOM();
    });
    portGroup?.addEventListener("change", (ev) => {
      this._portGroupFilter = ev.target.value;
      this.render();
    });
    html.querySelector(".vn-port-show-more")?.addEventListener("click", () => {
      this._portListLimit += 30;
      this.render();
    });

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

    html.querySelectorAll(".vn-port-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const port = this._data?.portraits.find(p => p.id === id);
        if (!port) return;
        this._editingPortId = id;
        this.render();
      });
    });

    html.querySelector(".vn-port-import")?.addEventListener("click", () => {
      _importActorPortraits();
    });

    html.querySelector(".vn-port-back")?.addEventListener("click", () => {
      this._editingPortId = null;
      this._showPanel = null;
      this.render();
    });

    // Populate form when editing
    if (this._editingPortId) {
      const port = this._data?.portraits.find(p => p.id === this._editingPortId);
      if (port) {
        const f = html.querySelector(".vn-port-form");
        if (f) {
          f.querySelector(".vn-port-f-name").value = port.name || "";
          f.querySelector(".vn-port-f-group").value = port.group || "";
          f.querySelector(".vn-port-f-title").value = port.title || "";
          f.querySelector(".vn-port-f-tags").value = (port.tags || []).join(", ");
          f.querySelector(".vn-port-f-img").value = port.image || "";
          f.querySelector(".vn-port-f-actor").value = port.actorId || "";
          const us = f.querySelector(".vn-port-f-user");
          if (us) us.value = port.userId || "";
          // Load emotion rows
          const list = f.querySelector(".vn-emotion-list");
          const tpl = f.querySelector(".vn-emotion-row-tpl");
          if (list && tpl && port.images && port.images.length > 1) {
            for (let i = 1; i < port.images.length; i++) {
              const el = tpl.content.cloneNode(true);
              el.querySelector(".vn-emotion-path").value = port.images[i] || "";
              if (this._bindEmotionRow) this._bindEmotionRow(el);
              list.appendChild(el);
            }
            list.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
            if (this._updateEmotionAddBtn) this._updateEmotionAddBtn();
          }
        }
      }
    }

    this._bindAddPortrait(html);
  }

  _bindAddPortrait(html) {
    const form = html.querySelector(".vn-port-form");
    if (!form) return;

    const MAX_EMOTIONS = 5;
    const ec = () => form.querySelectorAll(".vn-emotion-row").length;
    const ueb = () => {
      const btn = form.querySelector(".vn-emotion-add");
      if (!btn) return;
      const c = ec();
      btn.disabled = c >= MAX_EMOTIONS;
      btn.textContent = c >= MAX_EMOTIONS ? `Max ${MAX_EMOTIONS} emotions` : `Add emotion (${c}/${MAX_EMOTIONS})`;
    };
    this._readEmotions = () => {
      const paths = [];
      form.querySelectorAll(".vn-emotion-path").forEach(inp => {
        const v = inp.value.trim();
        if (v) paths.push(v);
      });
      return paths.slice(0, MAX_EMOTIONS);
    };
    this._resetEmotions = () => {
      const list = form.querySelector(".vn-emotion-list");
      if (list) list.innerHTML = "";
      ueb();
    };
    this._bindEmotionRow = (el) => {
      const inp = el.querySelector(".vn-emotion-path");
      el.querySelector(".vn-emotion-remove")?.addEventListener("click", (ev) => {
        const row = ev.currentTarget.closest(".vn-emotion-row");
        row?.parentElement?.removeChild(row);
        const list = form.querySelector(".vn-emotion-list");
        list?.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
        ueb();
      });
      el.querySelector(".vn-emotion-fp")?.addEventListener("click", () => {
        try {
          const fp = new FilePicker({ type: "image", current: "", callback: (path) => {
            if (inp) inp.value = path;
          }});
          fp.render(true);
        } catch(e) { console.error("FilePicker error:", e); }
      });
    };
    this._updateEmotionAddBtn = ueb;
    form.querySelector(".vn-emotion-add")?.addEventListener("click", () => {
      const list = form.querySelector(".vn-emotion-list");
      const tpl = form.querySelector(".vn-emotion-row-tpl");
      if (!list || !tpl) return;
      if (ec() >= MAX_EMOTIONS) {
        ui.notifications?.warn(`Maximum ${MAX_EMOTIONS} emotions allowed`);
        return;
      }
      const el = tpl.content.cloneNode(true);
      this._bindEmotionRow(el);
      list.appendChild(el);
      list.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
      ueb();
    });
    ueb();

    form.querySelector(".vn-port-save")?.addEventListener("click", async () => {
      if (this._saving) return;
      this._saving = true;
      const name = form.querySelector(".vn-port-f-name")?.value?.trim();
      if (!name) { this._saving = false; return ui.notifications?.warn("Enter portrait name"); }
      const mainImg = form.querySelector(".vn-port-f-img")?.value?.trim() || "";
      const extra = this._readEmotions();
      const allImgs = extra.length ? [mainImg, ...extra.filter(p => p !== mainImg)] : (mainImg ? [mainImg] : []);
      const tagsRaw = form.querySelector(".vn-port-f-tags")?.value?.trim() || "";
      const isPlayer = game.user?.role < 3;
      const userId = isPlayer ? (game.user?.id || "") : (form.querySelector(".vn-port-f-user")?.value || "");
      let tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (userId) {
        const user = game.users?.get(userId);
        const userTag = "player:" + (user?.name || userId);
        tags = tags.filter(t => !t.startsWith("player:"));
        tags.push(userTag);
      } else {
        tags = tags.filter(t => !t.startsWith("player:"));
      }
      const data = {
        name,
        title: form.querySelector(".vn-port-f-title")?.value?.trim() || "",
        group: form.querySelector(".vn-port-f-group")?.value?.trim() || "",
        tags,
        image: mainImg,
        images: allImgs,
        actorId: form.querySelector(".vn-port-f-actor")?.value?.trim() || "",
        userId
      };
      if (this._editingPortId) {
        const idx = this._data.portraits.findIndex(p => p.id === this._editingPortId);
        if (idx !== -1) Object.assign(this._data.portraits[idx], data);
        this._editingPortId = null;
      } else {
        this._data.portraits.push({ id: String(this._data.nextPortId++), ...data });
      }
      await _saveData(this._data);
      this._saving = false;
      form.querySelector(".vn-port-f-name").value = "";
      form.querySelector(".vn-port-f-title").value = "";
      form.querySelector(".vn-port-f-tags").value = "";
      form.querySelector(".vn-port-f-img").value = "";
      form.querySelector(".vn-port-f-actor").value = "";
      const userSel = form.querySelector(".vn-port-f-user");
      if (userSel) userSel.value = "";
      this._resetEmotions();
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

    // Background brightness
    html.querySelector(".vn-scene-brightness")?.addEventListener("input", (ev) => {
      this._bgBrightness = parseFloat(ev.target.value) || 1;
      const bg = html.querySelector(".vn-bg");
      if (bg) bg.style.filter = `brightness(${this._bgBrightness})`;
    });

    html.querySelector(".vn-theme-bg")?.addEventListener("input", (ev) => {
      this._themeBg = ev.target.value;
      if (this._data) { this._data.themeBg = this._themeBg; _saveData(this._data); }
      game.settings?.set("free-visual-novel", "themeBg", this._themeBg);
      this._applyTheme();
    });
    html.querySelector(".vn-theme-accent")?.addEventListener("input", (ev) => {
      this._themeAccent = ev.target.value;
      if (this._data) { this._data.themeAccent = this._themeAccent; _saveData(this._data); }
      game.settings?.set("free-visual-novel", "themeAccent", this._themeAccent);
      this._applyTheme();
    });

    const _saveDialogSetting = (key, value) => {
      game.settings?.set("free-visual-novel", key, value);
    };

    // Dialog width
    html.querySelector(".vn-dialog-width")?.addEventListener("input", (ev) => {
      this._dialog.width = parseInt(ev.target.value) || 65;
      _saveDialogSetting("dialogWidth", this._dialog.width);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.width + "%";
    });

    // Dialog height
    html.querySelector(".vn-dialog-height")?.addEventListener("input", (ev) => {
      this._dialog.height = parseInt(ev.target.value) || 160;
      _saveDialogSetting("dialogHeight", this._dialog.height);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.height + "px";
    });

    // Dialog opacity
    html.querySelector(".vn-dialog-opacity")?.addEventListener("input", (ev) => {
      this._dialog.opacity = parseFloat(ev.target.value) || 0.85;
      _saveDialogSetting("dialogOpacity", this._dialog.opacity);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.opacity;
    });

    // Dialog alignment
    html.querySelectorAll(".vn-dialog-align").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        this._dialog.align = ev.currentTarget.dataset.align;
        _saveDialogSetting("dialogAlign", this._dialog.align);
        this.render();
      });
    });

    // Dialog text input (live update)
    html.querySelector(".vn-dialog-text")?.addEventListener("input", (ev) => {
      this._dialog.text = ev.target.value;
      const box = document.querySelector(".vn-dialog-box");
      if (box) {
        const txt = box.querySelector(".vn-dialog-content");
        if (txt) txt.textContent = this._dialog.text;
      }
    });

    // Speaker toggle
    html.querySelector(".vn-dialog-speaker-toggle")?.addEventListener("click", (ev) => {
      this._dialog.showSpeaker = !this._dialog.showSpeaker;
      _saveDialogSetting("dialogShowSpeaker", this._dialog.showSpeaker);
      ev.currentTarget.textContent = this._dialog.showSpeaker ? "Show" : "Hide";
    });

    // Font size
    html.querySelector(".vn-dialog-fontsize")?.addEventListener("input", (ev) => {
      this._dialog.fontSize = parseInt(ev.target.value) || 16;
      _saveDialogSetting("dialogFontSize", this._dialog.fontSize);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.fontSize + "px";
      const box = document.querySelector(".vn-dialog-box");
      if (box) box.style.fontSize = this._dialog.fontSize + "px";
    });

    // Speaker box font size
    html.querySelector(".vn-speaker-fontsize")?.addEventListener("input", (ev) => {
      this._speakerFontSize = parseInt(ev.target.value) || 20;
      game.settings?.set("free-visual-novel", "speakerFontSize", this._speakerFontSize);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._speakerFontSize + "px";
      const box = document.querySelector(".vn-speaker-name");
      if (box) box.style.fontSize = this._speakerFontSize + "px";
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
      if (ev.target.closest(".vn-dialog-box")) return;
      if (ev.target.closest(".vn-panel")) return;
      if (ev.target.closest("select")) return;
      if (ev.target.closest(".vn-emotion-strip")) return;
      if (ev.target.closest(".vn-attention-btn")) return;
      if (ev.target.closest(".vn-approve-btn")) return;
      const el = ev.target.closest(".vn-portrait");
      if (!el) {
        this._selectedPortraitIdx = null;
        this.render();
        return;
      }
      // Only GM can select portraits
      if (game.user?.role < 3) return;
      const idx = parseInt(el.dataset.portIdx);
      this._selectedPortraitIdx = this._selectedPortraitIdx === idx ? null : idx;
      this.render();
    };

    const onDown = (ev) => {
      if (game.user?.role < 3) return;
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
      const images = port.images && port.images.length ? port.images : (port.image ? [port.image] : []);
      this._portraits.push({
        ...port,
        images,
        x: 50 + this._portraits.length * 180,
        y: 150,
        scale: 1.5,
        flip: false,
        locked: false,
        _currentEmotion: 0
      });
      if (this.rendered) { this.render(); this._broadcast(); }
    }
  }

  clearStage() {
    this._bg = "";
    this._portraits = [];
    this._speaker = "";
    this._claimed = {};
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
    this._broadcastMenuCleanup?.();
    this._interactiveEl?.remove();
    this._interactiveEl = null;
    this.element?.classList.remove("vn-fullscreen-active");
  }

  async close(options) {
    if (!this.element) return super.close(options);
    this.element.classList.add("vn-fading-out");
    this._interactiveEl?.classList.add("vn-fading-out");
    await new Promise(r => setTimeout(r, 250));
    return super.close(options);
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
    inviteMode: app._inviteMode || "all",
    bg: app._bg,
    portraits: app._portraits,
    speaker: app._speaker,
    claimed: app._claimed || {}
  });
}

function _applyVNState(data) {
  if (!game.user || game.user.role >= 3) return;
  if (!data.broadcasting) {
    ui.freevisualnovel?.close();
    return;
  }
  // Filter by invite mode
  if (data.inviteMode === "stage") {
    const hasPortraitOnStage = (data.portraits || []).some(p => p.userId === game.user?.id);
    if (!hasPortraitOnStage) {
      ui.freevisualnovel?.close();
      return;
    }
  }
  try {
    let app = ui.freevisualnovel;
    if (!app || !app.rendered) {
      app = new VisualNovelApp();
      ui.freevisualnovel = app;
    }
    app._bg = data.bg || "";
    app._portraits = data.portraits || [];
    app._speaker = data.speaker || "";
    app._claimed = data.claimed || {};
    app.render(true);
  } catch(e) {
    console.error("FreeVisualNovel | Failed to apply state:", e);
  }
}

/* ─────────────── Handlebars Helpers ─────────────── */
Handlebars.registerHelper("eq", function(v1, v2) {
  return v1 === v2;
});
Handlebars.registerHelper("or", function(v1, v2) {
  return v1 || v2;
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

  game.settings?.register("free-visual-novel", "themeBg", {
    scope: "world",
    type: String,
    default: "#0d0d1a",
    config: true,
    name: "Theme Background Color",
    hint: "Main background color for the VN overlay (e.g. #0d0d1a)"
  });

  game.settings?.register("free-visual-novel", "themeAccent", {
    scope: "world",
    type: String,
    default: "#f0c040",
    config: true,
    name: "Theme Accent Color",
    hint: "Accent/highlight color (e.g. #f0c040)"
  });

  const dialogSettings = [
    { key: "dialogWidth", name: "Dialogue Box Width", hint: "Width in percent (30-100)", default: 65, type: Number },
    { key: "dialogHeight", name: "Dialogue Box Height", hint: "Height in pixels (80-350)", default: 160, type: Number },
    { key: "dialogOpacity", name: "Dialogue Box Opacity", hint: "Opacity from 0.2 to 1.0", default: 0.85, type: Number },
    { key: "dialogAlign", name: "Dialogue Text Align", hint: "left, center, or right", default: "left", type: String },
    { key: "dialogShowSpeaker", name: "Show Speaker Name", hint: "Whether to display the speaker name in the dialogue box", default: true, type: Boolean },
    { key: "dialogFontSize", name: "Dialogue Font Size", hint: "Font size in pixels (10-36)", default: 16, type: Number },
  ];
  for (const s of dialogSettings) {
    game.settings?.register("free-visual-novel", s.key, {
      scope: "world", type: s.type, default: s.default, config: true,
      name: s.name, hint: s.hint
    });
  }

  game.settings?.register("free-visual-novel", "playablePortraits", {
    scope: "world", type: Boolean, default: true, config: true,
    name: "Player Portrait Control",
    hint: "Allow players to control their own portraits (emotions, Attention button) on stage"
  });

  const speakerSettings = [
    { key: "speakerFontSize", name: "Speaker Name Font Size", hint: "Font size in pixels (12-60)", default: 20, type: Number }
  ];
  for (const s of speakerSettings) {
    game.settings?.register("free-visual-novel", s.key, {
      scope: "world", type: s.type, default: s.default, config: true,
      name: s.name, hint: s.hint
    });
  }

  const hasEpicRolls = game.modules?.get("epic-rolls")?.active ?? false;
  const hasSequencer = game.modules?.get("sequencer")?.active ?? false;

  game.socket?.on(SOCKET, (data) => {
    if (data?.type === "state") _applyVNState(data);
    else if (data?.type === "stop") { ui.freevisualnovel?.close(); }
    else if (data?.type === "claim") {
      const app = ui.freevisualnovel;
      if (app && game.user?.role >= 3) {
        if (data.claimed) app._claimed[data.portraitId] = true;
        else delete app._claimed[data.portraitId];
        app.render();
      }
    }
    else if (data?.type === "emotion") {
      const app = ui.freevisualnovel;
      if (app && game.user?.role >= 3) {
        const p = app._portraits.find(port => port.id === data.portraitId);
        if (p && !isNaN(data.emotionIdx)) {
          p._currentEmotion = data.emotionIdx;
          app.render();
          _broadcastVNState(app);
        }
      }
    }
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
  if (text === "/vnportrait" || text === "/vnedit") {
    _openVN("portraits");
    return false;
  }
});

let _vnOpening = false;
function _openVN(openPanel) {
  if (_vnOpening) return;
  _vnOpening = true;
  if (ui.freevisualnovel?.rendered) {
    if (openPanel) {
      ui.freevisualnovel._showPanel = openPanel;
    }
    ui.freevisualnovel.render(true);
    _vnOpening = false;
    return;
  }
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    if (openPanel) {
      app._showPanel = openPanel;
    }
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
  const role = game.user?.role || 0;
  const group = {
    name: "freevisualnovel",
    title: "Free Visual Dialogs",
    icon: "fas fa-comment-dots",
    layer: "Canvas",
    order: 90,
    visible: role >= CONST.USER_ROLES?.PLAYER || true,
    tools: {}
  };
  if (role >= 3) {
    group.tools.launch = {
      name: "launch",
      title: "New Dialogue",
      icon: "fas fa-play",
      button: true,
      visible: true,
      onChange: () => _openVN()
    };
  }
  group.tools.portrait = {
    name: "portrait",
    title: "My Portrait",
    icon: "fas fa-user-circle",
    button: true,
    visible: true,
    onChange: () => _openVN("portraits")
  };
  t.freevisualnovel = group;
});

} // end _defineModule
