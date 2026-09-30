import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { formatPlayerLabel } from "../utils/playerLabel";

const NAV_ITEMS = [
  { to: "/", label: "Acasă", icon: "🏠" },
  { to: "/play/online", label: "Joacă online", icon: "🌐" },
  { to: "/play/robot", label: "Antrenează-te", icon: "🤖" },
  { to: "/puzzle", label: "Puzzle", icon: "🧩" },
  { to: "/rules", label: "Regulament", icon: "📖" },
];

type IncomingChallenge = { challengeId: string; fromPlayerId: string; deadline: number };
type OutgoingChallengeNotice = { title: string; text: string };

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  // Provocare primită de la alt jucător, în așteptare de răspuns (accept/refuz).
  // Afișată ca dialog global, ca să funcționeze indiferent pe ce pagină e utilizatorul.
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  // Id-ul provocării trimise chiar de acest utilizator (dacă există) - necesar
  // ca să știm cui îi arătăm popup-ul când provocarea se încheie fără acceptare
  // (refuzată, anulată de celălalt sau expirată).
  const outgoingChallengeIdRef = useRef<string | null>(null);
  // Mesaj afișat tot ca popup celui care a trimis provocarea, când aceasta se
  // încheie fără să fi fost acceptată (la fel ca dialogul de provocare primită).
  const [outgoingChallengeNotice, setOutgoingChallengeNotice] = useState<OutgoingChallengeNotice | null>(null);

  useEffect(() => {
    const handleOnlineCount = ({ count }: { count: number }) => setOnlineCount(count);
    socket.on("presence:onlineCount", handleOnlineCount);
    return () => {
      socket.off("presence:onlineCount", handleOnlineCount);
    };
  }, []);

  useEffect(() => {
    const handleReceived = (payload: IncomingChallenge) => setIncomingChallenge(payload);
    const handleSent = ({ challengeId }: { challengeId: string; targetPlayerId: string; deadline: number }) => {
      outgoingChallengeIdRef.current = challengeId;
    };
    const handleEnded = ({ challengeId, reason }: { challengeId: string; reason: string }) => {
      setIncomingChallenge((current) => (current?.challengeId === challengeId ? null : current));
      if (outgoingChallengeIdRef.current === challengeId) {
        outgoingChallengeIdRef.current = null;
        if (reason === "declined") {
          setOutgoingChallengeNotice({ title: "Provocare refuzată", text: "Jucătorul a refuzat provocarea ta." });
        } else if (reason === "expired") {
          setOutgoingChallengeNotice({ title: "Provocare expirată", text: "Provocarea a expirat fără răspuns." });
        } else if (reason === "cancelled") {
          setOutgoingChallengeNotice({ title: "Provocare anulată", text: "Jucătorul nu mai este disponibil pentru provocare." });
        }
      }
    };
    const handleFailed = ({ reason }: { targetPlayerId: string; reason: string }) => {
      outgoingChallengeIdRef.current = null;
      const text =
        reason === "busy"
          ? "Jucătorul tocmai a intrat într-o altă partidă."
          : reason === "you-are-busy"
            ? "Ești deja într-o partidă activă."
            : "Jucătorul nu mai este disponibil.";
      setOutgoingChallengeNotice({ title: "Provocare eșuată", text });
    };
    const handleMatched = ({ gameId }: { gameId: string }) => {
      outgoingChallengeIdRef.current = null;
      setIncomingChallenge(null);
      setOutgoingChallengeNotice(null);
      navigate(`/game/${gameId}`);
    };

    socket.on("matchmaking:challengeReceived", handleReceived);
    socket.on("matchmaking:challengeSent", handleSent);
    socket.on("matchmaking:challengeEnded", handleEnded);
    socket.on("matchmaking:challengeFailed", handleFailed);
    socket.on("matchmaking:matched", handleMatched);
    return () => {
      socket.off("matchmaking:challengeReceived", handleReceived);
      socket.off("matchmaking:challengeSent", handleSent);
      socket.off("matchmaking:challengeEnded", handleEnded);
      socket.off("matchmaking:challengeFailed", handleFailed);
      socket.off("matchmaking:matched", handleMatched);
    };
  }, [navigate]);

  // Numărătoare inversă locală pentru afișarea secundelor rămase în dialog.
  useEffect(() => {
    if (!incomingChallenge) return;
    const update = () => setRemainingMs(Math.max(0, incomingChallenge.deadline - Date.now()));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [incomingChallenge]);

  const respondToChallenge = (accept: boolean) => {
    if (!incomingChallenge) return;
    socket.emit("matchmaking:challengeRespond", { challengeId: incomingChallenge.challengeId, accept });
    setIncomingChallenge(null);
  };

  // Dacă jucătorul are o provocare trimisă în așteptare și navighează spre căutarea
  // unui meci online (matchmaking anonim) sau spre jocul cu robotul, provocarea nu
  // mai are sens - o anulăm automat.
  useEffect(() => {
    if (
      outgoingChallengeIdRef.current &&
      (location.pathname === "/play/online" || location.pathname === "/play/robot")
    ) {
      socket.emit("matchmaking:challengeCancel", { challengeId: outgoingChallengeIdRef.current });
      outgoingChallengeIdRef.current = null;
    }
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link to="/" className="app-sidebar__logo">
          <span className="app-sidebar__logo-icon" aria-hidden="true">
            ✈️
          </span>
          <span className="app-sidebar__logo-text">Flight</span>
        </Link>
        <nav className="app-sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`app-sidebar__link${location.pathname === item.to ? " active" : ""}`}
              title={item.label}
            >
              <span className="app-sidebar__link-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="app-sidebar__link-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        {/* Numărul de utilizatori conectați acum pe site, actualizat live. */}
        <div className="app-sidebar__online-count">
          <span className="app-sidebar__online-dot" aria-hidden="true" />
          <span className="app-sidebar__online-text">{onlineCount ?? "–"} online</span>
        </div>
      </aside>
      <main className="app-content">{children}</main>

      {incomingChallenge && (
        <div className="challenge-dialog-overlay">
          <div className="challenge-dialog">
            <h3 className="challenge-dialog__title">Provocare primită</h3>
            <p className="challenge-dialog__text">
              <strong>{formatPlayerLabel(incomingChallenge.fromPlayerId)}</strong> te provoacă la o partidă.
            </p>
            <p className="challenge-dialog__countdown">Expiră în {Math.ceil(remainingMs / 1000)}s</p>
            <div className="challenge-dialog__actions">
              <button className="play-now-button" onClick={() => respondToChallenge(true)}>
                Acceptă
              </button>
              <button className="challenge-dialog__decline" onClick={() => respondToChallenge(false)}>
                Refuză
              </button>
            </div>
          </div>
        </div>
      )}

      {outgoingChallengeNotice && (
        <div className="challenge-dialog-overlay">
          <div className="challenge-dialog">
            <h3 className="challenge-dialog__title">{outgoingChallengeNotice.title}</h3>
            <p className="challenge-dialog__text">{outgoingChallengeNotice.text}</p>
            <div className="challenge-dialog__actions">
              <button className="play-now-button" onClick={() => setOutgoingChallengeNotice(null)}>
                Am înțeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

