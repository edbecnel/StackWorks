# International Draughts (10x10) Tasklist

## Variant setup

- [ ] Add International Draughts as a new checkers-type variant in the game/variant selection flow.
- [ ] Define the variant metadata, naming, and rules summary used by the UI.
- [ ] Wire the variant into the non-chess game flow without enabling any chess-only behavior.

## Board and presentation

- [ ] Add the correct 10x10 board with 50 playable dark squares.
- [ ] Start the 10x10 gameboard from the existing Classic board presentation.
- [ ] Support all non-chess game pieces on the 10x10 board.
- [ ] Scale non-chess pieces down so they fit smaller 10x10 squares cleanly.
- [ ] Adjust board coordinates so they line up correctly on the 10x10 board.
- [ ] Prevent outside coordinates from crossing into the playable board area.
- [ ] Prevent inside coordinates from crossing outside of the playable board area.
- [ ] Verify the 10x10 board layout remains readable on desktop and mobile sizes used by StackWorks.

## Initial position and turn order

- [ ] Add the correct starting setup: 20 black men on 1-20, 20 white men on 31-50, and 21-30 empty.
- [ ] Ensure only dark squares are used for piece placement and movement.
- [ ] Set White to move first.
- [ ] Confirm board orientation matches the rule that the lower-left corner from each player's side is a dark square.

## Movement rules

- [ ] Enforce man movement: one square diagonally forward on non-captures.
- [ ] Enforce man captures in both forward and backward directions.
- [ ] Enforce king movement as flying diagonal movement in both directions.
- [ ] Enforce king capture from distance with landing on any empty square beyond the captured piece.
- [ ] Prevent any piece from moving onto or through occupied squares except where a legal capture allows jumping an opponent.

## Capture rules

- [ ] Enforce mandatory capture.
- [ ] Enforce continued multi-capture when additional captures are available.
- [ ] Enforce maximum-capture priority among all legal capture sequences.
- [ ] Allow free choice when multiple capture sequences tie for the maximum number of captured pieces.
- [ ] Prevent recapturing the same enemy piece during one capture sequence.
- [ ] Allow reuse of the same empty square during one capture sequence.
- [ ] Prevent jumping over a friendly piece.
- [ ] Remove captured pieces only after the full capture sequence is finished.
- [ ] Ensure king multi-capture generation supports changing diagonals after each landing.

## Promotion

- [ ] Enforce promotion only when a man ends the move on the far promotion row.
- [ ] Prevent mid-sequence promotion when a man only passes through the promotion row.
- [ ] Ensure a man that reaches the promotion row during a forced capture sequence continues that move as a man when required by the rules.

## Win and draw rules

- [ ] Enforce win by eliminating all opponent pieces.
- [ ] Enforce win when the opponent has no legal move.
- [ ] Enforce draw by threefold repetition.
- [ ] Enforce draw after 25 successive moves by each player with only kings moving, no man move, and no capture.
- [ ] Enforce the official 16-moves-each reduced-material draw cases.
- [ ] Enforce the official 5-moves-each reduced-material draw cases.
- [ ] Define how reduced-material draw counters are tracked, reset, and surfaced in game state.

## Validation and tests

- [ ] Add rule tests for initial setup, legal moves, and illegal moves on the 10x10 board.
- [ ] Add capture-sequence tests for men and flying kings, including maximum-capture selection.
- [ ] Add promotion tests covering end-of-move promotion and blocked mid-sequence promotion.
- [ ] Add win and draw tests for repetition, 25-move king-only sequences, and reduced-material cases.
- [ ] Add rendering tests or smoke checks for 10x10 board coordinates and scaled piece fit.
- [ ] Verify all rule text and implemented behavior against the official FMJD International Draughts rules.

## Documentation

- [ ] Add or update player-facing help text for International Draughts (10x10).
- [ ] Document any implementation-specific assumptions where StackWorks behavior must map official rules into engine state.
