# International Draughts (10x10) Implementation Spec

## Scope for Later Implementation

- Add a new checkers-type game: International Draughts.
- Use a 10x10 checkerboard.
- Start from the Classic board presentation for the 10x10 gameboard.
- Support all non-chess game pieces on the 10x10 board.
- Scale game pieces down so they fit the smaller 10x10 squares cleanly.
- Adjust board coordinates so they align correctly with the 10x10 board.
- Prevent outside coordinates from crossing into the playable board area.
- Prevent inside coordinates from crossing outside of the playable board area.

## Board and UI Requirements

- Add a new 10x10 checkerboard for International Draughts.
- Use the Classic board as the starting visual baseline for the 10x10 gameboard.
- Ensure the 10x10 board supports all non-chess game pieces used by StackWorks.
- Scale non-chess pieces down to fit the smaller square size on the 10x10 board without overlap or clipping.
- Adjust board coordinates so they remain aligned with the 10x10 grid.
- Prevent outside coordinate labels from crossing into the game board.
- Prevent inside coordinate labels from crossing outside of the game board.
- Preserve clear readability of both pieces and coordinate labels after the 10x10 layout adjustments.

## Rules Only

### Board and Setup

- The game is played on a 10x10 board.
- Only the 50 dark squares are used.
- Each player starts with 20 men.
- Black starts on squares 1-20.
- White starts on squares 31-50.
- Squares 21-30 start empty.
- The board is oriented so that the lower-left corner from each player's side is a dark square.
- White moves first.

### Piece Types

There are two piece types:

- Man
- King

### Movement Rules

#### Men

- A man moves one square diagonally forward to an empty square.
- A man may capture forward or backward.

#### Kings

- A king is a flying king.
- A king may move any number of empty squares diagonally, forward or backward.
- A king may capture an opposing piece from distance on a diagonal if there is at least one empty square beyond that piece.
- After jumping an enemy piece, a king may land on any empty square beyond it on the same diagonal.

### Capturing Rules

- Capturing is mandatory.
- If a player can capture, that player must capture.
- If after one capture another capture is available with the same piece, the capture sequence must continue as part of the same move.
- Captured pieces are removed only after the entire capture sequence is finished.
- During a capture sequence, a piece may pass through the same empty square more than once.
- During a capture sequence, the same enemy piece may not be captured more than once.
- A piece may not jump over its own side's piece.

### Capture Priority

- If more than one capture sequence is available, the player must choose a sequence that captures the greatest number of enemy pieces.
- If two or more legal capture sequences all capture the same maximum number of pieces, the player may choose any of them.
- There is no extra priority for choosing a king over a man, or for capturing kings instead of men, unless that changes the total number of pieces captured.

### Promotion

- A man becomes a king only if it ends its move on the far promotion row.
- If a man reaches the promotion row during a capture sequence but must continue capturing and ends elsewhere, it remains a man for that move.

### End of Game

A player wins if the opponent:

- has no pieces left, or
- has the move but no legal move.

### Draw Rules

The game is drawn if:

- the same position occurs for the third time with the same player to move, or
- for 25 successive moves by each player, there has been no capture and no man has moved, with only kings moving, or
- one of the official reduced-material draw limits is reached.

### Reduced-Material Draw Limits

The game is also drawn in these official endgame cases:

#### Draw after 16 moves by each player

- 3 kings vs 1 king
- 2 kings and 1 man vs 1 king
- 1 king and 2 men vs 1 king

#### Draw after 5 moves by each player

- 2 kings vs 1 king
- 1 king and 1 man vs 1 king
- 1 king vs 1 king

## StackWorks Implementation Assumptions

- StackWorks uses the shared repetition system already present in the engine/controller stack, so the implemented repetition draw is the same same-position, same-player-to-move rule used elsewhere in the app.
- The 25-move king-only rule is tracked as 50 plies at turn boundaries. Any capture, any man move, or any position that still contains a man resets that counter.
- Reduced-material timers begin when the qualifying material configuration first appears after a completed turn. The move that creates the configuration does not count toward the 16-move or 5-move limit.
- Reduced-material timers are tracked independently for White and Black completed turns so the official “moves by each player” phrasing maps cleanly onto engine state.
- International Draughts has no stacks as a gameplay rule. State accounting, win detection, and reduced-material counting therefore use the single controlled piece on each occupied square.
- Captured pieces remain on the board only as pending-removal markers during a capture sequence. They are excluded from re-capture immediately, then removed when the sequence is finalized.
- Quiet moves in the Dama-style engine path finalize draw counters immediately because they already switch `toMove`; capture turns finalize draw counters through the shared `endTurn()` boundary after sequence completion.
- Online and offline play share the same International Draughts move, promotion, capture-finalization, and draw-adjudication code paths.
