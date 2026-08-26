/**
 * Ține minte, pentru fiecare socket, ultima sală de joc în care a fost.
 * Folosit pentru a readuce un jucător exact în sala din care a ieșit,
 * atât timp cât adversarul e încă acolo (fără a porni un matchmaking nou).
 */
const playerToGame = new Map<string, string>();

export function setPlayerGame(socketId: string, gameId: string): void {
  playerToGame.set(socketId, gameId);
}

export function getPlayerGame(socketId: string): string | undefined {
  return playerToGame.get(socketId);
}

export function clearPlayerGame(socketId: string): void {
  playerToGame.delete(socketId);
}
