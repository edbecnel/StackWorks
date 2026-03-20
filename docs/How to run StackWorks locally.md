# Single commands to run StackWorks locally...

## Online server + client:

npm run online:dev

## Stockfish + client:

npm run bot:dev

## Online server + Stockfish + LAN client:

npm run online:dev:lan:bot

# Using the Admin page locally (requires `LASCA_ADMIN_TOKEN`)

The Admin page at `http://localhost:8080/admin.html` only works when the online backend was started with `LASCA_ADMIN_TOKEN` set.

Use the same token value in both places:

- Server environment variable: `LASCA_ADMIN_TOKEN`
- Admin page field: `Admin token`

## PowerShell: combined online + Stockfish + LAN client + Admin

Set the token before starting the stack:

```powershell
$env:LASCA_ADMIN_TOKEN = "change-me-please"
npm run online:dev:lan:bot
```

Then open:

- `http://localhost:8080/admin.html`

And enter:

- Server URL: `http://localhost:8788`
- Admin token: `change-me-please`

## PowerShell: separate commands + Admin

Start the online server with the token set:

```powershell
$env:LASCA_ADMIN_TOKEN = "change-me-please"
npm run online:server
```

Start the Stockfish server in another terminal:

```powershell
npm run stockfish:server
```

Start the client in another terminal:

```powershell
$env:VITE_SERVER_URL='http://localhost:8788'
$env:VITE_STOCKFISH_SERVER_URL='http://127.0.0.1:8799'
npm run dev
```

Then open:

- `http://localhost:8080/admin.html`

And enter:

- Server URL: `http://localhost:8788`
- Admin token: the same value as `LASCA_ADMIN_TOKEN`

## Important notes for local Admin access

- If the backend was started before `LASCA_ADMIN_TOKEN` was set, restart the backend after setting it.
- If the Admin page loads but delete actions fail with `404`, the server was started without `LASCA_ADMIN_TOKEN` in that process environment.
- Treat the admin token like a password and do not commit it.

# How to shut down the local servers

## Normal shutdown

If you started StackWorks in a terminal, press `Ctrl+C` in that terminal.

- For `npm run online:dev`, `npm run bot:dev`, or `npm run online:dev:lan:bot`: one `Ctrl+C` usually stops the whole combined stack.
- For separate terminals: press `Ctrl+C` once in each terminal running:
  - the online server
  - the Stockfish server
  - the Vite client

## If a process is still holding a port

If a terminal was closed without stopping the process first, you can stop the leftover listener by port.

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8080,8788,8799 -State Listen |
	Select-Object LocalPort, OwningProcess, State
```

Then stop the process IDs you want to remove:

```powershell
Stop-Process -Id <PID>
```

Typical local ports in this repo:

- `8080` = Vite client
- `8788` = online multiplayer server
- `8799` = Stockfish server

# Run each locally as separate commands...

## Online server:

npm run online:server

## Stockfish server:

npm run stockfish:server

## Client:

$env:VITE_SERVER_URL='http://localhost:8788'
$env:VITE_STOCKFISH_SERVER_URL='http://127.0.0.1:8799'
npm run dev

# Main advantages of running them separately:

## Better isolation:

if the client crashes or restarts, the online server and Stockfish server keep running.

## Easier debugging:

each terminal shows only one process, so logs are cleaner and failures are easier to identify.

## Independent restarts:

you can restart just the client, just the multiplayer server, or just Stockfish without disrupting the others.

## More realistic dev setup:

it matches production architecture more closely, where the frontend and backend services are distinct.

## Easier config changes:

you can change VITE_SERVER_URL, VITE_STOCKFISH_SERVER_URL, ports, or host binding without changing how the other processes are started.

## Better for network testing:

especially useful when testing LAN or phone access, because the client and each server may need different host/bind settings.

# When separate is usually better:

- You are actively debugging online play.
- You are debugging Stockfish connectivity.
- You want to inspect server logs while keeping the client hot-reloading.
- You want to restart only one part of the stack.

# When combined scripts are better:

- You just want a quick startup.
- You are doing routine UI work and do not care which process produced a log line.
- You want fewer terminals open.

# Practical tradeoff:

- Separate processes are better for control and debugging.
- Combined scripts are better for convenience.

# For this repo specifically, if you are working on online chess with Stockfish, separate terminals are the better setup.
