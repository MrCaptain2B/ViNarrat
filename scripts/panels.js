import { _userCan, _saveData, _loadData, _importActorPortraits, SOCKET, _FP } from './helpers.js';

export function bindPanels(proto) {

proto._bindMainUI = function() {
    const html = this._el();

    if (_userCan("permManage")) {
      // Locations
      html.querySelector(".vn-btn-locations")?.addEventListener("click", () => {
        this._showPanel = "locations";
        this.render();
      });
      // Scene settings
      html.querySelector(".vn-btn-scene")?.addEventListener("click", () => {
        this._showPanel = "scene";
        this.render();
      });
      // Presets (both Save & Load buttons)
      html.querySelectorAll(".vn-btn-presets").forEach(btn => {
        btn.addEventListener("click", () => {
          this._showPanel = "presets";
          this.render();
        });
      });
      // Live toggle
      html.querySelector(".vn-btn-live")?.addEventListener("click", () => {
        this._broadcasting = !this._broadcasting;
        if (this._broadcasting) {
          this._broadcast();
        } else {
          game.socket?.emit(SOCKET, { type: "stop" });
          this._claimed = {};
          this._clearSession();
          game.settings?.set("free-visual-novel", "broadcastStore", null);
        }
        this._showBroadcastMenu = false;
        this.render();
      });
      // Broadcast dropdown arrow
      html.querySelector(".vn-bw .vn-console-btn-arrow")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._showBroadcastMenu = !this._showBroadcastMenu;
        this.render();
      });
      // Broadcast menu options
      html.querySelectorAll(".vn-bo").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          this._inviteMode = ev.currentTarget.dataset.mode;
          this._showBroadcastMenu = false;
          this.render();
        });
      });
      // Close broadcast menu on outside click
      const menuCloser = (ev) => {
        if (this._showBroadcastMenu && !ev.target.closest(".vn-bw")) {
          this._showBroadcastMenu = false;
          this.render();
        }
      };
      this._broadcastMenuCleanup?.();
      setTimeout(() => document.addEventListener("click", menuCloser), 0);
      this._broadcastMenuCleanup = () => document.removeEventListener("click", menuCloser);
    }

    // Portraits panel (GM + players)
    html.querySelector(".vn-btn-portraits")?.addEventListener("click", () => {
      this._showPanel = "portraits";
      this.render();
    });

    // Close
    html.querySelector(".vn-btn-close")?.addEventListener("click", () => this.close());

    this._bindPortraitDrag(html);

    // Speaker bar buttons
    html.querySelectorAll(".vn-sb-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._speaker = this._speaker === id ? "" : id;
        if (id && this._speaker && this._claimed[id]) {
          delete this._claimed[id];
        }
        this.render();
        this._broadcast();
      });
    });

    // Portrait editor panel bindings
    const pep = html.querySelector(".vn-port-editor-panel");
    if (pep) {
      const idx = parseInt(pep.dataset.portIdx);
      // Close
      pep.querySelector(".vn-pep-close")?.addEventListener("click", () => {
        this._editingPortraitIdx = null;
        this.render();
      });
      // Scale
      pep.querySelector(".vn-pep-scale")?.addEventListener("input", (ev) => {
        const val = parseFloat(ev.target.value);
        if (this._portraits[idx]) {
          this._portraits[idx].scale = val;
          const el = document.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) {
            const flip = this._portraits[idx].flip ? "scaleX(-1)" : "";
            el.style.transform = `scale(${val}) ${flip}`;
          }
          pep.querySelector(".vn-pep-val").textContent = val;
        }
      });
      // Position X
      pep.querySelector(".vn-pep-x")?.addEventListener("change", (ev) => {
        const val = parseInt(ev.target.value);
        if (this._portraits[idx]) {
          this._portraits[idx].x = val;
          const el = document.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) el.style.left = val + "px";
          this._broadcast();
        }
      });
      // Position Y
      pep.querySelector(".vn-pep-y")?.addEventListener("change", (ev) => {
        const val = parseInt(ev.target.value);
        if (this._portraits[idx]) {
          this._portraits[idx].y = val;
          const el = document.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) el.style.top = val + "px";
          this._broadcast();
        }
      });
      // Action buttons
      pep.querySelectorAll(".vn-pep-btn").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          const action = ev.currentTarget.dataset.action;
          if (action === "flip" && this._portraits[idx]) {
            this._portraits[idx].flip = !this._portraits[idx].flip;
            const el = document.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
            if (el) {
              const p = this._portraits[idx];
              el.style.transform = `scale(${p.scale}) ${p.flip ? "scaleX(-1)" : ""}`;
            }
            this.render();
            this._broadcast();
          } else if (action === "lock" && this._portraits[idx]) {
            this._portraits[idx].locked = !this._portraits[idx].locked;
            this.render();
          } else if (action === "forward") {
            if (idx < this._portraits.length - 1) {
              [this._portraits[idx], this._portraits[idx+1]] = [this._portraits[idx+1], this._portraits[idx]];
              this._editingPortraitIdx = idx + 1;
              this.render();
              this._broadcast();
            }
          } else if (action === "backward") {
            if (idx > 0) {
              [this._portraits[idx-1], this._portraits[idx]] = [this._portraits[idx], this._portraits[idx-1]];
              this._editingPortraitIdx = idx - 1;
              this.render();
              this._broadcast();
            }
          } else if (action === "remove") {
            this._portraits.splice(idx, 1);
            this._editingPortraitIdx = null;
            this.render();
            this._broadcast();
          }
        });
      });
    }

    // Edit button in hover controls opens editor panel
    html.querySelectorAll('.vn-hc-btn[data-action="edit"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        this._editingPortraitIdx = idx;
        this.render();
      });
    });

    // Portrait hover controls (compact 20px)
    html.querySelectorAll('.vn-hc-btn[data-action="flip"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (this._portraits[idx]) {
          this._portraits[idx].flip = !this._portraits[idx].flip;
          const el = document.querySelector(`.vn-portrait[data-port-idx="${idx}"]`);
          if (el) {
            const p = this._portraits[idx];
            el.style.transform = `scale(${p.scale}) ${p.flip ? "scaleX(-1)" : ""}`;
          }
          this._broadcast();
        }
      });
    });
    html.querySelectorAll('.vn-hc-btn[data-action="lock"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        if (this._portraits[idx]) {
          this._portraits[idx].locked = !this._portraits[idx].locked;
          this.render();
        }
      });
    });
    html.querySelectorAll('.vn-hc-btn[data-action="remove"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        this._portraits.splice(idx, 1);
        this.render();
        this._broadcast();
      });
    });

    // Emotion thumbs
    html.querySelectorAll(".vn-emotion-thumb").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const emo = parseInt(ev.currentTarget.dataset.emotion);
        if (this._portraits[idx] && !isNaN(emo)) {
          this._portraits[idx]._currentEmotion = emo;
          const frame = document.querySelector(`.vn-portrait[data-port-idx="${idx}"] .vn-portrait-frame`);
          const oldImg = frame?.querySelector(".vn-portrait-img");
          const imgs = this._portraits[idx].images || [this._portraits[idx].image];
          if (oldImg && imgs[emo]) {
            const overlay = document.createElement("img");
            overlay.className = "vn-portrait-overlay";
            overlay.src = imgs[emo];
            overlay.alt = oldImg.alt || "";
            frame.appendChild(overlay);
            requestAnimationFrame(() => {
              oldImg.style.opacity = 0;
              overlay.style.opacity = 1;
            });
            setTimeout(() => {
              oldImg.style.transition = "none";
              oldImg.src = imgs[emo];
              oldImg.style.opacity = 1;
              overlay.remove();
              oldImg.offsetHeight;
              oldImg.style.transition = "";
            }, 400);
          }
    if (_userCan("permManage")) {
            this._broadcast();
          } else {
            const p = this._portraits[idx];
            if (p) game.socket?.emit(SOCKET, { type: "emotion", portraitId: p.id, emotionIdx: emo });
          }
        }
      });
    });

    // Attention buttons
    html.querySelectorAll(".vn-attention-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const p = this._portraits[idx];
        if (!p) return;
        const newClaim = !this._claimed[p.id];
        if (newClaim) {
          this._claimed[p.id] = true;
        } else {
          delete this._claimed[p.id];
        }
        this.render();
        game.socket?.emit(SOCKET, { type: "claim", portraitId: p.id, claimed: newClaim });
      });
    });

    // Approve buttons (GM)
    html.querySelectorAll(".vn-approve-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const idx = parseInt(ev.currentTarget.dataset.portIdx);
        const p = this._portraits[idx];
        if (!p) return;
        this._speaker = p.id;
        delete this._claimed[p.id];
        this.render();
        this._broadcast();
      });
    });

    // Request resolve
    html.querySelectorAll(".vn-request-resolve").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        this._requests = this._requests.filter(r => r.id !== id);
        this.render();
      });
    });
};

proto._bindLocationPanel = function() {
    const html = this._el();

    const locGroup = html.querySelector(".vn-loc-group-filter");
    if (locGroup) locGroup.value = this._locGroupFilter;

    const _filterLocDOM = () => {
      const sq = this._locSearch.toLowerCase();
      const tq = this._locTagSearch.toLowerCase();
      const gv = this._locGroupFilter;
      document.querySelectorAll(".vn-loc-item").forEach(el => {
        const name = (el.dataset.name || "").toLowerCase();
        const tags = (el.dataset.tags || "").toLowerCase();
        const group = (el.dataset.group || "").toLowerCase();
        const sOk = !sq || name.includes(sq) || tags.includes(sq) || group.includes(sq);
        const tOk = !tq || tags.includes(tq);
        const gOk = !gv || group === gv;
        el.style.display = (sOk && tOk && gOk) ? "" : "none";
      });
    };
    html.querySelector(".vn-loc-search")?.addEventListener("input", (ev) => {
      this._locSearch = ev.target.value;
      _filterLocDOM();
    });
    html.querySelector(".vn-loc-tag-filter")?.addEventListener("input", (ev) => {
      this._locTagSearch = ev.target.value;
      _filterLocDOM();
    });
    locGroup?.addEventListener("change", (ev) => {
      this._locGroupFilter = ev.target.value;
      this.render();
    });
    html.querySelector(".vn-loc-show-more")?.addEventListener("click", () => {
      this._locListLimit += 12;
      this.render();
    });

    html.querySelectorAll(".vn-loc-select").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const loc = this._data?.locations.find(l => l.id === id);
        if (loc) {
          this._bg = loc.background || "";
          this._showPanel = null;
          this._currentLocationId = id;
          this.render();
          this._broadcast();
        }
      });
    });

    html.querySelectorAll(".vn-loc-delete").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!id) return;
        this._data.locations = this._data.locations.filter(l => l.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });

    html.querySelectorAll(".vn-loc-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const loc = this._data?.locations.find(l => l.id === id);
        if (!loc) return;
        this._editingLocId = id;
        this.render();
      });
    });

    html.querySelector(".vn-loc-back")?.addEventListener("click", () => {
      this._editingLocId = null;
      this._showPanel = null;
      this.render();
    });

    if (this._editingLocId) {
      const loc = this._data?.locations.find(l => l.id === this._editingLocId);
      if (loc) {
        const f = html.querySelector(".vn-loc-form");
        if (f) {
          f.querySelector(".vn-loc-f-name").value = loc.name || "";
          f.querySelector(".vn-loc-f-group").value = loc.group || "";
          f.querySelector(".vn-loc-f-bg").value = loc.background || "";
          f.querySelector(".vn-loc-f-tags").value = (loc.tags || []).join(", ");
          f.querySelector(".vn-loc-f-parent").value = loc.parent || "";
          f.querySelector(".vn-loc-f-weather").value = loc.weather || "";
        }
      }
    }
    this._bindAddLocation(html);
};

proto._bindAddLocation = function(html) {
    const form = html.querySelector(".vn-loc-form");
    if (!form) return;
    form.querySelector(".vn-loc-save")?.addEventListener("click", async () => {
      if (this._saving) return;
      this._saving = true;
      const name = form.querySelector(".vn-loc-f-name")?.value?.trim();
      if (!name) { this._saving = false; return ui.notifications?.warn("Enter location name"); }
      const data = {
        name,
        background: form.querySelector(".vn-loc-f-bg")?.value?.trim() || "",
        group: form.querySelector(".vn-loc-f-group")?.value?.trim() || "",
        tags: (form.querySelector(".vn-loc-f-tags")?.value?.trim() || "").split(",").map(s => s.trim()).filter(Boolean),
        parent: form.querySelector(".vn-loc-f-parent")?.value?.trim() || "",
        weather: form.querySelector(".vn-loc-f-weather")?.value?.trim() || ""
      };
      if (this._editingLocId) {
        const idx = this._data.locations.findIndex(l => l.id === this._editingLocId);
        if (idx !== -1) Object.assign(this._data.locations[idx], data);
        this._editingLocId = null;
      } else {
        this._data.locations.push({ id: String(this._data.nextLocId++), ...data });
      }
      await _saveData(this._data);
      form.querySelector(".vn-loc-f-name").value = "";
      form.querySelector(".vn-loc-f-bg").value = "";
      form.querySelector(".vn-loc-f-tags").value = "";
      form.querySelector(".vn-loc-f-parent").value = "";
      form.querySelector(".vn-loc-f-weather").value = "";
      this._saving = false;
      this.render();
    });
    form.querySelector(".vn-loc-fp")?.addEventListener("click", () => {
      try {
        const fp = new (_FP())({ type: "image", current: "", callback: (path) => {
          form.querySelector(".vn-loc-f-bg").value = path;
        }});
        fp.render(true);
      } catch(e) { console.error("FilePicker error:", e); }
    });
};

proto._bindPortraitPanel = function() {
    const html = this._el();

    const portGroup = html.querySelector(".vn-port-group-filter");
    if (portGroup) portGroup.value = this._portGroupFilter;

    const _filterPortDOM = () => {
      const sq = this._portSearch.toLowerCase();
      const tq = this._portTagSearch.toLowerCase();
      const gv = this._portGroupFilter;
      document.querySelectorAll(".vn-port-item").forEach(el => {
        const name = (el.dataset.name || "").toLowerCase();
        const tags = (el.dataset.tags || "").toLowerCase();
        const group = (el.dataset.group || "").toLowerCase();
        const sOk = !sq || name.includes(sq) || tags.includes(sq) || group.includes(sq);
        const tOk = !tq || tags.includes(tq);
        const gOk = !gv || group === gv;
        el.style.display = (sOk && tOk && gOk) ? "" : "none";
      });
    };
    html.querySelector(".vn-port-search")?.addEventListener("input", (ev) => {
      this._portSearch = ev.target.value;
      _filterPortDOM();
    });
    html.querySelector(".vn-port-tag-filter")?.addEventListener("input", (ev) => {
      this._portTagSearch = ev.target.value;
      _filterPortDOM();
    });
    portGroup?.addEventListener("change", (ev) => {
      this._portGroupFilter = ev.target.value;
      this.render();
    });
    html.querySelector(".vn-port-show-more")?.addEventListener("click", () => {
      this._portListLimit += 12;
      this.render();
    });

    html.querySelectorAll(".vn-port-add-to-stage").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const port = this._data?.portraits.find(p => p.id === id);
        if (port && this._portraits.length < 10) {
          this._portraits.push({
            ...port,
            x: 50 + this._portraits.length * 180,
            y: 200,
            scale: this._defaultPortraitScale ?? 1,
            flip: false,
            locked: false
          });
          this._showPanel = null;
          this.render();
          this._broadcast();
        }
      });
    });

    html.querySelectorAll(".vn-port-delete").forEach(btn => {
      btn.addEventListener("click", async (ev) => {
        const id = ev.currentTarget.dataset.id;
        if (!id) return;
        this._data.portraits = this._data.portraits.filter(p => p.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });

    html.querySelectorAll(".vn-port-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const port = this._data?.portraits.find(p => p.id === id);
        if (!port) return;
        this._editingPortId = id;
        this.render();
      });
    });

    html.querySelector(".vn-port-import")?.addEventListener("click", () => {
      _importActorPortraits();
    });

    html.querySelector(".vn-port-back")?.addEventListener("click", () => {
      this._editingPortId = null;
      this._showPanel = null;
      this.render();
    });

    if (this._editingPortId) {
      const port = this._data?.portraits.find(p => p.id === this._editingPortId);
      if (port) {
        const f = html.querySelector(".vn-port-form");
        if (f) {
          f.querySelector(".vn-port-f-name").value = port.name || "";
          f.querySelector(".vn-port-f-group").value = port.group || "";
          f.querySelector(".vn-port-f-title").value = port.title || "";
          f.querySelector(".vn-port-f-tags").value = (port.tags || []).join(", ");
          f.querySelector(".vn-port-f-img").value = port.image || "";
          f.querySelector(".vn-port-f-actor").value = port.actorId || "";
          const us = f.querySelector(".vn-port-f-user");
          if (us) us.value = port.userId || "";
          const list = f.querySelector(".vn-emotion-list");
          const tpl = f.querySelector(".vn-emotion-row-tpl");
          if (list && tpl && port.images && port.images.length > 1) {
            for (let i = 1; i < port.images.length; i++) {
              const el = tpl.content.cloneNode(true);
              el.querySelector(".vn-emotion-path").value = port.images[i] || "";
              if (this._bindEmotionRow) this._bindEmotionRow(el);
              list.appendChild(el);
            }
            list.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
            if (this._updateEmotionAddBtn) this._updateEmotionAddBtn();
          }
        }
      }
    }

    this._bindAddPortrait(html);
};

proto._bindAddPortrait = function(html) {
    const form = html.querySelector(".vn-port-form");
    if (!form) return;

    const MAX_EMOTIONS = 5;
    const ec = () => form.querySelectorAll(".vn-emotion-row").length;
    const ueb = () => {
      const btn = form.querySelector(".vn-emotion-add");
      if (!btn) return;
      const c = ec();
      btn.disabled = c >= MAX_EMOTIONS;
      btn.textContent = c >= MAX_EMOTIONS ? `Max ${MAX_EMOTIONS} emotions` : `Add emotion (${c}/${MAX_EMOTIONS})`;
    };
    this._readEmotions = () => {
      const paths = [];
      form.querySelectorAll(".vn-emotion-path").forEach(inp => {
        const v = inp.value.trim();
        if (v) paths.push(v);
      });
      return paths.slice(0, MAX_EMOTIONS);
    };
    this._resetEmotions = () => {
      const list = form.querySelector(".vn-emotion-list");
      if (list) list.innerHTML = "";
      ueb();
    };
    this._bindEmotionRow = (el) => {
      const inp = el.querySelector(".vn-emotion-path");
      el.querySelector(".vn-emotion-remove")?.addEventListener("click", (ev) => {
        const row = ev.currentTarget.closest(".vn-emotion-row");
        row?.parentElement?.removeChild(row);
        const list = form.querySelector(".vn-emotion-list");
        list?.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
        ueb();
      });
      el.querySelector(".vn-emotion-fp")?.addEventListener("click", () => {
        try {
          const fp = new (_FP())({ type: "image", current: "", callback: (path) => {
            if (inp) inp.value = path;
          }});
          fp.render(true);
        } catch(e) { console.error("FilePicker error:", e); }
      });
    };
    this._updateEmotionAddBtn = ueb;
    form.querySelector(".vn-emotion-add")?.addEventListener("click", () => {
      const list = form.querySelector(".vn-emotion-list");
      const tpl = form.querySelector(".vn-emotion-row-tpl");
      if (!list || !tpl) return;
      if (ec() >= MAX_EMOTIONS) {
        ui.notifications?.warn(`Maximum ${MAX_EMOTIONS} emotions allowed`);
        return;
      }
      const el = tpl.content.cloneNode(true);
      this._bindEmotionRow(el);
      list.appendChild(el);
      list.querySelectorAll(".vn-emotion-idx").forEach((s, i) => s.textContent = (i + 1) + ".");
      ueb();
    });
    ueb();

    form.querySelector(".vn-port-save")?.addEventListener("click", async () => {
      if (this._saving) return;
      this._saving = true;
      const name = form.querySelector(".vn-port-f-name")?.value?.trim();
      if (!name) { this._saving = false; return ui.notifications?.warn("Enter portrait name"); }
      const mainImg = form.querySelector(".vn-port-f-img")?.value?.trim() || "";
      const extra = this._readEmotions();
      const allImgs = extra.length ? [mainImg, ...extra.filter(p => p !== mainImg)] : (mainImg ? [mainImg] : []);
      const tagsRaw = form.querySelector(".vn-port-f-tags")?.value?.trim() || "";
      const isPlayer = !_userCan("permManage");
      const userId = isPlayer ? (game.user?.id || "") : (form.querySelector(".vn-port-f-user")?.value || "");
      let tags = tagsRaw ? tagsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (userId) {
        const user = game.users?.get(userId);
        const userTag = "player:" + (user?.name || userId);
        tags = tags.filter(t => !t.startsWith("player:"));
        tags.push(userTag);
      } else {
        tags = tags.filter(t => !t.startsWith("player:"));
      }
      const data = {
        name,
        title: form.querySelector(".vn-port-f-title")?.value?.trim() || "",
        group: form.querySelector(".vn-port-f-group")?.value?.trim() || "",
        tags,
        image: mainImg,
        images: allImgs,
        actorId: form.querySelector(".vn-port-f-actor")?.value?.trim() || "",
        userId
      };
      if (this._editingPortId) {
        const idx = this._data.portraits.findIndex(p => p.id === this._editingPortId);
        if (idx !== -1) Object.assign(this._data.portraits[idx], data);
        this._editingPortId = null;
      } else {
        this._data.portraits.push({ id: String(this._data.nextPortId++), ...data });
      }
      await _saveData(this._data);
      this._saving = false;
      form.querySelector(".vn-port-f-name").value = "";
      form.querySelector(".vn-port-f-title").value = "";
      form.querySelector(".vn-port-f-tags").value = "";
      form.querySelector(".vn-port-f-img").value = "";
      form.querySelector(".vn-port-f-actor").value = "";
      const userSel = form.querySelector(".vn-port-f-user");
      if (userSel) userSel.value = "";
      this._resetEmotions();
      this.render();
    });
    form.querySelector(".vn-port-fp")?.addEventListener("click", () => {
      try {
        const fp = new (_FP())({ type: "image", current: "", callback: (path) => {
          form.querySelector(".vn-port-f-img").value = path;
        }});
        fp.render(true);
      } catch(e) { console.error("FilePicker error:", e); }
    });
};

proto._bindScenePanel = function() {
    const html = this._el();

    html.querySelector(".vn-scene-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    html.querySelector(".vn-scene-brightness")?.addEventListener("input", (ev) => {
      this._bgBrightness = parseFloat(ev.target.value) || 1;
      const bg = html.querySelector(".vn-bg");
      if (bg) bg.style.filter = `brightness(${this._bgBrightness})`;
    });

    html.querySelector(".vn-default-portrait-scale")?.addEventListener("input", (ev) => {
      this._defaultPortraitScale = parseFloat(ev.target.value) || 1;
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._defaultPortraitScale;
    });
    html.querySelector(".vn-default-portrait-scale")?.addEventListener("change", (ev) => {
      this._defaultPortraitScale = parseFloat(ev.target.value) || 1;
      if (this._data) { this._data.defaultPortraitScale = this._defaultPortraitScale; _saveData(this._data); }
    });

    html.querySelector(".vn-theme-bg")?.addEventListener("input", (ev) => {
      this._themeBg = ev.target.value;
      if (this._data) { this._data.themeBg = this._themeBg; _saveData(this._data); }
      game.settings?.set("free-visual-novel", "themeBg", this._themeBg);
      this._applyTheme();
    });
    html.querySelector(".vn-theme-accent")?.addEventListener("input", (ev) => {
      this._themeAccent = ev.target.value;
      if (this._data) { this._data.themeAccent = this._themeAccent; _saveData(this._data); }
      game.settings?.set("free-visual-novel", "themeAccent", this._themeAccent);
      this._applyTheme();
    });

    const _saveDialogSetting = (key, value) => {
      game.settings?.set("free-visual-novel", key, value);
    };

    const _updateDialogText = () => {
      const contentEls = document.querySelectorAll(".vn-dialog-content");
      contentEls.forEach(el => {
        const side = el.dataset.side;
        if (side === "left") el.textContent = this._dialog.leftText;
        else if (side === "single" || side === "right") el.textContent = this._dialog.text;
      });
    };

    html.querySelector(".vn-dialog-width")?.addEventListener("input", (ev) => {
      this._dialog.width = parseInt(ev.target.value) || 65;
      _saveDialogSetting("dialogWidth", this._dialog.width);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.width + "%";
      this._applyDialogStyles();
    });

    html.querySelector(".vn-dialog-height")?.addEventListener("input", (ev) => {
      this._dialog.height = parseInt(ev.target.value) || 160;
      _saveDialogSetting("dialogHeight", this._dialog.height);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.height + "px";
      this._applyDialogStyles();
    });

    html.querySelector(".vn-dialog-opacity")?.addEventListener("input", (ev) => {
      this._dialog.opacity = parseFloat(ev.target.value) || 0.85;
      _saveDialogSetting("dialogOpacity", this._dialog.opacity);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.opacity;
      this._applyDialogStyles();
    });

    html.querySelectorAll(".vn-dialog-align").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        this._dialog.align = ev.currentTarget.dataset.align;
        _saveDialogSetting("dialogAlign", this._dialog.align);
        this._applyDialogStyles();
      });
    });

    html.querySelector(".vn-dialog-text")?.addEventListener("input", (ev) => {
      this._dialog.text = ev.target.value;
      _updateDialogText();
    });

    html.querySelector(".vn-dialog-speaker-toggle")?.addEventListener("click", async (ev) => {
      this._dialog.showSpeaker = !this._dialog.showSpeaker;
      _saveDialogSetting("dialogShowSpeaker", this._dialog.showSpeaker);
      await this.render();
    });

    html.querySelector(".vn-scene-toggle-bg")?.addEventListener("click", () => {
      this._hideBg = !this._hideBg;
      this.render();
    });

    html.querySelector(".vn-dialog-fontsize")?.addEventListener("input", (ev) => {
      this._dialog.fontSize = parseInt(ev.target.value) || 16;
      _saveDialogSetting("dialogFontSize", this._dialog.fontSize);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.fontSize + "px";
      this._applyDialogStyles();
    });

    html.querySelector(".vn-speaker-fontsize")?.addEventListener("input", (ev) => {
      this._speakerFontSize = parseInt(ev.target.value) || 20;
      game.settings?.set("free-visual-novel", "speakerFontSize", this._speakerFontSize);
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._speakerFontSize + "px";
      document.querySelectorAll(".vn-dialog-speaker").forEach(el => {
        el.style.fontSize = this._speakerFontSize + "px";
      });
    });

    html.querySelector(".vn-dialog-mode-toggle")?.addEventListener("click", async (ev) => {
      this._dialog.mode = this._dialog.mode === 2 ? 1 : 2;
      ev.currentTarget.textContent = this._dialog.mode === 2 ? "Dual (2 boxes)" : "Single + Speaker";
      await this.render();
    });

    html.querySelector(".vn-dialog-yoffset")?.addEventListener("input", (ev) => {
      this._dialog.yOffset = parseInt(ev.target.value) || 100;
      const val = ev.target.parentElement?.querySelector(".vn-dialog-val");
      if (val) val.textContent = this._dialog.yOffset + "px";
      this._applyDialogStyles();
    });

    html.querySelector(".vn-dialog-lefttext")?.addEventListener("input", (ev) => {
      this._dialog.leftText = ev.target.value;
      const leftBox = document.querySelector(".vn-dialog-content[data-side='left']");
      if (leftBox) leftBox.textContent = this._dialog.leftText;
    });
};

proto._bindPresetsPanel = function() {
    const html = this._el();

    html.querySelector(".vn-presets-back")?.addEventListener("click", () => {
      this._showPanel = null;
      this.render();
    });

    html.querySelector(".vn-presets-save-btn")?.addEventListener("click", async () => {
      const input = html.querySelector(".vn-presets-name-input");
      const name = input?.value?.trim();
      if (!name) return ui.notifications?.warn("Enter a preset name");
      try {
        const result = await this._savePreset(name);
        if (result === "error") {
          return ui.notifications?.error("Failed to save preset");
        }
        ui.notifications?.info(result === "updated" ? `Preset "${name}" updated` : `Preset "${name}" saved`);
        this.render();
      } catch (err) {
        console.error("FreeVN | savePreset error:", err);
        ui.notifications?.error("Failed to save preset: " + err.message);
      }
    });

    html.querySelectorAll(".vn-presets-load").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!this._loadPreset(btn.dataset.id)) return;
        this.render();
        this._broadcast();
      });
    });

    html.querySelectorAll(".vn-presets-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        this._data.presets = this._data.presets.filter(p => p.id !== id);
        await _saveData(this._data);
        this.render();
      });
    });

    html.querySelectorAll(".vn-presets-export").forEach(btn => {
      btn.addEventListener("click", () => this._exportPreset(btn.dataset.id));
    });

    html.querySelector(".vn-presets-import")?.addEventListener("click", () => this._importPreset());
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

} // end bindPanels
