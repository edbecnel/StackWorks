# StackWorks

A browser-based suite of board games and variants, including Lasca (Laska), Dama, Damasca, Columns Chess, and Classic Chess.

## About

This project includes multiple variants (selected from the Start Page):

### Lasca (7×7 and 8×8)

Lasca is a two-player checkers variant with unique stacking mechanics. When a piece captures an opponent's piece, it forms a stack (called a "column") with the captured piece underneath. The top piece controls the stack, and captured pieces can be liberated when their stack is captured.

- Play on classic 7×7 board or Lasca 8×8 variant
- Soldiers move forward; Officers move diagonally any direction
- Captured pieces form stacks rather than leaving the board

### Dama (8×8)

Traditional checkers/draughts with two rule variants:

- **Standard**: Captured pieces removed immediately during multi-capture sequences
- **International**: Captured pieces remain on board until sequence completes
- Men move forward diagonally; Kings have "flying" movement (any distance diagonally)
- Save files are compatible between Standard and International variants
- Mandatory capture with maximum-capture rule (must take the longest capture sequence)

### Damasca (8×8)

Damasca combines Dama-style movement with Lasca-style stacking captures:

- Dama-style movement (including flying Officers)
- Lasca-style stacking captures (jump takes top piece only and adds it to the bottom of the capturing stack)
- Mandatory capture + multi-capture + maximum-capture priority
- Promotion is applied at end of turn / end of capture chain (no mid-chain king powers)

## Features

- ✨ Interactive board with drag-free click-to-move gameplay
- 🎯 Move hints showing capture targets and landing positions
- ⏮️ Full undo/redo with move history tracking
- 💾 Save and load games (JSON format)
  - Piece themes (Classic, Wooden, Glass, and others)
  - **Neo (PNG)** chess theme (expects local images in `public/pieces/neo/`; see below)
  - Optional 8×8 checkerboard board colors (Classic/Green/Blue) when “Use checkered board (8×8)” is enabled
- 🌈 Bright animated halos for selection/targets/highlights (theme-colored)
- 🔊 Sound effects toggle (Start Page + in-game)
- 📊 Stack inspector showing piece composition
- 🎮 Game over detection with win conditions
- 🔄 Multi-capture sequences with anti-loop protection
- 🏳️ Resign option with confirmation dialog
- 🆕 New Game button to start fresh
- ♾️ Threefold repetition draw detection (toggleable)
- 🎬 Smooth piece animations with toggle control
- 📝 Move notation display (r0c0 → r1c1 format)
- 💾 Export move history to JSON format
- 🤖 Optional AI opponents (Beginner / Intermediate / Expert per color)
- ♟️ Classic Chess mode with optional bot opponents (Stockfish-backed; offline)
  - Import/export PGN (paste/upload + export current line)
  - Copy/share FEN from any move (right-click a Move History entry)
- ⚖ Evaluation indicators (advantage / controlled stacks / material)
- 🧭 Start Page launcher to configure options before playing
- 🌐 Online multiplayer (2 players) via Start Page (Create/Join/Rejoin)
- ⛔ Online play is blocked until both players join (prevents “both colors” input)
- ⏳ Online room creation shows a sticky “Waiting for opponent…” toast (tap to copy invite link)
- 👁️ Spectate public rooms from the Start Page
- 🔒 Private rooms (joinable, not publicly spectatable)
- 🔗 Private-room spectating via secret watch link
- 📋 Lobby list of open rooms (one-click Join)
- 🆔 Room ID shown in-game (Info → Online) with one-click copy
- Ⓦ One-click copy of private spectate link (players)
- 📱 Mobile board-height adjust button (tap to toggle; touch-hold + drag to move)

## How to Play

### Starting the Game

1. Run the dev server with `npm start` (it opens the Start Page at `src/index.html`)
2. Choose options (theme, startup toggles, AI), then click **Launch**

- If you choose the **Glass** theme, you can also choose **Glass bg** (**Original** / **Felt** / **Walnut**).
- If you choose the **Glass** theme, you can also choose **Glass colors** (piece color-pair presets).
- For 8×8 variants, enabling **Use checkered board (8×8)** (Start Page or in-game Options) switches to a chess-style square grid. When enabled, the in-game **Theme** panel shows a **Board** selector (Classic/Green/Blue) for checkerboard colors.

#### Online multiplayer (Create / Join)

1. Start the online dev server + client with `npm run online:dev`

- Client: `http://localhost:8080/`
- Server: `http://localhost:8788/`

Note: if `8080` is already in use, Vite will pick another port (often `8081`). Use the URL printed in your terminal.

2. On the Start Page, set **Play mode** to **Online**.
3. Player 1 chooses **Create**, chooses **Room** visibility (**Public** or **Private**), and clicks **Launch**.
4. After the room is created, the game shows a sticky **Waiting for opponent…** toast. Tap it to copy an invite link to share.
5. You can also copy the **Room ID** from **Info → Online** (copy button next to “Room ID”).
6. Player 2 can either open the invite link, or go to the Start Page → **Join**, paste the Room ID, and click **Launch**.

#### Spectating (Start Page)

- For **public** rooms, choose **Online → Spectate**, paste the Room ID, and click **Launch**.
- **Private** rooms are not spectatable from the Lobby/Start Page without a secret watch link.

To share a private spectate link, a seated player can use **Info → Online → Ⓦ** (copy watch link).

Note: when joining, the Start Page will auto-open the correct variant page for that room.

Alternative: use the Start Page **Lobby** section to see open rooms and click **Join** on a row (auto-fills the Room ID and launches).

##### Leaving an online game

- If you want to leave cleanly and release your seat, use the in-game **Leave room (forfeit)** button. It confirms first, then ends the game immediately (counts as resign) and returns you to the Start Page.
- If you simply close the tab, the server starts a disconnect grace period (default ~2 minutes).
  - If your opponent is still connected when grace expires, you lose by disconnect timeout.
  - If **both players are disconnected**, the game stays paused and does not time out (so you can resume later).

##### Resuming later

- Same browser: use Start Page **Online → Rejoin room (this browser)** (uses saved seat/player ID).
- Different browser/device: keep the URL containing your **roomId** + **playerId** (your seat credential) and open it later.

##### Online troubleshooting

- **Ports already in use**: the online client uses `8080` and the online server uses `8788`. If `npm run online:dev` fails to start, stop anything else listening on those ports.
  - Windows PowerShell example:
    - `Get-NetTCPConnection -LocalPort 8788,8080 | Select-Object -ExpandProperty OwningProcess -Unique`
    - `Stop-Process -Id <PID> -Force`
- **Client is on 8081 (or similar)**: Vite will automatically choose a new port if `8080` is busy. Check the terminal output for the actual client URL.
- **Changes not taking effect**: make sure you restarted the online server (and client) after pulling new code; stale node processes can keep old behavior running.
- **Room ID copy doesn’t work**: clipboard writes usually require a secure context (HTTPS or `http://localhost`) and may prompt for permission. If the button fails, you can still select/copy the Room ID text manually.
- **Testing from a phone on your LAN**: run `npm run online:dev:lan`, then open `http://<your-lan-ip>:8080/` from your phone (same Wi‑Fi). The server still runs on `8788`.
- **Joined the wrong variant**: always join from the Start Page’s **Online → Join** flow. Opening a variant page directly (e.g. `src/lasca.html`) and then trying to “join” a room from another variant can cause confusing behavior.
- **Opponent’s moves don’t show up**: refresh the page and confirm both players are pointing at the same **Server URL** on the Start Page. Some networks/extensions can interfere with Server-Sent Events (SSE).

Alternatively, you can open `src/lasca.html` directly to jump straight into the game.

## Neo (PNG) Chess Pieces

This repo includes a **Neo (PNG)** theme that loads chess piece images from your local `public/` folder.

- Put these files in `public/pieces/neo/`:
  - `wp.png`, `wn.png`, `wb.png`, `wr.png`, `wq.png`, `wk.png`
  - `bp.png`, `bn.png`, `bb.png`, `br.png`, `bq.png`, `bk.png`
- If a file is missing, the theme falls back to disc + Unicode glyphs.

### Basic Rules

- **Movement**: Soldiers move forward diagonally one square. Officers move diagonally in any direction.
- **Captures**: Pieces jump over enemy pieces diagonally, landing two squares away. (In Lasca/Damasca, captured pieces stack under the capturer; in Dama, captured pieces are removed.)
- **Promotion**: Soldiers promote to Officers at the end of the turn. During capture chains, the piece continues as a Soldier; if it reaches the far edge at any point in the chain, it promotes when the chain ends.
- **Multi-captures**: If more captures are available, you must continue capturing.
- **Mandatory Capture**: If captures are available, you must capture.
- **Anti-loop Rule**: During multi-capture, you cannot jump over the same square twice.

### Winning

You win when your opponent has:

- No pieces on top of any stacks, OR
- No legal moves available

For detailed rules and strategy tips, see [Help](src/help.html).

If you want help using the Start Page itself (launcher UI), see [Start Page Help](src/start-help.html).

### AI and Evaluation

- **AI (Game Panel → AI):** For Lasca/Dama/Damasca, set Light and/or Dark to an AI difficulty. If both sides are AI, the game can auto-play.
- **Chess Bot (Game Panel → Bot):** For Classic Chess, set White and/or Black to a bot tier (Beginner / Intermediate / Strong). The bot warms up on first load.
- **Stockfish over HTTP:** Classic Chess prefers an HTTP Stockfish API when one is available.
  - In production, point the UI at your main game server and expose Stockfish there as `/api/stockfish`.
  - In local dev, you can still run the standalone helper service and point the client at it with `VITE_STOCKFISH_SERVER_URL`.
  - Same machine: `http://127.0.0.1:8799`
  - LAN device: use your PC's LAN IP (e.g. `http://192.168.1.50:8799`) — `127.0.0.1` will not work from a phone.
- **Speed:** Adjusts the pause between AI moves.
- **Pause / Step:** Pause AI play, or step a single move when both sides are AI.
- **Evaluation (Info panel → Evaluation):** Choose what to display using the icon buttons (hover for tooltips):
  - ⚖ Advantage (estimate)
  - ▦ Controlled stacks
  - ⛀ Material (all pieces)

### Move Notation and Export

#### Move History Display

The Move History section (in the Info panel, below the Lasca Stack Inspector) shows each move in algebraic notation.

- Click any entry (including "Start") to jump to that point in the game.
- When you Undo/Redo or jump, the list scrolls to keep the current entry visible.
- When you play moves normally, it auto-scrolls so the latest move stays visible.

- **Quiet moves**: `1. ⚪ D3 → E4` (start → destination)
- **Captures**: `1. ⚫ F6 × E5` (using × symbol)
- **Multi-captures**: `2. ⚪ D3 × F5 × H7` (full path when available)

Move numbers follow chess convention: each full turn (Light + Dark) is one move number.

#### Export Move History

Click "Export Move History" to download a JSON file containing all moves:

```json
{
  "game": "Lasca",
  "date": "2025-12-24T10:30:00.000Z",
  "moves": [
    {
      "moveNumber": 1,
      "player": "Light",
      "notation": "D3 → E4"
    },
    {
      "moveNumber": 1,
      "player": "Dark",
      "notation": "F6 × E5"
    }
  ]
}
```

This format is useful for:

- Recording games for publication
- Analyzing game patterns
- Sharing games with other players
- Potential import into other Lasca game engines

## Development

### Multiplayer checklist

For the current online-multiplayer implementation status and next milestones, see [docs/multiplayer-checklist.md](docs/multiplayer-checklist.md).

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
npm install
```

### Commands

- `npm start` - Start development server with hot reload
- `npm run bot:dev` - Start Classic Chess bot dev: local Stockfish server + client configured to use it
- `npm run stockfish:server` - Start the local Stockfish HTTP server (see `stockfish-server/`)
- `npm run online:dev` - Start online server + client (2-player online play)
- `npm run online:dev:lan` - Online dev server + client, with the client bound to your LAN interface (for phone testing)
- `npm run online:dev:lan:bot` - Online dev (LAN client) + local Stockfish server + client configured to use it
- `npm run build` - Build for production
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run preview` - Preview production build
- `npm run deploy` - Deploy to GitHub Pages

### Render Deployment

The multiplayer server can run on Render using [render.yaml](render.yaml), but avatar uploads and auth profile data only persist across deploys if you attach a persistent disk to the web service.

Required Render settings for `stackworks-server`:

1. Create or open the `stackworks-server` web service.
2. Ensure the service is on a paid Render plan.
3. Add a persistent disk in the Render dashboard.
4. Set the disk mount path to `/var/data/stackworks`.
5. Choose an initial disk size such as `1 GB`.
6. Confirm the service environment includes `LASCA_DATA_DIR=/var/data/stackworks/games`.

What this does:

- Game persistence is stored under `/var/data/stackworks/games`.
- Auth profile data is stored under `/var/data/stackworks/auth`.
- Uploaded avatar files are stored under `/var/data/stackworks/auth/avatars`.

Important Render constraints:

- Only files written under the disk mount path are persistent.
- Services with persistent disks cannot scale to multiple instances.
- Adding a disk disables zero-downtime deploys for that service.

Verification after deploy:

1. Upload an avatar from the Start Page account UI.
2. Redeploy or restart the Render service.
3. Confirm the avatar still appears after reload.
4. Optionally inspect these paths in the Render Shell:

- `/var/data/stackworks/auth/users.json`
- `/var/data/stackworks/auth/avatars`

### Debug scripts

- `node scripts/debug-check-save.mjs <path-to-save.json>` - Developer helper to inspect a save file and report whether `current` matches `history.states[history.currentIndex]` (and show a small diff / closest snapshot when it doesn’t).

### Project Structure

```
src/
├── game/           # Game logic (rules, moves, state)
├── render/         # SVG rendering and animations
├── controller/     # Game controller and interaction
├── ui/             # UI components (inspector, theme selector)
├── theme/          # Theme management
└── assets/         # SVG board and piece definitions
```

## Technology Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Vitest** - Unit testing framework
- **SVG** - Vector graphics for scalable rendering

## Testing

The project includes comprehensive unit tests covering:

- Move generation (captures, quiet moves)
- Move application and state transitions
- Promotion logic
- Game over detection
- Stack mechanics
- Save/load functionality

Run tests with:

```bash
npm test
```

## Browser Compatibility

Modern browsers with ES2020+ support:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Customization

### Theme Colors

In `src/lasca.html`, adjust CSS variables in `:root`:

```css
--themeMenuBg: rgba(0, 0, 0, 0.88);
--themeMenuHoverBg: rgba(255, 255, 255, 0.1);
--themeMenuSelectedBg: rgba(255, 255, 255, 0.16);
--themeMenuText: rgba(255, 255, 255, 0.92);
--themeMenuBorder: rgba(255, 255, 255, 0.18);
```

## License

MIT

## Changelog

### Version 1.0 (2025-12-24)

#### Initial Release

- Complete Lasca game implementation
- Interactive board with click-to-move
- Move hints with capture visualization
- Undo/redo with move history
- Save/load game functionality with clean session behavior
- Multiple themes
- Stack inspector
- Game over detection
- Anti-loop capture rule
- Full test coverage

#### Recent Updates

- Added **Resign** button with confirmation dialog
- Added **New Game** button to restart with fresh state
- Implemented **threefold repetition draw** detection
  - Same board position occurring 3 times results in a draw
  - Toggleable via the Options section in the Game Panel
  - Prevents infinite game loops
- Added **smooth piece animations** using Web Animations API
  - Animates all moves including captures and multi-capture chains
  - Toggleable via the Options section in the Game Panel (default: on)
- Implemented **move notation display** in Move History
  - Shows algebraic notation with → for moves, × for captures
  - Clean display for multi-capture chains (no repeated nodes)
- Added **Export Move History** feature
  - Downloads JSON file with game metadata and all moves
  - Includes move number, player, and notation for each move
- Improved save/load behavior to reset game state properly
- Enhanced deployment configuration for GitHub Pages
- Fixed Help link to open in new tab (preserves game state)
- Added a **Start Page** launcher (`src/index.html`) for configuring theme / options / AI before launching
- Added **Start Page Help** (`src/start-help.html`) and context-aware navigation between help pages

For example: Change --themeMenuBg to try different backgrounds.

## Notes

- The default entry HTML is `src/index.html` (Start Page), which loads `src/indexMain.ts`.
- The Lasca game page is `src/lasca.html`, which loads `src/main.ts`.
- If you prefer, you can also open `src/lasca.html` directly in a browser, but using a local server avoids potential file URL quirks.
