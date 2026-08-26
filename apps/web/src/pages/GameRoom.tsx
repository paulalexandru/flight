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
    <div className="page page-game-room">
      <p>Sala de joc #{gameId}</p>
      <p>Id-ul tău de conexiune: {socket.id}</p>
      <p>Jucători conectați: {playerIds.length}</p>
      <ul>
        {playerIds.map((id) => (
          <li key={id}>
            {id} {id === socket.id ? "(tu)" : ""}
          </li>
        ))}
      </ul>
      {opponentJoined ? (
        <p>Adversarul a intrat în sală!</p>
      ) : (
        <p>Se așteaptă ca adversarul să intre în sală...</p>
      )}
    </div>
  );
}
