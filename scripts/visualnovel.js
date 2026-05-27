class VisualNovelApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "free-visual-novel",
    title: "Free Visual Novel",
    template: "modules/FreeVisualNovel/templates/visualnovel.hbs",
    window: {
      width: 1000,
      height: 700,
      resizable: true,
      positioned: true
    },
    classes: ["free-visual-novel"],
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  constructor(scenes, options = {}) {
    super(options);
    this.scenes = scenes;
    this.currentScene = 0;
    this.history = [];
    this.state = this._prepareScene(0);
    this._dragState = null;
  }

  /* ── Context ──────────────────────────────────────── */
  _prepareContext() {
    return {
      state: this.state,
      current: this.currentScene,
      total: this.scenes.length - 1
    };
  }

  _prepareScene(index) {
    const scene = this.scenes[index];
    if (!scene) return null;
    const chars = [];
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach((c, i) => {
        chars.push(this._normalizeChar(c, i));
      });
    } else if (scene.character) {
      chars.push(this._normalizeChar({ src: scene.character, name: scene.name || "" }, 0));
    }
    return {
      background: scene.background || null,
      characters: chars,
      name: scene.name || "",
      text: scene.text || "",
      choices: scene.choices || [],
      effects: scene.effects || "",
      music: scene.music || null,
      next: "next" in scene ? scene.next : undefined
    };
  }

  _normalizeChar(char, index) {
    return {
      index,
      src: char.src || "",
      name: char.name || "",
      x: char.x != null ? char.x : 50 + index * 200,
      y: char.y != null ? char.y : 250,
      scale: char.scale || 1,
      speaking: !!char.speaking,
      flip: !!char.flip
    };
  }

  /* ── Events ───────────────────────────────────────── */
  _onRender(context, options) {
    const html = this.element;
    html.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const choice = this.state.choices[index];
        if (choice && choice.next !== undefined) {
          this.goToScene(choice.next);
        }
      });
    });
    const nextBtn = html.querySelector(".vn-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (this.state.choices.length === 0 && this.state.next !== undefined) {
          this.goToScene(this.state.next);
        }
      });
    }
    html.querySelector(".vn-backlog")?.addEventListener("click", () => {
      this._showBacklog();
    });
    html.querySelector(".vn-edit-chars")?.addEventListener("click", () => {
      this._editCharacters();
    });
    html.querySelector(".vn-manage-images")?.addEventListener("click", () => {
      this._manageImages();
    });
    this._initDrag(html);
  }

  goToScene(index) {
    if (index < 0 || index >= this.scenes.length) return;
    this.history.push(this.currentScene);
    this.currentScene = index;
    this.state = this._prepareScene(index);
    this.render();
  }

  /* ── Drag & Drop ─────────────────────────────────── */
  _initDrag(html) {
    if (this._dragCleanup) this._dragCleanup();
    const container = html;
    const onDown = (ev) => {
      const wrapper = ev.target.closest(".vn-char-wrapper");
      if (!wrapper) return;
      const idx = parseInt(wrapper.dataset.charIndex);
      if (isNaN(idx)) return;
      ev.preventDefault();
      const rect = container.getBoundingClientRect();
      this._dragState = {
        index: idx,
        offsetX: ev.clientX - rect.left - this.state.characters[idx].x,
        offsetY: ev.clientY - rect.top - this.state.characters[idx].y
      };
    };
    const onMove = (ev) => {
      if (!this._dragState) return;
      const rect = container.getBoundingClientRect();
      const char = this.state.characters[this._dragState.index];
      char.x = Math.round(ev.clientX - rect.left - this._dragState.offsetX);
      char.y = Math.round(ev.clientY - rect.top - this._dragState.offsetY);
      const wrapper = container.querySelector(
        `.vn-char-wrapper[data-char-index="${this._dragState.index}"]`
      );
      if (wrapper) {
        wrapper.style.left = char.x + "px";
        wrapper.style.top = char.y + "px";
      }
    };
    const onUp = () => {
      if (this._dragState) {
        const scene = this.scenes[this.currentScene];
        const idx = this._dragState.index;
        if (scene.characters && scene.characters[idx]) {
          scene.characters[idx].x = this.state.characters[idx].x;
          scene.characters[idx].y = this.state.characters[idx].y;
        }
        this._dragState = null;
      }
    };
    container.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    this._dragCleanup = () => {
      container.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }

  /* ── Character Position Editor ───────────────────── */
  _editCharacters() {
    const chars = this.state.characters;
    if (!chars.length) {
      ui.notifications.warn("No characters in this scene.");
      return;
    }
    let form = `
    <form class="vn-char-editor">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px;font-size:12px;margin-bottom:8px;">
        <b>Sprite</b><b>X</b><b>Y</b><b>Scale</b><b>Flip</b>
      </div>`;
    chars.forEach((c, i) => {
      form += `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:4px;align-items:center;margin-bottom:4px;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name || "char"}</span>
        <input type="number" name="x-${i}" value="${c.x}" step="1" style="width:60px">
        <input type="number" name="y-${i}" value="${c.y}" step="1" style="width:60px">
        <input type="number" name="scale-${i}" value="${c.scale}" step="0.05" min="0.1" max="3" style="width:60px">
        <input type="checkbox" name="flip-${i}" ${c.flip ? "checked" : ""}>
      </div>`;
    });
    form += `</form>`;
    new Dialog({
      title: "Character Positions",
      content: form,
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply",
          callback: (html) => {
            const fd = new FormDataExtended(html[0].querySelector("form"));
            const data = fd.object;
            this.state.characters.forEach((c, i) => {
              c.x = parseInt(data[`x-${i}`]) || 0;
              c.y = parseInt(data[`y-${i}`]) || 0;
              c.scale = parseFloat(data[`scale-${i}`]) || 1;
              c.flip = !!data[`flip-${i}`];
              const scene = this.scenes[this.currentScene];
              if (scene.characters && scene.characters[i]) {
                scene.characters[i].x = c.x;
                scene.characters[i].y = c.y;
                scene.characters[i].scale = c.scale;
                scene.characters[i].flip = c.flip;
              }
            });
            this.render();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "apply"
    }).render(true);
  }

  /* ── Image Manager ──────────────────────────────── */
  _manageImages() {
    const scene = this.scenes[this.currentScene];
    if (!scene) return;
    let content = `
    <div class="vn-img-manager">
      <h3>Background</h3>
      <div class="vn-img-row">
        <div class="vn-img-preview">${scene.background
          ? `<img src="${scene.background}" style="max-width:200px;max-height:100px">`
          : `<span class="vn-img-empty">No background</span>`}</div>
        <div class="vn-img-buttons">
          <button class="vn-fp-btn" data-target="bg">Change Background</button>
          <button class="vn-fp-clear" data-target="bg">Clear</button>
        </div>
      </div>
      <hr>
      <h3>Characters</h3>`;
    const chars = scene.characters || [];
    if (!chars.length) {
      content += `<p>No characters in this scene.</p>`;
    } else {
      chars.forEach((c, i) => {
        content += `
      <div class="vn-img-row">
        <div class="vn-img-preview">${c.src
          ? `<img src="${c.src}" style="max-width:100px;max-height:80px">`
          : `<span class="vn-img-empty">No sprite</span>`}</div>
        <div class="vn-img-label">${c.name || `Char ${i}`}</div>
        <div class="vn-img-buttons">
          <button class="vn-fp-btn" data-target="char" data-index="${i}">Change Sprite</button>
          <button class="vn-fp-clear" data-target="char" data-index="${i}">Clear</button>
        </div>
      </div>`;
      });
    }
    content += `</div>`;

    const dlg = new Dialog({
      title: "Manage Images",
      content,
      buttons: {
        close: { icon: '<i class="fas fa-times"></i>', label: "Close" }
      },
      render: (html) => {
        html.find(".vn-fp-btn").on("click", (ev) => {
          const btn = ev.currentTarget;
          const target = btn.dataset.target;
          const index = btn.dataset.index;
          const current = target === "bg" ? scene.background
            : (scene.characters && scene.characters[index] ? scene.characters[index].src : "");
          this._openFilePicker(current, (path) => {
            if (target === "bg") {
              scene.background = path;
            } else if (target === "char" && scene.characters && scene.characters[index]) {
              scene.characters[index].src = path;
            }
            this.state = this._prepareScene(this.currentScene);
            this.render();
            dlg.render(true);
          });
        });
        html.find(".vn-fp-clear").on("click", (ev) => {
          const btn = ev.currentTarget;
          const target = btn.dataset.target;
          const index = btn.dataset.index;
          if (target === "bg") {
            scene.background = "";
          } else if (target === "char" && scene.characters && scene.characters[index]) {
            scene.characters[index].src = "";
          }
          this.state = this._prepareScene(this.currentScene);
          this.render();
          dlg.render(true);
        });
      }
    }).render(true);
  }

  _openFilePicker(current, callback) {
    new FilePicker({
      type: "image",
      current: current || "",
      callback: (path) => { callback(path); }
    }).render(true);
  }

  _showBacklog() {
    let text = this.history.map(i => {
      const s = this.scenes[i];
      return `${s.name || ""}: ${s.text}`;
    }).join("\n");
    if (this.state && this.state.text) {
      text += `\n${this.state.name || ""}: ${this.state.text}`;
    }
    Dialog.prompt({
      title: "Backlog",
      content: `<pre style="max-height:300px;overflow-y:auto;white-space:pre-wrap">${text}</pre>`
    });
  }

  close(...args) {
    if (this._dragCleanup) this._dragCleanup();
    return super.close(...args);
  }

  static _createDefaultScenes() {
    return [
      {
        name: "Narrator",
        text: "It was a quiet evening in the town of Oakvale...",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 150, y: 250, scale: 0.8, speaking: false },
          { src: "", name: "Hero", x: 500, y: 250, scale: 0.8, speaking: false }
        ],
        next: 1
      },
      {
        name: "??",
        text: "Hey you! Wake up!",
        characters: [
          { src: "", name: "??", x: 300, y: 200, scale: 1, speaking: true }
        ],
        choices: [
          { text: "Who are you?", next: 2 },
          { text: "Where am I?", next: 3 }
        ]
      },
      {
        name: "Mysterious Girl",
        text: "I'm Lyra. I've been looking for you.",
        characters: [
          { src: "", name: "Lyra", x: 300, y: 200, scale: 1, speaking: true }
        ],
        next: 4
      },
      {
        name: "Mysterious Girl",
        text: "You're in the Forgotten Temple. Don't you remember anything?",
        characters: [
          { src: "", name: "Lyra", x: 300, y: 200, scale: 1, speaking: true }
        ],
        next: 4
      },
      {
        name: "Narrator",
        text: "The adventure begins...",
        next: null
      }
    ];
  }
}

/* ── Hook: store default scenes ────────────────────── */
Hooks.on("init", function() {
  game.freevisualnovel = {
    scenes: VisualNovelApp._createDefaultScenes()
  };
});

/* ── Hook: create singleton instance ───────────────── */
Hooks.on("ready", function() {
  if (!ui.freevisualnovel) {
    ui.freevisualnovel = new VisualNovelApp(game.freevisualnovel.scenes);
  }
});

/* ── Add scene toolbar button (v13 compat) ─────────── */
function _injectToolbarButton() {
  if (!ui.controls || !ui.controls.controls) return;
  const controls = ui.controls.controls;
  if (controls instanceof Map) {
    if (controls.has("freevisualnovel")) return;
    controls.set("freevisualnovel", {
      name: "freevisualnovel",
      title: "Free Visual Novel",
      icon: "fas fa-book-open",
      layer: "FreeVisualNovel",
      tools: [
        {
          name: "launch",
          title: "Open Visual Novel",
          icon: "fas fa-play",
          onClick: () => ui.freevisualnovel.render(true)
        }
      ]
    });
  } else if (Array.isArray(controls)) {
    if (controls.some(c => c.name === "freevisualnovel")) return;
    controls.push({
      name: "freevisualnovel",
      title: "Free Visual Novel",
      icon: "fas fa-book-open",
      layer: "FreeVisualNovel",
      tools: [
        {
          name: "launch",
          title: "Open Visual Novel",
          icon: "fas fa-play",
          onClick: () => ui.freevisualnovel.render(true)
        }
      ]
    });
  }
  ui.controls.render();
}

Hooks.on("getSceneControlButtons", (controls) => {
  if (controls instanceof Map) {
    if (controls.has("freevisualnovel")) return;
    controls.set("freevisualnovel", {
      name: "freevisualnovel",
      title: "Free Visual Novel",
      icon: "fas fa-book-open",
      layer: "FreeVisualNovel",
      tools: [
        {
          name: "launch",
          title: "Open Visual Novel",
          icon: "fas fa-play",
          onClick: () => ui.freevisualnovel.render(true)
        }
      ]
    });
  } else if (Array.isArray(controls)) {
    controls.push({
      name: "freevisualnovel",
      title: "Free Visual Novel",
      icon: "fas fa-book-open",
      layer: "FreeVisualNovel",
      tools: [
        {
          name: "launch",
          title: "Open Visual Novel",
          icon: "fas fa-play",
          onClick: () => ui.freevisualnovel.render(true)
        }
      ]
    });
  }
});

Hooks.on("renderSceneControls", () => _injectToolbarButton());