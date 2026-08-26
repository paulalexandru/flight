import { useTranslation } from "react-i18next";
import { Board } from "./components/Board";
import { useSocket } from "./hooks/useSocket";

const DEMO_GAME_ID = "demo-game";

export default function App() {
  const { t, i18n } = useTranslation();
  const { socket, gameState, error } = useSocket();

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>{t("app.title")}</h1>
        <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
          <option value="ro">Română</option>
          <option value="en">English</option>
        </select>
      </header>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={() => socket?.emit("game:join", { gameId: DEMO_GAME_ID })}>
        {t("lobby.findMatch")}
      </button>

      <p>Status: {gameState?.status ?? t("lobby.waitingForOpponent")}</p>

      <Board onCellClick={(cell) => socket?.emit("game:shoot", { gameId: DEMO_GAME_ID, cell })} />
    </div>
  );
}
