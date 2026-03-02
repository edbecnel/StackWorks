export interface ThemeDef {
  id: string;
  label: string;
  piecesDefs: URL;
  boardDefs: URL;
  css: URL;
  /** Hidden from general theme pickers (used for variant-specific themes). */
  hidden?: boolean;
}

export const DEFAULT_THEME_ID = "classic" as const;

export const THEMES: ThemeDef[] = [
  {
    id: "classic",
    label: "Classic",
    piecesDefs: new URL("../assets/themes/classic/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
  },
  {
    id: "checkers",
    label: "Checkers (Red/Black)",
    piecesDefs: new URL("../assets/themes/checkers/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
  },
  {
    id: "neo",
    label: "Neo",
    piecesDefs: new URL("../assets/themes/neo/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
    // Variant-specific theme; SVG-only so it can be deployed safely.
    hidden: true,
  },
  {
    id: "raster2d",
    label: "2D",
    piecesDefs: new URL("../assets/themes/raster2d/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
    hidden: true,
  },
  {
    id: "columns_classic",
    label: "Classic",
    hidden: true,
    // Columns Chess-only: chess glyphs printed on stackable discs.
    piecesDefs: new URL("../assets/themes/columns_classic/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
  },
  {
    id: "raster3d",
    label: "Raster 3D (Custom)",
    piecesDefs: new URL("../assets/themes/raster3d/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
    hidden: true,
  },
  {
    id: "wooden",
    label: "Wooden",
    piecesDefs: new URL("../assets/themes/wooden/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/wooden/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/wooden/theme.css", import.meta.url),
  },
  {
    id: "metal",
    label: "Copper & Steel",
    piecesDefs: new URL("../assets/themes/metal/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/metal/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/metal/theme.css", import.meta.url),
  },
  {
    id: "stone",
    label: "Granite & Marble",
    piecesDefs: new URL("../assets/themes/stone/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/stone/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/stone/theme.css", import.meta.url),
  },
  {
    id: "semiprecious",
    label: "Semi-Precious Stones",
    piecesDefs: new URL("../assets/themes/semiprecious/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/semiprecious/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/semiprecious/theme.css", import.meta.url),
  },
  {
    id: "glass",
    label: "Glass",
    piecesDefs: new URL("../assets/themes/glass/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/glass/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/glass/theme.css", import.meta.url),
  },
  {
    id: "turtle",
    label: "Turtle",
    piecesDefs: new URL("../assets/themes/turtle/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/turtle/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/turtle/theme.css", import.meta.url),
  },
  {
    id: "porcelain",
    label: "Porcelain",
    piecesDefs: new URL("../assets/themes/porcelain/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/porcelain/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/porcelain/theme.css", import.meta.url),
  },
  {
    id: "luminous",
    label: "Luminous",
    piecesDefs: new URL("../assets/themes/luminous/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/luminous/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/luminous/theme.css", import.meta.url),
  },
];

export function getThemeById(id: string): ThemeDef | null {
  return THEMES.find((t) => t.id === id) ?? null;
}
