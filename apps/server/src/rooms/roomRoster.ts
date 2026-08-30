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

/**
 * Numărul de conexiuni socket active pentru fiecare playerId (id stabil, nu
 * socket.id) — un jucător cu mai multe tab-uri/dispozitive deschise numără o
 * singură dată în totalul de utilizatori online.
 */
const connectionsByPlayer = new Map<string, number>();

export function registerConnection(playerId: string): void {
  connectionsByPlayer.set(playerId, (connectionsByPlayer.get(playerId) ?? 0) + 1);
}

export function unregisterConnection(playerId: string): void {
  const count = connectionsByPlayer.get(playerId) ?? 0;
  if (count <= 1) {
    connectionsByPlayer.delete(playerId);
  } else {
    connectionsByPlayer.set(playerId, count - 1);
  }
}

export function getOnlineUsersCount(): number {
  return connectionsByPlayer.size;
}
