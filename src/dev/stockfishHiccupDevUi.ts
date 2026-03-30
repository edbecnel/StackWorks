/**
 * Dev-only control to arm a simulated Stockfish failure on the next API call.
 * See POST /api/stockfish/dev/hiccup on the game server (non-production only).
 *
 * **Enable the bottom-left button:** create `.env.local` in the **repo root** (next to `vite.config.ts`) with:
 *   VITE_STOCKFISH_HICCUP_UI=1
 * then restart `vite` (`npm run dev` / `npm run online:dev`). Remove the line or set to `0` to hide it again.
 * (Production builds never ship this UI; the gate is `import.meta.env.DEV` plus this variable.)
 */

function normalizeBaseUrl(raw: string): string {
  const value = String(raw || "").trim();
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLocalDevHostname(): boolean {
  if (typeof window === "undefined") return false;
  const h = String(window.location.hostname || "").toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

/** Same base resolution as ChessBotManager / HttpUciEngine for server-backed Stockfish. */
function resolveStockfishApiBase(): string | null {
  const env = (import.meta as any).env ?? {};
  const mainServer = typeof env.VITE_SERVER_URL === "string" ? normalizeBaseUrl(env.VITE_SERVER_URL) : "";
  if (mainServer) return `${mainServer}/api/stockfish`;
  return `${normalizeBaseUrl(window.location.origin)}/api/stockfish`;
}

const INSTALL_FLAG = "data-lasca-stockfish-hiccup-dev-ui";

export function installStockfishHiccupDevUi(): void {
  if (!import.meta.env.DEV || typeof document === "undefined") return;
  if (import.meta.env.VITE_STOCKFISH_HICCUP_UI !== "1") return;
  if (!isLocalDevHostname()) return;
  if (document.documentElement.hasAttribute(INSTALL_FLAG)) return;
  document.documentElement.setAttribute(INSTALL_FLAG, "1");

  const base = resolveStockfishApiBase();
  const wrap = document.createElement("div");
  wrap.setAttribute(INSTALL_FLAG, "panel");
  wrap.style.cssText = [
    "position:fixed",
    "left:8px",
    "bottom:8px",
    "z-index:99999",
    "font:12px/1.2 system-ui,sans-serif",
    "display:flex",
    "gap:6px",
    "align-items:center",
    "pointer-events:auto",
  ].join(";");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Dev: SF hiccup";
  btn.title =
    "Arm the next Stockfish bestmove/evaluate to fail once with a fake timeout (server restarts engine). Non-production server only. Localhost dev UI only.";
  btn.style.cssText = [
    "cursor:pointer",
    "padding:4px 8px",
    "border-radius:6px",
    "border:1px solid rgba(255,255,255,.25)",
    "background:rgba(40,40,40,.92)",
    "color:rgba(255,255,255,.9)",
  ].join(";");

  const status = document.createElement("span");
  status.style.cssText = "color:rgba(255,255,255,.55);max-width:140px";
  status.textContent = "";

  btn.addEventListener("click", () => {
    void (async () => {
      status.textContent = "…";
      try {
        const res = await fetch(`${base}/dev/hiccup`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; armed?: number } | null;
        if (!res.ok || !json?.ok) {
          status.textContent =
            res.status === 404
              ? "404: set LASCA_STOCKFISH_DEV_HICCUP=1 or NODE_ENV=development on server"
              : `HTTP ${res.status}`;
          return;
        }
        status.textContent = `Armed ×${json.armed ?? 1}`;
        window.setTimeout(() => {
          if (status.textContent.startsWith("Armed")) status.textContent = "";
        }, 4000);
      } catch {
        status.textContent = "Fetch failed";
      }
    })();
  });

  wrap.appendChild(btn);
  wrap.appendChild(status);
  document.body.appendChild(wrap);
}
