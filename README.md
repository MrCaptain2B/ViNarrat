# ViNarrat

Social scenes for Foundry VTT — portraits, dialogue, backgrounds, all in real time.  
Players see what you build the moment you build it. No token setup, no prep.

> **v0.7.0** — works on Foundry v13 and v14

---

## What's this?

ViNarrat gives you a fullscreen overlay where you drag portraits, switch backgrounds, type dialogue, and pick who's speaking — all live, all visible to players the instant you hit Broadcast.

It's not a visual novel engine. It's a **scene director**. Every NPC portrait your players would normally stare at while you talk now stands on a stage, changes expressions, and shows exactly who's speaking, no squinting at docs.

---

## Quick start (for GMs)

```
/vn           Open the overlay
/vnreq text   Send me a request (players)
/vnportrait   Open my portrait panel (players)
/vnrejoin     Re-sync if you DC'd
```

**First time:**
1. Hit `/vn`.
2. Open the **Portraits** panel → **Import from Actors**. Pick your actor folder.
3. Open **Locations** → add backgrounds for wherever the scene is.
4. Drag a portrait onto the stage. Click it — scale, flip, lock, whatever.
5. Type dialogue in Scene Control. Pick who's talking from the speaker bar on the left.
6. Click **Broadcast**. Now your players see the same thing you do.
7. If you want a scripted sequence — **Create Script**, add steps, hit play.

---

## What you can do with it

### 🎭 Portraits on stage
Drag any portrait from your data panel onto the stage. Move it, scale it, flip it, lock it in place. Multiple expressions per portrait (emotions). Players can click their own portrait's emotion strip to change expressions live — GM sees it instantly.

The speaker bar on the left shows every portrait on stage with colored borders: blue = player-controlled, red = NPC. Click a name to set as speaker. Active speaker gets the gold border.

### 💬 Dialogue
Type text, pick a speaker, done. Single box or dual-column mode. Dialogue box has opacity, width, height, font size, and alignment sliders — whatever fits your screen. You can click the text directly to edit it inline, Enter to save.

### 🖼 Presets (scene save/load)
Save the full scene — background, brightness, all portraits with positions/scales/emotions, speaker, dialogue settings. Name it, load it later. Export as `.json`, import on another world.

### 📜 Scripts (auto-play sequences)
Multi-step scene scripts. Each step stores the full scene state and can be:

| Step type | What it does |
|-----------|-------------|
| **Scene** | Load everything — background, portraits, speaker, dialogue |
| **Pause** | Wait N seconds |
| **Transition** | Animated fade (fadeToBlack or crossfade) |

Playback walks through the sequence. Click to clear typewriter, click again to advance. Transitions are purely visual — they never touch your scene state.

### 📡 Broadcast & Invite
Broadcast pushes everything — bg, portraits, speaker, dialogue, theme colors — to all players. Invite is per-player: click the invite button, pick who joins. Both work over Foundry's socket.

### 🧩 Region triggers
Make a Region on your scene. Add ViNarrat Script behavior. Pick a script. When a player token walks in, the script fires once. Re-entering won't re-trigger.

### 👁 Player view
Players get a lightweight toolbar: portraits panel (they can edit their own portrait's name, title, emotion images), attention button (pings GM with a pulse indicator), and rejoin (`/vnrejoin` if they refresh and lose sync).

### 🔐 Permissions
Every action has a minimum role:

| Setting | Default | What it gates |
|---------|---------|---------------|
| `permManage` | GM | Full scene control |
| `permBroadcast` | GM | Start/stop broadcast |
| `permApproveClaims` | GM | Approve player attention requests |
| `permAddRequests` | Player | Send requests to GM |

---

## Known quirks / honest talk

- This is **beta**. Core stuff works (scripts, broadcast, portraits, regions), but there's no migration path if I break the data format.
- Imported presets reference image paths from your server. If the same images don't exist on the target world, they won't show. No image files are copied during import.
- Theme colors broadcast to players now, but accent RGB is auto-calculated from the hex picker. If it looks wrong, refresh.
- FilePicker (for browsing images) uses Foundry's v13+ implementation. The native import bypasses it with a plain `<input type="file">` because v13/14 FilePicker is picky about extensions.
- No bundled dependencies. No JSZip, no nothing. Works with any game system.

---

## API

```js
game.freevisualnovel.open()                // Open the overlay
game.freevisualnovel.close()               // Close it
game.freevisualnovel.setBackground(path)
game.freevisualnovel.addPortrait(data)
game.freevisualnovel.addRequest(text)
game.freevisualnovel.clearStage()
game.freevisualnovel.importActorPortraits()
```

---

## Install

```
https://raw.githubusercontent.com/MrCaptain2B/FreeVisualNovel/master/module.json
```

Paste that in Foundry → Add-on Modules → Install Module. Or clone:

```bash
git clone https://github.com/MrCaptain2B/FreeVisualNovel.git
```

---

## Structure

```
vinarrat/
├── scripts/
│   ├── app.js
│   ├── helpers.js
│   ├── script-engine.js
│   ├── panels.js
│   ├── portrait-drag.js
│   ├── dialog.js
│   ├── inline-edit.js
│   ├── invite.js
│   ├── region-behavior.js
│   └── visualnovel.js
├── style/visualnovel.css
├── templates/visualnovel.hbs
├── languages/en.json
├── module.json
├── README.md
└── README.ru.md
```

---

## License

MIT
