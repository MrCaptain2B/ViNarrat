import { _userCan } from './helpers.js';

export function bindPortraitDrag(proto) {

proto._bindPortraitDrag = function(html) {
    if (this._dragCleanup) this._dragCleanup();
    if (this._showPanel) return;

    const container = html;

    const onClick = (ev) => {
      if (!this.element?.contains(ev.target)) return;
      if (ev.target.closest(".vn-portrait-controls")) return;
      if (ev.target.closest(".vn-dialog-box")) return;
      if (ev.target.closest(".vn-panel")) return;
      if (ev.target.closest("select")) return;
      if (ev.target.closest(".vn-emotion-strip")) return;
      if (ev.target.closest(".vn-attention-btn")) return;
      if (ev.target.closest(".vn-approve-btn")) return;
      const el = ev.target.closest(".vn-portrait");
      if (!el) {
        this._selectedPortraitIdx = null;
        this.render();
        return;
      }
      if (!_userCan("permManage")) return;
      const idx = parseInt(el.dataset.portIdx);
      this._selectedPortraitIdx = this._selectedPortraitIdx === idx ? null : idx;
      this.render();
    };

    const onDown = (ev) => {
      if (!this.element?.contains(ev.target)) return;
      if (!_userCan("permManage")) return;
      const el = ev.target.closest(".vn-portrait");
      if (!el) return;
      const idx = parseInt(el.dataset.portIdx);
      if (isNaN(idx)) return;
      const portrait = this._portraits[idx];
      if (!portrait) return;
      if (portrait.locked) return;
      if (ev.target.closest(".vn-portrait-controls")) return;
      ev.preventDefault();
      const rect = container.getBoundingClientRect();
      this._dragState = {
        index: idx,
        ox: ev.clientX - rect.left - portrait.x,
        oy: ev.clientY - rect.top - portrait.y
      };
    };
    const onMove = (ev) => {
      if (!this._dragState) return;
      const rect = container.getBoundingClientRect();
      const p = this._portraits[this._dragState.index];
      if (!p) return;
      p.x = Math.round(ev.clientX - rect.left - this._dragState.ox);
      p.y = Math.round(ev.clientY - rect.top - this._dragState.oy);
      const el = document.querySelector(`.vn-portrait[data-port-idx="${this._dragState.index}"]`);
      if (el) {
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
      }
    };
    const onUp = () => { this._dragState = null; };
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    this._dragCleanup = () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
};

} // end bindPortraitDrag
