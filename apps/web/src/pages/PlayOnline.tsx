import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";

export function PlayOnline() {
  const navigate = useNavigate();

  useEffect(() => {
    socket.emit("matchmaking:findMatch");

    const handleMatched = ({ gameId }: { gameId: string }) => {
      navigate(`/game/${gameId}`);
    };

    socket.on("matchmaking:matched", handleMatched);

    return () => {
      socket.off("matchmaking:matched", handleMatched);
    };
  }, [navigate]);

  return (
    <div className="page page-play-online">
      <p>Se așteaptă un adversar...</p>
    </div>
  );
}
