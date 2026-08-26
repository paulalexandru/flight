import { useNavigate } from "react-router-dom";

export function Home() {
  const navigate = useNavigate();

  return (
    <div className="work-panel page-home">
      <h1>Flight</h1>
      <p className="status-text">Provoacă un adversar la o partidă rapidă.</p>
      <button className="play-now-button" onClick={() => navigate("/play/online")}>
        Play now
      </button>
    </div>
  );
}
