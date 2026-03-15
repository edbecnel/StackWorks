Drop your raster piece images here.

Option A (recommended): generate from a single sprite

1. Save the 8x2 sprite image (black row on top, white row below) as:
   public/pieces/raster3d/source.png
2. Run:
   npm run pieces:raster3d

This will generate the required files using:

- the taller pawn (2nd from the left)
- the taller queen (2nd from the right, next to the king)

Option B: provide individual files yourself

Required filenames:

- W_P.png B_P.png W_N.png B_N.png W_B.png B_B.png
- W_R.png B_R.png W_Q.png B_Q.png W_K.png B_K.png

Optional (used by non-chess variants; otherwise the theme falls back to vector discs):

- W_S.png B_S.png W_O.png B_O.png

Recommended:

- Square images (e.g. 256x256 or 512x512)
- Transparent background
