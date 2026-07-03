import { _loadData, _saveData, _defaultData, _userCan, _roleCan, _broadcastVNState, _getLastBroadcastState, _whisperInvite } from './helpers.js';
import { bindPanels } from './panels.js';
import { bindPortraitDrag } from './portrait-drag.js';
import { bindDialog } from './dialog.js';
import { bindInlineEdit } from './inline-edit.js';
import { bindInvite } from './invite.js';
// import { bindScriptEngine } from './script-engine.js'; // SCENARIO ENGINE — disabled for narrator focus

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications?.api || {};
const _AppBase = HandlebarsApplicationMixin ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;
if (!_AppBase) {
  console.error("ViNarrat | Application class not found.");
}

class VisualNovelApp extends _AppBase {
  static DEFAULT_OPTIONS = {
    id: "vinarrat",
    title: "ViNarrat — Live Scene Director",
    window: {
      width: window.innerWidth,
      height: window.innerHeight,
      positioned: true,
      minimizable: false,
      resizable: false,
      frame: false,
      controls: []
    },
    classes: ["vinarrat", "vn-fullscreen"],
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  static PARTS = {
    main: { template: "modules/free-visual-novel/templates/visualnovel.hbs" }
  };



  constructor(options = {}) {
    super(options);
    console.log("FreeVN | constructor, AppBase:", _AppBase?.name, "proto has _renderHTML:", typeof VisualNovelApp.prototype._renderHTML, "own has _renderHTML:", typeof this._renderHTML);
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
    this._editingPortraitIdx = null;
    this._currentLocationId = null;
    this._broadcasting = false;
    this._locSearch = "";
    this._locTagSearch = "";
    this._locGroupFilter = "";
    this._locListLimit = 12;
    this._editingLocId = null;
    this._editingPortId = null;
    this._portSearch = "";
    this._portTagSearch = "";
    this._portGroupFilter = "";
    this._portListLimit = 12;
    this._bgBrightness = 1;
    this._themeBg = "#0d0d1a";
    this._themeAccent = "#f0c040";
    this._claimed = {};
    this._inviteMode = "all";
    this._showBroadcastMenu = false;
    this._showInviteMenu = false;
    this._speakerBarPos = game.settings?.get("free-visual-novel", "speakerBarPos") || "left";
    this._portraitMode = game.settings?.get("free-visual-novel", "portraitMode") || "portrait";
    this._splashShowNames = game.settings?.get("free-visual-novel", "splashShowNames") !== false;
    this._dialog = {
      width: 65,
      height: 160,
      opacity: 0.85,
      align: "left",
      text: "",
      showSpeaker: true,
      fontSize: 16,
      mode: 1,
      yOffset: 100,
      leftText: ""
    };
    // SCENARIO ENGINE (disabled)
    // this._playback = null;
    // this._editScriptId = null;
    // this._tempSteps = [];
    // this._activeEditIdx = null;
    // this._showStepTypePicker = false;
    this._typewriterTimer = null;
    this._typewriterFullText = "";
    this._typewriterPos = 0;
    this._typewriterDirty = false;
  }

  get element() {
    return this._element || null;
  }
  set element(v) {
    this._element = v;
  }

  get rendered() {
    return !!this._element;
  }

  async render(options) {
    console.log("FreeVN | render called");
    if (!this._ready) await this._initialize();
    const context = await this._prepareContext();
    const html = await this._renderHTML(context, {});
    const isFirst = !this._element;
    if (!this._element) {
      this._element = document.createElement("div");
      this._element.id = "vinarrat";
      this._element.className = "vinarrat vn-fullscreen";
      document.body.appendChild(this._element);
    }
    this._element.innerHTML = html;
    this._contentEl = this._element;
    try {
      if (isFirst) this._onFirstRender(context, {});
      this._onRender(context, {});
    } catch(e) { console.error("FreeVN | render callback error:", e); }
    if (this._element && !this._element.querySelector(".vn-root")) {
      this._element.classList.add("vn-root");
    }
    return this;
  }

  async _initialize() {
    console.log("FreeVN | _initialize start");
    try { this._data = await _loadData(); } catch(e) { console.error("FreeVN | _loadData failed:", e); throw e; }
    this._themeBg = game.settings?.get("free-visual-novel", "themeBg") || this._data.themeBg || "#0d0d1a";
    this._themeAccent = game.settings?.get("free-visual-novel", "themeAccent") || this._data.themeAccent || "#f0c040";
    this._dialog = {
      width: parseInt(game.settings?.get("free-visual-novel", "dialogWidth")) || 65,
      height: parseInt(game.settings?.get("free-visual-novel", "dialogHeight")) || 160,
      opacity: parseFloat(game.settings?.get("free-visual-novel", "dialogOpacity")) || 0.85,
      align: game.settings?.get("free-visual-novel", "dialogAlign") || "left",
      text: "",
      showSpeaker: game.settings?.get("free-visual-novel", "dialogShowSpeaker") !== false,
      fontSize: parseInt(game.settings?.get("free-visual-novel", "dialogFontSize")) || 16,
      mode: 1,
      yOffset: 100,
      leftText: ""
    };
    this._speakerFontSize = parseInt(game.settings?.get("free-visual-novel", "speakerFontSize")) || 20;
    this._defaultPortraitScale = this._data.defaultPortraitScale ?? 1;
    await this._restoreSession();
    this._ready = true;
  }

  async _saveSession() {
    if (!game.user || !_userCan("permManage")) return;
    if (!this._broadcasting) return;
    await game.user.setFlag("free-visual-novel", "sessionState", {
      portraits: this._portraits,
      bg: this._bg,
      speaker: this._speaker,
      broadcasting: this._broadcasting,
      inviteMode: this._inviteMode,
      claimed: this._claimed,
      hideBg: this._hideBg,
      hideUI: this._hideUI,
      bgBrightness: this._bgBrightness,
      themeBg: this._themeBg,
      themeAccent: this._themeAccent,
      dialog: this._dialog,
      speakerFontSize: this._speakerFontSize,
      currentLocationId: this._currentLocationId,
      defaultPortraitScale: this._defaultPortraitScale
    });
  }

  async _restoreSession() {
    if (!game.user || !_userCan("permManage")) return;
    const state = await game.user.getFlag("free-visual-novel", "sessionState");
    if (!state) return;
    this._portraits = state.portraits || [];
    this._bg = state.bg || "";
    this._speaker = state.speaker || "";
    this._broadcasting = state.broadcasting || false;
    this._inviteMode = state.inviteMode || "all";
    this._claimed = state.claimed || {};
    this._hideBg = !!state.hideBg;
    this._hideUI = !!state.hideUI;
    this._editingPortraitIdx = null;
    this._bgBrightness = state.bgBrightness ?? 1;
    this._themeBg = state.themeBg || this._themeBg;
    this._themeAccent = state.themeAccent || this._themeAccent;
    this._dialog = Object.assign({}, this._dialog, state.dialog);
    this._speakerFontSize = state.speakerFontSize || this._speakerFontSize;
    this._currentLocationId = state.currentLocationId || null;
    this._defaultPortraitScale = state.defaultPortraitScale ?? this._defaultPortraitScale;
  }

  _enc(str) {
    if (str && typeof str !== "string") {
      console.error("FreeVN | _enc: non-string input", typeof str, str);
      return str;
    }
    if (!str) return str;

    const hadNonAscii = /[^\x00-\x7F]/.test(str);
    const encoded = str.replace(/[^\x00-\x7F]/g, ch => encodeURIComponent(ch));
    const cleaned = encoded.replace(/'/g, "%27");

    if (hadNonAscii) {
      console.log("FreeVN | _enc:", JSON.stringify(str.substring(0,80)), "->", JSON.stringify(cleaned.substring(0,80)));
    } else if (str !== cleaned) {
      console.log("FreeVN | _enc (ascii change):", JSON.stringify(str.substring(0,80)), "->", JSON.stringify(cleaned.substring(0,80)));
    }
    return cleaned;
  }

  async _prepareContext() {
    console.log("FreeVN | _prepareContext called");
    if (!this._ready) await this._initialize();

    const playableEnabled = game.settings?.get("free-visual-novel", "playablePortraits") !== false;
    const portraits = this._portraits.map((p, i) => ({
      ...p,
      index: i,
      speaking: this._speaker === p.id,
      selected: this._selectedPortraitIdx === i,
      currentImg: this._enc((p.images && p.images.length) ? p.images[p._currentEmotion || 0] : p.image),
      hasEmotions: (p.images && p.images.length > 1),
      images: (p.images || []).slice(0, 6).map(img => this._enc(img)),
      emotionIdx: p._currentEmotion || 0,
      isMyPortrait: playableEnabled && p.userId === game.user?.id,
      isClaimed: !!this._claimed[p.id]
    }));

    const speakerPortrait = this._portraits.find(p => p.id === this._speaker);
    const selPort = this._selectedPortraitIdx !== null ? portraits[this._selectedPortraitIdx] : null;
    const allLocations = this._data?.locations || [];
    const allPortraits = this._data?.portraits || [];

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
    const locations = filteredLocs.slice(0, this._locListLimit).map(l => ({
      ...l,
      background: this._enc(l.background)
    }));

    const role = game.user?.role || 0;
    const canManage = _userCan("permManage");

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
    const filteredPortraits = filteredPorts.slice(0, this._portListLimit).map(p => ({
      ...p,
      image: this._enc(p.image),
      images: (p.images || []).map(img => this._enc(img))
    }));

    const locGroups = [...new Set(allLocations.map(l => l.group || "").filter(Boolean))];
    const portGroups = [...new Set(allPortraits.map(p => p.group || "").filter(Boolean))];
    const users = [...game.users].map(u => ({ id: u.id, name: u.name }));
    const onlinePlayers = [...game.users].filter(u => u.active && !u.isGM && !_roleCan(u.role, "permManage")).map(u => ({ id: u.id, name: u.name }));
    return {
      bg: this._hideBg ? "" : this._enc(this._bg || ""),
      hideBg: this._hideBg,
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
      onlinePlayers,
      selectedPortrait: selPort,
      bgBrightness: this._bgBrightness,
      inviteMode: this._inviteMode,
      showBroadcastMenu: this._showBroadcastMenu,
      editingPortraitIdx: this._editingPortraitIdx,
      showInviteMenu: this._showInviteMenu,
      dialog: this._dialog,
      dialogEnabled: game.settings?.get("free-visual-novel", "dialogEnabled") !== false,
      speakerFontSize: this._speakerFontSize,
      speakerBarPos: this._speakerBarPos,
      portraitMode: this._portraitMode,
      splashShowNames: this._splashShowNames,
      themeBg: this._themeBg,
      themeAccent: this._themeAccent,
      defaultPortraitScale: this._defaultPortraitScale,
      /* SCENARIO ENGINE (disabled)
      scripts: this._data?.scripts || [],
      editScript: this._editScriptId ? (this._data?.scripts?.find(s => s.id === this._editScriptId) || { id: null, name: "", steps: [] }) : { id: null, name: "", steps: [] },
      editSteps: this._showPanel === "scriptEdit" ? (this._tempSteps || []) : [],
      activeEditIdx: this._activeEditIdx,
      showStepTypePicker: this._showStepTypePicker,
      playback: this._playback ? {
        playing: this._playback.playing,
        currentStep: this._playback.currentStep,
        script: { name: this._playback.script.name, steps: this._playback.script.steps, length: this._playback.script.steps.length }
      } : null
      */
    };
  }

  _applyTheme() {
    const container = this._element || this.element;
    const root = container?.querySelector?.(".vn-root") || container;
    if (root) {
      root.style.setProperty("--vn-bg", this._themeBg);
      root.style.setProperty("--vn-accent", this._themeAccent);
      const hex = this._themeAccent.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r + g + b)) {
        root.style.setProperty("--vn-accent-rgb", `${r},${g},${b}`);
        root.style.setProperty("--vn-accent-soft", `rgba(${r},${g},${b},0.12)`);
        root.style.setProperty("--vn-glow", `0 0 20px rgba(${r},${g},${b},0.08)`);
      }
    }
  }

  async _renderHTML(context, options) {
    console.log("FreeVN | _renderHTML called, context keys:", Object.keys(context));
    const path = "modules/free-visual-novel/templates/visualnovel.hbs";
    const resp = await fetch(path);
    const source = await resp.text();
    const template = Handlebars.compile(source);
    const html = template(context);
    return html;
  }

  _replaceHTML(result, content, options) {
    super._replaceHTML(result, content, options);
    this._contentEl = content;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._applyTheme();
    this._applyDialogStyles();
    if (this._dragCleanup) this._dragCleanup();
    if (this._dragCleanupPanel) this._dragCleanupPanel();
    this._bindMainUI();
    this._bindInlineEdit();
    if (this._showPanel === "locations") this._bindLocationPanel();
    else if (this._showPanel === "portraits") this._bindPortraitPanel();
    else if (this._showPanel === "scene") this._bindScenePanel();
    else if (this._showPanel === "presets") this._bindPresetsPanel();
    // SCENARIO ENGINE (disabled)
    // else if (this._showPanel === "scripts" || this._showPanel === "scriptEdit") this._bindScriptPanel();
    /* SCENARIO ENGINE (disabled)
    if (this._playback) {
      this._bindPlayback();
      if (this._typewriterDirty) {
        this._startTypewriter();
        this._typewriterDirty = false;
      }
    }
    */
    const panelEl = this._el();
    const panel = panelEl.querySelector(".vn-panel-floating");
    const header = panel?.querySelector(".vn-panel-header");
    if (panel && header) {
      header.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        const rect = panel.getBoundingClientRect();
        const offX = ev.clientX - rect.left;
        const offY = ev.clientY - rect.top;
        const onMove = (e) => {
          panel.style.left = (e.clientX - offX) + "px";
          panel.style.top = (e.clientY - offY) + "px";
          panel.style.right = "auto";
        };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
    this._buildInviteUI();
    if (this._broadcasting) this._broadcast();

    const bgEl = document.querySelector(".vn-bg");
    if (bgEl) {
      const bgStyle = bgEl.style.backgroundImage;
      console.log("FreeVN | render bg style:", bgStyle && bgStyle.substring(0,120));
    }
    document.querySelectorAll(".vn-portrait-img, .vn-port-avatar img, .vn-emotion-thumb img").forEach(img => {
      if (img.hasAttribute("data-fvn-logged")) return;
      img.setAttribute("data-fvn-logged", "1");
      img.addEventListener("error", () => {
        console.error("FreeVN | IMAGE LOAD ERROR:", img.getAttribute("src") && img.getAttribute("src").substring(0,150));
      });
      img.addEventListener("load", () => {
        console.log("FreeVN | IMAGE LOADED:", img.getAttribute("src") && img.getAttribute("src").substring(0,100));
      });
    });
  }

  _el() {
    if (!this._queryRoot) {
      const self = this;
      this._queryRoot = {
        querySelector: (sel) => document.querySelector(sel),
        querySelectorAll: (sel) => document.querySelectorAll(sel),
        addEventListener: (...args) => document.addEventListener(...args),
        removeEventListener: (...args) => document.removeEventListener(...args),
        getBoundingClientRect: () => (self._contentEl || self.element)?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      };
    }
    return this._queryRoot;
  }

  _broadcast() {
    _broadcastVNState(this);
  }

  async _savePreset(name) {
    if (!this._data) this._data = await _loadData();
    if (!this._data.presets) this._data.presets = [];
    if (!this._data.nextPresetId) this._data.nextPresetId = 1;
    const existing = this._data.presets.find(p => p.name === name);
    try {
      if (existing) {
        existing.bg = this._bg;
        existing.bgBrightness = this._bgBrightness;
        existing.hideBg = this._hideBg;
        existing.hideUI = this._hideUI;
        existing.portraits = JSON.parse(JSON.stringify(this._portraits));
        existing.speaker = this._speaker;
        existing.dialog = JSON.parse(JSON.stringify(this._dialog));
        existing.speakerFontSize = this._speakerFontSize;
        existing.themeBg = this._themeBg;
        existing.themeAccent = this._themeAccent;
        existing.currentLocationId = this._currentLocationId;
      } else {
        this._data.presets.push({
          id: String(this._data.nextPresetId++),
          name,
          bg: this._bg,
          bgBrightness: this._bgBrightness,
          hideBg: this._hideBg,
          hideUI: this._hideUI,
          portraits: JSON.parse(JSON.stringify(this._portraits)),
          speaker: this._speaker,
          dialog: JSON.parse(JSON.stringify(this._dialog)),
          speakerFontSize: this._speakerFontSize,
          themeBg: this._themeBg,
          themeAccent: this._themeAccent,
          currentLocationId: this._currentLocationId
        });
      }
    } catch (err) {
      console.error("FreeVN | _savePreset serialize error:", err);
      return "error";
    }
    await _saveData(this._data);
    return existing ? "updated" : "created";
  }

  _loadPreset(id) {
    const preset = this._data?.presets.find(p => p.id === id);
    if (!preset) return false;
    this._bg = preset.bg || "";
    this._bgBrightness = preset.bgBrightness ?? 1;
    this._hideBg = !!preset.hideBg;
    this._hideUI = !!preset.hideUI;
    this._portraits = JSON.parse(JSON.stringify(preset.portraits || []));
    this._speaker = preset.speaker || "";
    if (preset.dialog) Object.assign(this._dialog, preset.dialog);
    this._speakerFontSize = preset.speakerFontSize ?? 20;
    this._themeBg = preset.themeBg || "#0d0d1a";
    this._themeAccent = preset.themeAccent || "#f0c040";
    this._currentLocationId = preset.currentLocationId || null;
    this._claimed = {};
    this._showPanel = null;
    this._applyTheme();
    return true;
  }

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

  setBackground(path) {
    console.log("FreeVN | setBackground raw:", JSON.stringify(path && path.substring(0,100)), "encoded:", JSON.stringify(this._enc(path && path.substring(0,100))));
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
        scale: this._defaultPortraitScale ?? 1,
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
    this._clearSession();
    if (this.rendered) { this.render(); this._broadcast(); }
  }

  async _clearSession() {
    if (!game.user || !_userCan("permManage")) return;
    await game.user.setFlag("free-visual-novel", "sessionState", null);
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._context = context;
    const el = this._element || this.element;
    el?.classList.add("vn-fullscreen-active");
  }

  _onClose(options) {
    const el = this._element || this.element;
    el?.classList.remove("vn-fullscreen-active");
    // SCENARIO ENGINE (disabled)
    // if (this._playback?.timer) clearTimeout(this._playback.timer);
    // if (this._typewriterTimer) { clearInterval(this._typewriterTimer); this._typewriterTimer = null; }
    // this._playback = null;
  }

  async close(options) {
    const el = this._element || this.element;
    if (!el) {
      this._broadcastMenuCleanup?.();
      this._inviteMenuCleanup?.();
      this._inviteBtn?.remove();
      this._inviteBtn = null;
      this._inviteMenu?.remove();
      this._inviteMenu = null;
      this._onClose();
      return;
    }
    el.classList.add("vn-fading-out");
    await new Promise(r => setTimeout(r, 250));
    await this._saveSession();
    if (this._dragCleanup) this._dragCleanup();
    this._broadcastMenuCleanup?.();
    this._inviteMenuCleanup?.();
    this._inviteBtn?.remove();
    this._inviteBtn = null;
    this._inviteMenu?.remove();
    this._inviteMenu = null;
    this._portraits = [];
    if (!_userCan("permManage") && _getLastBroadcastState()) {
      _whisperInvite();
    }
    this._onClose();
    if (this._element) { this._element.remove(); this._element = null; }
  }
}

// Apply mixins in order (panels depends on portrait-drag + inline-edit)
bindPortraitDrag(VisualNovelApp.prototype);
bindInlineEdit(VisualNovelApp.prototype);
bindDialog(VisualNovelApp.prototype);
bindInvite(VisualNovelApp.prototype);
// bindScriptEngine(VisualNovelApp.prototype); // SCENARIO ENGINE (disabled)
bindPanels(VisualNovelApp.prototype);

export default VisualNovelApp;
