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
    <div className="work-panel page-play-online">
      <h2>Se caută adversar...</h2>
      <span className="badge waiting">În așteptare</span>
    </div>
  );
}
