import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../socket";

export function GameRoom() {
  const { id: gameId } = useParams<{ id: string }>();
  const [playerIds, setPlayerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!gameId) return;

    socket.emit("room:join", { gameId });

    const handleRoomState = (payload: { gameId: string; playerIds: string[] }) => {
      if (payload.gameId === gameId) {
        setPlayerIds(payload.playerIds);
      }
    };

    socket.on("room:state", handleRoomState);

    return () => {
      socket.off("room:state", handleRoomState);
    };
  }, [gameId]);

  const opponentJoined = playerIds.length > 1;

  return (
    <div className="work-panel page-game-room">
      <h2>Sala de joc #{gameId}</h2>
      <p className="status-text">Id-ul tău de conexiune: {socket.id}</p>
      <ul className="player-list">
        {playerIds.map((id) => (
          <li key={id} className={id === socket.id ? "you" : ""}>
            {id} {id === socket.id ? "(tu)" : ""}
          </li>
        ))}
      </ul>
      {opponentJoined ? (
        <span className="badge ready">Adversarul a intrat în sală!</span>
      ) : (
        <span className="badge waiting">Se așteaptă adversarul...</span>
      )}
    </div>
  );
}
