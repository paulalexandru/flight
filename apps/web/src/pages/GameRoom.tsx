import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket, playerId } from "../socket";
import { Board } from "../components/Board";
import { PlaneTray, NEXT_ORIENTATION } from "../components/PlaneTray";
import { TOTAL_PLANES_PER_PLAYER, isValidPlanePlacement, getOccupiedCellKeys } from "@flight/game-logic";
import type { PlanePlacement } from "@flight/types";

interface ActivityEntry {
  key: string;
  playerId: string;
  type: "joined" | "left";
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


  useEffect(() => {
    if (!gameId) return;

    setActivity([]);
    socket.emit("room:join", { gameId });

    const handleRoomState = (payload: { gameId: string; playerIds: string[] }) => {
      if (payload.gameId === gameId) {
        setPlayerIds(payload.playerIds);
      }
    };

    const handleActivity = (payload: {
      gameId: string;
      playerId: string;
      type: "joined" | "left";
      at: number;
    }) => {
      if (payload.gameId !== gameId) return;
      activityCounter.current += 1;
      const sequence = activityCounter.current;
      // Sortăm mereu cronologic (după `at`, apoi ordinea de sosire) astfel încât
      // mesajele să apară mereu unul sub altul, în ordine, chiar dacă vin foarte rapid.
      setActivity((prev) =>
        [
          ...prev,
          {
            key: `${payload.at}-${sequence}`,
            playerId: payload.playerId,
            type: payload.type,
            at: payload.at,
          },
        ].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
      );
    };

    // Dacă socket-ul se reconectează (ex: rețea instabilă) cât timp suntem încă
    // pe pagina sălii, retrimitem room:join ca să reintrăm automat în cameră.
    const handleReconnect = () => socket.emit("room:join", { gameId });

    socket.on("room:state", handleRoomState);
    socket.on("room:activity", handleActivity);
    socket.io.on("reconnect", handleReconnect);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:activity", handleActivity);
      socket.io.off("reconnect", handleReconnect);
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
            <Board
              planes={placedPlanes}
              onPlanesChange={setPlacedPlanes}
              onDropNewPlane={handleDropNewPlane}
              draggingOrientation={draggingTrayOrientation}
              onRotatePlane={handleRotatePlacedPlane}
            />
          </div>
          <div className="game-room__extra-col">
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
              className={`activity-log__entry ${entry.type === "joined" ? "joined" : "left"}${
                entry.playerId === playerId ? " you" : ""
              }`}
            >
              <span className="activity-log__player">
                {entry.playerId} {entry.playerId === playerId ? "(tu)" : ""}
              </span>
              <span className="activity-log__action">
                {entry.type === "joined" ? "a intrat în sală" : "a ieșit din sală"}
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
