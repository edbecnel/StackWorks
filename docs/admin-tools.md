# Admin tools (private / operator-only)

This document is intended for server operators and developers.

- Do not link to this doc from public pages.
- Do not share the admin URL/token with players.

## What exists today

### Admin UI page

There is a lightweight admin UI page:

- Source: `src/admin.html` + `src/adminMain.ts`
- Purpose: list lobby rooms and delete a room using the admin API

There is also an admin help page:

- Source: `src/admin-help.html`

Important: the Admin UI is **not** linked from the Start Page.

Also important: the production build does **not** emit `admin.html` into `dist/` by default.

To include it in a deployable build (for self-hosted online management), build with:

```bash
npm run build:admin
```

Equivalent (manual):

```bash
npx cross-env VITE_EMIT_ADMIN=1 vite build
```

### Admin API

Room deletion endpoint:

- Method: `DELETE`
- Path: `/api/admin/room/:roomId`
- Auth: header `x-lasca-admin-token: <token>`

Behavior:

- If `LASCA_ADMIN_TOKEN` is not configured on the server, the endpoint is hidden and returns `404`.
- If the token is wrong/missing, returns `403`.
- On success it:
  - tombstones the room in memory (prevents reload and future persistence),
  - evicts the room immediately (drops it from the server’s `rooms` map, cancels grace timers, closes transports),
  - deletes the room folder on disk.

## Setup: configuring `LASCA_ADMIN_TOKEN`

`LASCA_ADMIN_TOKEN` is an environment variable read by the Node process running the Lasca server.

Choose a long random value. Example guidance:

- Length: 32+ characters
- Use a password manager / random generator
- Do not commit it to git

### Windows PowerShell (recommended for local dev)

Set it for the current PowerShell session (immediate effect):

```powershell
$env:LASCA_ADMIN_TOKEN = "change-me-please"
npm run online:dev
```

Or server only:

```powershell
$env:LASCA_ADMIN_TOKEN = "change-me-please"
npm run online:server
```

### Windows cmd.exe

Set it for the current cmd session:

```bat
set LASCA_ADMIN_TOKEN=change-me-please
npm run online:dev
```

### Cross-platform one-liner (uses `cross-env`)

```powershell
npx cross-env LASCA_ADMIN_TOKEN=change-me-please npm run online:server
```

### Persistent user environment variable (Windows)

This persists the variable for future shells:

```bat
setx LASCA_ADMIN_TOKEN "change-me-please"
```

Then **close/reopen** terminals and start the server normally:

```bat
npm run online:dev
```

## Using the Admin UI

### 1) Start the server with the token

Run the online server with `LASCA_ADMIN_TOKEN` set (see above).

Default dev server URL is usually:

- `http://localhost:8788`

### 2) Start the client

`npm run online:dev` starts both server + client.

Default dev client URL is usually:

- `http://localhost:8080/`

### 3) Open the Admin page (direct URL)

Open:

- `http://localhost:8080/admin.html`

(If Vite chose a different port, use that port.)

### 4) Fill in the form

- **Server URL**: `http://localhost:8788`
- **Admin token**: the same string as `LASCA_ADMIN_TOKEN`

Then:

- Click **Refresh lobby**
- Click **Delete** on a room row (or paste a Room ID and click **Delete room**)

## Using the Admin API directly (curl)

```bash
curl -X DELETE "http://localhost:8788/api/admin/room/<ROOM_ID>" \
  -H "x-lasca-admin-token: change-me-please"
```

## Operational notes / safety

- Treat the admin token like a password.
- Do not set `LASCA_ADMIN_TOKEN` in environments where untrusted users can make requests to your server.
- Consider binding the server to localhost only (or firewall it) if admin actions are enabled.
- Rotate the token if you suspect it leaked.

## Troubleshooting

### Server fails to start: `EADDRINUSE` (port 8788 already in use)

If you see an error like:

- `listen EADDRINUSE: address already in use :::8788`

…then some other process is already listening on port `8788` (often an older Lasca server that’s still running).

Fix option A: find and stop the process using the port.

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8788 | Select-Object -Property LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <PID> -Force
```

cmd.exe:

```bat
netstat -ano | findstr ":8788"
taskkill /PID <PID> /F
```

Fix option B: run Lasca server on a different port.

```powershell
npx cross-env PORT=8790 npm run online:server
```

If you also run the client, point it at the new server URL:

```powershell
npx cross-env PORT=8790 VITE_SERVER_URL=http://localhost:8790 npm run online:dev
```

### Endpoint returns 404

This usually means the server process does **not** have `LASCA_ADMIN_TOKEN` set.

Confirm from the same shell used to start the server:

- PowerShell: `Get-ChildItem Env:LASCA_ADMIN_TOKEN`
- cmd.exe: `echo %LASCA_ADMIN_TOKEN%`

### Endpoint returns 403

Token mismatch.

- Ensure the header name is exactly `x-lasca-admin-token`.
- Ensure the Admin page token matches the server’s `LASCA_ADMIN_TOKEN` exactly.

### Admin page not found

The Admin page only exists when serving from the Vite dev server (rooted at `src/`).

If you are serving `dist/` (static hosting), `admin.html` is only present when the build was produced with:

```bash
npm run build:admin
```

## Deploy notes: Vite `base` (GitHub Pages vs custom domains)

This repo historically targets GitHub Pages (repo site) which requires a repo-scoped base path.

The Vite config defaults to:

- Production base: `/StackWorks/` (good for GitHub Pages)
- Dev base: `/`

To support future deployments (e.g. Cloudflare Pages + a real domain like `https://stackworks.com/`), production base can be overridden at build time with `VITE_BASE`.

Examples:

### GitHub Pages (current default)

No changes needed — do not set `VITE_BASE`:

```bash
npm run build
```

### Custom domain at the site root

Use `/`:

```bash
npx cross-env VITE_BASE=/ vite build
```

Or if you also want the admin page in the build:

```bash
npx cross-env VITE_BASE=/ VITE_EMIT_ADMIN=1 vite build
```

### Hosting under a subpath

If your static host serves the site at a subpath like `https://example.com/stackworks/`, set:

```bash
npx cross-env VITE_BASE=/stackworks/ vite build
```
