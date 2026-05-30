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

proto._startPlayback = function(script) {
  if (!script?.steps?.length) {
    ui.notifications?.warn("Script has no steps.");
    return;
  }
  this._playback = {
    script: JSON.parse(JSON.stringify(script)),
    currentStep: 0,
    playing: false,
    timer: null,
    choiceResolve: null
  };
  this._showPanel = null;
  this._applyStep(script.steps[0]);
  this.render();
};

proto._stopPlayback = function() {
  if (this._playback?.timer) clearTimeout(this._playback.timer);
  this._playback = null;
  this.render();
};

proto._applyStep = function(step) {
  if (!step) return;
  switch (step.type) {
    case "dialog":
      this._dialog.text = step.text ?? this._dialog.text;
      this._dialog.leftText = step.leftText ?? this._dialog.leftText;
      this._dialog.mode = step.mode ?? this._dialog.mode;
      break;
    case "bg":
      this._bg = step.bg ?? this._bg;
      this._bgBrightness = step.bgBrightness ?? this._bgBrightness;
      this._currentLocationId = step.locationId ?? this._currentLocationId;
      break;
    case "portrait":
      if (step.portraitId) this.addPortraitToStage(step.portraitId);
      break;
    case "emotion":
      if (step.portraitId) {
        const p = this._portraits.find(port => port.id === step.portraitId);
        if (p && !isNaN(step.emotionIdx)) p._currentEmotion = step.emotionIdx;
      }
      break;
    case "speaker":
      this._speaker = step.speakerId ?? "";
      break;
    case "pause":
      break;
    case "choice":
      break;
    case "jump":
      const target = this._playback?.script?.steps?.findIndex(s => s.label === step.target);
      if (target !== -1 && target !== undefined) {
        this._playback.currentStep = target;
        this._applyStep(this._playback.script.steps[target]);
      }
      return;
  }
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
  this._applyStep(step);
  this._broadcast();
  const duration = step.duration || 0;
  if (step.type === "pause" || duration === 0) {
    this._playback.playing = false;
    this.render();
    return;
  }
  if (step.type === "choice") {
    this._playback.playing = false;
    this.render();
    return;
  }
  this._playback.playing = true;
  this.render();
  if (duration > 0) {
    this._playback.timer = setTimeout(() => this._nextStep(), duration * 1000);
  }
};

proto._bindScriptPanel = function() {
  const html = this._el();
  if (this._editScriptId !== null) {
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
      this._showPanel = "scriptEdit";
      this._showStepTypePicker = false;
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
  // Read steps from DOM, save to _tempSteps
  function _collectSteps() {
    const stepEls = html.querySelectorAll(".vn-sceditor-step");
    const steps = [];
    stepEls.forEach(el => {
      const type = el.dataset.stepType;
      const label = el.querySelector(".vn-step-label")?.value || "";
      const step = { type, label };
      switch (type) {
        case "dialog":
          step.text = el.querySelector(".vn-step-dialog-text")?.value || "";
          step.leftText = el.querySelector(".vn-step-dialog-left")?.value || "";
          step.mode = parseInt(el.querySelector(".vn-step-dialog-mode")?.value) || 1;
          step.duration = parseFloat(el.querySelector(".vn-step-dialog-dur")?.value) || 0;
          break;
        case "bg":
          step.bg = el.querySelector(".vn-step-bg-path")?.value || "";
          step.bgBrightness = parseFloat(el.querySelector(".vn-step-bg-bright")?.value) || 1;
          break;
        case "portrait": step.portraitId = el.querySelector(".vn-step-port-id")?.value || ""; break;
        case "emotion":
          step.portraitId = el.querySelector(".vn-step-em-port-id")?.value || "";
          step.emotionIdx = parseInt(el.querySelector(".vn-step-em-idx")?.value) || 0;
          break;
        case "speaker": step.speakerId = el.querySelector(".vn-step-speaker-id")?.value || ""; break;
        case "pause": step.duration = parseFloat(el.querySelector(".vn-step-pause-dur")?.value) || 0; break;
        case "choice":
          step.choices = [];
          el.querySelectorAll(".vn-step-choice-row").forEach(r => {
            const text = r.querySelector(".vn-step-choice-text")?.value || "";
            const jump = r.querySelector(".vn-step-choice-jump")?.value || "";
            if (text) step.choices.push({ text, jump: jump || undefined });
          });
          break;
        case "jump": step.target = el.querySelector(".vn-step-jump-target")?.value || ""; break;
      }
      steps.push(step);
    });
    return steps;
  }

  html.querySelector(".vn-sceditor-back")?.addEventListener("click", () => {
    this._editScriptId = null;
    this._tempSteps = [];
    this.render();
  });

  html.querySelector(".vn-sceditor-save")?.addEventListener("click", async () => {
    const name = html.querySelector(".vn-sceditor-name")?.value || "Unnamed Script";
    const steps = _collectSteps();
    if (await this._saveScript(name, steps)) {
      ui.notifications?.info("Script saved");
      this._showPanel = "scripts";
      this._editScriptId = null;
      this._tempSteps = [];
      this.render();
    } else {
      ui.notifications?.error("Failed to save script");
    }
  });

  html.querySelector(".vn-sceditor-add")?.addEventListener("click", () => {
    // Save current DOM edits before re-render
    this._tempSteps = _collectSteps();
    this._showStepTypePicker = !this._showStepTypePicker;
    this.render();
  });

  html.querySelectorAll(".vn-step-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      const newStep = { type, label: "" };
      switch (type) {
        case "dialog": newStep.text = ""; newStep.leftText = ""; newStep.mode = 1; newStep.duration = 0; break;
        case "bg": newStep.bg = ""; newStep.bgBrightness = 1; break;
        case "portrait": newStep.portraitId = ""; break;
        case "emotion": newStep.portraitId = ""; newStep.emotionIdx = 0; break;
        case "speaker": newStep.speakerId = ""; break;
        case "pause": newStep.duration = 0; break;
        case "choice": newStep.choices = []; break;
        case "jump": newStep.target = ""; break;
      }
      this._tempSteps = _collectSteps();
      this._tempSteps.push(newStep);
      this._showStepTypePicker = false;
      this.render();
    });
  });

  html.querySelectorAll(".vn-step-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      this._tempSteps = _collectSteps();
      this._tempSteps.splice(idx, 1);
      this.render();
    });
  });

  html.querySelectorAll(".vn-step-up, .vn-step-down").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      const dir = btn.classList.contains("vn-step-up") ? -1 : 1;
      this._tempSteps = _collectSteps();
      const swap = idx + dir;
      if (swap < 0 || swap >= this._tempSteps.length) return;
      [this._tempSteps[idx], this._tempSteps[swap]] = [this._tempSteps[swap], this._tempSteps[idx]];
      this.render();
    });
  });

  html.querySelectorAll(".vn-choice-add-row").forEach(btn => {
    btn.addEventListener("click", () => {
      this._tempSteps = _collectSteps();
      const idx = parseInt(btn.closest(".vn-sceditor-step")?.dataset.stepIdx) || 0;
      if (this._tempSteps[idx]) {
        if (!this._tempSteps[idx].choices) this._tempSteps[idx].choices = [];
        this._tempSteps[idx].choices.push({ text: "", jump: "" });
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
  // Choice buttons in playback
  html.querySelectorAll(".vn-choice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.jump;
      if (target) {
        const idx = this._playback.script.steps.findIndex(s => s.label === target);
        if (idx !== -1) {
          this._playback.currentStep = idx;
          this._playStep(idx);
        } else {
          this._nextStep();
        }
      } else {
        this._nextStep();
      }
    });
  });
  // Click to advance (for pause/dialog steps)
  html.querySelector(".vn-root")?.addEventListener("click", (ev) => {
    if (!this._playback || this._playback.playing) return;
    if (ev.target.closest(".vn-gm-toolbar") || ev.target.closest(".vn-playback-bar") || ev.target.closest(".vn-choice-list")) return;
    const step = this._playback.script.steps[this._playback.currentStep];
    if (!step) return;
    if (step.type === "pause" || (step.type === "dialog" && !step.duration)) {
      this._nextStep();
    }
  });
};

} // end bindScriptEngine
