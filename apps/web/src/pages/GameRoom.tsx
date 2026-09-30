import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket, playerId } from "../socket";
import { playShotSound, playCrowdLoseSound, playVictoryTrumpetSound } from "../utils/sounds";
import { formatPlayerLabel } from "../utils/playerLabel";
import { Board } from "../components/Board";
import { PlaneTray, NEXT_ORIENTATION } from "../components/PlaneTray";
import {
  TOTAL_PLANES_PER_PLAYER,
  BOARD_SIZE,
  isValidPlanePlacement,
  getOccupiedCellKeys,
  getPlaneShape,
} from "@flight/game-logic";
import type { Cell, PlanePlacement, PlaneOrientation, ShotResult } from "@flight/types";

interface ActivityEntry {
  key: string;
  playerId: string;
  type: "joined" | "left" | "won" | "lost" | "placement-cancelled" | "timeout-lost" | "timeout-won" | "placed" | "kicked-for-not-placing";
  at: number;
}

function createEmptyTrayPlanes(): { id: string; orientation: "N" | "E" | "S" | "W" }[] {
  return Array.from({ length: TOTAL_PLANES_PER_PLAYER }, (_, i) => ({
    id: `tray-${i}`,
    orientation: "N" as const,
  }));
}

// Paletă de culori pentru notițele proprii (click-dreapta pe tabla adversarului),
// distincte de culorile folosite deja pentru avioane/lovituri. Culoarea curentă
// se schimbă automat (nu manual) după ce ai hașurat un avion complet (10 celule).
const ANNOTATION_COLORS = ["#f1c40f", "#9b59b6", "#00bcd4", "#e67e22", "#e91e8c", "#2ecc71"];
const PLANE_CELL_COUNT = getPlaneShape("N").length;

/** Fulger suprapus peste avatarul unui jucător care a ieșit din sală, cât timp partida continuă. */
function DisconnectBolt() {
  return (
    <span className="disconnected-badge" title="Adversarul a ieșit din sală">
      <svg width="14" height="26" viewBox="0 0 14 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 0L0 15h5l-2 11L14 10H8l2-10z" fill="#ffd400" stroke="#8a6d00" strokeWidth="0.5" />
      </svg>
    </span>
  );
}

export function GameRoom() {
  const { id: gameId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const hasSeenOpponentRef = useRef(false);
  const mainSectionRef = useRef<HTMLElement | null>(null);
  const [mainHeight, setMainHeight] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityCounter = useRef(0);
  const activityLogRef = useRef<HTMLUListElement | null>(null);
  const gameJustEndedRef = useRef(false);
  // Scorul dintre acești 2 jucători, ca la jocul cu robotul: rămâne cât timp
  // rămân în aceeași "sesiune" (chiar dacă apasă "Joacă din nou" și ajung
  // într-o sală nouă cu alt gameId), dar se resetează dacă vreunul din ei
  // părăsește complet pagina de joc online (navighează în altă parte).
  const [score, setScore] = useState({ wins: 0, losses: 0 });
  // Popup de victorie/înfrângere la finalul unui meci, la fel ca la jocul cu
  // robotul - poate fi închis fără să afecteze restul stării (scor, sidebar).
  const [showResultDialog, setShowResultDialog] = useState(false);
  // Cerere de revanșă primită de la adversar (partida tocmai s-a terminat) -
  // afișată ca dialog de accept/refuz, la fel ca o provocare directă.
  const [incomingRematchFrom, setIncomingRematchFrom] = useState<string | null>(null);
  // true cât timp acest jucător așteaptă răspunsul adversarului la propria cerere de revanșă.
  const [awaitingRematchResponse, setAwaitingRematchResponse] = useState(false);
  const [rematchDeclinedNotice, setRematchDeclinedNotice] = useState(false);

  // Mesajele de chat schimbate în sala curentă (nu se persistă, doar în memorie locală).
  const [chatMessages, setChatMessages] = useState<{ key: string; playerId: string; text: string; at: number }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatCounter = useRef(0);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  // Rolul acestui client în sala curentă: "player" (participă normal) sau
  // "spectator" (sala are deja 2 jucători - poate doar privi cele 2 table).
  const [role, setRole] = useState<"player" | "spectator" | null>(null);
  // Loviturile date de fiecare jucător, așa cum le vede spectatorul (public,
  // fără avioane dezvăluite cât timp jocul e încă în desfășurare).
  const [spectatorShots, setSpectatorShots] = useState<Record<string, { cell: Cell; status: ShotResult }[]>>({});
  const [spectatorPlanes, setSpectatorPlanes] = useState<Record<string, PlanePlacement[]> | null>(null);
  const [spectatorCurrentTurnPlayerId, setSpectatorCurrentTurnPlayerId] = useState<string | null>(null);
  const [spectatorWinnerId, setSpectatorWinnerId] = useState<string | null>(null);

  // Plasarea avioanelor: cele nedescoperite/neplasate stau în "tray" (coloana dreapta),
  // cele plasate au o poziție (head) și apar pe tablă. Momentan doar local (fără sync
  // cu serverul) — pregătim UI-ul de plasare înainte să adăugăm faza de joc propriu-zisă.
  const [trayPlanes, setTrayPlanes] = useState(createEmptyTrayPlanes);
  const [placedPlanes, setPlacedPlanes] = useState<PlanePlacement[]>([]);
  const [draggingTrayId, setDraggingTrayId] = useState<string | null>(null);

  // Faza jocului: "placing" -> plasare avioane, "waiting" -> eu am confirmat, aștept adversarul,
  // "battle" -> lupta a început, "over" -> jocul s-a terminat.
  const [phase, setPhase] = useState<"placing" | "waiting" | "battle" | "over">("placing");
  const [isMyTurn, setIsMyTurn] = useState(false);
  // Loviturile date DE mine (asupra tablei adversarului) și cele primite (asupra mea).
  const [myShots, setMyShots] = useState<{ cell: Cell; status: ShotResult }[]>([]);
  const [incomingShots, setIncomingShots] = useState<{ cell: Cell; status: ShotResult }[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  // Avioanele adversarului, dezvăluite doar la finalul partidei, ca să-ți poți face
  // o idee cum erau aranjate.
  const [opponentPlanes, setOpponentPlanes] = useState<PlanePlacement[] | null>(null);

  // Cronometrul de plasare (30s comune) — deadline absolut trimis de server,
  // numărăm invers local pornind de la el (nu de la un contor propriu, ca să
  // rămânem sincronizați chiar dacă tab-ul a stat inactiv o vreme).
  const [placementDeadline, setPlacementDeadline] = useState<number | null>(null);
  const [placementSecondsLeft, setPlacementSecondsLeft] = useState<number | null>(null);
  // Ceasul de șah al luptei: câte ms mai are fiecare jucător + de când curge
  // ceasul celui aflat la rând acum (ca să calculăm local timpul rămas afișat).
  const [clockByPlayer, setClockByPlayer] = useState<Record<string, number>>({});
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Dacă adversarul a ieșit din sală în timpul luptei, are o perioadă de grație
  // să revină înainte de a fi declarat abandon automat - numărăm invers local
  // pornind de la deadline-ul absolut trimis de server (la fel ca la plasare).
  const [forfeitDeadline, setForfeitDeadline] = useState<number | null>(null);
  const [forfeitSecondsLeft, setForfeitSecondsLeft] = useState<number | null>(null);

  // Notițe proprii pe tabla adversarului (click-dreapta), pentru a schița unde crezi
  // că ar putea fi avioanele lui — pur vizuale, nu au nicio legătură cu logica jocului
  // și nu sunt trimise pe server. "row:col" -> culoarea de hașurare curentă a celulei.
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [annotationColorIndex, setAnnotationColorIndex] = useState(0);

  const handleCellRightClick = (cell: Cell) => {
    const key = `${cell.row}:${cell.col}`;
    if (annotations[key]) {
      // Al doilea click-dreapta pe aceeași celulă -> anulează hașurarea.
      const next = { ...annotations };
      delete next[key];
      setAnnotations(next);
      return;
    }
    const color = ANNOTATION_COLORS[annotationColorIndex % ANNOTATION_COLORS.length];
    const next = { ...annotations, [key]: color };
    setAnnotations(next);
    // Odată ce ai hașurat un avion întreg (10 celule) cu culoarea curentă, trecem
    // automat la următoarea culoare pentru avionul următor pe care vrei să-l trasezi.
    const markedWithCurrentColor = Object.values(next).filter((c) => c === color).length;
    if (markedWithCurrentColor >= PLANE_CELL_COUNT) {
      setAnnotationColorIndex((annotationColorIndex + 1) % ANNOTATION_COLORS.length);
    }
  };


  useEffect(() => {
    if (!gameId) return;

    // Sala se poate schimba fără remontarea componentei (ex: revanșă acceptată
    // -> gameId nou pe aceeași rută /game/:id) - resetăm complet starea locală
    // a jocului anterior, dar PĂSTRĂM scorul (vezi comentariul de la `score`).
    setActivity([]);
    setRole(null);
    setPlayerIds([]);
    hasSeenOpponentRef.current = false;
    setTrayPlanes(createEmptyTrayPlanes());
    setPlacedPlanes([]);
    setDraggingTrayId(null);
    setPhase("placing");
    setIsMyTurn(false);
    setMyShots([]);
    setIncomingShots([]);
    setWinner(null);
    setOpponentPlanes(null);
    setPlacementDeadline(null);
    setPlacementSecondsLeft(null);
    setClockByPlayer({});
    setTurnStartedAt(null);
    setForfeitDeadline(null);
    setForfeitSecondsLeft(null);
    setAnnotations({});
    setAnnotationColorIndex(0);
    setSpectatorShots({});
    setSpectatorPlanes(null);
    setSpectatorCurrentTurnPlayerId(null);
    setSpectatorWinnerId(null);
    setIncomingRematchFrom(null);
    setAwaitingRematchResponse(false);
    setRematchDeclinedNotice(false);
    setShowResultDialog(false);
    gameJustEndedRef.current = false;
    socket.emit("room:join", { gameId });

    const handleRoomState = (payload: { gameId: string; playerIds: string[] }) => {
      if (payload.gameId === gameId) {
        if (payload.playerIds.length > 1) hasSeenOpponentRef.current = true;
        setPlayerIds(payload.playerIds);
      }
    };

    const handleRoomRole = (payload: { gameId: string; role: "player" | "spectator"; playerIds: string[] }) => {
      if (payload.gameId !== gameId) return;
      setRole(payload.role);
      setPlayerIds(payload.playerIds);
    };

    // Adaugă o intrare cronologică în jurnalul de activitate al sălii (folosit atât pentru
    // intrări/ieșiri, cât și pentru anunțul de final de joc).
    const pushActivity = (entry: { playerId: string; type: ActivityEntry["type"]; at: number }) => {
      activityCounter.current += 1;
      const sequence = activityCounter.current;
      setActivity((prev) =>
        [
          ...prev,
          {
            key: `${entry.at}-${sequence}`,
            playerId: entry.playerId,
            type: entry.type,
            at: entry.at,
          },
        ].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
      );
    };

    const handleActivity = (payload: {
      gameId: string;
      playerId: string;
      type: "joined" | "left" | "placed";
      at: number;
    }) => {
      if (payload.gameId !== gameId) return;
      if (payload.type === "placed" && payload.playerId === playerId) return; // deja arătăm "Gata" local
      pushActivity(payload);
    };

    // Dacă socket-ul se reconectează (ex: rețea instabilă) cât timp suntem încă
    // pe pagina sălii, retrimitem room:join ca să reintrăm automat în cameră.
    const handleReconnect = () => socket.emit("room:join", { gameId });

    const handlePlacementDeadline = (payload: { gameId: string; deadline: number }) => {
      if (payload.gameId !== gameId) return;
      setPlacementDeadline(payload.deadline);
    };

    const handlePlacementCancelled = (payload: { gameId: string; blamedPlayerId: string | null; bothBlamed?: boolean }) => {
      if (payload.gameId !== gameId) return;
      if (payload.bothBlamed) {
        // Niciunul dintre cei doi nu a plasat la timp -> ambii sunt redirecționați
        // automat pe homepage, fără vinovat unic.
        navigate("/");
        return;
      }
      if (payload.blamedPlayerId) {
        if (payload.blamedPlayerId === playerId) {
          // Eu sunt cel care nu a plasat la timp -> redirecționat automat pe homepage.
          navigate("/");
          return;
        }
        // Adversarul nu a plasat la timp -> meciul se anulează; anunțăm doar prin
        // jurnalul de activitate din coloana din dreapta (nu blocăm tabla).
        pushActivity({ playerId: payload.blamedPlayerId, type: "kicked-for-not-placing" as ActivityEntry["type"], at: Date.now() });
        setPlacementDeadline(null);
        return;
      }
    };

    const handleForfeitPending = (payload: { gameId: string; playerId: string; deadline: number }) => {
      if (payload.gameId !== gameId) return;
      if (payload.playerId === playerId) return; // eu sunt cel plecat - nu am nevoie de propriul countdown
      setForfeitDeadline(payload.deadline);
    };

    const handleForfeitCancelled = (payload: { gameId: string; playerId: string }) => {
      if (payload.gameId !== gameId) return;
      setForfeitDeadline(null);
    };

    const handleBattleClock = (payload: {
      gameId: string;
      clockByPlayer: Record<string, number>;
      currentTurnPlayerId: string | null;
      turnStartedAt: number | null;
    }) => {
      if (payload.gameId !== gameId) return;
      setClockByPlayer(payload.clockByPlayer);
      setTurnStartedAt(payload.turnStartedAt);
      setSpectatorCurrentTurnPlayerId(payload.currentTurnPlayerId);
    };

    const handleBattleStarted = (payload: { gameId: string; firstPlayerId: string }) => {
      if (payload.gameId !== gameId) return;
      setPhase("battle");
      setIsMyTurn(payload.firstPlayerId === playerId);
      setPlacementDeadline(null);
      setSpectatorCurrentTurnPlayerId(payload.firstPlayerId);
      // Pornim cu tabla de notițe curată la fiecare luptă nouă.
      setAnnotations({});
      setAnnotationColorIndex(0);
    };

    const handleBattleShot = (payload: { gameId: string; byPlayerId: string; cell: Cell; result: ShotResult }) => {
      if (payload.gameId !== gameId) return;
      const entry = { cell: payload.cell, status: payload.result };
      // Amânăm puțin sunetul loviturii: dacă imediat după vine battle:over
      // (adică asta a fost lovitura care a câștigat meciul), anulăm acest
      // sunet - vrem doar fanfara de victorie, fără suprapunere.
      gameJustEndedRef.current = false;
      setTimeout(() => {
        if (!gameJustEndedRef.current) playShotSound(payload.result);
      }, 30);
      if (payload.byPlayerId === playerId) {
        setMyShots((prev) => [...prev, entry]);
        // Fiecare joacă o singură mutare pe rând, indiferent de rezultat.
        setIsMyTurn(false);
      } else {
        setIncomingShots((prev) => [...prev, entry]);
        setIsMyTurn(true);
      }
      // Un spectator vede loviturile ambilor jucători, indexate după cine a tras.
      setSpectatorShots((prev) => ({
        ...prev,
        [payload.byPlayerId]: [...(prev[payload.byPlayerId] ?? []), entry],
      }));
    };

    const handleBattleOver = (payload: {
      gameId: string;
      winnerId: string;
      planes: Record<string, PlanePlacement[]>;
      reason?: "timeout";
    }) => {
      if (payload.gameId !== gameId) return;
      setSpectatorPlanes(payload.planes);
      setSpectatorWinnerId(payload.winnerId);
      // Restul (sunete, jurnal de "am câștigat/pierdut") are sens doar pentru cei
      // 2 jucători propriu-ziși - un spectator nu a jucat, deci nu a câștigat/pierdut nimic.
      if (!(playerId in payload.planes)) return;
      gameJustEndedRef.current = true;
      setForfeitDeadline(null);
      setPhase("over");
      setWinner(payload.winnerId);
      setShowResultDialog(true);
      const opponentId = Object.keys(payload.planes).find((id) => id !== playerId);
      if (opponentId) setOpponentPlanes(payload.planes[opponentId]);
      const iWon = payload.winnerId === playerId;
      if (iWon) { playVictoryTrumpetSound(); } else playCrowdLoseSound();
      setScore((prev) => (iWon ? { ...prev, wins: prev.wins + 1 } : { ...prev, losses: prev.losses + 1 }));
      const isTimeout = payload.reason === "timeout";
      pushActivity({
        playerId,
        type: iWon ? (isTimeout ? "timeout-won" : "won") : isTimeout ? "timeout-lost" : "lost",
        at: Date.now(),
      });
    };

    // La (re)intrarea în sală, serverul ne retrimite starea completă a luptei
    // dacă exista deja una în desfășurare (ex: am ieșit fără să termin jocul
    // și am revenit) — reconstruim local avioanele, loviturile, rândul curent.
    const handleBattleSync = (payload: {
      gameId: string;
      myPlanes: PlanePlacement[] | null;
      readyPlayerIds: string[];
      started: boolean;
      isMyTurn: boolean;
      winnerId: string | null;
      myShots: { cell: Cell; result: ShotResult }[];
      incomingShots: { cell: Cell; result: ShotResult }[];
      opponentPlanes: PlanePlacement[] | null;
      placementDeadline: number | null;
      clockByPlayer: Record<string, number>;
      turnStartedAt: number | null;
    }) => {
      if (payload.gameId !== gameId) return;
      setClockByPlayer(payload.clockByPlayer);
      setTurnStartedAt(payload.turnStartedAt);
      setPlacementDeadline(payload.placementDeadline);

      if (payload.winnerId) {
        if (payload.myPlanes) setPlacedPlanes(payload.myPlanes);
        setTrayPlanes([]);
        setMyShots(payload.myShots.map((s) => ({ cell: s.cell, status: s.result })));
        setIncomingShots(payload.incomingShots.map((s) => ({ cell: s.cell, status: s.result })));
        setWinner(payload.winnerId);
        if (payload.opponentPlanes) setOpponentPlanes(payload.opponentPlanes);
        setPhase("over");
        return;
      }

      if (payload.started) {
        if (payload.myPlanes) setPlacedPlanes(payload.myPlanes);
        setTrayPlanes([]);
        setMyShots(payload.myShots.map((s) => ({ cell: s.cell, status: s.result })));
        setIncomingShots(payload.incomingShots.map((s) => ({ cell: s.cell, status: s.result })));
        setIsMyTurn(payload.isMyTurn);
        setPhase("battle");
        return;
      }

      if (payload.myPlanes && payload.readyPlayerIds.includes(playerId)) {
        setPlacedPlanes(payload.myPlanes);
        setTrayPlanes([]);
        setPhase("waiting");
      }
    };

    const handleSpectatorSync = (payload: {
      gameId: string;
      started: boolean;
      winnerId: string | null;
      shotsByPlayer: Record<string, { cell: Cell; result: ShotResult }[]>;
      planesByPlayer: Record<string, PlanePlacement[]> | null;
      placementDeadline: number | null;
      clockByPlayer: Record<string, number>;
      currentTurnPlayerId: string | null;
      turnStartedAt: number | null;
    }) => {
      if (payload.gameId !== gameId) return;
      setSpectatorShots(
        Object.fromEntries(
          Object.entries(payload.shotsByPlayer).map(([id, shots]) => [
            id,
            shots.map((s) => ({ cell: s.cell, status: s.result })),
          ])
        )
      );
      setSpectatorWinnerId(payload.winnerId);
      setSpectatorPlanes(payload.planesByPlayer);
      setPlacementDeadline(payload.placementDeadline);
      setClockByPlayer(payload.clockByPlayer);
      setTurnStartedAt(payload.turnStartedAt);
      setSpectatorCurrentTurnPlayerId(payload.currentTurnPlayerId);
    };

    const handleChatMessage = (payload: { gameId: string; playerId: string; text: string; at: number }) => {
      if (payload.gameId !== gameId) return;
      chatCounter.current += 1;
      setChatMessages((prev) => [
        ...prev,
        { key: `chat-${chatCounter.current}`, playerId: payload.playerId, text: payload.text, at: payload.at },
      ]);
    };

    const handleRematchRequested = (payload: { gameId: string; fromPlayerId: string }) => {
      if (payload.gameId !== gameId) return;
      setIncomingRematchFrom(payload.fromPlayerId);
    };
    const handleRematchDeclined = (payload: { gameId: string }) => {
      if (payload.gameId !== gameId) return;
      setAwaitingRematchResponse(false);
      setRematchDeclinedNotice(true);
    };

    socket.on("room:state", handleRoomState);
    socket.on("room:role", handleRoomRole);
    socket.on("room:activity", handleActivity);
    socket.on("room:chatMessage", handleChatMessage);
    socket.io.on("reconnect", handleReconnect);
    socket.on("placement:deadline", handlePlacementDeadline);
    socket.on("placement:cancelled", handlePlacementCancelled);
    socket.on("forfeit:pending", handleForfeitPending);
    socket.on("forfeit:cancelled", handleForfeitCancelled);
    socket.on("battle:clock", handleBattleClock);
    socket.on("battle:started", handleBattleStarted);
    socket.on("battle:shot", handleBattleShot);
    socket.on("battle:over", handleBattleOver);
    socket.on("battle:sync", handleBattleSync);
    socket.on("spectator:sync", handleSpectatorSync);
    socket.on("rematch:requested", handleRematchRequested);
    socket.on("rematch:declined", handleRematchDeclined);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:role", handleRoomRole);
      socket.off("room:activity", handleActivity);
      socket.off("room:chatMessage", handleChatMessage);
      socket.io.off("reconnect", handleReconnect);
      socket.off("placement:deadline", handlePlacementDeadline);
      socket.off("placement:cancelled", handlePlacementCancelled);
      socket.off("forfeit:pending", handleForfeitPending);
      socket.off("forfeit:cancelled", handleForfeitCancelled);
      socket.off("battle:clock", handleBattleClock);
      socket.off("battle:started", handleBattleStarted);
      socket.off("battle:shot", handleBattleShot);
      socket.off("rematch:requested", handleRematchRequested);
      socket.off("rematch:declined", handleRematchDeclined);
      socket.off("battle:over", handleBattleOver);
      socket.off("battle:sync", handleBattleSync);
      socket.off("spectator:sync", handleSpectatorSync);
      socket.emit("room:leave", { gameId });
    };
  }, [gameId]);

  const opponentJoined = playerIds.length > 1;
  const opponentId = playerIds.find((id) => id !== playerId) ?? null;

  // Numărătoare inversă locală pentru fereastra de plasare (30s), recalculată
  // în fiecare secundă din deadline-ul absolut trimis de server.
  useEffect(() => {
    if (placementDeadline == null) {
      setPlacementSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((placementDeadline - Date.now()) / 1000));
      setPlacementSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [placementDeadline]);

  // Numărătoare inversă locală pentru perioada de grație de abandon (adversarul
  // a ieșit din sală în timpul luptei), calculată la fel din deadline-ul de server.
  useEffect(() => {
    if (forfeitDeadline == null) {
      setForfeitSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((forfeitDeadline - Date.now()) / 1000));
      setForfeitSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [forfeitDeadline]);

  // Sidebar-ul de notificări nu trebuie să crească mai mult decât tablele de
  // joc din stânga - urmărim înălțimea reală a `.game-room__main` (care conține
  // tablele) și limităm sidebar-ul la aceeași înălțime, cu scroll intern pentru
  // lista de notificări dacă depășește spațiul disponibil.
  useEffect(() => {
    const node = mainSectionRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMainHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Un "acum" care se actualizează în fiecare sfert de secundă cât timp lupta e
  // în desfășurare (pentru jucători sau spectator), folosit pentru a calcula
  // local ceasul curent al fiecărui jucător fără cereri suplimentare la server.
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const battleLive = phase === "battle" || (role === "spectator" && spectatorWinnerId == null);
    if (!battleLive) return;
    const interval = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [phase, role, spectatorWinnerId]);

  // Scroll automat la ultimul mesaj de chat, de fiecare dată când sosește unul nou.
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Scroll automat la cea mai recentă notificare din jurnalul de activitate
  // (jucător intrat/ieșit, joc câștigat/pierdut etc.), ca cele mai noi să
  // rămână mereu vizibile pentru utilizator, nu ascunse sub scroll.
  useEffect(() => {
    if (activityLogRef.current) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [activity]);

  const getLiveClockMs = (pid: string | null, activePlayerId: string | null): number | null => {
    if (!pid) return null;
    const base = clockByPlayer[pid];
    if (base == null) return null;
    if (activePlayerId !== pid || turnStartedAt == null) return base;
    return Math.max(0, base - (clockNow - turnStartedAt));
  };

  const myClockMs = getLiveClockMs(playerId, isMyTurn ? playerId : opponentId);
  const opponentClockMs = getLiveClockMs(opponentId, isMyTurn ? playerId : opponentId);

  const formatClock = (ms: number | null): string => {
    if (ms == null) return "";
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Un avion nou din tray e plasat pe tablă la poziția pe care s-a dat drop, dacă e validă
  // (nu iese de pe tablă și nu se suprapune cu un avion deja plasat).
  const handleDropNewPlane = (head: { row: number; col: number }) => {
    if (!draggingTrayId) return;
    const trayPlane = trayPlanes.find((p) => p.id === draggingTrayId);
    if (!trayPlane) return;
    const candidate: PlanePlacement = { id: trayPlane.id, head, orientation: trayPlane.orientation };
    const occupied = getOccupiedCellKeys(placedPlanes);
    if (!isValidPlanePlacement(candidate, occupied)) return;
    setPlacedPlanes((prev) => [...prev, candidate]);
    setTrayPlanes((prev) => prev.filter((p) => p.id !== draggingTrayId));
    setDraggingTrayId(null);
  };

  // Rotește un avion, fie că e încă în tray (neplasat), fie deja pe tablă — în ambele
  // cazuri, dacă e deja plasat, rotirea e respinsă când noua orientare nu (mai) e validă.
  const handleRotateTrayPlane = (planeId: string) => {
    setTrayPlanes((prev) =>
      prev.map((p) => (p.id === planeId ? { ...p, orientation: NEXT_ORIENTATION[p.orientation] } : p))
    );
  };

  const handleRotatePlacedPlane = (planeId: string) => {
    setPlacedPlanes((prev) => {
      const plane = prev.find((p) => p.id === planeId);
      if (!plane) return prev;
      const candidate: PlanePlacement = { ...plane, orientation: NEXT_ORIENTATION[plane.orientation] };
      const occupied = getOccupiedCellKeys(prev, planeId);
      if (!isValidPlanePlacement(candidate, occupied)) return prev;
      return prev.map((p) => (p.id === planeId ? candidate : p));
    });
  };

  // Golește tabla și pune toate avioanele înapoi în tavă (de la zero), ca jucătorul
  // să poată reîncepe plasarea dacă nu-i place aranjamentul curent.
  const handleClearBoard = () => {
    setPlacedPlanes([]);
    setTrayPlanes(createEmptyTrayPlanes());
    setDraggingTrayId(null);
  };

  // Aranjează cele 3 avioane aleatoriu pe tablă (poziție + orientare la întâmplare),
  // fără suprapuneri și fără să iasă de pe grid. Încearcă cu reveniri (backtracking
  // simplificat prin reluare completă) până găsește o combinație validă pentru toate.
  const ORIENTATIONS: PlaneOrientation[] = ["N", "E", "S", "W"];

  const handleRandomPlacement = () => {
    const MAX_RESTARTS = 200;
    const MAX_TRIES_PER_PLANE = 300;

    for (let restart = 0; restart < MAX_RESTARTS; restart++) {
      const result: PlanePlacement[] = [];
      let allPlaced = true;

      for (let i = 0; i < TOTAL_PLANES_PER_PLAYER; i++) {
        let placed = false;
        for (let tries = 0; tries < MAX_TRIES_PER_PLANE; tries++) {
          const orientation = ORIENTATIONS[Math.floor(Math.random() * ORIENTATIONS.length)];
          const head: Cell = {
            row: Math.floor(Math.random() * BOARD_SIZE),
            col: Math.floor(Math.random() * BOARD_SIZE),
          };
          const candidate: PlanePlacement = { id: `tray-${i}`, head, orientation };
          const occupied = getOccupiedCellKeys(result);
          if (isValidPlanePlacement(candidate, occupied)) {
            result.push(candidate);
            placed = true;
            break;
          }
        }
        if (!placed) {
          allPlaced = false;
          break;
        }
      }

      if (allPlaced) {
        setPlacedPlanes(result);
        setTrayPlanes([]);
        setDraggingTrayId(null);
        return;
      }
    }
  };

  const draggingTrayOrientation = draggingTrayId
    ? trayPlanes.find((p) => p.id === draggingTrayId)?.orientation
    : undefined;

  const handleConfirmPlacement = () => {
    if (!gameId || trayPlanes.length > 0) return;
    socket.emit("placement:ready", { gameId, planes: placedPlanes });
    setPhase("waiting");
  };

  const handleShootOpponent = (cell: Cell) => {
    if (!gameId || phase !== "battle" || !isMyTurn) return;
    if (myShots.some((s) => s.cell.row === cell.row && s.cell.col === cell.col)) return;
    socket.emit("battle:shoot", { gameId, cell });
  };

  const handleSendChat = (e: FormEvent) => {
    e.preventDefault();
    if (!gameId) return;
    const text = chatInput.trim();
    if (!text) return;
    socket.emit("room:chatMessage", { gameId, text });
    setChatInput("");
  };

  const isPlacingPhase = phase === "placing" || phase === "waiting";
  // Dacă adversarul iese din sală chiar în timpul plasării avioanelor (fie eu, fie el
  // mai are de plasat/așteptat), sala se invalidează pe server (nu mai poate fi reluată)
  // — blocăm imediat orice interacțiune locală (tablă, butoane, cronometru, mesajul de
  // așteptare) ca jucătorul rămas să nu mai creadă că meciul încă poate continua.
  const placementLocked = isPlacingPhase && hasSeenOpponentRef.current && !opponentJoined;
  const placementInteractive = phase === "placing" && !placementLocked;

  if (role === "spectator") {
    const [firstPlayerId, secondPlayerId] = playerIds;
    // Tabla unui jucător arată loviturile primite de la ADVERSAR (nu cele date de el).
    const firstPlayerBoardShots = secondPlayerId ? spectatorShots[secondPlayerId] ?? [] : [];
    const secondPlayerBoardShots = firstPlayerId ? spectatorShots[firstPlayerId] ?? [] : [];
    const gameOver = spectatorWinnerId != null;
    return (
      <div className="game-room">
        <section className="game-room__main">
          <div className="game-room__work-row">
            <div className="game-room__board-col">
              <div className="board-title">
                <span className="player-avatar" aria-hidden="true">
                  👤
                </span>
                <span className="board-title__name-row">
                  {firstPlayerId ? formatPlayerLabel(firstPlayerId) : "Jucător 1"}
                  {gameOver && spectatorWinnerId === firstPlayerId && " 🏆"}
                  {!gameOver && placementSecondsLeft != null && (
                    <span className="placement-timer">⏱ {placementSecondsLeft}s</span>
                  )}
                  {!gameOver && firstPlayerId && clockByPlayer[firstPlayerId] != null && (
                    <span
                      className={`battle-clock${
                        spectatorCurrentTurnPlayerId === firstPlayerId ? " battle-clock--active" : ""
                      }`}
                    >
                      ⏱ {formatClock(getLiveClockMs(firstPlayerId, spectatorCurrentTurnPlayerId))}
                    </span>
                  )}
                </span>
              </div>
              <Board
                markedCells={firstPlayerBoardShots}
                planes={gameOver && firstPlayerId && spectatorPlanes ? spectatorPlanes[firstPlayerId] ?? [] : []}
              />
            </div>
            <div className="game-room__extra-col">
              <div className="board-title">
                <span className="player-avatar" aria-hidden="true">
                  👤
                </span>
                <span className="board-title__name-row">
                  {secondPlayerId ? formatPlayerLabel(secondPlayerId) : "Jucător 2"}
                  {gameOver && spectatorWinnerId === secondPlayerId && " 🏆"}
                  {!gameOver && placementSecondsLeft != null && (
                    <span className="placement-timer">⏱ {placementSecondsLeft}s</span>
                  )}
                  {!gameOver && secondPlayerId && clockByPlayer[secondPlayerId] != null && (
                    <span
                      className={`battle-clock${
                        spectatorCurrentTurnPlayerId === secondPlayerId ? " battle-clock--active" : ""
                      }`}
                    >
                      ⏱ {formatClock(getLiveClockMs(secondPlayerId, spectatorCurrentTurnPlayerId))}
                    </span>
                  )}
                </span>
              </div>
              <Board
                markedCells={secondPlayerBoardShots}
                planes={gameOver && secondPlayerId && spectatorPlanes ? spectatorPlanes[secondPlayerId] ?? [] : []}
              />
            </div>
          </div>
        </section>

        <aside className="game-room__sidebar">
          <h2 className="game-room__sidebar-heading">Sala de joc #{gameId}</h2>
          <p className="plane-tray__hint">
            Ești spectator în această sală - poți doar privi cele două table, fără să poți
            interacționa cu ele. Meciul se joacă între cei doi jucători de mai sus.
          </p>
          <div className="chat-box">
            <div className="chat-box__log" ref={chatLogRef}>
              {chatMessages.length === 0 && <p className="chat-box__empty">Niciun mesaj încă...</p>}
              {chatMessages.map((msg) => (
                <p key={msg.key} className="chat-box__message">
                  <span className="chat-box__author">
                    {msg.playerId === playerId ? "Tu" : formatPlayerLabel(msg.playerId)}:
                  </span>{" "}
                  {msg.text}
                </p>
              ))}
            </div>
            <form className="chat-box__form" onSubmit={handleSendChat}>
              <input
                type="text"
                className="chat-box__input"
                placeholder="Scrie un mesaj..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={300}
              />
              <button type="submit" className="chat-box__send" disabled={!chatInput.trim()}>
                Trimite
              </button>
            </form>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="game-room">
      <section className="game-room__main" ref={mainSectionRef}>
        <div className="game-room__work-row">
          <div className="game-room__board-col">
            <div className="board-title">
              <span className="player-avatar" aria-hidden="true">
                👤
              </span>
              <span className="board-title__name-row">
                Tu
                {phase === "battle" && isMyTurn && <span className="turn-hourglass">⏳</span>}
                {phase === "placing" && !placementLocked && placementSecondsLeft != null && (
                  <span className="placement-timer">⏱ {placementSecondsLeft}s</span>
                )}
                {phase === "battle" && myClockMs != null && (
                  <span className={`battle-clock${isMyTurn ? " battle-clock--active" : ""}`}>
                    ⏱ {formatClock(myClockMs)}
                  </span>
                )}
              </span>
              {!isPlacingPhase && score.wins + score.losses > 0 && (
                <span className="player-score-badge">{score.wins}</span>
              )}
            </div>
            <Board
              planes={placedPlanes}
              onPlanesChange={placementInteractive ? setPlacedPlanes : undefined}
              onDropNewPlane={placementInteractive ? handleDropNewPlane : undefined}
              draggingOrientation={placementInteractive ? draggingTrayOrientation : undefined}
              draggingPlaneIdFromTray={placementInteractive ? draggingTrayId ?? undefined : undefined}
              onRotatePlane={placementInteractive ? handleRotatePlacedPlane : undefined}
              markedCells={incomingShots}
            />
          </div>
          <div
            className={`game-room__extra-col${placementLocked ? " game-room__extra-col--centered" : ""}`}
          >
            {isPlacingPhase && placementLocked && (
              <div className="placement-cancelled-panel placement-cancelled-panel--centered">
                <span className="placement-cancelled-panel__icon" aria-hidden="true">✈️</span>
                <p className="placement-cancelled-panel__title">Meci anulat</p>
                <p className="placement-cancelled-panel__text">
                  Acest meci nu va mai continua.
                </p>
                <button
                  className="placement-cancelled-panel__button"
                  onClick={() => navigate("/play/online")}
                >
                  Încearcă din nou
                </button>
              </div>
            )}
            {phase === "placing" && !placementLocked && (
              <>
                <PlaneTray
                  planes={trayPlanes}
                  onDragStart={setDraggingTrayId}
                  onDragEnd={() => setDraggingTrayId(null)}
                  onRotate={handleRotateTrayPlane}
                />
                <div className="plane-tray placed-planes-hint">
                  <p className="plane-tray__empty">
                    Trage un avion pentru a-l plasa pe tablă. După ce l-ai plasat, îl poți trage
                    din nou pentru a-l repoziționa sau dă dublu-click pe el pentru a-l roti.
                  </p>
                </div>
                <div className="board-actions-row">
                  <button className="random-placement-button" onClick={handleRandomPlacement}>
                    Aranjare aleatorie
                  </button>
                  <button
                    className="clear-board-button"
                    disabled={placedPlanes.length === 0}
                    onClick={handleClearBoard}
                  >
                    Golește tabla
                  </button>
                </div>
                <button
                  className="ready-button"
                  disabled={trayPlanes.length > 0}
                  onClick={handleConfirmPlacement}
                >
                  Gata
                </button>
              </>
            )}

            {phase === "waiting" && !placementLocked && (
              <>
                <div className="board-title">
                  <span className="player-avatar" aria-hidden="true">
                    👤
                    {!opponentJoined && (
                      <DisconnectBolt />
                    )}
                  </span>
                  <span className="board-title__name-row">
                    Adversarul
                    <span className="waiting-hint">încă își așează avioanele...</span>
                  </span>
                </div>
                {placementSecondsLeft != null && (
                  <div className="waiting-timer-wrap">
                    <div className="waiting-timer-big">⏱ {placementSecondsLeft}s</div>
                  </div>
                )}
              </>
            )}

            {phase === "battle" && (
              <>
                <div className="board-title">
                  <span className="player-avatar" aria-hidden="true">
                    👤
                    {!opponentJoined && (
                      <DisconnectBolt />
                    )}
                  </span>
                  <span className="board-title__name-row">
                    <span className="board-title__name-group">
                      Adversarul
                      {!isMyTurn && <span className="turn-hourglass">⏳</span>}
                    </span>
                    <span className="board-title__timers-group">
                      {!opponentJoined && forfeitSecondsLeft != null && (
                        <span className="forfeit-timer" title="Timp până la abandon automat">
                          🔌 {forfeitSecondsLeft}s
                        </span>
                      )}
                      {opponentClockMs != null && (
                        <span className={`battle-clock${!isMyTurn ? " battle-clock--active" : ""}`}>
                          ⏱ {formatClock(opponentClockMs)}
                        </span>
                      )}
                    </span>
                  </span>
                  {score.wins + score.losses > 0 && (
                    <span className="player-score-badge">{score.losses}</span>
                  )}
                </div>
                <Board
                  onCellClick={handleShootOpponent}
                  markedCells={myShots}
                  annotations={annotations}
                  onCellRightClick={handleCellRightClick}
                />
              </>
            )}

            {phase === "over" && (
              <>
                <div className="board-title">
                  <span className="player-avatar" aria-hidden="true">
                    👤
                    {!opponentJoined && (
                      <DisconnectBolt />
                    )}
                  </span>
                  <span className="board-title__name-row">Adversarul</span>
                  {score.wins + score.losses > 0 && (
                    <span className="player-score-badge">{score.losses}</span>
                  )}
                </div>
                <Board markedCells={myShots} planes={opponentPlanes ?? []} annotations={annotations} />
              </>
            )}
          </div>
        </div>
      </section>

      <aside
        className="game-room__sidebar"
        style={mainHeight != null ? { height: mainHeight, maxHeight: mainHeight } : undefined}
      >
        <h2 className="game-room__sidebar-heading">Sala de joc #{gameId}</h2>
        <h3 className="game-room__sidebar-title">Jucători</h3>
        <ul className="activity-log" ref={activityLogRef}>
          {activity.length === 0 && <li className="activity-log__empty">Niciun eveniment încă...</li>}
          {activity.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${
                entry.type === "joined" || entry.type === "won" || entry.type === "timeout-won" || entry.type === "placed"
                  ? "joined"
                  : "left"
              }${entry.playerId === playerId ? " you" : ""}`}
            >
              {entry.type === "won" ||
              entry.type === "lost" ||
              entry.type === "timeout-won" ||
              entry.type === "timeout-lost" ||
              entry.type === "placement-cancelled" ||
              entry.type === "kicked-for-not-placing" ? (
                <span className="activity-log__action">
                  {entry.type === "won" && "Ai câștigat jocul! 🏆"}
                  {entry.type === "lost" && "Ai pierdut jocul."}
                  {entry.type === "timeout-won" && "Adversarul a rămas fără timp - ai câștigat! 🏆"}
                  {entry.type === "timeout-lost" && "Ți-a expirat timpul - ai pierdut jocul."}
                  {entry.type === "placement-cancelled" &&
                    "Timpul de plasare a expirat pentru amândoi - se reia plasarea."}
                  {entry.type === "kicked-for-not-placing" &&
                    (entry.playerId === playerId
                      ? "Nu ți-ai plasat avioanele la timp - ai fost scos din sală."
                      : "Meciul a fost anulat.")}
                </span>
              ) : (
                <>
                  <span className="activity-log__player">
                    {formatPlayerLabel(entry.playerId)} {entry.playerId === playerId ? "(tu)" : ""}
                  </span>
                  <span className="activity-log__action">
                    {entry.type === "joined" && "a intrat în sală"}
                    {entry.type === "left" && "a ieșit din sală"}
                    {entry.type === "placed" && "și-a plasat avioanele"}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        {phase === "over" && (
          <button
            className="sidebar-rematch-button"
            disabled={awaitingRematchResponse}
            onClick={() => {
              if (!gameId) return;
              socket.emit("rematch:request", { gameId });
              setAwaitingRematchResponse(true);
            }}
          >
            {awaitingRematchResponse ? "Se așteaptă răspunsul..." : "Joacă din nou"}
          </button>
        )}
        <div className="chat-box">
          <div className="chat-box__log" ref={chatLogRef}>
            {chatMessages.length === 0 && <p className="chat-box__empty">Niciun mesaj încă...</p>}
            {chatMessages.map((msg) => (
              <p key={msg.key} className="chat-box__message">
                <span className="chat-box__author">
                  {msg.playerId === playerId ? "Tu" : formatPlayerLabel(msg.playerId)}:
                </span>{" "}
                {msg.text}
              </p>
            ))}
          </div>
          <form className="chat-box__form" onSubmit={handleSendChat}>
            <input
              type="text"
              className="chat-box__input"
              placeholder="Scrie un mesaj..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={300}
            />
            <button type="submit" className="chat-box__send" disabled={!chatInput.trim()}>
              Trimite
            </button>
          </form>
        </div>
      </aside>

      {phase === "over" && winner && showResultDialog && (
        <div className="challenge-dialog-overlay">
          <div className="challenge-dialog">
            <button
              className="challenge-dialog__close"
              aria-label="Închide"
              onClick={() => setShowResultDialog(false)}
            >
              ×
            </button>
            <h3 className="challenge-dialog__title">
              {winner === playerId ? "Ai câștigat! 🏆" : "Ai pierdut."}
            </h3>
            <p className="challenge-dialog__text game-over-dialog__text">
              {winner === playerId
                ? `Ai câștigat în ${myShots.length} mutări.`
                : `Te-a bătut în ${incomingShots.length} mutări.`}
            </p>
            <div className="game-over-dialog__actions">
              <button
                className="game-over-dialog__primary"
                onClick={() => {
                  if (!gameId) return;
                  setShowResultDialog(false);
                  socket.emit("rematch:request", { gameId });
                  setAwaitingRematchResponse(true);
                }}
                disabled={awaitingRematchResponse}
              >
                Joacă din nou
              </button>
              <button className="game-over-dialog__secondary" onClick={() => navigate("/play/online")}>
                Înapoi la online
              </button>
            </div>
          </div>
        </div>
      )}

      {incomingRematchFrom && (
        <div className="challenge-dialog-overlay">
          <div className="challenge-dialog">
            <h3 className="challenge-dialog__title">Cerere de revanșă</h3>
            <p className="challenge-dialog__text">
              <strong>{formatPlayerLabel(incomingRematchFrom)}</strong> vrea să joace din nou cu tine.
            </p>
            <div className="challenge-dialog__actions">
              <button
                className="play-now-button"
                onClick={() => {
                  if (!gameId) return;
                  socket.emit("rematch:respond", { gameId, accept: true });
                  setIncomingRematchFrom(null);
                }}
              >
                Acceptă
              </button>
              <button
                className="challenge-dialog__decline"
                onClick={() => {
                  if (!gameId) return;
                  socket.emit("rematch:respond", { gameId, accept: false });
                  setIncomingRematchFrom(null);
                }}
              >
                Refuză
              </button>
            </div>
          </div>
        </div>
      )}

      {rematchDeclinedNotice && (
        <div className="challenge-dialog-overlay">
          <div className="challenge-dialog">
            <h3 className="challenge-dialog__title">Revanșă refuzată</h3>
            <p className="challenge-dialog__text">Adversarul nu a acceptat revanșa.</p>
            <div className="challenge-dialog__actions">
              <button className="play-now-button" onClick={() => setRematchDeclinedNotice(false)}>
                Am înțeles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
