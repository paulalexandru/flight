import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../socket";

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
      setActivity((prev) => [
        ...prev,
        {
          key: `${payload.at}-${activityCounter.current}`,
          playerId: payload.playerId,
          type: payload.type,
          at: payload.at,
        },
      ]);
    };

    socket.on("room:state", handleRoomState);
    socket.on("room:activity", handleActivity);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:activity", handleActivity);
      socket.emit("room:leave", { gameId });
    };
  }, [gameId]);

  const opponentJoined = playerIds.length > 1;

  return (
    <div className="game-room">
      <section className="game-room__main">
        <h2>Sala de joc #{gameId}</h2>
        <p className="status-text">Id-ul tău de conexiune: {socket.id}</p>
        {opponentJoined ? (
          <span className="badge ready">Adversarul a intrat în sală!</span>
        ) : (
          <span className="badge waiting">Se așteaptă adversarul...</span>
        )}
      </section>

      <aside className="game-room__sidebar">
        <h3 className="game-room__sidebar-title">Jucători</h3>
        <ul className="activity-log">
          {activity.length === 0 && <li className="activity-log__empty">Niciun eveniment încă...</li>}
          {activity.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${entry.type === "joined" ? "joined" : "left"}${
                entry.playerId === socket.id ? " you" : ""
              }`}
            >
              <span className="activity-log__player">
                {entry.playerId} {entry.playerId === socket.id ? "(tu)" : ""}
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
