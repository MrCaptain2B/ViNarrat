export const DATA_KEY = "vndata";

export function _FP() {
  return foundry?.applications?.apps?.FilePicker?.implementation || FilePicker;
}

export function _defaultData() {
  return {
    locations: [],
    portraits: [],
    presets: [],
    scripts: [],
    nextLocId: 1,
    nextPortId: 1,
    nextPresetId: 1,
    nextScriptId: 1,
    themeBg: "#0d0d1a",
    themeAccent: "#f0c040",
    defaultPortraitScale: 1
  };
}

export async function _loadData() {
  let data = game.settings?.get("free-visual-novel", DATA_KEY);
  if (!data) data = _defaultData();
  else {
    const def = _defaultData();
    for (const k of Object.keys(def)) {
      if (data[k] === undefined) data[k] = def[k];
    }
  }
  return data;
}

export async function _saveData(data) {
  await game.settings?.set("free-visual-novel", DATA_KEY, data);
}

const roleChoices = { 1: "Player", 2: "Trusted", 3: "Assistant", 4: "GM" };
const permDefaults = { permManage: 3, permBroadcast: 3, permApproveClaims: 3, permAddRequests: 1 };

export function _userCan(permKey) {
  const minRole = game.settings?.get("free-visual-novel", permKey) ?? permDefaults[permKey] ?? 3;
  return (game.user?.role ?? 0) >= minRole;
}

export function _roleCan(role, permKey) {
  const minRole = game.settings?.get("free-visual-novel", permKey) ?? permDefaults[permKey] ?? 3;
  return role >= minRole;
}

export const SOCKET = "module.free-visual-novel";

export function _broadcastVNState(app, force) {
  if (!game.user || !_userCan("permManage")) { console.log("FreeVN | _broadcastVNState: blocked, no perm"); return; }
  if (!app._broadcasting && !force) { console.log("FreeVN | _broadcastVNState: blocked, not broadcasting"); return; }
  console.log("FreeVN | Emitting broadcast, socket:", !!game.socket, "broadcasting:", app._broadcasting);
  const payload = {
    type: "state",
    broadcasting: app._broadcasting,
    inviteMode: app._inviteMode || "all",
    bg: app._bg,
    portraits: app._portraits,
    speaker: app._speaker,
    claimed: app._claimed || {},
    dialog: app._dialog,
    themeBg: app._themeBg,
    themeAccent: app._themeAccent,
    speakerFontSize: app._speakerFontSize
  };
  console.log("FreeVN | Broadcasting to players");
  game.socket?.emit(SOCKET, payload);
  _setLastBroadcastState(payload);
  if (app._broadcasting) {
    game.settings?.set("free-visual-novel", "broadcastStore", payload);
  }
}

let _lastVal = null;
export function _getLastBroadcastState() { return _lastVal; }
export function _setLastBroadcastState(v) { _lastVal = v; }

export function _whisperInvite() {
  const macro = game.macros?.getName("ViNarrat: Rejoin");
  const link = macro ? macro.link : "<code>/vnrejoin</code>";
  ChatMessage.create({
    user: game.user?.id,
    whisper: [game.user?.id],
    content: `🎭 <b>ViNarrat</b> broadcast is active. Click to rejoin:<br>${link}`
  });
}

export async function _importActorPortraits(folderPath) {
  if (!folderPath) {
    folderPath = game.settings?.get("free-visual-novel", "defaultPortraitFolder");
  }
  if (!folderPath) {
    try {
      const fp = new (_FP())({ type: "folder", current: "", callback: (path) => {
        _importActorPortraits(path);
      }});
      fp.render(true);
    } catch(e) { console.error("FilePicker error:", e); }
    return;
  }
  let fileList;
  try {
    const result = await _FP().browse("data", folderPath);
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

Handlebars.registerHelper("eq", function(v1, v2) {
  return v1 === v2;
});
Handlebars.registerHelper("or", function(v1, v2) {
  return v1 || v2;
});
Handlebars.registerHelper("add", function(a, b) {
  return (a || 0) + b;
});
Handlebars.registerHelper("multiply", function(a, b) {
  return (a || 0) * b;
});
Handlebars.registerHelper("divide", function(a, b) {
  return b ? (a || 0) / b : 0;
});
Handlebars.registerHelper("getStepType", function(steps, idx) {
  return steps?.[idx]?.type || "";
});
Handlebars.registerHelper("getStepChoices", function(steps, idx) {
  return steps?.[idx]?.choices || [];
});

