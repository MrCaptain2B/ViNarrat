import { _loadData, _saveData, _userCan, _loadScriptsFromFiles, _saveScriptToFile, _deleteScriptFile, _migrateScriptsToFiles, _scriptsDir, _fetchFileAsBlob, _extFromPath, _FP } from './helpers.js';

export function bindScriptEngine(proto) {

proto._createTransitionOverlay = function() {
  let overlay = document.querySelector(".vn-transition-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "vn-transition-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
};

proto._performTransition = function(type, duration, prepareFn) {
  return new Promise(resolve => {
    const overlay = this._createTransitionOverlay();
    if (!overlay) { prepareFn?.(); resolve(); return; }
    if (type === "fadeToBlack") {
      const half = (duration || 0.5) / 2;
      overlay.style.transition = "none";
      overlay.style.opacity = "0";
      void overlay.offsetHeight;
      overlay.style.transition = `opacity ${half}s ease`;
      overlay.style.opacity = "1";
      setTimeout(() => {
        prepareFn?.();
        overlay.style.transition = `opacity ${half}s ease`;
        overlay.style.opacity = "0";
        setTimeout(resolve, half * 1000 + 50);
      }, half * 1000 + 50);
    } else if (type === "crossfade") {
      prepareFn?.();
      overlay.style.transition = "none";
      overlay.style.opacity = "0";
      void overlay.offsetHeight;
      overlay.style.transition = `opacity ${(duration || 0.5)}s ease`;
      overlay.style.opacity = "0.5";
      setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(resolve, (duration || 0.5) / 2 * 1000 + 50);
      }, 50);
    } else {
      prepareFn?.();
      resolve();
    }
  });
};

proto._saveScript = async function(name, steps) {
  if (!_userCan("permManage")) return;
  let script;
  if (this._editScriptId) {
    script = { id: this._editScriptId, name, steps: JSON.parse(JSON.stringify(steps)) };
  } else {
    const existing = await _loadScriptsFromFiles();
    let maxId = existing.reduce((m, s) => Math.max(m, parseInt(s.id) || 0), 0);
    script = { id: String(maxId + 1), name, steps: JSON.parse(JSON.stringify(steps)) };
  }
  try {
    await _saveScriptToFile(script);
  } catch (err) {
    console.error("FreeVN | _saveScript error:", err);
    return false;
  }
  this._editScriptId = null;
  return true;
};

proto._deleteScript = async function(id) {
  if (!_userCan("permManage")) return;
  await _deleteScriptFile(id);
};

proto._captureSceneState = function() {
  return {
    dialog: JSON.parse(JSON.stringify(this._dialog)),
    speaker: this._speaker,
    bg: this._bg,
    bgBrightness: this._bgBrightness,
    stage: this._portraits.map(p => ({
      portraitId: p.id,
      x: p.x,
      y: p.y,
      scale: p.scale,
      flip: p.flip,
      locked: p.locked,
      emotion: p._currentEmotion || 0
    }))
  };
};

proto._applyStepState = function(state) {
  if (!state) return;
  if (state.dialog) Object.assign(this._dialog, state.dialog);
  this._speaker = state.speaker ?? "";
  this._bg = state.bg ?? "";
  this._bgBrightness = state.bgBrightness ?? 1;
  const newPortraits = [];
  for (const s of (state.stage || [])) {
    const portData = this._data?.portraits.find(p => p.id === s.portraitId);
    if (portData) {
      const images = portData.images && portData.images.length ? portData.images : (portData.image ? [portData.image] : []);
      newPortraits.push({
        ...portData,
        images,
        x: s.x ?? 50,
        y: s.y ?? 200,
        scale: s.scale ?? 1,
        flip: s.flip ?? false,
        locked: s.locked ?? false,
        _currentEmotion: s.emotion ?? 0
      });
    }
  }
  this._portraits = newPortraits;
};

proto._saveActiveStep = function() {
  if (this._activeEditIdx === null || this._activeEditIdx < 0 || this._activeEditIdx >= this._tempSteps.length) return;
  this._tempSteps[this._activeEditIdx].state = this._captureSceneState();
};

proto._startPlayback = async function(script) {
  if (!script?.steps?.length) {
    ui.notifications?.warn("Script has no steps.");
    return;
  }
  this._clearTypewriter();
  this._playback = {
    script: JSON.parse(JSON.stringify(script)),
    currentStep: 0,
    playing: false,
    timer: null,
    transitioning: false
  };
  this._prePlaybackState = this._captureSceneState();
  if (game.settings?.get("free-visual-novel", "scriptAssetWarnings") !== false) {
    const missingPortraits = new Set();
    for (const step of steps) {
      if (!step.state) continue;
      if (step.state.speaker && !this._data?.portraits?.find(p => p.id === step.state.speaker)) {
        missingPortraits.add(step.state.speaker);
      }
      for (const s of (step.state.stage || [])) {
        if (!this._data?.portraits?.find(p => p.id === s.portraitId)) {
          missingPortraits.add(s.portraitId);
        }
      }
    }
    if (missingPortraits.size) {
      ui.notifications?.warn(`Script "${script.name}" references missing portraits: ${[...missingPortraits].join(", ")}`, {permanent: true});
    }
  }
  this._showPanel = null;
  this._activeEditIdx = null;
  const steps = this._playback.script.steps;
  const firstStep = steps[0];
  if (firstStep && firstStep.type === "transition" && firstStep.transition !== "none") {
    this._playback.transitioning = true;
    const overlay = this._createTransitionOverlay();
    overlay.style.transition = "none";
    overlay.style.opacity = "1";
    void overlay.offsetHeight;
    let firstSceneIdx = 0;
    while (firstSceneIdx < steps.length && steps[firstSceneIdx].type === "transition") {
      firstSceneIdx++;
    }
    const sceneState = firstSceneIdx < steps.length ? steps[firstSceneIdx].state : null;
    if (sceneState) {
      this._applyStepState(sceneState);
      this._broadcast();
    }
    overlay.style.transition = `opacity ${(firstStep.transitionDuration || 0.5) / 2}s ease`;
    overlay.style.opacity = "0";
    await new Promise(r => setTimeout(r, ((firstStep.transitionDuration || 0.5) / 2) * 1000 + 100));
    this._playback.currentStep = firstSceneIdx < steps.length ? firstSceneIdx : 0;
    this._playback.transitioning = false;
    this._typewriterDirty = true;
    this.render();
  } else {
    this._playStep(0);
  }
};

proto._stopPlayback = async function() {
  this._clearTypewriter();
  if (this._playback?.timer) clearTimeout(this._playback.timer);
  const overlay = this._createTransitionOverlay();
  if (overlay) {
    overlay.style.transition = "none";
    overlay.style.opacity = "0";
  }
  if (this._prePlaybackState) {
    this._applyStepState(this._prePlaybackState);
    this._prePlaybackState = null;
  }
  this._playback = null;
  this.render();
};

proto._nextStep = async function() {
  if (!this._playback) return;
  if (this._playback.transitioning) return;
  if (this._playback.timer) { clearTimeout(this._playback.timer); this._playback.timer = null; }
  this._playback.playing = false;
  const steps = this._playback.script.steps;
  const next = this._playback.currentStep + 1;
  if (next >= steps.length) {
    ui.notifications?.info("Script finished.");
    this._stopPlayback();
    return;
  }
  this._playback.currentStep = next;
  await this._playStep(next);
};

proto._prevStep = async function() {
  if (!this._playback) return;
  if (this._playback.transitioning) return;
  if (this._playback.timer) { clearTimeout(this._playback.timer); this._playback.timer = null; }
  this._playback.playing = false;
  const prev = this._playback.currentStep - 1;
  if (prev < 0) { this._playback.currentStep = 0; this.render(); return; }
  this._playback.currentStep = prev;
  await this._playStep(prev);
};

proto._playStep = async function(idx) {
  const steps = this._playback.script.steps;
  const step = steps[idx];
  if (!step) return;
  this._clearTypewriter();
  if (step.type === "transition" && step.transition && step.transition !== "none") {
    this._playback.transitioning = true;
    this._playback.playing = false;
    this.render();
    const isLastStep = idx >= steps.length - 1;
    if (isLastStep) {
      const overlay = this._createTransitionOverlay();
      if (overlay) {
        overlay.style.transition = "none";
        overlay.style.opacity = "0";
        void overlay.offsetHeight;
        overlay.style.transition = `opacity ${(step.transitionDuration || 0.5)}s ease`;
        overlay.style.opacity = "1";
        await new Promise(r => setTimeout(r, (step.transitionDuration || 0.5) * 1000 + 100));
      }
    } else {
      await this._performTransition(step.transition, step.transitionDuration, null);
    }
    this._playback.transitioning = false;
    this._typewriterDirty = false;
    this.render();
    return;
  }
  this._applyStepState(step.state);
  this._broadcast();
  this._typewriterDirty = (step.type !== "pause");
  if (step.duration > 0) {
    this._playback.playing = true;
    this.render();
    this._playback.timer = setTimeout(() => this._nextStep(), step.duration * 1000);
  } else {
    this._playback.playing = false;
    this.render();
  }
};

proto._clearTypewriter = function() {
  if (this._typewriterTimer) {
    clearInterval(this._typewriterTimer);
    this._typewriterTimer = null;
  }
  this._typewriterFullText = "";
  this._typewriterPos = 0;
};

proto._startTypewriter = function() {
  this._clearTypewriter();
  const contentEls = document.querySelectorAll(".vn-dialog-content");
  const mainEl = Array.from(contentEls).find(el => el.dataset.side === "single" || el.dataset.side === "right");
  if (!mainEl) return;
  const fullText = mainEl.textContent || "";
  if (!fullText) return;
  this._typewriterFullText = fullText;
  this._typewriterPos = 0;
  mainEl.textContent = "";
  const leftEl = Array.from(contentEls).find(el => el.dataset.side === "left");
  if (leftEl) leftEl.textContent = "";
  const speed = 25;
  this._typewriterTimer = setInterval(() => {
    this._typewriterPos++;
    if (mainEl) mainEl.textContent = this._typewriterFullText.substring(0, this._typewriterPos);
    if (this._typewriterPos >= this._typewriterFullText.length) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
  }, speed);
};

proto._exportPreset = async function(presetId) {
  const preset = this._data?.presets?.find(p => p.id === presetId);
  if (!preset) return ui.notifications?.error("Preset not found");
  const zip = new JSZip();
  const exportData = {
    name: preset.name, version: 1, bg: preset.bg, bgBrightness: preset.bgBrightness,
    hideBg: !!preset.hideBg, hideUI: !!preset.hideUI, speaker: preset.speaker,
    dialog: preset.dialog, speakerFontSize: preset.speakerFontSize,
    themeBg: preset.themeBg, themeAccent: preset.themeAccent,
    currentLocationId: preset.currentLocationId,
    portraits: [], backgrounds: [], scripts: []
  };
  for (const sp of (preset.portraits || [])) {
    const orig = this._data?.portraits?.find(op => op.id === sp.portraitId);
    if (!orig) continue;
    const entry = { id: orig.id, name: orig.name, title: orig.title, tags: orig.tags, group: orig.group, actorId: orig.actorId, userId: orig.userId };
    if (orig.image) try {
      const blob = await _fetchFileAsBlob(orig.image);
      zip.file(`portraits/${sp.portraitId}.${_extFromPath(orig.image)}`, blob);
      entry.image = `portraits/${sp.portraitId}.${_extFromPath(orig.image)}`;
    } catch(e) { console.warn("FVN | export missing portrait img", orig.image); }
    if (orig.images?.length) {
      entry.images = [];
      for (let i = 0; i < orig.images.length; i++) if (orig.images[i]) try {
        const blob = await _fetchFileAsBlob(orig.images[i]);
        zip.file(`portraits/${sp.portraitId}_em${i}.${_extFromPath(orig.images[i])}`, blob);
        entry.images.push(`portraits/${sp.portraitId}_em${i}.${_extFromPath(orig.images[i])}`);
      } catch(e) { entry.images.push(orig.images[i]); }
    }
    entry._stageX = sp.x; entry._stageY = sp.y; entry._stageScale = sp.scale;
    entry._stageFlip = sp.flip; entry._stageEmotion = sp.emotion;
    exportData.portraits.push(entry);
  }
  if (preset.bg) try {
    const loc = this._data?.locations?.find(l => l.file === preset.bg);
    const bgEntry = loc ? { id: loc.id, name: loc.name, tags: loc.tags, group: loc.group } : { id: "bg1", name: "Background" };
    const blob = await _fetchFileAsBlob(preset.bg);
    zip.file(`backgrounds/bg.${_extFromPath(preset.bg)}`, blob);
    bgEntry.file = `backgrounds/bg.${_extFromPath(preset.bg)}`;
    exportData.backgrounds.push(bgEntry);
  } catch(e) { console.warn("FVN | export missing bg", preset.bg); }
  zip.file("preset.json", JSON.stringify(exportData, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const fname = `${preset.name.replace(/[^a-z0-9_-]/gi, "_")}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
  ui.notifications?.info(`Preset "${preset.name}" exported`);
};

proto._importPreset = function() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".zip";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const presetFile = zip.file("preset.json");
      if (!presetFile) return ui.notifications?.error("Invalid preset: missing preset.json");
      const preset = JSON.parse(await presetFile.async("string"));
      if (!this._data) this._data = await _loadData();
      if (!this._data.presets) this._data.presets = [];
      this._data.nextPresetId ||= 1; this._data.nextPortId ||= 1; this._data.nextLocId ||= 1;
      const importDir = `worlds/${game.world.id}/free-visual-novel/imports`;
      const DataOps = foundry.data?.DataOperations;
      async function _storeFile(subdir, fn, blob) {
        const path = `${importDir}/${subdir}/${fn}`;
        if (DataOps?.write) {
          await DataOps.write("data", path, new Uint8Array(await blob.arrayBuffer()));
        } else {
          await _FP().upload("data", `${importDir}/${subdir}`, new File([blob], fn));
        }
        return path;
      }
      const bgIds = {};
      for (const bg of (preset.backgrounds || [])) if (bg.file) try {
        const zf = zip.file(bg.file); if (!zf) continue;
        const blob = await zf.async("blob");
        const fn = bg.file.split("/").pop();
        const saved = await _storeFile("backgrounds", fn, blob);
        const newId = String(this._data.nextLocId++);
        bgIds[bg.id || bg.name] = newId;
        this._data.locations.push({ id: newId, name: bg.name || fn, file: saved, tags: [...(bg.tags||[]), "Import"], group: "Import" });
      } catch(e) { console.warn("FVN | import bg", e); }
      const portIds = {};
      for (const port of (preset.portraits || [])) {
        const newId = String(this._data.nextPortId++);
        portIds[port.id] = newId;
        const p = { id: newId, name: port.name, title: port.title||"", tags: [...(port.tags||[]), "Import"], group: "Import", actorId: port.actorId||"", userId: game.user?.id };
        if (port.image) try {
          const zf = zip.file(port.image); if (zf) {
            const blob = await zf.async("blob");
            const fn = port.image.split("/").pop();
            p.image = await _storeFile("portraits", fn, blob);
          }
        } catch(e) { console.warn("FVN | import portrait img", e); }
        if (port.images?.length) {
          p.images = [];
          for (const emPath of port.images) try {
            const zf = zip.file(emPath); if (zf) {
              const blob = await zf.async("blob");
              const fn = emPath.split("/").pop();
              p.images.push(await _storeFile("portraits", fn, blob));
            }
          } catch(e) { console.warn("FVN | import emotion img", e); }
        }
        this._data.portraits.push(p);
      }
      const newPreset = { id: String(this._data.nextPresetId++), name: preset.name, bg: "", bgBrightness: preset.bgBrightness??1, hideBg: !!preset.hideBg, hideUI: !!preset.hideUI, speaker: preset.speaker||"", dialog: preset.dialog||{}, speakerFontSize: preset.speakerFontSize||20, themeBg: preset.themeBg||"#0d0d1a", themeAccent: preset.themeAccent||"#f0c040", currentLocationId: null, portraits: [] };
      const mappedBgId = bgIds[preset.currentLocationId];
      const firstBg = mappedBgId ? this._data.locations.find(l => l.id === mappedBgId) : null;
      if (firstBg) { newPreset.bg = firstBg.file; newPreset.currentLocationId = firstBg.id; }
      for (const sp of (preset.portraits || [])) {
        const newId = portIds[sp.id];
        if (newId) newPreset.portraits.push({ portraitId: newId, x: sp._stageX??50, y: sp._stageY??200, scale: sp._stageScale??1, flip: sp._stageFlip??false, emotion: sp._stageEmotion??0 });
      }
      this._data.presets.push(newPreset);
      await _saveData(this._data);
      this.render();
      ui.notifications?.info(`Preset "${preset.name}" imported`);
    } catch(e) { console.error("FVN | Import error:", e); ui.notifications?.error("Failed to import preset"); }
  };
  input.click();
};

proto._bindScriptPanel = function() {
  const html = this._el();
  if (this._showPanel === "scriptEdit") {
    this._bindScriptEditor(html);
  } else {
    this._bindScriptList(html);
  }
};

proto._bindScriptList = function(html) {
  html.querySelector(".vn-scripts-back")?.addEventListener("click", () => {
    this._showPanel = null;
    this.render();
  });
  html.querySelectorAll(".vn-script-load").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const script = this._data?.scripts.find(s => s.id === id);
      if (script) this._startPlayback(script);
    });
  });
  html.querySelectorAll(".vn-script-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      this._editScriptId = btn.dataset.id;
      const script = this._data?.scripts?.find(s => s.id === this._editScriptId);
      this._tempSteps = script ? JSON.parse(JSON.stringify(script.steps)) : [];
      this._activeEditIdx = null;
      this._showPanel = "scriptEdit";
      this.render();
    });
  });
  html.querySelectorAll(".vn-script-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      await this._deleteScript(btn.dataset.id);
      this.render();
    });
  });
  html.querySelector(".vn-scripts-open-folder")?.addEventListener("click", () => {
    const dir = _scriptsDir();
  const fp = new (_FP())({
      type: "any",
      current: dir,
      callback: async () => {
        await this._refreshScriptsFromFiles();
        this.render();
      }
    });
    fp.browse?.() || fp.render(true);
  });
};

proto._bindScriptEditor = function(html) {
  html.querySelector(".vn-sceditor-back")?.addEventListener("click", () => {
    this._editScriptId = null;
    this._tempSteps = [];
    this._activeEditIdx = null;
    this._showPanel = null;
    this.render();
  });

  html.querySelector(".vn-sceditor-save")?.addEventListener("click", async () => {
    this._saveActiveStep();
    const name = html.querySelector(".vn-sceditor-name")?.value || "Unnamed Script";
    if (await this._saveScript(name, this._tempSteps)) {
      ui.notifications?.info("Script saved");
      this._showPanel = "scripts";
      this._editScriptId = null;
      this._tempSteps = [];
      this._activeEditIdx = null;
      this.render();
    } else {
      ui.notifications?.error("Failed to save script");
    }
  });

  html.querySelectorAll(".vn-sceditor-load").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      this._saveActiveStep();
      this._activeEditIdx = idx;
      this._applyStepState(this._tempSteps[idx].state);
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-toggle-type").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      const step = this._tempSteps[idx];
      if (step) {
        const types = ["scene", "pause", "transition"];
        const curIdx = types.indexOf(step.type);
        step.type = types[(curIdx + 1) % types.length];
        if (step.type === "transition") {
          step.transition = step.transition || "fadeToBlack";
          step.transitionDuration = step.transitionDuration || 0.5;
        }
      }
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-duration").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].duration = parseFloat(inp.value) || 0;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-label").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].label = inp.value;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-transition").forEach(sel => {
    sel.addEventListener("change", () => {
      const idx = parseInt(sel.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].transition = sel.value;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-transition-dur").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].transitionDuration = parseFloat(inp.value) || 0.5;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-add")?.forEach(btn => {
    btn.addEventListener("click", () => {
      this._saveActiveStep();
      const addType = btn.dataset.addType || "scene";
      const prevStep = this._activeEditIdx !== null ? this._tempSteps[this._activeEditIdx] : null;
      let newStep;
      if (addType === "transition") {
        newStep = {
          type: "transition",
          label: "",
          duration: 0,
          transition: "fadeToBlack",
          transitionDuration: 0.5,
          state: prevStep ? JSON.parse(JSON.stringify(prevStep.state)) : this._captureSceneState()
        };
      } else if (addType === "pause") {
        newStep = {
          type: "pause",
          label: "",
          duration: 2,
          state: prevStep ? JSON.parse(JSON.stringify(prevStep.state)) : this._captureSceneState()
        };
      } else {
        newStep = {
          type: "scene",
          label: "",
          duration: 0,
          state: prevStep ? JSON.parse(JSON.stringify(prevStep.state)) : this._captureSceneState()
        };
      }
      this._tempSteps.push(newStep);
      this._activeEditIdx = this._tempSteps.length - 1;
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      this._saveActiveStep();
      this._tempSteps.splice(idx, 1);
      if (this._activeEditIdx === idx) {
        this._activeEditIdx = null;
      } else if (this._activeEditIdx > idx) {
        this._activeEditIdx--;
      }
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-up").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx <= 0) return;
      this._saveActiveStep();
      [this._tempSteps[idx - 1], this._tempSteps[idx]] = [this._tempSteps[idx], this._tempSteps[idx - 1]];
      if (this._activeEditIdx === idx) {
        this._activeEditIdx = idx - 1;
      } else if (this._activeEditIdx === idx - 1) {
        this._activeEditIdx = idx;
      }
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-down").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx >= this._tempSteps.length - 1) return;
      this._saveActiveStep();
      [this._tempSteps[idx], this._tempSteps[idx + 1]] = [this._tempSteps[idx + 1], this._tempSteps[idx]];
      if (this._activeEditIdx === idx) {
        this._activeEditIdx = idx + 1;
      } else if (this._activeEditIdx === idx + 1) {
        this._activeEditIdx = idx;
      }
      this.render();
    });
  });
};

proto._bindPlayback = function() {
  const html = this._el();
  html.querySelector(".vn-playback-play")?.addEventListener("click", () => {
    if (this._playback.playing) {
      if (this._playback.timer) clearTimeout(this._playback.timer);
      this._playback.playing = false;
      this.render();
    } else {
      this._clearTypewriter();
      this._playStep(this._playback.currentStep);
    }
  });
  html.querySelector(".vn-playback-prev")?.addEventListener("click", () => this._prevStep());
  html.querySelector(".vn-playback-next")?.addEventListener("click", () => this._nextStep());
  html.querySelector(".vn-playback-stop")?.addEventListener("click", () => this._stopPlayback());
  html.querySelector(".vn-root")?.addEventListener("click", (ev) => {
    if (!this._playback) { ev.stopImmediatePropagation(); return; }
    if (this._playback.transitioning) { ev.stopImmediatePropagation(); return; }
    if (ev.target.closest(".vn-gm-toolbar") || ev.target.closest(".vn-playback-bar") || ev.target.closest(".vn-panel")) { ev.stopImmediatePropagation(); return; }
    if (this._typewriterTimer) {
      this._clearTypewriter();
      const contentEls = document.querySelectorAll(".vn-dialog-content");
      contentEls.forEach(el => {
        const side = el.dataset.side;
        if (side === "single" || side === "right") el.textContent = this._typewriterFullText || "";
      });
      ev.stopImmediatePropagation();
      return;
    }
    this._nextStep();
    ev.stopImmediatePropagation();
  });
};

} // end bindScriptEngine
