# Single commands to run StackWorks locally...

## Online server + client:
npm run online:dev

## Stockfish + client:
npm run bot:dev

## Online server + Stockfish + LAN client:
npm run online:dev:lan:bot

# Run each locally as separate commands...

## Online server:
npm run online:server

## Stockfish server:
npm run stockfish:server

##Client:
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
