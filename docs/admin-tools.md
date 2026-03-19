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

### Production URL behavior: why `/admin` can open the Start Page

If `https://stackworks.games/admin` opens the Start Page instead of the admin UI, the usual cause is that the deployed static build does not contain `admin.html`.

That happens when the site was built with the normal production command:

```bash
npm run build
```

instead of the admin-aware build:

```bash
npm run build:admin
```

The repo already contains a clean-URL rule in [public/\_redirects](../public/_redirects):

- `/admin.html /admin 301`

So once `admin.html` is present in the deployed output, `/admin` should work again.

If `admin.html` is missing from the deploy, many static hosts fall back to the main entry page, which is why `/admin` appears to "default to the Start Page".

## Production fix for `https://stackworks.games/admin`

Use this checklist whenever the admin page stops working in production.

### 1) Build the client with the admin entry enabled

From the repo root, run:

```bash
npm run build:admin
```

Equivalent manual command:

```bash
npx cross-env VITE_EMIT_ADMIN=1 vite build
```

### 2) Verify the build output before deploying

Confirm these files exist in `dist/`:

- `dist/admin.html`
- `dist/admin-help.html`
- `dist/_redirects`

If `dist/admin.html` is missing, `https://stackworks.games/admin` will not work.

### 3) Deploy that build output

Deploy the contents of `dist/` produced by `npm run build:admin`.

Do not deploy a `dist/` folder produced by plain `npm run build` if you need the admin page in production.

### Cloudflare Pages setup

For Cloudflare Pages, the important settings are the build command and output directory.

Recommended Pages settings for `stackworks.games` if you want `/admin` available in production:

- Build command: `npm run build:admin`
- Build output directory: `dist`

Why this works:

- Cloudflare Pages will deploy the contents of `dist/`.
- Vite will include `admin.html` and `admin-help.html` only when `VITE_EMIT_ADMIN=1`, which `npm run build:admin` already sets.
- Cloudflare Pages supports `_redirects` files that are present in the final build output, so the existing redirect rule from [public/\_redirects](../public/_redirects) can map `/admin` to the built admin entry.

Cloudflare dashboard steps:

1. Open the Cloudflare dashboard.
2. Go to Workers & Pages.
3. Select the Pages project that serves `stackworks.games`: "stackworks"
4. Open **Settings**.
5. Select 'Production' from the 'Choose Environment' dropdown.
6. Select **Build configuration**.
7. Set the build command to `npm run build:admin`.
8. Set the build output directory to `dist`.
9. Select Save.
10. Trigger a new production deployment so the saved build settings are actually used.

Important: **Save does not rebuild the current production deployment by itself.** It updates the project configuration that the next deployment will use.

Use one of these deployment paths after saving:

#### Option A: push a new commit to the production branch

If Cloudflare Pages is connected to your git repo, the simplest path is:

1. Push a new commit to the production branch.
2. Cloudflare Pages will start a new production build automatically.
3. That new build will use `npm run build:admin` and output `dist`.

#### Option B: redeploy from the Cloudflare dashboard

If you want to apply the saved build settings immediately without making another git commit:

1. Open the same Pages project in Cloudflare.
2. Go to **Deployments**.
3. Find the most recent successful production deployment.
4. Click on the 'View details' link.
5. Choose the 'Retry deployment' for that deployment.

The exact label can vary slightly in the Cloudflare UI over time, but the goal is to start a new production build from the latest source revision after the build settings have been saved.

#### Option C: create a fresh manual deployment if your workflow uses direct uploads

If this Pages project is not deploying from git, start a new deployment using the newly built output after saving the settings.

Optional verification after the deploy finishes:

1. Open `https://stackworks.games/admin.html`
2. Open `https://stackworks.games/admin`
3. Confirm both routes open the Admin UI instead of the Start Page.

If `admin.html` works but `/admin` does not, confirm the deployed build still contains `_redirects` and that Cloudflare Pages is serving the static Pages output rather than a different routing layer.

### 4) Verify the production routes

After deploy, check both URLs:

- `https://stackworks.games/admin.html`
- `https://stackworks.games/admin`

Expected result: both should open the Admin UI.

If `admin.html` works but `/admin` does not, the deployed host is not honoring the `_redirects` file and the host-level redirect/rewrite config needs to be checked.

If both URLs open the Start Page, the deployed client build still does not include `admin.html`.

## Should Cloudflare always use `npm run build:admin`?

Short answer: use `npm run build:admin` by default for the Cloudflare Pages project that powers `stackworks.games` if you want the production admin route to keep working consistently.

Recommended policy:

- Use `npm run build:admin` for the production Cloudflare Pages build if `https://stackworks.games/admin` is an intentional operator workflow.
- Use plain `npm run build` only if you intentionally do **not** want the admin pages deployed.

Tradeoff:

- `npm run build:admin` makes the admin static entry available in the deployed bundle.
- It does **not** by itself grant admin access; destructive actions still require the server-side `LASCA_ADMIN_TOKEN`.
- So the main downside is not security of the API, but that the admin UI becomes present in the deployed client bundle.

Practical recommendation for this repo:

- For `stackworks.games` production on Cloudflare Pages: yes, make `npm run build:admin` the default build command if you expect to use `/admin` going forward.
- For local builds, GitHub Pages, or public-only builds where you do not want the admin entry present: keep using `npm run build`.

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

For production, use:

- `https://stackworks.games/admin`

If that falls back to the Start Page, see `Production fix for https://stackworks.games/admin` above.

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

Production symptom to remember:

- `/admin` opening the Start Page usually means the deployed static bundle was built without `VITE_EMIT_ADMIN=1`.

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
