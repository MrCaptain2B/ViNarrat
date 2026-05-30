import { _loadData, _saveData, _userCan } from './helpers.js';

export function bindScriptEngine(proto) {

proto._saveScript = async function(name, steps) {
  if (!_userCan("permManage")) return;
  if (!this._data) this._data = await _loadData();
  if (!this._data.scripts) this._data.scripts = [];
  if (!this._data.nextScriptId) this._data.nextScriptId = 1;
  const existing = this._data.scripts.find(s => s.id === this._editScriptId);
  try {
    if (existing) {
      existing.name = name;
      existing.steps = JSON.parse(JSON.stringify(steps));
    } else {
      this._data.scripts.push({
        id: String(this._data.nextScriptId++),
        name,
        steps: JSON.parse(JSON.stringify(steps))
      });
    }
  } catch (err) {
    console.error("FreeVN | _saveScript error:", err);
    return false;
  }
  await _saveData(this._data);
  this._editScriptId = null;
  return true;
};

proto._deleteScript = async function(id) {
  if (!_userCan("permManage") || !this._data?.scripts) return;
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

proto._startPlayback = function(script) {
  if (!script?.steps?.length) {
    ui.notifications?.warn("Script has no steps.");
    return;
  }
  this._playback = {
    script: JSON.parse(JSON.stringify(script)),
    currentStep: 0,
    playing: false,
    timer: null
  };
  this._showPanel = null;
  this._activeEditIdx = null;
  this._applyStepState(script.steps[0].state);
  this.render();
};

proto._stopPlayback = function() {
  if (this._playback?.timer) clearTimeout(this._playback.timer);
  this._playback = null;
  this.render();
};

proto._nextStep = function() {
  if (!this._playback) return;
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
  this._playStep(next);
};

proto._prevStep = function() {
  if (!this._playback) return;
  if (this._playback.timer) { clearTimeout(this._playback.timer); this._playback.timer = null; }
  this._playback.playing = false;
  const prev = this._playback.currentStep - 1;
  if (prev < 0) { this._playback.currentStep = 0; this.render(); return; }
  this._playback.currentStep = prev;
  this._playStep(prev);
};

proto._playStep = function(idx) {
  const steps = this._playback.script.steps;
  const step = steps[idx];
  if (!step) return;
  this._applyStepState(step.state);
  this._broadcast();
  if (step.type === "pause") {
    if (step.duration > 0) {
      this._playback.playing = true;
      this.render();
      this._playback.timer = setTimeout(() => this._nextStep(), step.duration * 1000);
    } else {
      this._playback.playing = false;
      this.render();
    }
  } else {
    if (step.duration > 0) {
      this._playback.playing = true;
      this.render();
      this._playback.timer = setTimeout(() => this._nextStep(), step.duration * 1000);
    } else {
      this._playback.playing = false;
      this.render();
    }
  }
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
};

proto._bindScriptEditor = function(html) {
  html.querySelector(".vn-sceditor-back")?.addEventListener("click", () => {
    this._editScriptId = null;
    this._tempSteps = [];
    this._activeEditIdx = null;
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
        step.type = step.type === "pause" ? "normal" : "pause";
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

  html.querySelectorAll(".vn-sceditor-add")?.forEach(btn => {
    btn.addEventListener("click", () => {
      this._saveActiveStep();
      const prevStep = this._activeEditIdx !== null ? this._tempSteps[this._activeEditIdx] : null;
      const newStep = {
        type: "normal",
        label: "",
        duration: 0,
        state: prevStep ? JSON.parse(JSON.stringify(prevStep.state)) : this._captureSceneState()
      };
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
      this._playStep(this._playback.currentStep);
    }
  });
  html.querySelector(".vn-playback-prev")?.addEventListener("click", () => this._prevStep());
  html.querySelector(".vn-playback-next")?.addEventListener("click", () => this._nextStep());
  html.querySelector(".vn-playback-stop")?.addEventListener("click", () => this._stopPlayback());
  html.querySelector(".vn-root")?.addEventListener("click", (ev) => {
    if (!this._playback || this._playback.playing) return;
    if (ev.target.closest(".vn-gm-toolbar") || ev.target.closest(".vn-playback-bar")) return;
    const step = this._playback.script.steps[this._playback.currentStep];
    if (!step) return;
    if (step.duration === 0) {
      this._nextStep();
    }
  });
};

} // end bindScriptEngine
