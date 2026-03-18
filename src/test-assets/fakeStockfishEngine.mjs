import readline from "node:readline";

let currentFen = "";
let currentSkill = 0;

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (raw) => {
  const line = String(raw || "").trim();
  if (!line) return;

  if (line === "uci") {
    process.stdout.write("id name Fake Stockfish\n");
    process.stdout.write("uciok\n");
    return;
  }

  if (line === "isready") {
    process.stdout.write("readyok\n");
    return;
  }

  if (line.startsWith("setoption name Skill Level value ")) {
    currentSkill = Number(line.slice("setoption name Skill Level value ".length)) || 0;
    return;
  }

  if (line.startsWith("position fen ")) {
    currentFen = line.slice("position fen ".length);
    return;
  }

  if (line.startsWith("go movetime ")) {
    const cp = currentSkill * 10 + 13;
    if (currentFen.includes(" k7/")) {
      process.stdout.write("info depth 12 score mate 3\n");
    } else {
      process.stdout.write(`info depth 10 score cp ${cp}\n`);
    }
    process.stdout.write("bestmove e2e4\n");
  }
});