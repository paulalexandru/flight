import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket, playerId } from "../socket";
import { playShotSound, playCrowdWinSound, playCrowdLoseSound } from "../utils/sounds";
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
  type: "joined" | "left" | "won" | "lost";
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
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityCounter = useRef(0);

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

    setActivity([]);
    socket.emit("room:join", { gameId });

    const handleRoomState = (payload: { gameId: string; playerIds: string[] }) => {
      if (payload.gameId === gameId) {
        setPlayerIds(payload.playerIds);
      }
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
      type: "joined" | "left";
      at: number;
    }) => {
      if (payload.gameId !== gameId) return;
      pushActivity(payload);
    };

    // Dacă socket-ul se reconectează (ex: rețea instabilă) cât timp suntem încă
    // pe pagina sălii, retrimitem room:join ca să reintrăm automat în cameră.
    const handleReconnect = () => socket.emit("room:join", { gameId });

    const handleBattleStarted = (payload: { gameId: string; firstPlayerId: string }) => {
      if (payload.gameId !== gameId) return;
      setPhase("battle");
      setIsMyTurn(payload.firstPlayerId === playerId);
      // Pornim cu tabla de notițe curată la fiecare luptă nouă.
      setAnnotations({});
      setAnnotationColorIndex(0);
    };

    const handleBattleShot = (payload: { gameId: string; byPlayerId: string; cell: Cell; result: ShotResult }) => {
      if (payload.gameId !== gameId) return;
      const entry = { cell: payload.cell, status: payload.result };
      playShotSound(payload.result);
      if (payload.byPlayerId === playerId) {
        setMyShots((prev) => [...prev, entry]);
        // Fiecare joacă o singură mutare pe rând, indiferent de rezultat.
        setIsMyTurn(false);
      } else {
        setIncomingShots((prev) => [...prev, entry]);
        setIsMyTurn(true);
      }
    };

    const handleBattleOver = (payload: { gameId: string; winnerId: string; planes: Record<string, PlanePlacement[]> }) => {
      if (payload.gameId !== gameId) return;
      setPhase("over");
      setWinner(payload.winnerId);
      const opponentId = Object.keys(payload.planes).find((id) => id !== playerId);
      if (opponentId) setOpponentPlanes(payload.planes[opponentId]);
      const iWon = payload.winnerId === playerId;
      if (iWon) playCrowdWinSound(); else playCrowdLoseSound();
      pushActivity({ playerId, type: iWon ? "won" : "lost", at: Date.now() });
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
    }) => {
      if (payload.gameId !== gameId) return;

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

    socket.on("room:state", handleRoomState);
    socket.on("room:activity", handleActivity);
    socket.io.on("reconnect", handleReconnect);
    socket.on("battle:started", handleBattleStarted);
    socket.on("battle:shot", handleBattleShot);
    socket.on("battle:over", handleBattleOver);
    socket.on("battle:sync", handleBattleSync);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:activity", handleActivity);
      socket.io.off("reconnect", handleReconnect);
      socket.off("battle:started", handleBattleStarted);
      socket.off("battle:shot", handleBattleShot);
      socket.off("battle:over", handleBattleOver);
      socket.off("battle:sync", handleBattleSync);
      socket.emit("room:leave", { gameId });
    };
  }, [gameId]);

  const opponentJoined = playerIds.length > 1;

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

  const isPlacingPhase = phase === "placing";

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
                Tu
                {phase === "battle" && isMyTurn && <span className="turn-hourglass">⏳</span>}
              </span>
            </div>
            <Board
              planes={placedPlanes}
              onPlanesChange={isPlacingPhase ? setPlacedPlanes : undefined}
              onDropNewPlane={isPlacingPhase ? handleDropNewPlane : undefined}
              draggingOrientation={isPlacingPhase ? draggingTrayOrientation : undefined}
              draggingPlaneIdFromTray={isPlacingPhase ? draggingTrayId ?? undefined : undefined}
              onRotatePlane={isPlacingPhase ? handleRotatePlacedPlane : undefined}
              markedCells={incomingShots}
            />
          </div>
          <div className="game-room__extra-col">
            {isPlacingPhase && (
              <>
                <PlaneTray
                  planes={trayPlanes}
                  onDragStart={setDraggingTrayId}
                  onDragEnd={() => setDraggingTrayId(null)}
                  onRotate={handleRotateTrayPlane}
                />
                {placedPlanes.length > 0 && (
                  <div className="plane-tray placed-planes-hint">
                    <p className="plane-tray__empty">
                      Trage un avion plasat pentru a-l muta, sau dă dublu-click pentru a-l roti.
                    </p>
                  </div>
                )}
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

            {phase === "waiting" && (
              <div className="board-title">
                <span className="player-avatar" aria-hidden="true">
                  👤
                  {!opponentJoined && (
                    <DisconnectBolt />
                  )}
                </span>
                <span className="board-title__name-row">
                  Adversarul
                  <span className="waiting-hint">Se așteaptă...</span>
                </span>
              </div>
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
                    Adversarul
                    {!isMyTurn && <span className="turn-hourglass">⏳</span>}
                  </span>
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
                </div>
                <Board markedCells={myShots} planes={opponentPlanes ?? []} annotations={annotations} />
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="game-room__sidebar">
        <h2 className="game-room__sidebar-heading">Sala de joc #{gameId}</h2>
        <h3 className="game-room__sidebar-title">Jucători</h3>
        <ul className="activity-log">
          {activity.length === 0 && <li className="activity-log__empty">Niciun eveniment încă...</li>}
          {activity.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${entry.type === "joined" || entry.type === "won" ? "joined" : "left"}${
                entry.playerId === playerId ? " you" : ""
              }`}
            >
              {entry.type === "won" || entry.type === "lost" ? (
                <span className="activity-log__action">
                  {entry.type === "won" ? "Ai câștigat jocul! 🏆" : "Ai pierdut jocul."}
                </span>
              ) : (
                <>
                  <span className="activity-log__player">
                    {entry.playerId} {entry.playerId === playerId ? "(tu)" : ""}
                  </span>
                  <span className="activity-log__action">
                    {entry.type === "joined" && "a intrat în sală"}
                    {entry.type === "left" && "a ieșit din sală"}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
