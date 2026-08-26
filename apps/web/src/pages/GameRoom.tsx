import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket, playerId } from "../socket";
import { Board } from "../components/Board";
import { PlaneTray, NEXT_ORIENTATION } from "../components/PlaneTray";
import { TOTAL_PLANES_PER_PLAYER, isValidPlanePlacement, getOccupiedCellKeys } from "@flight/game-logic";
import type { Cell, PlanePlacement, ShotResult } from "@flight/types";

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
    };

    const handleBattleShot = (payload: { gameId: string; byPlayerId: string; cell: Cell; result: ShotResult }) => {
      if (payload.gameId !== gameId) return;
      const entry = { cell: payload.cell, status: payload.result };
      if (payload.byPlayerId === playerId) {
        setMyShots((prev) => [...prev, entry]);
        // Fiecare joacă o singură mutare pe rând, indiferent de rezultat.
        setIsMyTurn(false);
      } else {
        setIncomingShots((prev) => [...prev, entry]);
        setIsMyTurn(true);
      }
    };

    const handleBattleOver = (payload: { gameId: string; winnerId: string }) => {
      if (payload.gameId !== gameId) return;
      setPhase("over");
      setWinner(payload.winnerId);
      const iWon = payload.winnerId === playerId;
      pushActivity({ playerId, type: iWon ? "won" : "lost", at: Date.now() });
    };

    socket.on("room:state", handleRoomState);
    socket.on("room:activity", handleActivity);
    socket.io.on("reconnect", handleReconnect);
    socket.on("battle:started", handleBattleStarted);
    socket.on("battle:shot", handleBattleShot);
    socket.on("battle:over", handleBattleOver);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:activity", handleActivity);
      socket.io.off("reconnect", handleReconnect);
      socket.off("battle:started", handleBattleStarted);
      socket.off("battle:shot", handleBattleShot);
      socket.off("battle:over", handleBattleOver);
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
        <h2>Sala de joc #{gameId}</h2>
        <p className="status-text">Id-ul tău: {playerId}</p>
        {opponentJoined ? (
          <span className="badge ready">Adversarul a intrat în sală!</span>
        ) : (
          <span className="badge waiting">Se așteaptă adversarul...</span>
        )}

        <div className="game-room__work-row">
          <div className="game-room__board-col">
            <p className="board-title">
              Tabla ta
              {phase === "battle" && !isMyTurn && <span className="turn-hourglass">⏳</span>}
            </p>
            <Board
              planes={placedPlanes}
              onPlanesChange={isPlacingPhase ? setPlacedPlanes : undefined}
              onDropNewPlane={isPlacingPhase ? handleDropNewPlane : undefined}
              draggingOrientation={isPlacingPhase ? draggingTrayOrientation : undefined}
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
                  onRotate={handleRotateTrayPlane}
                />
                {placedPlanes.length > 0 && (
                  <div className="plane-tray placed-planes-hint">
                    <p className="plane-tray__empty">
                      Trage un avion plasat pentru a-l muta, sau dă dublu-click pentru a-l roti.
                    </p>
                  </div>
                )}
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
              <div className="plane-tray waiting-panel">
                <p className="plane-tray__empty">Se așteaptă după celălalt jucător...</p>
              </div>
            )}

            {phase === "battle" && (
              <>
                <p className="board-title">
                  Tabla adversarului
                  {isMyTurn && <span className="turn-hourglass">⏳</span>}
                </p>
                <Board onCellClick={handleShootOpponent} markedCells={myShots} />
              </>
            )}

            {phase === "over" && (
              <>
                <p className="board-title">Tabla adversarului</p>
                <Board markedCells={myShots} />
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="game-room__sidebar">
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
