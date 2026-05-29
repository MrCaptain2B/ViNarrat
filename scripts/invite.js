import { _userCan, _roleCan, SOCKET } from './helpers.js';

export function bindInvite(proto) {

proto._buildInviteUI = function() {
    if (!_userCan("permManage") || !this.element) return;
    if (this._inviteBtn) { this._inviteBtn.remove(); this._inviteBtn = null; }
    if (this._inviteMenu) { this._inviteMenu.remove(); this._inviteMenu = null; }
    this._inviteMenuCleanup?.();

    const toolbar = this.element.querySelector(".vn-gm-toolbar");
    if (!toolbar) return;

    const btn = document.createElement("button");
    btn.className = "vn-btn-invite";
    btn.title = "Invite Player";
    btn.innerHTML = '<i class="fas fa-user-plus"></i>';
    toolbar.insertBefore(btn, toolbar.querySelector(".vn-btn-close"));

    const menu = document.createElement("div");
    menu.className = "vn-invite-menu";
    menu.classList.add("vn-hidden");

    function _rebuildMenu() {
      menu.innerHTML = "";
      const label = document.createElement("div");
      label.className = "vn-broadcast-label";
      label.textContent = "Online Players";
      menu.appendChild(label);

      const users = [...game.users].filter(u => u.active && !u.isGM && !_roleCan(u.role, "permManage"));
      if (users.length) {
        for (const u of users) {
          const pb = document.createElement("button");
          pb.className = "vn-invite-player";
          pb.dataset.userId = u.id;
          pb.textContent = u.name;
          pb.addEventListener("click", () => {
            const payload = {
              type: "state", broadcasting: true, inviteMode: this._inviteMode || "all",
              bg: this._bg, portraits: this._portraits,
              speaker: this._speaker, claimed: this._claimed || {}
            };
            game.socket?.emit(SOCKET, { ...payload, targetUser: u.id });
            game.socket?.emit(SOCKET, { type: "invite", userId: u.id });
            menu.classList.add("vn-hidden");
          });
          menu.appendChild(pb);
        }
      } else {
        const empty = document.createElement("div");
        empty.className = "vn-broadcast-empty";
        empty.textContent = "No players online";
        menu.appendChild(empty);
      }
    }
    _rebuildMenu();

    toolbar.appendChild(menu);

    const btnClick = (ev) => {
      ev.stopPropagation();
      _rebuildMenu();
      menu.classList.toggle("vn-hidden");
    };
    btn.addEventListener("click", btnClick);

    const closer = (ev) => {
      if (!menu.classList.contains("vn-hidden") && !menu.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
        menu.classList.add("vn-hidden");
      }
    };
    document.addEventListener("click", closer);
    this._inviteMenuCleanup = () => {
      document.removeEventListener("click", closer);
      btn.removeEventListener("click", btnClick);
    };
    this._inviteBtn = btn;
    this._inviteMenu = menu;
};

} // end bindInvite
