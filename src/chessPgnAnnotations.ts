import type { EvalScore } from "./bot/uciEngine.ts";

export type PgnMoveAnnotation = {
  emtMs: number | null;
  evalScore: EvalScore | null;
};

type PgnToken = { type: "move" | "comment" | "num"; text: string };

function stripPgnHeaders(rawPgn: string): string {
  return String(rawPgn ?? "")
    .replace(/^\[.+\]\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMovetext(rawPgn: string): PgnToken[] {
  const movetext = stripPgnHeaders(rawPgn);
  const tokens: PgnToken[] = [];
  let rem = movetext;

  while (rem.length > 0) {
    rem = rem.trimStart();
    if (!rem) break;

    if (rem.startsWith("{")) {
      const end = rem.indexOf("}");
      if (end < 0) break;
      tokens.push({ type: "comment", text: rem.slice(1, end) });
      rem = rem.slice(end + 1);
      continue;
    }

    const nextBrace = rem.indexOf("{");
    const nextSpace = rem.search(/\s/);
    const end =
      nextBrace >= 0 && (nextSpace < 0 || nextBrace < nextSpace)
        ? nextBrace
        : nextSpace >= 0
          ? nextSpace
          : rem.length;
    const token = rem.slice(0, end).trim();
    rem = rem.slice(end);
    if (!token) continue;
    if (/^\d+\.+$/.test(token)) {
      tokens.push({ type: "num", text: token });
      continue;
    }
    if (token !== "*" && token !== "1-0" && token !== "0-1" && token !== "1/2-1/2") {
      tokens.push({ type: "move", text: token });
    }
  }

  return tokens;
}

export function formatEmtForPgn(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatEvalForPgn(score: EvalScore): string {
  if ("mate" in score) return `#${score.mate}`;

  const pawns = score.cp / 100;
  const fixed = pawns.toFixed(2);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.00$/, ".0");
  return trimmed === "-0.0" ? "0.0" : trimmed;
}

export function buildPgnMoveComment(args: { emtMs?: number | null; evalScore?: EvalScore | null }): string | null {
  const parts: string[] = [];
  if (typeof args.emtMs === "number" && Number.isFinite(args.emtMs)) {
    parts.push(`[%emt ${formatEmtForPgn(args.emtMs)}]`);
  }
  if (args.evalScore) {
    parts.push(`[%eval ${formatEvalForPgn(args.evalScore)}]`);
  }
  if (parts.length === 0) return null;
  return `{ ${parts.join(" ")} }`;
}

function extractEvalScore(comment: string): EvalScore | null {
  const match = comment.match(/\[%eval\s+([^\]]+)\]/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;

  const mate = /^(?:#|M)([+-]?\d+)$/i.exec(raw);
  if (mate) return { mate: parseInt(mate[1]!, 10) };

  const cp = Number(raw);
  if (!Number.isFinite(cp)) return null;
  return { cp: Math.round(cp * 100) };
}

function extractEmtMs(comment: string): number | null {
  const emt = comment.match(/\[%emt\s+(\d+):(\d+):(\d+)\]/i);
  if (!emt) return null;
  return (parseInt(emt[1]!, 10) * 3600 + parseInt(emt[2]!, 10) * 60 + parseInt(emt[3]!, 10)) * 1000;
}

function extractClkMs(comment: string): number | null {
  const clk = comment.match(/\[%clk\s+(\d+):(\d+):(\d+)\]/i);
  if (!clk) return null;
  return (parseInt(clk[1]!, 10) * 3600 + parseInt(clk[2]!, 10) * 60 + parseInt(clk[3]!, 10)) * 1000;
}

export function parsePgnMoveAnnotations(rawPgn: string): PgnMoveAnnotation[] {
  const tokens = tokenizeMovetext(rawPgn);
  const annotations: PgnMoveAnnotation[] = [];
  const prevClk: [number | null, number | null] = [null, null];

  let moveCount = 0;
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.type !== "move") continue;

    const comment = tokens[index + 1]?.type === "comment" ? tokens[index + 1]!.text : null;
    let emtMs = comment ? extractEmtMs(comment) : null;
    const evalScore = comment ? extractEvalScore(comment) : null;

    if (emtMs === null && comment) {
      const clkMs = extractClkMs(comment);
      if (clkMs !== null) {
        const sideIdx = moveCount % 2 as 0 | 1;
        const prev = prevClk[sideIdx];
        if (prev !== null && prev >= clkMs) emtMs = prev - clkMs;
        prevClk[sideIdx] = clkMs;
      }
    } else if (comment) {
      const clkMs = extractClkMs(comment);
      if (clkMs !== null) prevClk[moveCount % 2 as 0 | 1] = clkMs;
    }

    annotations.push({ emtMs, evalScore });
    moveCount += 1;
  }

  return annotations;
}