const _AppBase = foundry.applications?.api?.Application || foundry.applications?.api?.ApplicationV2;
if (!_AppBase) {
  console.error("FreeVisualNovel | Application class not found. Requires Foundry V13+.");
} else {
  _defineModule(_AppBase);
}

function _defineModule(AppBase) {

class VisualNovelApp extends AppBase {
  static DEFAULT_OPTIONS = {
    id: "free-visual-novel",
    title: "Free Visual Novel",
    template: "modules/free-visual-novel/templates/visualnovel.hbs",
    window: {
      width: window.innerWidth,
      height: window.innerHeight,
      positioned: true,
      minimizable: false,
      resizable: false,
      frame: false,
      controls: []
    },
    classes: ["free-visual-novel", "vn-fullscreen"],
    form: { submitOnChange: false, closeOnSubmit: false }
  };

  constructor(scenes, options = {}) {
    super(options);
    this.scenes = scenes;
    this.currentScene = 0;
    this.history = [];
    this.backlog = [];
    this._vnState = this._prepareScene(0);
    this._dragState = null;
    this._dragCleanup = null;
    this._typewriterTimer = null;
    this._typing = false;
    this._revealed = false;
    this._showingBacklog = false;
  }

  async _prepareContext() {
    return {
      state: this._vnState,
      current: this.currentScene,
      total: this.scenes.length - 1,
      history: this.backlog,
      showingBacklog: this._showingBacklog
    };
  }

  async _renderHTML(context, options) {
    const path = "modules/free-visual-novel/templates/visualnovel.hbs";
    const resp = await fetch(path);
    const source = await resp.text();
    const template = Handlebars.compile(source);
    return template(context);
  }

  _replaceHTML(result, content, options) {
    content.innerHTML = result;
    this._onRenderContent();
  }

  _prepareScene(index) {
    const scene = this.scenes[index];
    if (!scene) return null;
    const chars = [];
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach((c, i) => chars.push(this._normalizeChar(c, i)));
    } else if (scene.character) {
      chars.push(this._normalizeChar({ src: scene.character, name: scene.name || "" }, 0));
    }
    return {
      background: scene.background || null,
      characters: chars,
      name: scene.name || "",
      text: scene.text || "",
      choices: scene.choices || [],
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

  _onRenderContent() {
    const html = this.element;
    this._showNextButton = false;

    if (this._showingBacklog) {
      html.querySelector(".vn-backlog-close")?.addEventListener("click", () => {
        this._showingBacklog = false;
        this.render();
      });
      return;
    }

    this._showText(html);
    this._bindChoices(html);
    this._bindButtons(html);
    this._initDrag(html);
  }

  _showText(html) {
    const textEl = html.querySelector(".vn-dialogue-text");
    const nextEl = html.querySelector(".vn-next-indicator");
    if (!textEl) return;
    const text = this._vnState.text || "";
    textEl.textContent = "";
    textEl.dataset.full = text;
    if (nextEl) nextEl.style.display = "none";

    if (this._revealed || !text) {
      textEl.textContent = text;
      this._revealed = true;
      if (nextEl) nextEl.style.display = "block";
      this._showNextButton = true;
      return;
    }

    this._typing = true;
    let i = 0;
    const speed = 30;
    if (this._typewriterTimer) clearInterval(this._typewriterTimer);
    this._typewriterTimer = setInterval(() => {
      if (i >= text.length) {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
        this._typing = false;
        this._showNextButton = true;
        if (nextEl) nextEl.style.display = "block";
        return;
      }
      i++;
      textEl.textContent = text.slice(0, i);
    }, speed);
  }

  _bindChoices(html) {
    html.querySelectorAll(".vn-choice").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const choice = this._vnState.choices[index];
        if (choice && choice.next !== undefined) {
          this._revealed = false;
          this.goToScene(choice.next);
        }
      });
    });
  }

  _bindButtons(html) {
    html.querySelector(".vn-next-area")?.addEventListener("click", () => {
      if (this._typing) {
        this._revealNow();
      } else if (this._showNextButton && this._vnState.choices.length === 0 && this._vnState.next !== undefined) {
        this._revealed = false;
        this.goToScene(this._vnState.next);
      }
    });

    html.querySelector(".vn-btn-backlog")?.addEventListener("click", () => {
      this._showingBacklog = true;
      this.render();
    });

    html.querySelector(".vn-btn-skip")?.addEventListener("click", () => {
      this._revealed = true;
      const el = this.element?.querySelector(".vn-dialogue-text");
      if (el) el.textContent = el.dataset.full || "";
    });

    html.querySelector(".vn-btn-save")?.addEventListener("click", () => {
      this._saveQuick();
    });

    html.querySelector(".vn-btn-load")?.addEventListener("click", () => {
      this._loadQuick();
    });

    html.querySelector(".vn-btn-close")?.addEventListener("click", () => {
      this.close();
    });
  }

  _revealNow() {
    if (this._typewriterTimer) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
    this._typing = false;
    this._revealed = true;
    const el = this.element?.querySelector(".vn-dialogue-text");
    if (el) el.textContent = el.dataset.full || "";
    const nextEl = this.element?.querySelector(".vn-next-indicator");
    if (nextEl) nextEl.style.display = "block";
    this._showNextButton = true;
  }

  goToScene(index) {
    if (index < 0 || index >= this.scenes.length) return;
    const prev = this.scenes[this.currentScene];
    if (prev) {
      this.backlog.push({
        name: prev.name || "",
        text: prev.text || ""
      });
    }
    this.history.push(this.currentScene);
    this.currentScene = index;
    this._vnState = this._prepareScene(index);
    this._revealed = false;
    this._showNextButton = false;
    this.render();
  }

  _initDrag(html) {
    if (this._dragCleanup) this._dragCleanup();
    const container = html;
    const onDown = (ev) => {
      const wrapper = ev.target.closest(".vn-char");
      if (!wrapper) return;
      const idx = parseInt(wrapper.dataset.charIndex);
      if (isNaN(idx)) return;
      ev.preventDefault();
      const rect = container.getBoundingClientRect();
      this._dragState = {
        index: idx,
        offsetX: ev.clientX - rect.left - (this._vnState.characters[idx]?.x || 0),
        offsetY: ev.clientY - rect.top - (this._vnState.characters[idx]?.y || 0)
      };
    };
    const onMove = (ev) => {
      if (!this._dragState) return;
      const rect = container.getBoundingClientRect();
      const char = this._vnState.characters[this._dragState.index];
      if (!char) return;
      char.x = Math.round(ev.clientX - rect.left - this._dragState.offsetX);
      char.y = Math.round(ev.clientY - rect.top - this._dragState.offsetY);
      const wrapper = container.querySelector(`.vn-char[data-char-index="${this._dragState.index}"]`);
      if (wrapper) {
        wrapper.style.left = char.x + "px";
        wrapper.style.top = char.y + "px";
      }
    };
    const onUp = () => {
      if (this._dragState) {
        const scene = this.scenes[this.currentScene];
        const idx = this._dragState.index;
        if (scene.characters?.[idx]) {
          scene.characters[idx].x = this._vnState.characters[idx]?.x;
          scene.characters[idx].y = this._vnState.characters[idx]?.y;
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

  _saveQuick() {
    const data = {
      currentScene: this.currentScene,
      history: this.history,
      backlog: this.backlog
    };
    game.user?.setFlag("free-visual-novel", "quicksave", data).then(() => {
      ui.notifications?.info("Quick saved!");
    });
  }

  _loadQuick() {
    game.user?.getFlag("free-visual-novel", "quicksave").then((data) => {
      if (!data) {
        ui.notifications?.warn("No quick save found.");
        return;
      }
      this.history = data.history || [];
      this.backlog = data.backlog || [];
      this.currentScene = data.currentScene || 0;
      this._vnState = this._prepareScene(this.currentScene);
      this._revealed = false;
      this.render();
      ui.notifications?.info("Quick loaded!");
    });
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this.element?.classList.add("vn-fullscreen-active");
  }

  _onClose(options) {
    if (this._dragCleanup) this._dragCleanup();
    if (this._typewriterTimer) clearInterval(this._typewriterTimer);
    this.element?.classList.remove("vn-fullscreen-active");
  }

  static _createDefaultScenes() {
    return [
      {
        name: "Narrator",
        text: "It was a quiet evening in the town of Oakvale... The streets were empty, and a cold wind swept through the alleys.",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 150, y: 180, scale: 0.9, speaking: false },
          { src: "", name: "Hero", x: 600, y: 180, scale: 0.9, speaking: false }
        ],
        next: 1
      },
      {
        name: "Mysterious Girl",
        text: "Hey! You there! Wake up! You've been asleep for hours!",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 350, y: 160, scale: 1, speaking: true }
        ],
        choices: [
          { text: "\"Who are you?\"", next: 2 },
          { text: "\"Where am I?\"", next: 3 }
        ]
      },
      {
        name: "Lyra",
        text: "I'm Lyra. I've been searching for you. The village is in danger, and we need your help.",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 350, y: 160, scale: 1, speaking: true }
        ],
        next: 4
      },
      {
        name: "Lyra",
        text: "You're in the Forgotten Temple, just outside Oakvale. Don't you remember anything that happened?",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 350, y: 160, scale: 1, speaking: true }
        ],
        next: 4
      },
      {
        name: "Lyra",
        text: "Come on, we don't have much time. I'll explain everything on the way.",
        background: "",
        characters: [
          { src: "", name: "Lyra", x: 200, y: 160, scale: 1, speaking: true },
          { src: "", name: "Hero", x: 550, y: 180, scale: 0.9, speaking: false }
        ],
        next: 5
      },
      {
        name: "Narrator",
        text: "And so the adventure begins...",
        background: "",
        characters: [],
        next: null
      }
    ];
  }
}

Hooks.on("init", function() {
  game.freevisualnovel = {
    scenes: VisualNovelApp._createDefaultScenes()
  };
});

function _openVN() {
  try {
    if (!ui.freevisualnovel) {
      const scenes = game.freevisualnovel?.scenes || VisualNovelApp._createDefaultScenes();
      ui.freevisualnovel = new VisualNovelApp(scenes);
    }
    ui.freevisualnovel.render({ force: true });
  } catch(e) {
    console.error("FreeVisualNovel | Failed to open:", e);
    ui.notifications?.error("Free Visual Novel: failed to open");
  }
}

Hooks.on("getSceneControlButtons", (t) => {
  if (!canvas) return;
  t.freevisualnovel = {
    name: "freevisualnovel",
    title: "Free Visual Novel",
    icon: "fas fa-book-open",
    layer: "Canvas",
    order: 90,
    tools: {
      launch: {
        name: "launch",
        title: "Open Visual Novel",
        icon: "fas fa-play",
        button: true,
        visible: true,
        onChange: (_event, active) => {
          if (active === false) return;
          _openVN();
        }
      }
    },
    activeTool: "launch"
  };
});

} // end _defineModule
