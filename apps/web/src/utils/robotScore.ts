import type { RobotDifficulty } from "./robotAI";

export type RobotScoreEntry = { wins: number; losses: number };
export type RobotScore = Record<RobotDifficulty, RobotScoreEntry>;

// Scorul contra robotului există doar cât timp jucătorul rămâne în sală (ține și
// la apăsarea "Joacă din nou"/schimbarea dificultății), dar se resetează complet
// quando iese din pagină - de aceea NU se mai persistă în localStorage, ci se ține
// doar în starea componentei (vezi PlayRobot.tsx), pornind mereu de la zero.
export function emptyRobotScore(): RobotScore {
  return {
    easy: { wins: 0, losses: 0 },
    medium: { wins: 0, losses: 0 },
    advanced: { wins: 0, losses: 0 },
    expert: { wins: 0, losses: 0 },
    cheating: { wins: 0, losses: 0 },
  };
}

export function recordRobotResult(
  current: RobotScore,
  difficulty: RobotDifficulty,
  outcome: "win" | "loss"
): RobotScore {
  const entry = current[difficulty];
  return {
    ...current,
    [difficulty]: {
      wins: entry.wins + (outcome === "win" ? 1 : 0),
      losses: entry.losses + (outcome === "loss" ? 1 : 0),
    },
  };
}

export function sumRobotScore(score: RobotScore): RobotScoreEntry {
  return Object.values(score).reduce(
    (acc, entry) => ({ wins: acc.wins + entry.wins, losses: acc.losses + entry.losses }),
    { wins: 0, losses: 0 }
  );
}

