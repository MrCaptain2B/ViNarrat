import { _loadData, _saveData, _userCan } from './helpers.js';

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
  if (!this._data) this._data = await _loadData();
  this._data.nextScriptId ||= 1;
  let script;
  if (this._editScriptId) {
    script = { id: this._editScriptId, name, steps: JSON.parse(JSON.stringify(steps)) };
    const idx = this._data.scripts.findIndex(s => s.id === script.id);
    if (idx >= 0) this._data.scripts[idx] = script;
    else this._data.scripts.push(script);
  } else {
    script = { id: String(this._data.nextScriptId++), name, steps: JSON.parse(JSON.stringify(steps)) };
    this._data.scripts.push(script);
  }
  await _saveData(this._data);
  this._editScriptId = null;
  return true;
};

proto._deleteScript = async function(id) {
  if (!_userCan("permManage")) return;
  if (!this._data) this._data = await _loadData();
  this._data.scripts = this._data.scripts.filter(s => s.id !== id);
  await _saveData(this._data);
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
    for (const step of script.steps) {
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
    this.render();
    overlay.style.transition = `opacity ${(firstStep.transitionDuration || 0.5)}s ease`;
    overlay.style.opacity = "0";
    await new Promise(r => setTimeout(r, ((firstStep.transitionDuration || 0.5) * 1000 + 100)));
    if (!this._playback) return;
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
    if (!this._playback) return;
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
  const out = { name: preset.name, version: 1, bg: preset.bg || null, bgBrightness: preset.bgBrightness, hideBg: !!preset.hideBg, hideUI: !!preset.hideUI, speaker: preset.speaker, dialog: preset.dialog, speakerFontSize: preset.speakerFontSize, themeBg: preset.themeBg, themeAccent: preset.themeAccent, currentLocationId: preset.currentLocationId || null, portraits: [] };
  for (const sp of (preset.portraits || [])) {
    const orig = this._data?.portraits?.find(op => op.id === sp.portraitId);
    if (!orig) continue;
    out.portraits.push({ portraitId: sp.portraitId, name: orig.name, title: orig.title, image: orig.image || null, images: orig.images || [], _stageX: sp.x, _stageY: sp.y, _stageScale: sp.scale, _stageFlip: sp.flip, _stageEmotion: sp.emotion });
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const fname = `${preset.name.replace(/[^a-z0-9_-]/gi, "_")}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
  ui.notifications?.info(`Preset "${preset.name}" exported`);
};

proto._importPreset = function() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const preset = JSON.parse(await file.text());
      if (!preset.name || !preset.version) return ui.notifications?.error("Invalid preset file");
      if (!this._data) this._data = await _loadData();
      if (!this._data.presets) this._data.presets = [];
      this._data.nextPresetId ||= 1;
      const newPreset = { id: String(this._data.nextPresetId++), name: preset.name, bg: preset.bg || "", bgBrightness: preset.bgBrightness??1, hideBg: !!preset.hideBg, hideUI: !!preset.hideUI, speaker: preset.speaker||"", dialog: preset.dialog||{}, speakerFontSize: preset.speakerFontSize||20, themeBg: preset.themeBg||"#0d0d1a", themeAccent: preset.themeAccent||"#f0c040", currentLocationId: preset.currentLocationId || null, portraits: [] };
      for (const sp of (preset.portraits || [])) {
        const match = this._data.portraits.find(p => p.id === sp.portraitId || p.name === sp.name);
        const pid = match ? match.id : null;
        newPreset.portraits.push({ portraitId: pid || sp.portraitId, x: sp._stageX??50, y: sp._stageY??200, scale: sp._stageScale??1, flip: sp._stageFlip??false, emotion: sp._stageEmotion??0 });
      }
      this._data.presets.push(newPreset);
      await _saveData(this._data);
      this.render();
      const missing = newPreset.bg && !this._data.locations?.find(l => l.file === newPreset.bg);
      ui.notifications?.info(`Preset "${preset.name}" imported${missing ? " (background path may not exist in this world)" : ""}`);
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
      this._tempStepsDirty = false;
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

};

proto._bindScriptEditor = function(html) {
  const panel = html.querySelector(".vn-panel-floating");
  const header = panel?.querySelector(".vn-panel-header");
  if (header) {
    let drag = null;
    const onDown = (ev) => { if (ev.button !== 0) return; drag = { ox: ev.clientX - (panel.offsetLeft || 0), oy: ev.clientY - (panel.offsetTop || 0) }; };
    const onMove = (ev) => { if (!drag) return; panel.style.left = (ev.clientX - drag.ox) + "px"; panel.style.right = "auto"; panel.style.top = (ev.clientY - drag.oy) + "px"; };
    const onUp = () => { drag = null; };
    header.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    this._dragCleanupPanel = () => { header.removeEventListener("pointerdown", onDown); document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
  }

  html.querySelector(".vn-sceditor-back")?.addEventListener("click", () => {
    if (this._tempStepsDirty && !confirm("Discard unsaved changes?")) return;
    this._editScriptId = null;
    this._tempSteps = [];
    this._tempStepsDirty = false;
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
      this._tempStepsDirty = false;
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
        this._tempStepsDirty = true;
      }
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-duration").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].duration = parseFloat(inp.value) || 0;
        this._tempStepsDirty = true;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-label").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].label = inp.value;
        this._tempStepsDirty = true;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-transition").forEach(sel => {
    sel.addEventListener("change", () => {
      const idx = parseInt(sel.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].transition = sel.value;
        this._tempStepsDirty = true;
      }
    });
  });

  html.querySelectorAll(".vn-sceditor-transition-dur").forEach(inp => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.dataset.idx);
      if (this._tempSteps[idx]) {
        this._tempSteps[idx].transitionDuration = parseFloat(inp.value) || 0.5;
        this._tempStepsDirty = true;
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
      this._tempStepsDirty = true;
      this._activeEditIdx = this._tempSteps.length - 1;
      this.render();
    });
  });

  html.querySelectorAll(".vn-sceditor-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      this._saveActiveStep();
      this._tempSteps.splice(idx, 1);
      this._tempStepsDirty = true;
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
      this._tempStepsDirty = true;
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
      this._tempStepsDirty = true;
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
    if (ev.target.closest(".vn-gm-toolbar") || ev.target.closest(".vn-playback-bar") || ev.target.closest(".vn-panel") || ev.target.closest(".vn-emotion-strip")) { ev.stopImmediatePropagation(); return; }
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
