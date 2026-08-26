import { useNavigate } from "react-router-dom";

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="page page-home">
      <button className="play-now-button" onClick={() => navigate("/play/online")}>
        Play now
      </button>
    </div>
  );
}
