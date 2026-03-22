# International Draughts (10x10) Tasklist

## Variant setup

- [x] Add International Draughts as a new checkers-type variant in the game/variant selection flow.
- [x] Define the variant metadata, naming, and rules summary used by the UI.
- [x] Wire the variant into the non-chess game flow without enabling any chess-only behavior.
- [x] Enable International Draughts in the UI by flipping the variant to available after final validation.

## Board and presentation

- [x] Add the correct 10x10 board with 50 playable dark squares.
- [x] Start the 10x10 gameboard from the existing Classic board presentation.
- [x] Add dedicated 10x10 checkerboard families for classic, green, blue, and red/black presentation.
- [x] Support all non-chess game pieces on the 10x10 board.
- [x] Scale non-chess pieces down so they fit smaller 10x10 squares cleanly.
- [x] Adjust board coordinates so they line up correctly on the 10x10 board.
- [x] Prevent outside coordinates from crossing into the playable board area.
- [x] Prevent inside coordinates from crossing outside of the playable board area.
- [x] Verify the 10x10 board layout remains readable on desktop and mobile sizes used by StackWorks.

## Initial position and turn order

- [x] Add the correct starting setup: 20 black men on 1-20, 20 white men on 31-50, and 21-30 empty.
- [x] Ensure only dark squares are used for piece placement and movement.
- [x] Set White to move first.
- [x] Confirm board orientation matches the rule that the lower-left corner from each player's side is a dark square.

## Movement rules

- [x] Enforce man movement: one square diagonally forward on non-captures.
- [x] Enforce man captures in both forward and backward directions.
- [x] Enforce king movement as flying diagonal movement in both directions.
- [x] Enforce king capture from distance with landing on any empty square beyond the captured piece.
- [x] Prevent any piece from moving onto or through occupied squares except where a legal capture allows jumping an opponent.

## Capture rules

- [x] Enforce mandatory capture.
- [x] Enforce continued multi-capture when additional captures are available.
- [x] Enforce maximum-capture priority among all legal capture sequences.
- [x] Allow free choice when multiple capture sequences tie for the maximum number of captured pieces.
- [x] Prevent recapturing the same enemy piece during one capture sequence.
- [x] Allow reuse of the same empty square during one capture sequence.
- [x] Prevent jumping over a friendly piece.
- [x] Remove captured pieces only after the full capture sequence is finished.
- [x] Ensure king multi-capture generation supports changing diagonals after each landing.

## Promotion

- [x] Enforce promotion only when a man ends the move on the far promotion row.
- [x] Prevent mid-sequence promotion when a man only passes through the promotion row.
- [x] Ensure a man that reaches the promotion row during a forced capture sequence continues that move as a man when required by the rules.

## Win and draw rules

- [x] Enforce win by eliminating all opponent pieces.
- [x] Enforce win when the opponent has no legal move.
- [x] Enforce draw by threefold repetition.
- [x] Enforce draw after 25 successive moves by each player with only kings moving, no man move, and no capture.
- [x] Enforce the official 16-moves-each reduced-material draw cases.
- [x] Enforce the official 5-moves-each reduced-material draw cases.
- [x] Define how reduced-material draw counters are tracked, reset, and surfaced in game state.

## Validation and tests

- [x] Add rule tests for initial setup, legal moves, and illegal moves on the 10x10 board.
- [x] Add capture-sequence tests for men and flying kings, including maximum-capture selection.
- [x] Add promotion tests covering end-of-move promotion and blocked mid-sequence promotion.
- [x] Add win and draw tests for repetition, 25-move king-only sequences, and reduced-material cases.
- [x] Add rendering tests or smoke checks for 10x10 board coordinates and scaled piece fit.
- [ ] Verify all rule text and implemented behavior against the official FMJD International Draughts rules.

## Documentation

- [x] Add a dedicated International Draughts (10x10) help file.
- [x] Wire the International Draughts help file into the game UI and help navigation.
- [x] Add or update player-facing help text for International Draughts (10x10).
- [x] Document any implementation-specific assumptions where StackWorks behavior must map official rules into engine state.
