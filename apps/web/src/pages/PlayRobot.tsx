import { useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { PlaneTray, NEXT_ORIENTATION } from "../components/PlaneTray";
import { playShotSound, playCrowdLoseSound, playVictoryTrumpetSound } from "../utils/sounds";
import {
  pickRobotShot,
  DIFFICULTY_LABELS,
  DIFFICULTY_DESCRIPTIONS,
  ROBOT_SHOT_REASON_LABELS,
  type RobotDifficulty,
} from "../utils/robotAI";
import { emptyRobotScore, recordRobotResult, sumRobotScore, type RobotScore } from "../utils/robotScore";
import {
  TOTAL_PLANES_PER_PLAYER,
  BOARD_SIZE,
  isValidPlanePlacement,
  getOccupiedCellKeys,
  resolveShot,
  hasFoundAllPlaneHeads,
  cellKey,
  getPlaneShape,
} from "@flight/game-logic";
import type { Cell, PlanePlacement, PlaneOrientation, ShotResult } from "@flight/types";

const ORIENTATIONS: PlaneOrientation[] = ["N", "E", "S", "W"];
const DIFFICULTIES: RobotDifficulty[] = ["easy", "medium", "advanced", "expert", "cheating"];


// Paletă de culori pentru notițele proprii (click-dreapta pe tabla robotului),
// distincte de culorile folosite deja pentru avioane/lovituri. Culoarea curentă
// se schimbă automat (nu manual) după ce ai hașurat un avion complet (10 celule).
const ANNOTATION_COLORS = ["#f1c40f", "#9b59b6", "#00bcd4", "#e67e22", "#e91e8c", "#2ecc71"];
const PLANE_CELL_COUNT = getPlaneShape("N").length;

function createEmptyTrayPlanes(): { id: string; orientation: PlaneOrientation }[] {
  return Array.from({ length: TOTAL_PLANES_PER_PLAYER }, (_, i) => ({
    id: `tray-${i}`,
    orientation: "N" as const,
  }));
}

/**
 * Alege un aranjament aleatoriu valid (fără suprapuneri, fără ieșiri de pe tablă)
 * pentru cele 3 avioane — folosit atât de butonul "Aranjare aleatorie", cât și pentru
 * ca robotul să-și plaseze singur avioanele la începutul partidei. */
function generateRandomPlanes(): PlanePlacement[] | null {
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
        const candidate: PlanePlacement = { id: `plane-${i}`, head, orientation };
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

    if (allPlaced) return result;
  }

  return null;
}



export function PlayRobot() {
  const [trayPlanes, setTrayPlanes] = useState(createEmptyTrayPlanes);
  const [placedPlanes, setPlacedPlanes] = useState<PlanePlacement[]>([]);
  const [draggingTrayId, setDraggingTrayId] = useState<string | null>(null);

  const [phase, setPhase] = useState<"selectDifficulty" | "placing" | "battle" | "over">("selectDifficulty");
  const [difficulty, setDifficulty] = useState<RobotDifficulty>("easy");

  const [isMyTurn, setIsMyTurn] = useState(true);
  const [myShots, setMyShots] = useState<{ cell: Cell; status: ShotResult }[]>([]);
  const [incomingShots, setIncomingShots] = useState<{ cell: Cell; status: ShotResult }[]>([]);
  const [winner, setWinner] = useState<"me" | "robot" | null>(null);
  const [robotPlanes, setRobotPlanes] = useState<PlanePlacement[]>([]);

  // Controlează vizibilitatea popup-ului de final - permite jucătorului să-l închidă
  // (X) pentru a se uita peste tablă, fără să iasă din faza "over".
  const [showResultDialog, setShowResultDialog] = useState(false);

  // Scor persistent (câștiguri/înfrângeri per dificultate), citit din localStorage
  // la prima randare și actualizat la finalul fiecărei partide.
  const [score, setScore] = useState<RobotScore>(emptyRobotScore);

  // Jurnal de activitate al sălii, ca la jocul online — dar cu robotul în locul
  // celuilalt jucător: intră imediat ce alegi dificultatea, iese când jocul se termină.
  const [activity, setActivity] = useState<
    { key: string; type: "joined" | "left" | "won" | "lost" | "shot"; detail?: string }[]
  >([]);

  // Notițe proprii pe tabla robotului (click-dreapta), pentru a schița unde crezi
  // că ar putea fi avioanele lui — pur vizuale, nu au nicio legătură cu logica jocului.
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

  // Avem nevoie de referințe "live" (nu doar de state) pentru mutarea robotului,
  // ca să nu depindă de un re-render anterior care ar putea încă să nu se fi produs.
  const robotPlanesRef = useRef<PlanePlacement[]>([]);
  const myShotsRef = useRef<{ cell: Cell; status: ShotResult }[]>([]);

  useEffect(() => {
    robotPlanesRef.current = robotPlanes;
  }, [robotPlanes]);

  useEffect(() => {
    myShotsRef.current = myShots;
  }, [myShots]);

  const handleSelectDifficulty = (level: RobotDifficulty) => {
    setDifficulty(level);
    setActivity([{ key: "robot-joined", type: "joined" }]);
    setPhase("placing");
  };

  // Robotul mută automat când e rândul lui, cu o mică întârziere ca să pară "că se gândește".
  useEffect(() => {
    if (phase !== "battle" || isMyTurn) return;
    const timeout = window.setTimeout(() => {
      const { cell, reason, detail: reasonDetail } = pickRobotShot(difficulty, incomingShots, placedPlanes);
      const { result } = resolveShot(cell, placedPlanes, new Set(
        incomingShots.filter((s) => s.status !== "miss").map((s) => cellKey(s.cell))
      ));
      playShotSound(result);
      const nextIncoming = [...incomingShots, { cell, status: result }];
      setIncomingShots(nextIncoming);
      // Afișăm în jurnal, la fiecare mutare a robotului, strategia pe baza căreia
      // a ales celula respectivă - ca să poți verifica dacă face ce trebuie. Când
      // există (deducție de formă), adăugăm și loviturile concrete considerate,
      // plus ce parte a avionului (coadă/aripă/fuselaj/cap) au reprezentat ele.
      setActivity((prev) => [
        ...prev,
        {
          key: `robot-shot-${nextIncoming.length}`,
          type: "shot",
          detail: `${String.fromCharCode(65 + cell.col)}${cell.row + 1} — ${ROBOT_SHOT_REASON_LABELS[reason]}${
            reasonDetail ? ` (${reasonDetail})` : ""
          }`,
        },
      ]);

      const robotWon = hasFoundAllPlaneHeads(placedPlanes, nextIncoming.map((s) => ({ cell: s.cell, result: s.status, byPlayerId: "robot" })));
      if (robotWon) {
        playCrowdLoseSound();
        setWinner("robot");
        setScore((prev) => recordRobotResult(prev, difficulty, "loss"));
        setShowResultDialog(true);
        setPhase("over");
        setActivity((prev) => [
          ...prev,
          { key: "robot-lost", type: "lost" },
        ]);
      } else {
        setIsMyTurn(true);
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [phase, isMyTurn, incomingShots, placedPlanes, difficulty]);

  const handleDropNewPlane = (head: Cell) => {
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

  const handleClearBoard = () => {
    setPlacedPlanes([]);
    setTrayPlanes(createEmptyTrayPlanes());
    setDraggingTrayId(null);
  };

  const handleRandomPlacement = () => {
    const result = generateRandomPlanes();
    if (!result) return;
    setPlacedPlanes(result);
    setTrayPlanes([]);
    setDraggingTrayId(null);
  };

  const draggingTrayOrientation = draggingTrayId
    ? trayPlanes.find((p) => p.id === draggingTrayId)?.orientation
    : undefined;

  // La "Gata", robotul își plasează instant propriile avioane și lupta începe direct
  // (nu există fază de așteptare - robotul e mereu "gata" imediat).
  const handleConfirmPlacement = () => {
    if (trayPlanes.length > 0) return;
    const generated = generateRandomPlanes();
    if (!generated) return;
    setRobotPlanes(generated);
    setMyShots([]);
    setIncomingShots([]);
    setWinner(null);
    setIsMyTurn(true);
    setPhase("battle");
  };

  // Permite un meci nou fără a reveni la alegerea dificultății - păstrăm aceeași
  // dificultate și trecem direct la faza de plasare a avioanelor.
  const handleNewGame = () => {
    setPlacedPlanes([]);
    setTrayPlanes(createEmptyTrayPlanes());
    setDraggingTrayId(null);
    setRobotPlanes([]);
    setMyShots([]);
    setIncomingShots([]);
    setWinner(null);
    setShowResultDialog(false);
    setAnnotations({});
    setAnnotationColorIndex(0);
    setActivity([{ key: "robot-joined", type: "joined" }]);
    setPhase("placing");
  };

  // Renunță la meciul curent și revine la ecranul de alegere a dificultății.
  const handleChangeDifficulty = () => {
    setPlacedPlanes([]);
    setTrayPlanes(createEmptyTrayPlanes());
    setDraggingTrayId(null);
    setRobotPlanes([]);
    setMyShots([]);
    setIncomingShots([]);
    setWinner(null);
    setShowResultDialog(false);
    setAnnotations({});
    setAnnotationColorIndex(0);
    setActivity([]);
    setPhase("selectDifficulty");
  };

  const handleShootRobot = (cell: Cell) => {
    if (phase !== "battle" || !isMyTurn) return;
    if (myShots.some((s) => s.cell.row === cell.row && s.cell.col === cell.col)) return;

    const previousHitKeys = new Set(
      myShots.filter((s) => s.status !== "miss").map((s) => cellKey(s.cell))
    );
    const { result } = resolveShot(cell, robotPlanesRef.current, previousHitKeys);
    const nextShots = [...myShots, { cell, status: result }];
    setMyShots(nextShots);

    const iWon = hasFoundAllPlaneHeads(
      robotPlanesRef.current,
      nextShots.map((s) => ({ cell: s.cell, result: s.status, byPlayerId: "me" }))
    );
    if (iWon) {
      // Nu mai redăm și sunetul de "cap lovit" aici - la victorie vrem un
      // singur sunet (fanfara), nu două suprapuse.
      playVictoryTrumpetSound();
      setWinner("me");
      setScore((prev) => recordRobotResult(prev, difficulty, "win"));
      setShowResultDialog(true);
      setPhase("over");
      setActivity((prev) => [
        ...prev,
        { key: "robot-won-msg", type: "won" },
        { key: "robot-left", type: "left" },
      ]);
    } else {
      playShotSound(result);
      setIsMyTurn(false);
    }
  };

  const isPlacingPhase = phase === "placing";
  // Nu afișăm badge-ul de scor la 0/0 (nicio partidă jucată încă la dificultatea
  // curentă) - apare abia după ce se termină prima partidă la acea dificultate.
  const hasPlayedDifficulty = score[difficulty].wins + score[difficulty].losses > 0;

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
                <span className="board-title__name-group">
                  Tu
                  {phase === "battle" && isMyTurn && <span className="turn-hourglass">⏳</span>}
                </span>
              </span>
              {phase !== "selectDifficulty" && !isPlacingPhase && hasPlayedDifficulty && (
                <span className="player-score-badge">{score[difficulty].wins}</span>
              )}
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
            {phase === "selectDifficulty" && (
              <div className="difficulty-select">
                <h3 className="plane-tray__title">Alege dificultatea</h3>
                <div className="difficulty-select__list">
                  {DIFFICULTIES.map((level) => (
                    <button
                      key={level}
                      className="difficulty-select__button"
                      onClick={() => handleSelectDifficulty(level)}
                    >
                      <span className="difficulty-select__label">{DIFFICULTY_LABELS[level]}</span>
                      <span className="difficulty-select__description">{DIFFICULTY_DESCRIPTIONS[level]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPlacingPhase && (
              <>
                <PlaneTray
                  planes={trayPlanes}
                  onDragStart={setDraggingTrayId}
                  onDragEnd={() => setDraggingTrayId(null)}
                  onRotate={handleRotateTrayPlane}
                  hint='Așează-ți avioanele și apasă "Gata" pentru a începe.'
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

            {phase === "battle" && (
              <>
                <div className="board-title">
                  <span className="player-avatar" aria-hidden="true">
                    🤖
                  </span>
                  <span className="board-title__name-row">
                    <span className="board-title__name-group">
                      Robotul
                      {!isMyTurn && <span className="turn-hourglass">⏳</span>}
                    </span>
                  </span>
                  {hasPlayedDifficulty && (
                    <span className="player-score-badge">{score[difficulty].losses}</span>
                  )}
                </div>
                <Board
                  onCellClick={handleShootRobot}
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
                    🤖
                  </span>
                  <span className="board-title__name-row">
                    <span className="board-title__name-group">
                      Robotul
                    </span>
                  </span>
                  {hasPlayedDifficulty && (
                    <span className="player-score-badge">{score[difficulty].losses}</span>
                  )}
                </div>
                <Board markedCells={myShots} planes={robotPlanes} />
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="game-room__sidebar">
        <h2 className="game-room__sidebar-heading">
          Joacă cu robotul
          {phase !== "selectDifficulty" && (
            <span className="game-room__difficulty-tag"> ({DIFFICULTY_LABELS[difficulty]})</span>
          )}
        </h2>
        <p className="game-room__total-score">
          Total (toate dificultățile): {sumRobotScore(score).wins}V / {sumRobotScore(score).losses}Î
        </p>
        <ul className="activity-log">
          {activity.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${entry.type === "joined" || entry.type === "won" ? "joined" : "left"}${
                entry.type === "won" || entry.type === "lost" ? " you" : ""
              }`}
            >
              {entry.type === "won" || entry.type === "lost" ? (
                <span className="activity-log__action">
                  {entry.type === "won" ? "Ai câștigat jocul! 🏆" : "Ai pierdut jocul."}
                </span>
              ) : entry.type === "shot" ? (
                <>
                  <span className="activity-log__player">Robotul</span>
                  <span className="activity-log__action">a tras pe {entry.detail}</span>
                </>
              ) : (
                <>
                  <span className="activity-log__player">Robotul</span>
                  <span className="activity-log__action">
                    {entry.type === "joined" && "a intrat în sală"}
                    {entry.type === "left" && "a ieșit din sală"}
                  </span>
                </>
              )}
            </li>
          ))}
          {phase === "battle" && (
            <li className="activity-log__empty">{isMyTurn ? "Este rândul tău să tragi." : "Robotul se gândește..."}</li>
          )}
        </ul>
        {phase === "over" && (
          <button className="sidebar-rematch-button" onClick={handleNewGame}>
            Joacă din nou
          </button>
        )}
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
              {winner === "me" ? "Ai câștigat! 🏆" : "Ai pierdut."}
            </h3>
            <p className="challenge-dialog__text game-over-dialog__text">
              {winner === "me"
                ? `Ai câștigat în ${myShots.length} mutări.`
                : `Te-a bătut în ${incomingShots.length} mutări.`}
            </p>
            <div className="game-over-dialog__actions">
              <button className="game-over-dialog__primary" onClick={handleNewGame}>
                Joacă din nou
              </button>
              <button className="game-over-dialog__secondary" onClick={handleChangeDifficulty}>
                Schimbă dificultatea
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
