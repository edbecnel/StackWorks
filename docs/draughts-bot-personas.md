# Draughts-type bot personas (design notes)

This document captures how the four shared bot personas (**Balanced**, **Teacher**, **Trickster**, **Endgame**) should behave in **draughts-type games** (Lasca, Dama, Checkers US, International Draughts, Damasca, Columns Draughts, etc.), and records intent for future work.

For **start-game**, **mid-game**, and **end-game** comparison tables between the four personas, see [Persona-Comparisons.html](Persona-Comparisons.html) in this folder (open the HTML file locally in a browser).

## Implementation and product scope (planned)

- **Gameplay**: Wire persona selection into draughts-type bot engines / difficulty so each persona meaningfully changes style (not only avatar art). Today, persona art and shell identity are partly shared with chess; engine behavior for draughts personas is still to be implemented.
- **Coaching games**: Use these personas as the default opponent personality when the user is in a coached or guided session, aligned with lesson goals (e.g. Teacher for fundamentals, Trickster for tactics).
- **Lessons**: Reuse the same persona definitions in copy, lesson scripts, and coach UI so terminology stays consistent between play vs bot and structured lesson flows.

## Persona philosophy in draughts-type games

In draughts-type games, **Balanced** and **Teacher** bots emphasize **fundamental principles** (central control, piece mobility, readable structure) rather than the high-tension traps of a **Trickster** or the ruthless precision of an **Endgame** bot.

---

## Balanced bot: the solid center specialist

In draughts, a Balanced bot acts as a **neutral gatekeeper**. It avoids risky, speculative shots but also does not grind the player down with perfect endgame theory.

- **Central dominance**: Prioritizes golden squares (central squares): a piece in the center typically controls more than a piece on the edge, which often controls less.
- **Cohesive structure**: Builds pyramids or chains of pieces that protect each other from the back and sides (a neutral opponent that does not collapse easily but does not over-press).
- **Predictable trading**: Often accepts 1-for-1 trades to simplify the board and keep complexity manageable for a normal play session.

### Summary (Balanced)

| | |
| --- | --- |
| **Playstyle** | Solid center: strong, connected formation; controls the middle. |
| **Behavior** | Avoids risky sacrifices and complex trap-hunting; prefers 1-for-1 trades and a clean, manageable position. |
| **Goal** | Reliable sparring partner: steady resistance without overwhelming sharp tactics. |

---

## Teacher bot: the concept coach

The Teacher persona is designed to be **readable**, sometimes making **instructive errors** that highlight specific strategic mistakes.

- **Back row retention**: Emphasizes keeping its own back row intact as long as possible, illustrating how that delays or prevents early crowns.
- **Feedback and rewinds**: Like a play coach or Dr. Wolf-style chess coaching, may flag when the player missed a winning jump and offer an undo so they can find the tactic themselves.
- **Vulnerability alerts**: May intentionally move to the edge to show weaker control, or leave trapping pairs open to see if the player can execute the strategy.
- **Calm pressure**: Avoids double-exposure traps (losing multiple pieces at once) unless it is explicitly trying to show how they work.

### Summary (Teacher)

| | |
| --- | --- |
| **Playstyle** | Readable strategy; moves that demonstrate fundamentals (e.g. back row importance). |
| **Behavior** | Instructive errors or subtle mistakes the player can punish; avoids high-pressure shot sequences that end the game too quickly. |
| **Goal** | Build confidence and tactical vision; room to experiment and highlight basic positional wins. |

---

## Trickster bot in draughts

The Trickster is **especially relevant** in draughts because of the **mandatory capture** rule.

- **Forced tactical shots**: Focuses on shots or combinations where it deliberately sacrifices one or more pieces to force a capture sequence that ends in the opponent losing more pieces or a key position.
- **The bait**: Excels at leaving hanging pieces that look like mistakes but are traps (e.g. Slip Shot or Canalejas Cannonball style ideas, where rules allow).
- **Sharper decisions**: Forces the player to calculate the full chain of jumps before committing; a single natural-looking move can lose three or four pieces.

### Summary (Trickster)

| | |
| --- | --- |
| **Playstyle** | Sacrifices and shots; bait that triggers large counter-jumps under mandatory capture. |
| **Behavior** | High risk, high tension; thrives on combinations (blows) where the player loses many pieces in one turn if they do not calculate every chain. |
| **Goal** | Sharpen tactical vision: never take a free piece without checking consequences two or three moves ahead. |

---

## Endgame bot in draughts

The Endgame persona is essential because the final stage is often mathematically precise and involves high-level **opposition** (the move).

- **Technical conversion**: An extra king does not guarantee a win without specific maneuvers (e.g. First Position or Second Position style ideas) to trap the opponent pieces.
- **Patience and precision**: Plays for technical locks; teaches using the back row for defense and maneuvering kings to force a win or secure a draw when disadvantaged.
- **Opposition training**: Focuses on the move (draughts equivalent of zugzwang): leaving the opponent with no good legal moves.

### Summary (Endgame)

| | |
| --- | --- |
| **Playstyle** | Positional locks and kings; patient game aimed at thinning the board then squeezing with superior geometry. |
| **Behavior** | Prioritizes reaching the back row for kings and controlling the double diagonal; excels at the move (opposition) until the opponent is forced into a losing jump or runs out of moves. |
| **Goal** | Train technical conversion: trapping a lone king, holding a draw a piece down, precise king endings. |

---

## TypeScript minimax + persona evaluation (implementation sketch)

The best approach is a **TypeScript-based minimax engine with alpha–beta pruning**. WebAssembly is generally **overkill** for draughts in a training app: modern JavaScript engines can search deep enough that strong play in a **much smaller state space than chess** (English checkers is on the order of **~5×10^20** positions in the classical enumeration — still huge, but tractable for heuristic search) returns in **milliseconds** at typical UI depths.

To implement **personas**, you usually **do not change the core search algorithm**; you change the **evaluation function**, **root move selection**, or both (e.g. move buckets, stochastic Teacher).

### TypeScript implementation strategy

- **Core search:** Use a standard **minimax** with **alpha** and **beta** parameters to **prune** unnecessary branches and improve speed; add move ordering / iterative deepening as needed.
- **Persona integration:** Pass a **persona** object into **`evaluateBoard`** (and optionally into the **root** picker). That object holds **multipliers** (and flags) for board features: material, **center / golden squares**, king value, **trap or volatility** (Trickster), opposition (Endgame), etc.

### Code snippet: minimax with persona multipliers

Illustrative pseudocode — adapt `Board`, `Player`, and helpers to your variant rules.

```typescript
type Persona = {
  materialWeight: number; // weight for piece count
  centerWeight: number; // weight for controlling the "golden squares"
  riskFactor: number; // higher values prioritize sharper / more volatile positions (Trickster)
  instructiveErrorRate: number; // probability of picking a slightly worse root move (Teacher)
};

function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  persona: Persona
): number {
  if (depth === 0 || board.isGameOver()) {
    return evaluateBoard(board, persona);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of board.getLegalMoves()) {
      const evaluation = minimax(board.makeMove(move), depth - 1, alpha, beta, false, persona);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // alpha-beta pruning
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const move of board.getLegalMoves()) {
    const evaluation = minimax(board.makeMove(move), depth - 1, alpha, beta, true, persona);
    minEval = Math.min(minEval, evaluation);
    beta = Math.min(beta, evaluation);
    if (beta <= alpha) break;
  }
  return minEval;
}

/**
 * Heuristic evaluation modified by persona weights
 */
function evaluateBoard(board: Board, persona: Persona): number {
  const material = board.getPieceCount(Player.AI) - board.getPieceCount(Player.Human);
  const centerControl = board.getCenterControlScore(Player.AI);

  // Trickster: "trap potential" / volatility (e.g. mandatory-capture branching)
  const volatility = persona.riskFactor > 0 ? board.getCaptureChainPotential() : 0;

  return (
    material * persona.materialWeight +
    centerControl * persona.centerWeight +
    volatility * persona.riskFactor
  );
}
```

**Teacher:** apply `instructiveErrorRate` when **choosing among root moves** after search (e.g. pick the 3rd–4th best line when the best is too crushing), not only inside the static evaluator.
## Trickster bot: volatility and trap potential (implementation notes)

To implement a **Trickster** bot, you need to measure **volatility**. In draughts, volatility is the presence of **latent jumps** — positions where one move triggers a long chain of **forced captures**.

The Trickster does not only want the best static score; it wants a **high-variance** board where a **single human mistake** can produce a **massive swing**.

### The trap potential logic (volatility)

Below is one way to sketch a `getCaptureChainPotential` helper in TypeScript (adapt `Board`, `Player`, and jump types to your engine).

```typescript
function getCaptureChainPotential(board: Board, player: Player): number {
  let trapScore = 0;
  const opponent = player === Player.AI ? Player.Human : Player.AI;

  // 1. Count "hanging" pieces (bait): squares the human could jump on the next turn
  const baits = board.getAvailableJumps(opponent);

  for (const jump of baits) {
    // 2. Simulate the human taking the bait
    const phantomBoard = board.makeMove(jump);

    // 3. Look for the snap-back (the trap): AI multi-jump right after?
    const counterJumps = phantomBoard.getAvailableJumps(player);

    for (const counter of counterJumps) {
      if (counter.isMultiJump) {
        // High trap potential: sacrifice material to win a longer forced sequence
        trapScore += counter.piecesCaptured.length * 10;
      }
    }
  }

  return trapScore;
}
```

### Applying it to the evaluation function

Integrate volatility into evaluation so the Trickster can **prefer a line with lower material** when **trap score** is high enough.

```typescript
function evaluateForTrickster(board: Board, persona: Persona): number {
  const baseScore = evaluateStandardMaterial(board); // e.g. small material lead
  const trapPotential = getCaptureChainPotential(board, Player.AI); // e.g. large if baits exist

  // Trickster weights traps above raw material
  return baseScore + trapPotential * persona.riskFactor;
}
```

### Why this fits draughts

- **Forced captures:** Because jumping is often **mandatory**, the Trickster can set lines where the human is **forced into** the bait if they do not see the snap-back.
- **Psychology:** Produces the **tactical tempter** feel: the bot looks like it blundered, but it is angling for a **3-for-1** (or similar) exchange under the rules.

### Implementation tip: bait threshold

To stop the Trickster from playing like a **weak random bot**, only reward or select bait moves when the **full forced sequence** still leaves the side **net neutral or better** by your engine’s material / king / safety terms — i.e. require a **minimum verified swing** after simulating the whole capture chain, not only the first tempting jump.

---

## Endgame bot: "the move" (opposition) — implementation sketch

In draughts and checkers, **the move** (**opposition**) is the idea that **who must move** shapes control: the player who **need not** commit to a weakening advance is often better placed. For an **Endgame** bot, you can approximate this with a **mathematical parity check** on distances between pieces. Treat this as a **heuristic** — real opposition depends on **variant rules, square coloring, king movement, and piece count**; validate on your board model before relying on it in production.

### The formula for "the move" (teaching summary)

In a **simple** ending with **one piece per side**, some teaching summaries use the **ranks + files** between the two pieces:

1. Sum the number of **vertical ranks** and **horizontal files** between the two pieces.
2. If the sum is **odd**, **the player whose turn it is** is said to **have the move** (the advantage) in this simplified story.
3. If the sum is **even**, **the player whose turn it is** does **not** have the move (the disadvantage) in this simplified story.

### TypeScript sketch

Fold a version of this into the **evaluation function** (or a feature extractor) to **prioritize moves that secure opposition-like tempo** under your rules.

```typescript
/**
 * Calculates if the AI "has the move" (opposition) against a specific opponent piece.
 * Returns true if the AI has the tactical advantage under the odd/even distance rule above.
 */
function hasTheMove(aiPiece: Piece, humanPiece: Piece, isAiTurn: boolean): boolean {
  const rowDiff = Math.abs(aiPiece.row - humanPiece.row);
  const colDiff = Math.abs(aiPiece.col - humanPiece.col);

  // Parity check: total Manhattan distance between the pieces
  const totalDistance = rowDiff + colDiff;
  const isDistanceOdd = totalDistance % 2 !== 0;

  // If it's the AI's turn and distance is odd, the AI "has the move"
  return isAiTurn ? isDistanceOdd : !isDistanceOdd;
}
```

### How the Endgame bot uses this

- **Opposition scoring:** In thin endgames, add a **large bonus** when a candidate position leaves the AI **having the move** by this predicate (optionally re-check after a modeled opponent reply).
- **Blocking strategy:** Combine with king maneuver heuristics so play **steers** the human toward **corners**, **restricted diagonals**, or **mandatory jumps** that lose.
- **Simplification:** When the bot **has the move**, it may **seek 1-for-1 trades** more aggressively if your eval shows the **tempo edge grows** as material drops.

### Why this suits Teacher or Endgame personas

- **Teacher:** Detect when the human likely **lost the move** and offer a **hint or explanation** (e.g. why the position is now technically difficult).
- **Endgame:** Push **high precision** in **1-vs-1** or **2-vs-2** fragments; pair with **small tablebases** or deeper search where available so this parity sketch is not the only line of defense.

---

## System of squares ("System of Four") — collective opposition

In draughts and checkers, the **system of squares** (often called the **system of four**) is a standard way to reason about **the move** (**opposition**) when **several pieces** remain. It can help an **Endgame** bot estimate **who holds strategic tempo** without fully simulating every variation.

**Caveat:** Which files form system A / B, and counting **only dark squares**, depend on your **board representation and variant**. The TypeScript below uses **odd `column` indices** as a stand-in for one file system—**map this to your real coordinates** before trusting scores in production.

### Theory (two systems on the playable lattice)

On boards where pieces use only **half the squares** (classically the **dark** cells), teaching texts often split playable squares into two **independent systems** along files:

1. **System A:** Squares on **odd-numbered vertical files** (e.g. files **1, 3, 5, 7** in a 1-based 8×8 description).
2. **System B:** Squares on **even-numbered vertical files** (e.g. files **2, 4, 6, 8**).

You apply the **parity count within one system at a time** (the "System of Four" name refers to square groupings in classic endgame teaching).

### How to calculate "the move" (collective recipe)

Using **one chosen system** (here: odd files, aligned to your engine):

1. **Select the key files** — odd columns **1, 3, 5, 7** (or equivalent indices).
2. **Sum pieces on those squares** — count **all** pieces (both sides) on playable squares in that file set **within the active color complex** if your rules require it.
3. **Parity check for the player to move:**
   - If the total is **even**, **the player to move** does **not** have the move (disadvantage in this model).
   - If the total is **odd**, **the player to move** **has** the move (advantage in this model).

### TypeScript sketch (multiple pieces)

Use as a **positional bonus** in endgame evaluation. **Filter** `getAllPieces()` to **in-system, legal squares** only when you wire this for real.

```typescript
/**
 * Collective "move" (opposition) hint from parity on key files (odd columns here).
 * Returns +1 if the model awards the move to the side to move, -1 otherwise.
 */
function calculateCollectiveMove(board: Board, currentPlayer: Player): number {
  let pieceCountOnKeySquares = 0;

  for (const piece of board.getAllPieces()) {
    // Example: odd vertical file — must match YOUR indexing and dark-square rules
    if (piece.column % 2 !== 0) {
      pieceCountOnKeySquares++;
    }
  }

  const sideToMoveHasTheMove = pieceCountOnKeySquares % 2 !== 0;

  // If evaluating for AI but `currentPlayer` is not always side-to-move, adjust sign here.
  return sideToMoveHasTheMove ? 1 : -1;
}

/** Example: fold into endgame evaluation */
function evaluateEndgame(board: Board, persona: Persona): number {
  const material = board.getPieceCount(Player.AI) - board.getPieceCount(Player.Human);
  const oppositionBonus = calculateCollectiveMove(board, Player.AI) * 50; // tune by phase / variant

  return material * persona.materialWeight + oppositionBonus;
}
```

### Why this fits your personas

- **Endgame bot:** Bias toward **simplification** when the model says it **has the move**—still **confirm** with search or **tablebase** before claiming a forced win.
- **Teacher bot:** Detect when the learner **loses the move** in a simplified ending and explain that their setup is **out of sync** with the opponent on this **system** (best with a board diagram in the lesson).

---

## Cross-reference

- [Persona-Comparisons.html](Persona-Comparisons.html) — opening, middlegame, and endgame persona comparison tables.
- Shared persona IDs and chess-specific tuning: see `src/bot/chessBotPersonaGameplay.ts`, Play Hub bot state.
- Draughts-style avatar paths: `src/shared/draughtsBotPersonaAvatars.ts` and `public/icons/bots/`.

When engine and coaching behavior land, update this doc with concrete module links and variant-specific caveats (Lasca vs 10x10 international rules, etc.).

