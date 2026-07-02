# ViNarrat

A live social scene director for **Foundry Virtual Tabletop v13/v14**.  
GMs orchestrate encounters — backgrounds, portraits, dialogue — while players see everything in real time and control their own characters.

> **Version 0.7.0** — Active development

---

## Features

### GM Tools
- **Fullscreen scene overlay** — dialogue box, speaker indicator, character portraits, backgrounds
- **Portrait management** — add, drag, scale, flip, lock, arrange; import portraits from Actor sheets
- **Location backgrounds** — image backgrounds with brightness control, grouped/tagged
- **Scene control** — dialogue (single or dual mode), speaker selection, themes (bg/accent colors)
- **Broadcast** — push your scene to all online players (or stage-only) in real time
- **Invite** — targeted invitations for specific players
- **Scene Presets** — save/load full scene snapshots (background, portraits, speaker, dialog state)

### Script Engine
- **Scripts** — multi-step automated scene sequences
- **Step types**: Scene (full state snapshot), Pause (N-second wait), Transition (fade effects)
- **Playback** — play, pause, step forward/backward with typewriter text and animated transitions
- **Editor** — drag-to-reorder steps, inline edit every field, export/import as JSON
- **Opening transition** — fades from black; **closing transition** — fades to black

### Region Triggers
- Attach any script to a Foundry **Region**
- Auto-plays once when a **player-controlled token** enters the region
- Works with standard Foundry Region tools — no new UI

### Player Features
- **Live view** — see GM's scene with full broadcast sync
- **My Portrait** — open your own portrait panel, edit name/title/emotions/images
- **Emotion strip** — click to change your portrait's expression (visible to everyone)
- **Attention / Claim** — press ✋ on your portrait → GM gets a pulsing indicator → approves with ✓
- **Rejoin** — type `/vnrejoin` to re-sync if you refresh or disconnect
- **Session persistence** — state survives browser refresh

### Permissions (granular)
Each feature has a configurable minimum role (Player / Trusted / Assistant / GM):

| Permission | Default | What it controls |
|------------|---------|------------------|
| `permManage` | GM | Full scene control |
| `permBroadcast` | GM | Start/stop broadcast |
| `permApproveClaims` | GM | Approve player Attention requests |
| `permAddRequests` | Player | Send requests to GM |

---

## Quick Start

```
/vn           Open ViNarrat as GM
/vnreq text   Send a request to GM
/vnportrait   Open your portrait panel
/vnedit       Alias for /vnportrait
/vnrejoin     Re-sync after disconnect
```

### First-time GM
1. `/vn` — open the overlay
2. **Portraits** panel → **Import from Actors** → select your actors
3. **Locations** panel → add backgrounds
4. **Scene Control** → type dialogue, set speaker
5. Click **Broadcast** — players see your scene live
6. Use **Create Script** to build a reusable scene sequence

---

## Script Engine

### Scripts vs Presets

| Presets | Scripts |
|---------|---------|
| Single scene snapshot | Multi-step sequence |
| Background + portraits + speaker | Dialogue, emotions, pauses, transitions |
| Manual load | Auto-playback |
| No logic | Step-by-step progression |

### Step Types

| Type | Effect |
|------|--------|
| **Scene** | Applies full state — background, portraits, dialogue, speaker |
| **Pause** | Waits N seconds, no scene changes |
| **Transition** | Visual fade (fadeToBlack or crossfade) — no state change |

### Playback Controls
- **Click empty space** — advance to next step (first click clears typewriter, second advances)
- **Prev / Next / Stop** — navigate and exit
- **Play / Pause** — auto-advance through script
- Portraits are locked, speaker bar hidden, stage non-interactive during playback

### Editor
- **Load step** — load saved step state into scene editor
- **Edit state** — change the scene, then **Save** to update the step
- **Up / Down** — reorder steps
- **Delete** — remove step
- **Add** — Scene, Pause, or Transition (with type/duration selectors)
- Default template: Opening Transition → Scene → Closing Transition

---

## Region Triggers

1. Create a **Region** on your scene
2. Add behavior → **ViNarrat Script**
3. Click **Select Script** → pick from saved scripts
4. When a **player-controlled token** enters the region, the script fires **once**
5. Flag-based: re-entering the region won't re-trigger

---

## API

```js
game.freevisualnovel.open()                // Open VN overlay
game.freevisualnovel.close()               // Close VN overlay
game.freevisualnovel.setBackground(path)
game.freevisualnovel.addPortrait(data)
game.freevisualnovel.addRequest(text)
game.freevisualnovel.clearStage()
game.freevisualnovel.importActorPortraits()
```

---

## Installation

1. Foundry VTT → **Add-on Modules** → **Install Module**
2. Paste manifest URL:
   ```
   https://raw.githubusercontent.com/MrCaptain2B/FreeVisualNovel/master/module.json
   ```
3. Enable in your world

Or clone for development:
```bash
git clone https://github.com/MrCaptain2B/FreeVisualNovel.git
```

---

## Compatibility

- **Foundry VTT v13/v14**
- No external library dependencies
- Works with any game system
- Tested in modern browsers (Chrome, Firefox, Edge)

---

## Development

```
vinarrat/
├── scripts/
│   ├── app.js               — VisualNovelApp main class
│   ├── helpers.js           — data load/save, permissions, FP helper
│   ├── script-engine.js     — playback, editor, presets
│   ├── panels.js            — all UI panels
│   ├── portrait-drag.js     — drag & drop
│   ├── invite.js            — invite system
│   ├── region-behavior.js   — Region trigger integration
│   └── visualnovel.js       — entry point (init, ready)
├── style/
│   └── visualnovel.css
├── templates/
│   └── visualnovel.hbs
├── languages/
│   └── en.json
├── docs/
│   └── progress.md          — internal dev notes
├── module.json
├── README.md
└── README.ru.md
```

---

## License

MIT
