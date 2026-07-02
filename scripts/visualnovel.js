import VisualNovelApp from './app.js';
import { _getLastBroadcastState, _setLastBroadcastState, _userCan, _roleCan, SOCKET, _loadData, _saveData, _defaultData, DATA_KEY, _broadcastVNState, _importActorPortraits } from './helpers.js';

export { VisualNovelApp, _getLastBroadcastState, _setLastBroadcastState, _userCan, _roleCan, SOCKET, _loadData, _saveData, _defaultData, DATA_KEY };

let _vnOpening = false;

function _openVN(openPanel) {
  if (_vnOpening) return;
  _vnOpening = true;
  try {
    if (ui.freevisualnovel?.rendered) {
      if (openPanel) ui.freevisualnovel._showPanel = openPanel;
      ui.freevisualnovel.render();
      _vnOpening = false;
      return;
    }
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    if (openPanel) app._showPanel = openPanel;
    console.log("FreeVN | render() call");
    app.render();
  } catch(e) {
    console.error("ViNarrat | Failed to open:", e);
    ui.notifications?.error("ViNarrat: failed to open");
  }
  _vnOpening = false;
}

function _rejoinVN() {
  if (!_getLastBroadcastState()) { _openVN(); return; }
  if (_vnOpening) return;
  _vnOpening = true;
  if (ui.freevisualnovel?.rendered) {
    const app = ui.freevisualnovel;
    app._bg = _getLastBroadcastState().bg || "";
    app._portraits = _getLastBroadcastState().portraits || [];
    app._speaker = _getLastBroadcastState().speaker || "";
    app._claimed = _getLastBroadcastState().claimed || {};
    if (_getLastBroadcastState().dialog) app._dialog = Object.assign({}, app._dialog, _getLastBroadcastState().dialog);
    app.render();
    _vnOpening = false;
    return;
  }
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    app._bg = _getLastBroadcastState().bg || "";
    app._portraits = _getLastBroadcastState().portraits || [];
    app._speaker = _getLastBroadcastState().speaker || "";
    app._claimed = _getLastBroadcastState().claimed || {};
    if (_getLastBroadcastState().dialog) app._dialog = Object.assign({}, app._dialog, _getLastBroadcastState().dialog);
    app.render();
  } catch(e) {
    console.error("ViNarrat | Failed to rejoin:", e);
    ui.notifications?.error("ViNarrat: failed to rejoin");
  }
  _vnOpening = false;
}

function _applyVNState(data) {
  console.log("FreeVN | _applyVNState called", data?.broadcasting, "targetUser:", data?.targetUser, "user id:", game.user?.id);
  if (!game.user || _userCan("permManage")) { console.log("FreeVN | _applyVNState: blocked by permManage"); return; }
  if (!data.broadcasting) {
    _setLastBroadcastState(null);
    ui.freevisualnovel?.close();
    return;
  }
  if (data.targetUser && data.targetUser !== game.user?.id) return;
  if (data.inviteMode === "stage" && !data.targetUser) {
    const hasPortraitOnStage = (data.portraits || []).some(p => p.userId === game.user?.id);
    if (!hasPortraitOnStage) {
      _setLastBroadcastState(null);
      ui.freevisualnovel?.close();
      return;
    }
  }
  _setLastBroadcastState(data);
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
    if (data.dialog) app._dialog = Object.assign({}, app._dialog, data.dialog);
    if (data.themeBg) app._themeBg = data.themeBg;
    if (data.themeAccent) app._themeAccent = data.themeAccent;
    if (data.speakerFontSize) app._speakerFontSize = data.speakerFontSize;
    app._applyTheme();
    app.render(true);
  } catch(e) {
    console.error("FreeVN | Failed to apply state:", e);
  }
}

/* ─────────────── Hooks ─────────────── */
Hooks.once("init", async function() {
  game.settings?.register("free-visual-novel", DATA_KEY, {
    scope: "world", type: Object, default: _defaultData(), config: false
  });
  game.settings?.register("free-visual-novel", "defaultPortraitFolder", {
    scope: "world", type: String, default: "", config: true,
    name: "Default Portrait Folder",
    hint: "Path to folder containing actor portraits for auto-import"
  });
  game.settings?.register("free-visual-novel", "themeBg", {
    scope: "world", type: String, default: "#0d0d1a", config: true,
    name: "Theme Background Color",
    hint: "Main background color for the scene overlay (e.g. #0d0d1a)"
  });
  game.settings?.register("free-visual-novel", "themeAccent", {
    scope: "world", type: String, default: "#f0c040", config: true,
    name: "Theme Accent Color",
    hint: "Accent/highlight color (e.g. #f0c040)"
  });
  const dialogSettings = [
    { key: "dialogEnabled", name: "Enable Dialogue Boxes", hint: "Master toggle — show/hide dialogue boxes entirely", default: true, type: Boolean },
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
  game.settings?.register("free-visual-novel", "scriptAssetWarnings", {
    scope: "world", type: Boolean, default: true, config: true,
    name: "Script Asset Warnings",
    hint: "Warn when a script references missing portraits or other assets"
  });
  game.settings?.register("free-visual-novel", "playablePortraits", {
    scope: "world", type: Boolean, default: true, config: true,
    name: "Player Portrait Control",
    hint: "Allow players to control their own portraits (emotions, Attention button) on stage"
  });
  game.settings?.register("free-visual-novel", "speakerFontSize", {
    scope: "world", type: Number, default: 20, config: true,
    name: "Speaker Name Font Size",
    hint: "Font size in pixels (12-60)"
  });
  game.settings?.register("free-visual-novel", "broadcastStore", {
    scope: "world", type: Object, default: null, config: false
  });
  const roleChoices = { 1: "Player", 2: "Trusted", 3: "Assistant", 4: "GM" };
  const permSettings = [
    { key: "permManage", name: "Manage VN", hint: "Minimum role to manage scenes, portraits, and background", min: 3 },
    { key: "permBroadcast", name: "Broadcast", hint: "Minimum role to start/stop broadcast", min: 3 },
    { key: "permApproveClaims", name: "Approve Claims", hint: "Minimum role to approve player attention claims", min: 3 },
    { key: "permAddRequests", name: "Add Requests", hint: "Minimum role to add dialogue requests", min: 1 },
  ];
  for (const p of permSettings) {
    game.settings?.register("free-visual-novel", p.key, {
      scope: "world", type: Number, default: p.min, config: true,
      name: p.name, hint: p.hint, choices: roleChoices
    });
  }

  if (game.socket) {
    console.log("FreeVN | Registering socket handler on", SOCKET);
    game.socket.on(SOCKET, (data) => {
      console.log("FreeVN | Socket received:", data?.type, data ? Object.keys(data) : null);
      if (data?.type === "state") _applyVNState(data);
      else if (data?.type === "invite") {
        if (_userCan("permManage")) return;
        if (data.userId && data.userId !== game.user?.id) return;
        console.log("FreeVN | Invite received for", game.user?.id);
        ui.notifications?.info("🎭 You've been invited to the scene!");
      }
      else if (data?.type === "stop") { console.log("FreeVN | Stop received"); _setLastBroadcastState(null); ui.freevisualnovel?.close(); }
      else if (data?.type === "claim") {
        const app = ui.freevisualnovel;
        if (app && _userCan("permApproveClaims")) {
          if (data.claimed) app._claimed[data.portraitId] = true;
          else delete app._claimed[data.portraitId];
          app.render();
        }
      }
      else if (data?.type === "emotion") {
        const app = ui.freevisualnovel;
        if (app && _userCan("permApproveClaims")) {
          const p = app._portraits.find(port => port.id === data.portraitId);
          if (p && !isNaN(data.emotionIdx)) {
            p._currentEmotion = data.emotionIdx;
            app.render();
            _broadcastVNState(app);
          }
        }
      }
    });
    console.log("FreeVN | Socket handler registered");
  } else {
    console.warn("FreeVN | game.socket not available on init");
  }
});

Hooks.once("ready", async function() {

  try { (await import('./region-behavior.js')).registerRegionBehavior(); }
  catch(e) { console.error("FreeVN | Failed to register region behavior:", e); }

  const hasEpicRolls = game.modules?.get("epic-rolls")?.active ?? false;
  const hasSequencer = game.modules?.get("sequencer")?.active ?? false;
  game.freevisualnovel = {
    _hasEpicRolls: hasEpicRolls,
    _hasSequencer: hasSequencer,
    open() { _openVN(); },
    close() { ui.freevisualnovel?.close(); },
    setBackground(path) { ui.freevisualnovel?.setBackground(path); },
    addPortrait(id) { ui.freevisualnovel?.addPortraitToStage(id); },
    addRequest(text, priority) { ui.freevisualnovel?.addRequest(text, priority); },
    clearStage() { ui.freevisualnovel?.clearStage(); },
    importActorPortraits(folderPath) { _importActorPortraits(folderPath); }
  };

  const stored = game.settings?.get("free-visual-novel", "broadcastStore");
  console.log("FreeVN | ready: broadcastStore", stored?.broadcasting, !!stored);
  if (stored && stored.broadcasting) {
    _setLastBroadcastState(stored);
  }

  document.querySelector("#chat-log")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-vn-rejoin]");
    if (!btn) return;
    _rejoinVN();
    const msgEl = btn.closest(".chat-message");
    const msgId = msgEl?.dataset.messageId;
    if (msgId) game.messages.get(msgId)?.delete();
  });
});

Hooks.on("chatMessage", (message, text) => {
  if (text.startsWith("/vnreq ")) {
    const reqText = text.slice(7).trim();
    if (reqText && ui.freevisualnovel) ui.freevisualnovel.addRequest(reqText, "normal");
    return false;
  }
  if (text === "/vnreq" || text === "/vnrequest") {
    ui.notifications?.info("Usage: /vnreq <your request text>");
    return false;
  }
  if (text === "/vnportrait" || text === "/vnedit") { _openVN("portraits"); return false; }
  if (text === "/vnrejoin") { _rejoinVN(); return false; }
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!canvas) return;
  const isArray = Array.isArray(controls);
  const group = {
    name: "freevisualnovel",
    title: "ViNarrat",
    icon: "fas fa-comment-dots",
    layer: "Canvas",
    order: 90,
    visible: true,
    tools: {}
  };
  if (_userCan("permManage")) {
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
  if (isArray) controls.push(group);
  else controls.freevisualnovel = group;
});

console.log("FreeVN | script LOADED");
