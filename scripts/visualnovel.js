import VisualNovelApp from './app.js';
import { _lastBroadcastState, _userCan, _roleCan, SOCKET, _loadData, _saveData, _defaultData, DATA_KEY, _broadcastVNState, _importActorPortraits } from './helpers.js';

export { VisualNovelApp, _lastBroadcastState, _userCan, _roleCan, SOCKET, _loadData, _saveData, _defaultData, DATA_KEY };

let _vnOpening = false;

function _openVN(openPanel) {
  if (_vnOpening) return;
  _vnOpening = true;
  if (ui.freevisualnovel?.rendered) {
    if (openPanel) ui.freevisualnovel._showPanel = openPanel;
    ui.freevisualnovel.render(true);
    _vnOpening = false;
    return;
  }
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    if (openPanel) app._showPanel = openPanel;
    app.render(true);
  } catch(e) {
    console.error("FreeVN | Failed to open:", e);
    ui.notifications?.error("Free Visual Novel: failed to open");
  }
  _vnOpening = false;
}

function _rejoinVN() {
  if (!_lastBroadcastState) { _openVN(); return; }
  if (_vnOpening) return;
  _vnOpening = true;
  if (ui.freevisualnovel?.rendered) {
    const app = ui.freevisualnovel;
    app._bg = _lastBroadcastState.bg || "";
    app._portraits = _lastBroadcastState.portraits || [];
    app._speaker = _lastBroadcastState.speaker || "";
    app._claimed = _lastBroadcastState.claimed || {};
    if (_lastBroadcastState.dialog) app._dialog = Object.assign({}, app._dialog, _lastBroadcastState.dialog);
    app.render(true);
    _vnOpening = false;
    return;
  }
  try {
    const app = new VisualNovelApp();
    ui.freevisualnovel = app;
    app._bg = _lastBroadcastState.bg || "";
    app._portraits = _lastBroadcastState.portraits || [];
    app._speaker = _lastBroadcastState.speaker || "";
    app._claimed = _lastBroadcastState.claimed || {};
    if (_lastBroadcastState.dialog) app._dialog = Object.assign({}, app._dialog, _lastBroadcastState.dialog);
    app.render(true);
  } catch(e) {
    console.error("FreeVN | Failed to rejoin:", e);
    ui.notifications?.error("Free Visual Novel: failed to rejoin");
  }
  _vnOpening = false;
}

function _applyVNState(data) {
  if (!game.user || _userCan("permManage")) return;
  if (!data.broadcasting) {
    _lastBroadcastState = null;
    ui.freevisualnovel?.close();
    return;
  }
  if (data.targetUser && data.targetUser !== game.user?.id) return;
  if (data.inviteMode === "stage") {
    const hasPortraitOnStage = (data.portraits || []).some(p => p.userId === game.user?.id);
    if (!hasPortraitOnStage) {
      _lastBroadcastState = null;
      ui.freevisualnovel?.close();
      return;
    }
  }
  _lastBroadcastState = data;
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
    hint: "Main background color for the VN overlay (e.g. #0d0d1a)"
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

  const hasEpicRolls = game.modules?.get("epic-rolls")?.active ?? false;
  const hasSequencer = game.modules?.get("sequencer")?.active ?? false;

  game.socket?.on(SOCKET, (data) => {
    if (data?.type === "state") _applyVNState(data);
    else if (data?.type === "invite") {
      if (_userCan("permManage")) return;
      if (data.userId && data.userId !== game.user?.id) return;
      ui.notifications?.info("🎭 You've been invited to the VN scene!");
    }
    else if (data?.type === "stop") { _lastBroadcastState = null; ui.freevisualnovel?.close(); }
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

Hooks.on("getSceneControlButtons", (t) => {
  if (!canvas) return;
  const group = {
    name: "freevisualnovel",
    title: "Free Visual Dialogs",
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
  t.freevisualnovel = group;
});

Hooks.once("ready", () => {
  const stored = game.settings?.get("free-visual-novel", "broadcastStore");
  if (stored && stored.broadcasting) _applyVNState(stored);
});

console.log("FreeVN | script LOADED");
