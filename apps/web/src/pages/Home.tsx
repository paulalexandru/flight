import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket, playerId } from "../socket";
import { formatPlayerLabel } from "../utils/playerLabel";

type ActiveMatch = {
  gameId: string;
  playerIds: string[];
  currentTurnPlayerId: string | null;
  moveCount: number;
};

type LobbySnapshot = {
  activeMatches: ActiveMatch[];
  onlinePlayerIds: string[];
  busyPlayerIds: string[];
};

const REFRESH_INTERVAL_MS = 3000;
// Coloanele au înălțime fixă, suficientă pentru exact 10 înregistrări —
// peste acest număr, lista trece pe pagini în loc să crească coloana.
const PAGE_SIZE = 8;

/** Butoane de paginare (Înapoi/Înainte + "pagina X din Y"), afișate doar dacă sunt >10 rânduri. */
function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <div className="lobby-pager">
      <button
        type="button"
        className="lobby-pager__button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        ← Înapoi
      </button>
      <span className="lobby-pager__label">
        Pagina {page + 1} din {pageCount}
      </span>
      <button
        type="button"
        className="lobby-pager__button"
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        Înainte →
      </button>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<LobbySnapshot>({
    activeMatches: [],
    onlinePlayerIds: [],
    busyPlayerIds: [],
  });
  const [matchesPage, setMatchesPage] = useState(0);
  const [playersPage, setPlayersPage] = useState(0);
  // Provocare trimisă de mine, în așteptare de răspuns - identifică jucătorul
  // provocat, ca butonul lui să afișeze "În așteptare..." în loc de "Provoacă".
  // Mesajele de reușită/eșec ale provocării sunt afișate global, ca popup, în Layout.
  const [outgoingChallenge, setOutgoingChallenge] = useState<{ challengeId: string; targetPlayerId: string } | null>(
    null
  );

  useEffect(() => {
    const requestSnapshot = () => socket.emit("lobby:requestSnapshot");

    const handleSnapshot = (payload: LobbySnapshot) => setSnapshot(payload);
    const handleChallengeFailed = () => setOutgoingChallenge(null);
    const handleChallengeSent = ({ challengeId, targetPlayerId }: { challengeId: string; targetPlayerId: string }) => {
      setOutgoingChallenge({ challengeId, targetPlayerId });
    };
    const handleChallengeEnded = ({ challengeId }: { challengeId: string; reason: string }) => {
      setOutgoingChallenge((current) => (current?.challengeId === challengeId ? null : current));
    };
    const handleMatched = ({ gameId }: { gameId: string }) => navigate(`/game/${gameId}`);

    socket.on("lobby:snapshot", handleSnapshot);
    socket.on("matchmaking:challengeFailed", handleChallengeFailed);
    socket.on("matchmaking:challengeSent", handleChallengeSent);
    socket.on("matchmaking:challengeEnded", handleChallengeEnded);
    socket.on("matchmaking:matched", handleMatched);

    requestSnapshot();
    const interval = window.setInterval(requestSnapshot, REFRESH_INTERVAL_MS);

    return () => {
      socket.off("lobby:snapshot", handleSnapshot);
      socket.off("matchmaking:challengeFailed", handleChallengeFailed);
      socket.off("matchmaking:challengeSent", handleChallengeSent);
      socket.off("matchmaking:challengeEnded", handleChallengeEnded);
      socket.off("matchmaking:matched", handleMatched);
      window.clearInterval(interval);
    };
  }, [navigate]);

  const handleWatch = (gameId: string) => navigate(`/game/${gameId}`);
  const handleChallenge = (targetPlayerId: string) => {
    socket.emit("matchmaking:challenge", { targetPlayerId });
  };
  const handleCancelChallenge = () => {
    if (!outgoingChallenge) return;
    socket.emit("matchmaking:challengeCancel", { challengeId: outgoingChallenge.challengeId });
    setOutgoingChallenge(null);
  };

  const onlinePlayersSorted = [...snapshot.onlinePlayerIds].sort((a, b) => {
    if (a === playerId) return -1;
    if (b === playerId) return 1;
    return 0;
  });

  const matchesPageCount = Math.max(1, Math.ceil(snapshot.activeMatches.length / PAGE_SIZE));
  const playersPageCount = Math.max(1, Math.ceil(onlinePlayersSorted.length / PAGE_SIZE));
  // Dacă lista s-a micșorat între timp (ex: un meci s-a terminat) și pagina
  // curentă nu mai există, revenim automat la ultima pagină validă.
  const safeMatchesPage = Math.min(matchesPage, matchesPageCount - 1);
  const safePlayersPage = Math.min(playersPage, playersPageCount - 1);

  const visibleMatches = snapshot.activeMatches.slice(
    safeMatchesPage * PAGE_SIZE,
    safeMatchesPage * PAGE_SIZE + PAGE_SIZE
  );
  const visiblePlayers = onlinePlayersSorted.slice(
    safePlayersPage * PAGE_SIZE,
    safePlayersPage * PAGE_SIZE + PAGE_SIZE
  );

  return (
    <div className="game-room page-home">
      <section className="game-room__main">
        <div className="game-room__work-row">
          <div className="game-room__board-col game-room__board-col--list">
            <h3 className="game-room__sidebar-title">Meciuri în desfășurare</h3>
            {visibleMatches.length === 0 ? (
              <p className="status-text">Niciun meci în desfășurare momentan.</p>
            ) : (
              <ul className="lobby-list">
                {visibleMatches.map((match) => {
                  const [firstPlayerId, secondPlayerId] = match.playerIds;
                  return (
                    <li key={match.gameId} className="lobby-list__row">
                      <div className="lobby-list__info">
                        <span className="lobby-list__title">
                          {formatPlayerLabel(firstPlayerId)} vs {formatPlayerLabel(secondPlayerId)}
                        </span>
                        <span className="lobby-list__subtitle">Mutări: {match.moveCount}</span>
                      </div>
                      <button className="play-now-button lobby-list__action" onClick={() => handleWatch(match.gameId)}>
                        Vizionează
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pager page={safeMatchesPage} pageCount={matchesPageCount} onChange={setMatchesPage} />
          </div>

          <div className="game-room__extra-col game-room__extra-col--list">
            <h3 className="game-room__sidebar-title">Jucători online</h3>
            <ul className="lobby-list">
              {visiblePlayers.map((id, index) => {
                const isSelf = id === playerId;
                const isBusy = snapshot.busyPlayerIds.includes(id);
                const isChallenging = outgoingChallenge?.targetPlayerId === id;
                const number = safePlayersPage * PAGE_SIZE + index + 1;
                return (
                  <li key={id} className="lobby-list__row">
                    <span className="lobby-list__number">{number}</span>
                    <div className="lobby-list__info">
                      <span className="lobby-list__title">
                        {formatPlayerLabel(id)}
                        {isSelf && " (Tu)"}
                      </span>
                      <span className="lobby-list__subtitle">{isBusy ? "Într-o partidă" : "Liber"}</span>
                    </div>
                    {!isSelf && !isBusy && isChallenging && (
                      <button className="play-now-button lobby-list__action" onClick={handleCancelChallenge}>
                        Anulează
                      </button>
                    )}
                    {!isSelf && !isBusy && !isChallenging && (
                      <button
                        className="play-now-button lobby-list__action"
                        disabled={outgoingChallenge != null}
                        onClick={() => handleChallenge(id)}
                      >
                        Provoacă
                      </button>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: Math.max(0, PAGE_SIZE - visiblePlayers.length) }).map((_, index) => {
                const number = safePlayersPage * PAGE_SIZE + visiblePlayers.length + index + 1;
                return (
                  <li key={`empty-${index}`} className="lobby-list__row lobby-list__row--empty">
                    <span className="lobby-list__number">{number}</span>
                    <div className="lobby-list__info">
                      <span className="lobby-list__title lobby-list__title--empty">Loc liber</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pager page={safePlayersPage} pageCount={playersPageCount} onChange={setPlayersPage} />
          </div>
        </div>
      </section>

      <aside className="game-room__sidebar">
        <h3 className="game-room__sidebar-title">Acțiuni rapide</h3>
        <div className="lobby-actions">
          <button className="play-now-button" onClick={() => navigate("/play/online")}>
            Joacă online
          </button>
          <button className="play-now-button" onClick={() => navigate("/play/robot")}>
            Antrenează-te
          </button>
          <button className="play-now-button" onClick={() => navigate("/puzzle")}>
            Puzzle
          </button>
        </div>
      </aside>
    </div>
  );
}
