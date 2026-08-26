import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket, playerId } from "../socket";
import { Board } from "../components/Board";

interface ActivityEntry {
  key: string;
  playerId: string;
  type: "joined" | "left";
  at: number;
}

export function GameRoom() {
  const { id: gameId } = useParams<{ id: string }>();
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityCounter = useRef(0);

  useEffect(() => {
    if (!gameId) return;

    setActivity([]);
    socket.emit("room:join", { gameId });

    const handleRoomState = (payload: { gameId: string; playerIds: string[] }) => {
      if (payload.gameId === gameId) {
        setPlayerIds(payload.playerIds);
      }
    };

    const handleActivity = (payload: {
      gameId: string;
      playerId: string;
      type: "joined" | "left";
      at: number;
    }) => {
      if (payload.gameId !== gameId) return;
      activityCounter.current += 1;
      const sequence = activityCounter.current;
      // Sortăm mereu cronologic (după `at`, apoi ordinea de sosire) astfel încât
      // mesajele să apară mereu unul sub altul, în ordine, chiar dacă vin foarte rapid.
      setActivity((prev) =>
        [
          ...prev,
          {
            key: `${payload.at}-${sequence}`,
            playerId: payload.playerId,
            type: payload.type,
            at: payload.at,
          },
        ].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
      );
    };

    // Dacă socket-ul se reconectează (ex: rețea instabilă) cât timp suntem încă
    // pe pagina sălii, retrimitem room:join ca să reintrăm automat în cameră.
    const handleReconnect = () => socket.emit("room:join", { gameId });

    socket.on("room:state", handleRoomState);
    socket.on("room:activity", handleActivity);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:activity", handleActivity);
      socket.io.off("reconnect", handleReconnect);
      socket.emit("room:leave", { gameId });
    };
  }, [gameId]);

  const opponentJoined = playerIds.length > 1;

  return (
    <div className="game-room">
      <section className="game-room__main">
        <h2>Sala de joc #{gameId}</h2>
        <p className="status-text">Id-ul tău: {playerId}</p>
        {opponentJoined ? (
          <span className="badge ready">Adversarul a intrat în sală!</span>
        ) : (
          <span className="badge waiting">Se așteaptă adversarul...</span>
        )}

        <div className="game-room__work-row">
          <div className="game-room__board-col">
            <Board />
          </div>
          <div className="game-room__extra-col" />
        </div>
      </section>

      <aside className="game-room__sidebar">
        <h3 className="game-room__sidebar-title">Jucători</h3>
        <ul className="activity-log">
          {activity.length === 0 && <li className="activity-log__empty">Niciun eveniment încă...</li>}
          {activity.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${entry.type === "joined" ? "joined" : "left"}${
                entry.playerId === playerId ? " you" : ""
              }`}
            >
              <span className="activity-log__player">
                {entry.playerId} {entry.playerId === playerId ? "(tu)" : ""}
              </span>
              <span className="activity-log__action">
                {entry.type === "joined" ? "a intrat în sală" : "a ieșit din sală"}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
