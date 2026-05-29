export function bindDialog(proto) {

proto._applyDialogStyles = function() {
    const d = this._dialog;
    if (!d) return;
    const boxes = document.querySelectorAll(".vn-dialog-box");
    boxes.forEach(box => {
      const isDual = box.classList.contains("vn-dialog-left") || box.classList.contains("vn-dialog-right");
      box.style.width = isDual ? `calc(${d.width}% / 2 - 30px)` : d.width + "%";
      box.style.height = d.height + "px";
      box.style.opacity = d.opacity;
      box.style.textAlign = d.align;
      box.style.fontSize = d.fontSize + "px";
      if (!isDual) box.style.bottom = d.yOffset + "px";
    });
    const dual = document.querySelector(".vn-dialog-dual");
    if (dual) dual.style.bottom = d.yOffset + "px";
};

} // end bindDialog
