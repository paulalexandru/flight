import { useEffect, useState } from "react";
import { Board } from "../components/Board";
import { generatePuzzle, type PuzzleState } from "../utils/puzzle";
import { playHeadHitSound, playMoveSound } from "../utils/sounds";
import { getPlaneShape } from "@flight/game-logic";
import type { Cell, ShotResult } from "@flight/types";

interface FeedbackEntry {
  key: string;
  type: "correct" | "wrong" | "revealed";
}

// Paletă de culori pentru notițele proprii (click-dreapta pe tablă), la fel ca
// pe tabla adversarului din modul robot/online - pur vizuale, fără legătură cu
// logica puzzle-ului.
const ANNOTATION_COLORS = ["#f1c40f", "#9b59b6", "#00bcd4", "#e67e22", "#e91e8c", "#2ecc71"];
const PLANE_CELL_COUNT = getPlaneShape("N").length;

export function Puzzle() {
  const [puzzle, setPuzzle] = useState<PuzzleState>(() => generatePuzzle());
  const [markedCells, setMarkedCells] = useState<{ cell: Cell; status: ShotResult }[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [feedbackCounter, setFeedbackCounter] = useState(0);
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [annotationColorIndex, setAnnotationColorIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // La montarea paginii, "dezvăluim" direct celulele-indiciu (corpul avionului
  // țintă, alte avioane deja complet descoperite, plus ratările), ca stare
  // inițială a tablei (fără nicio interacțiune a jucătorului încă).
  useEffect(() => {
    setMarkedCells([
      ...puzzle.revealedBodyCells.map((cell) => ({ cell, status: "hit" as ShotResult })),
      ...puzzle.otherPlanesBodyCells.map((cell) => ({ cell, status: "sunk" as ShotResult })),
      ...puzzle.otherPlanesHeadCells.map((cell) => ({ cell, status: "head" as ShotResult })),
      ...puzzle.missCells.map((cell) => ({ cell, status: "miss" as ShotResult })),
    ]);
    // Un puzzle nou -> pornim iar cu tabla de notițe curată.
    setAnnotations({});
    setAnnotationColorIndex(0);
    setRevealed(false);
  }, [puzzle]);

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

  const handleShowResult = () => {
    if (locked) return;
    // NU adăugăm celule noi pe tablă - păstrăm neatinse absolut toate semnele
    // deja existente (loviturile jucătorului, ratările, indiciile inițiale).
    // Doar suprapunem forma colorată a tuturor avioanelor (ca la victorie în
    // modul robot/online), fără să atingem markedCells.
    setStreak(0);
    setBestStreak(0);
    setFeedback((prev) => [{ key: `f-${feedbackCounter}`, type: "revealed" as const }, ...prev].slice(0, 20));
    setFeedbackCounter((c) => c + 1);
    setRevealed(true);
  };

  const handleNextPuzzle = () => {
    setPuzzle(generatePuzzle());
  };

  const handleCellClick = (cell: Cell) => {
    if (locked || revealed) return;
    // Nu numărăm ca "greșeală" un click pe o celulă deja dezvăluită (indiciu
    // arătat de la început) - doar pe celule încă neatinse.
    const alreadyRevealed = markedCells.some((m) => m.cell.row === cell.row && m.cell.col === cell.col);
    if (alreadyRevealed) return;
    const isHead = cell.row === puzzle.plane.head.row && cell.col === puzzle.plane.head.col;

    if (isHead) {
      playHeadHitSound();
      setMarkedCells((prev) => [...prev, { cell, status: "head" }]);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBestStreak((prev) => Math.max(prev, nextStreak));
      setFeedback((prev) => [{ key: `f-${feedbackCounter}`, type: "correct" as const }, ...prev].slice(0, 20));
      setFeedbackCounter((c) => c + 1);
      setLocked(true);
      // Scurtă pauză ca jucătorul să vadă capul descoperit, apoi puzzle nou.
      window.setTimeout(() => {
        setPuzzle(generatePuzzle());
        setLocked(false);
      }, 700);
    } else {
      playMoveSound();
      setStreak(0);
      setFeedback((prev) => [{ key: `f-${feedbackCounter}`, type: "wrong" as const }, ...prev].slice(0, 20));
      setFeedbackCounter((c) => c + 1);
      // Nu blocăm tabla la un răspuns greșit - jucătorul poate încerca din nou,
      // fiindcă soluția corectă (capul) rămâne mereu unică și vizibilă din indicii.
    }
  };

  return (
    <div className="puzzle-room">
      <div className="puzzle-room__board-col">
        <Board
          onCellClick={handleCellClick}
          markedCells={markedCells}
          planes={revealed ? puzzle.allPlanes : []}
          annotations={annotations}
          onCellRightClick={handleCellRightClick}
        />
      </div>
      <aside className="puzzle-room__sidebar">
        <h2 className="game-room__sidebar-heading">Puzzle: ghicește capul avionului</h2>
        <p className="plane-tray__hint">
          Situație reală de joc: pe tablă vezi deja bucăți din corpul avionului căutat (❌ verde),
          eventual alte avioane deja lovite parțial sau complet (❌ + ★ pentru cap) și câteva
          celule ratate (🌥️). Din toate aceste indicii, capul avionului căutat poate fi dedus cu
          certitudine într-un singur loc. Dă click acolo! Poți hașura cu click-dreapta pe unde
          crezi că mai sunt avioane, ca notițe proprii.
        </p>
        <div className="puzzle-room__streak">
          <div className="puzzle-room__streak-current">
            <span className="puzzle-room__streak-number">{streak}</span>
            <span className="puzzle-room__streak-label">reușite la rând</span>
          </div>
          <div className="puzzle-room__streak-best">
            Record: <strong>{bestStreak}</strong>
          </div>
        </div>
        <h3 className="game-room__sidebar-title">Istoric</h3>
        <ul className="activity-log">
          {feedback.map((entry) => (
            <li
              key={entry.key}
              className={`activity-log__entry ${entry.type === "correct" ? "joined" : "left"}`}
            >
              <span className="activity-log__action">
                {entry.type === "correct"
                  ? "Cap găsit! ✅"
                  : entry.type === "wrong"
                  ? "Greșit, mai încearcă. ❌"
                  : "Ai cerut rezultatul. 👁️"}
              </span>
            </li>
          ))}
          {feedback.length === 0 && (
            <li className="activity-log__empty">Fă primul click pe tablă.</li>
          )}
        </ul>
        <button
          type="button"
          className={revealed ? "puzzle-room__reveal-btn puzzle-room__reveal-btn--next" : "puzzle-room__reveal-btn"}
          onClick={revealed ? handleNextPuzzle : handleShowResult}
          disabled={locked}
        >
          {revealed ? "Mergi mai departe" : "Arată rezultat"}
        </button>
      </aside>
    </div>
  );
}
