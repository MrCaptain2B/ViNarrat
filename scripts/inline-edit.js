export function bindInlineEdit(proto) {

proto._bindInlineEdit = function() {
    if (this._inlineEditBound) return;
    this._inlineEditBound = true;
    document.addEventListener("click", (ev) => {
      const content = ev.target.closest(".vn-dlg-content");
      if (!content || content.getAttribute("contenteditable") === "true") return;
      content.setAttribute("contenteditable", "true");
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    document.addEventListener("blur", (ev) => {
      const content = ev.target.closest?.(".vn-dlg-content");
      if (!content || content.getAttribute("contenteditable") !== "true") return;
      content.removeAttribute("contenteditable");
      const side = content.dataset.side;
      if (side === "left") this._dialog.leftText = content.textContent;
      else this._dialog.text = content.textContent;
      const val = content.textContent;
      if (val) this.render();
    }, true);
    document.addEventListener("keydown", (ev) => {
      const content = ev.target.closest?.(".vn-dlg-content");
      if (!content || content.getAttribute("contenteditable") !== "true") return;
      if (ev.key === "Escape") {
        content.textContent = content.dataset.side === "left" ? this._dialog.leftText : this._dialog.text;
        content.blur();
      } else if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        content.blur();
      }
    });
};

} // end bindInlineEdit
