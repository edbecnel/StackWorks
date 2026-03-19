# Offline Regression Smoke Check (Golden)

Goal: confirm offline/local gameplay still works (golden behavior) before/after multiplayer refactors.

## Automated (preferred)

- Run: `npm run smoke:offline`

This performs a lightweight check that:

- Each variant initial position has at least 1 legal move
- A legal move can be applied without throwing
- Existing golden save fixtures under `docs/test-saves/` still load and can advance

## Manual UI spot-check

For each page: Lasca, Lasca 8×8, Dama (Standard/International), Damasca:

1. Load the page
2. Make 3–5 legal moves (including a capture if available)
3. Undo twice, Redo twice; ensure Move History scroll follows the current entry
4. Confirm no console errors
5. Turn off network access and refresh/reopen the same previously visited page; it should still render from the cached HTML shell
6. (Optional) Save game and immediately load it back
