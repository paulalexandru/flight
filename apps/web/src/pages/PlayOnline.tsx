import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";

export function PlayOnline() {
  const navigate = useNavigate();

  useEffect(() => {
    let matched = false;
    socket.emit("matchmaking:findMatch");

    const handleMatched = ({ gameId }: { gameId: string }) => {
      matched = true;
      navigate(`/game/${gameId}`);
    };

    socket.on("matchmaking:matched", handleMatched);

    return () => {
      socket.off("matchmaking:matched", handleMatched);
      // Anulăm căutarea dacă nu a fost găsit un adversar (ex: utilizatorul
      // navighează în altă parte, sau remontarea dublă din React StrictMode).
      if (!matched) {
        socket.emit("matchmaking:cancel");
      }
    };
  }, [navigate]);

  return (
    <div className="work-panel page-play-online">
      <h2>Se caută adversar...</h2>
      <span className="badge waiting">În așteptare</span>
    </div>
  );
}
