export const DATA_KEY = "vndata";
const DATA_SRC = "data";

export function _FP() {
  const fp = foundry?.applications?.apps?.FilePicker?.implementation || FilePicker;
  console.log("FVN | _FP() =>", fp?.name, typeof fp?.createDirectory);
  return fp;
}

function _worldDir() {
  return `worlds/${game.world?.id || "unknown"}`;
}

export function _scriptsDir() {
  return `${_worldDir()}/free-visual-novel/scripts`;
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
    themeAccent: "#f0c040"
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
  try {
    const fileScripts = await _loadScriptsFromFiles();
    if (fileScripts.length) data.scripts = fileScripts;
  } catch(e) { /* ignore */ }
  return data;
}

export async function _saveData(data) {
  await game.settings?.set("free-visual-novel", DATA_KEY, data);
}

/* ── File-based script storage ── */

async function _ensureScriptsDir() {
  try {
    await _FP().createDirectory(DATA_SRC, _scriptsDir());
  } catch(e) {
    /* already exists */
  }
}

async function _readTextFile(path) {
  const DataOps = foundry.data?.DataOperations;
  if (DataOps?.read) {
    const result = await DataOps.read(DATA_SRC, path);
    return typeof result === "string" ? result : await result?.text?.();
  }
  const url = `${location.origin}/${path}`;
  const resp = await fetch(url);
  return resp.text();
}

async function _writeTextFile(path, content) {
  const DataOps = foundry.data?.DataOperations;
  if (DataOps?.write) {
    await DataOps.write(DATA_SRC, path, content);
    return;
  }
  const blob = new Blob([content], {type: "application/json"});
  const file = new File([blob], path.split("/").pop());
  await _FP().upload(DATA_SRC, path.replace(/[^/]+$/, ""), file);
}

async function _removeFile(path) {
  const DataOps = foundry.data?.DataOperations;
  if (DataOps?.delete) {
    await DataOps.delete(DATA_SRC, path);
    return;
  }
  console.warn("FreeVN | DataOperations.delete() not available; cannot remove file:", path);
}

export async function _loadScriptsFromFiles() {
  try {
    await _ensureScriptsDir();
    const result = await _FP().browse(DATA_SRC, _scriptsDir());
    const scripts = [];
    for (const file of (result.files || [])) {
      if (!file.endsWith(".json")) continue;
      try {
        const text = await _readTextFile(file);
        const script = JSON.parse(text);
        scripts.push(script);
      } catch(e2) {
        console.error("FreeVN | Failed to parse script file:", file, e2);
      }
    }
    return scripts;
  } catch(e) {
    if (e?.message?.includes("does not exist") || e?.message?.includes("not found")) {
      return [];
    }
    console.error("FreeVN | Failed to browse scripts directory:", e);
    return [];
  }
}

export async function _saveScriptToFile(script) {
  await _ensureScriptsDir();
  const path = `${_scriptsDir()}/${script.id}.json`;
  await _writeTextFile(path, JSON.stringify(script, null, 2));
}

export async function _deleteScriptFile(id) {
  const path = `${_scriptsDir()}/${id}.json`;
  await _removeFile(path);
}

export async function _migrateScriptsToFiles() {
  const data = await _loadData();
  if (!data.scripts?.length) return;
  for (const script of data.scripts) {
    try {
      await _saveScriptToFile(script);
    } catch(e) {
      console.error("FreeVN | Failed to migrate script:", script.id, e);
    }
  }
  data.scripts = [];
  await _saveData(data);
  console.log(`FreeVN | Migrated ${data.scripts?.length || 0} scripts to file storage`);
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
    dialog: app._dialog
  };
  console.log("FreeVN | Broadcasting to players");
  game.socket?.emit(SOCKET, payload);
  if (app._broadcasting) {
    game.settings?.set("free-visual-novel", "broadcastStore", payload);
  }
}

let _lastVal = null;
export function _getLastBroadcastState() { return _lastVal; }
export function _setLastBroadcastState(v) { _lastVal = v; }

export function _whisperInvite() {
  ChatMessage.create({
    user: game.user?.id,
    whisper: [game.user?.id],
    content: `🎭 <b>Free Visual Novel</b> broadcast is active!<br>Type <code>/vnrejoin</code> to return to the scene.`
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

export async function _fetchFileAsBlob(path) {
  const url = path.startsWith("http") ? path : `${location.origin}/${path}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`);
  return resp.blob();
}

export function _extFromPath(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1) : "bin";
}
