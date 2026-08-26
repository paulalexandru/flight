/**
 * Ține minte, pentru fiecare jucător (id stabil, nu socket.id), ultima sală de joc
 * în care a fost. Folosit pentru a-l readuce exact în sala din care a ieșit,
 * atât timp cât adversarul e încă acolo (fără a porni un matchmaking nou).
 */
const playerToGame = new Map<string, string>();

export function setPlayerGame(playerId: string, gameId: string): void {
  playerToGame.set(playerId, gameId);
}

export function getPlayerGame(playerId: string): string | undefined {
  return playerToGame.get(playerId);
}
