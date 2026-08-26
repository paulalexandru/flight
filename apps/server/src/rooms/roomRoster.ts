/**
 * Registru al jucătorilor (id stabil, nu socket.id) prezenți în fiecare sală.
 * Necesar pentru ca un jucător reconectat (socket.id nou) să fie recunoscut
 * ca fiind "tot el" în lista de jucători afișată.
 */
const gameRosters = new Map<string, Set<string>>();

export function addPlayerToRoom(gameId: string, playerId: string): void {
  const roster = gameRosters.get(gameId) ?? new Set<string>();
  roster.add(playerId);
  gameRosters.set(gameId, roster);
}

export function removePlayerFromRoom(gameId: string, playerId: string): void {
  const roster = gameRosters.get(gameId);
  if (!roster) return;
  roster.delete(playerId);
  if (roster.size === 0) {
    gameRosters.delete(gameId);
  }
}

export function getRoomRoster(gameId: string): string[] {
  return Array.from(gameRosters.get(gameId) ?? []);
}

export function isPlayerInRoom(gameId: string, playerId: string): boolean {
  return gameRosters.get(gameId)?.has(playerId) ?? false;
}
