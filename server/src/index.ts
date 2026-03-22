import { startLascaServer } from "./app.ts";

/*
 * Legacy inline Express server (pre Step F persistence) lived in this file.
 * It has been superseded by the persistence-enabled implementation in server/src/app.ts.
 * The block below is intentionally kept commented to minimize churn.
 */

/*

app.post("/api/create", (req, res) => {
  try {
    const body = req.body as CreateRoomRequest;
    const variantId = body?.variantId as VariantId;
    if (!variantId) throw new Error("Missing variantId");
    const snapshot = body?.snapshot as WireSnapshot;
    if (!snapshot?.state || !snapshot?.history) throw new Error("Missing snapshot");

    const roomId: RoomId = randId();
    const playerId: PlayerId = randId();

    const state = deserializeWireGameState(snapshot.state);
    const history = new HistoryManager();
    const h = deserializeWireHistory(snapshot.history);
    history.replaceAll(h.states as any, h.notation, h.currentIndex);
    const current = history.getCurrent();
    const aligned = current ?? state;

    const room: Room = {
      roomId,
      state: aligned,
      history,
      players: new Map([[playerId, "W"]]),
      colorsTaken: new Set(["W"]),
      variantId,
    };
    rooms.set(roomId, room);

    const response: CreateRoomResponse = {
      roomId,
      playerId,
      color: "W",
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Create failed";
    const response: CreateRoomResponse = { error: msg };
    res.status(400).json(response);
  }
});

app.post("/api/join", (req, res) => {
  try {
    const body = req.body as JoinRoomRequest;
    const roomId = body?.roomId;
    if (!roomId) throw new Error("Missing roomId");

    const room = requireRoom(roomId);
    const color = nextColor(room);
    if (!color) throw new Error("Room full");

    const playerId: PlayerId = randId();
    room.players.set(playerId, color);
    room.colorsTaken.add(color);

    const response: JoinRoomResponse = {
      roomId,
      playerId,
      color,
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Join failed";
    const response: JoinRoomResponse = { error: msg };
    res.status(400).json(response);
  }
});

app.get("/api/room/:roomId", (req, res) => {
  try {
    const roomId = req.params.roomId as RoomId;
    const room = requireRoom(roomId);
    const response: GetRoomSnapshotResponse = {
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Snapshot failed";
    const response: GetRoomSnapshotResponse = { error: msg };
    res.status(400).json(response);
  }
});

app.post("/api/submitMove", (req, res) => {
  try {
    const body = req.body as SubmitMoveRequest;
    const room = requireRoom(body.roomId);
    const color = requirePlayer(room, body.playerId);

    if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

    const move = body.move as Move;
    if (!move || typeof (move as any).from !== "string" || typeof (move as any).to !== "string") {
      throw new Error("Invalid move");
    }

    const prevToMove = (room.state as any).toMove;
    const next = applyMove(room.state as any, move as any) as any;
    room.state = next;

    // Record history only at turn boundaries (quiet moves typically switch turns).
    if (next.toMove !== prevToMove) {
      room.history.push(room.state);
    }

    const response: SubmitMoveResponse = {
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
      didPromote: Boolean(next.didPromote) || undefined,
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Move failed";
    // eslint-disable-next-line no-console
    console.error("[lasca-server] submitMove error", msg);
    const response: SubmitMoveResponse = { error: msg };
    res.status(400).json(response);
  }
});

app.post("/api/finalizeCaptureChain", (req, res) => {
  try {
    const body = req.body as FinalizeCaptureChainRequest;
    const room = requireRoom(body.roomId);
    const color = requirePlayer(room, body.playerId);

    if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

    let next: any;
    if (body.rulesetId === "dama" || body.rulesetId === "draughts_international") {
      next = finalizeDamaCaptureChain(room.state as any, body.landing, new Set(body.jumpedSquares));
    } else {
      next = finalizeDamascaCaptureChain(room.state as any, body.landing);
    }

    room.state = next;
    // Turn does not switch here; client will call /api/endTurn when the capture turn ends.

    const response: FinalizeCaptureChainResponse = {
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
      didPromote: Boolean(next.didPromote) || undefined,
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Finalize failed";
    // eslint-disable-next-line no-console
    console.error("[lasca-server] finalizeCaptureChain error", msg);
    const response: FinalizeCaptureChainResponse = { error: msg };
    res.status(400).json(response);
  }
});

app.post("/api/endTurn", (req, res) => {
  try {
    const body = req.body as EndTurnRequest;
    const room = requireRoom(body.roomId);
    const color = requirePlayer(room, body.playerId);

    if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

    room.state = {
      ...(room.state as any),
      toMove: room.state.toMove === "B" ? "W" : "B",
      phase: "idle",
    };

    const notation = typeof (body as any).notation === "string" ? (body as any).notation : undefined;
    room.history.push(room.state as any, notation);

    const response: EndTurnResponse = {
      snapshot: {
        state: serializeWireGameState(room.state),
        history: serializeWireHistory(room.history.exportSnapshots()),
      },
    };
    res.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "End turn failed";
    // eslint-disable-next-line no-console
    console.error("[lasca-server] endTurn error", msg);
    const response: EndTurnResponse = { error: msg };
    res.status(400).json(response);
  }
});

*/

const port = Number(process.env.PORT ?? 8788);

startLascaServer({ port })
  .then(({ url, gamesDir }) => {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] listening on ${url}`);
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] persistence dir: ${gamesDir}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[lasca-server] failed to start", err);
    process.exitCode = 1;
  });
