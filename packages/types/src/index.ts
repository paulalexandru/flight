// Tipuri partajate între server și client (web/mobile).

export type Cell = {
  row: number; // 0-9
  col: number; // 0-9
};

export type PlaneOrientation = "N" | "S" | "E" | "W";

export type PlanePlacement = {
  id: string;
  head: Cell; // celula "cap" a avionului, restul formei se calculează din orientare
  orientation: PlaneOrientation;
};

export type ShotResult = "hit" | "miss" | "sunk" | "head";

export type Shot = {
  cell: Cell;
  result: ShotResult;
  byPlayerId: string;
};

export type GameStatus = "waiting" | "placing" | "in_progress" | "finished";

export interface Player {
  id: string;
  username: string;
}

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  currentTurnPlayerId: string | null;
  shots: Shot[];
  winnerId: string | null;
}

// --- Evenimente Socket.io (client <-> server) ---

export interface ClientToServerEvents {
  "game:join": (payload: { gameId: string }) => void;
  "game:placePlanes": (payload: { gameId: string; planes: PlanePlacement[] }) => void;
  "game:shoot": (payload: { gameId: string; cell: Cell }) => void;
  "game:resign": (payload: { gameId: string }) => void;

  // Matchmaking simplu + prezență în sală (fază curentă, fără logică de joc încă)
  "matchmaking:findMatch": () => void;
  "matchmaking:cancel": () => void;
  "room:join": (payload: { gameId: string }) => void;
  "room:leave": (payload: { gameId: string }) => void;

  // Provocare directă a unui jucător anume (spre deosebire de matchmaking:findMatch,
  // care caută pe oricine e disponibil) — folosit din lista de jucători online de pe
  // pagina principală. NU creează sala imediat: cel provocat trebuie mai întâi să
  // accepte (vezi matchmaking:challengeRespond), altfel provocarea expiră singură.
  "matchmaking:challenge": (payload: { targetPlayerId: string }) => void;
  // Răspunsul celui provocat (accept/refuz), identificat prin challengeId-ul primit în
  // matchmaking:challengeReceived.
  "matchmaking:challengeRespond": (payload: { challengeId: string; accept: boolean }) => void;
  // Provocatorul își retrage provocarea înainte ca cel provocat să fi răspuns.
  "matchmaking:challengeCancel": (payload: { challengeId: string }) => void;

  // Cerere de instantaneu al lobby-ului (meciuri în desfășurare + jucători online),
  // folosit pe pagina principală.
  "lobby:requestSnapshot": () => void;

  // Plasare avioane + luptă propriu-zisă (în memorie, per sală)
  "placement:ready": (payload: { gameId: string; planes: PlanePlacement[] }) => void;
  "battle:shoot": (payload: { gameId: string; cell: Cell }) => void;

  // Mesaj de chat trimis în sala de joc curentă, vizibil pentru ambii jucători
  // (și spectatori, dacă e cazul).
  "room:chatMessage": (payload: { gameId: string; text: string }) => void;

  // Un jucător cere o revanșă (aceeași sală, meci deja terminat) - celălalt
  // jucător trebuie mai întâi să accepte, la fel ca la o provocare directă.
  "rematch:request": (payload: { gameId: string }) => void;
  "rematch:respond": (payload: { gameId: string; accept: boolean }) => void;
}

export interface ServerToClientEvents {
  "matchmaking:matched": (payload: { gameId: string }) => void;
  "room:state": (payload: { gameId: string; playerIds: string[] }) => void;
  "room:activity": (payload: { gameId: string; playerId: string; type: "joined" | "left" | "placed"; at: number }) => void;
  // Trimis exclusiv celui care tocmai a intrat, ca să știe dacă rolul lui în
  // sala respectivă e de jucător sau doar de spectator (sala are deja 2 jucători).
  "room:role": (payload: { gameId: string; role: "player" | "spectator"; playerIds: string[] }) => void;

  // Numărul total de utilizatori conectați la site în acest moment (nu doar
  // cei dintr-o sală anume) — afișat în bara de navigare.
  "presence:onlineCount": (payload: { count: number }) => void;

  // Instantaneu al lobby-ului pentru pagina principală: meciurile aflate în
  // desfășurare (cu numărul de mutări și cine e la rând) + jucătorii online,
  // cu id-ul sălii în care se află (dacă e cazul), ca clientul să știe cui
  // să-i afișeze butonul de "Provoacă".
  "lobby:snapshot": (payload: {
    activeMatches: Array<{
      gameId: string;
      playerIds: string[];
      currentTurnPlayerId: string | null;
      moveCount: number;
    }>;
    onlinePlayerIds: string[];
    busyPlayerIds: string[];
  }) => void;
  // Provocarea nu a putut fi trimisă (ex: adversarul tocmai a intrat în alt joc).
  "matchmaking:challengeFailed": (payload: { targetPlayerId: string; reason: string }) => void;
  // Trimis provocatorului, ca să știe că provocarea a fost livrată și e în așteptare.
  "matchmaking:challengeSent": (payload: { challengeId: string; targetPlayerId: string; deadline: number }) => void;
  // Trimis celui provocat - trebuie să apară un dialog de accept/refuz.
  "matchmaking:challengeReceived": (payload: { challengeId: string; fromPlayerId: string; deadline: number }) => void;
  // Trimis ambelor părți când provocarea s-a încheiat fără a porni un joc: fie a
  // refuzat cel provocat, fie a expirat fără răspuns, fie provocatorul a anulat-o.
  "matchmaking:challengeEnded": (payload: { challengeId: string; reason: "declined" | "expired" | "cancelled" }) => void;

  "game:state": (state: GameState) => void;
  "game:error": (payload: { message: string }) => void;

  // Confirmă cine e gata (a plasat avioanele) în sala curentă.
  "placement:status": (payload: { gameId: string; readyPlayerIds: string[] }) => void;
  // Ambii jucători sunt gata -> începe lupta; se alege aleator cine mută primul.
  "battle:started": (payload: { gameId: string; firstPlayerId: string }) => void;
  "battle:shot": (payload: { gameId: string; byPlayerId: string; cell: Cell; result: ShotResult }) => void;
  "battle:over": (payload: {
    gameId: string;
    winnerId: string;
    // Avioanele ambilor jucători (indexate după playerId), dezvăluite la finalul
    // partidei, ca fiecare jucător să vadă cum era aranjată tabla adversarului.
    planes: Record<string, PlanePlacement[]>;
    // Motivul terminării partidei — implicit abandon/victorie normală; "timeout"
    // dacă adversarul a pierdut pentru că i s-a terminat ceasul de 5 minute.
    reason?: "timeout";
  }) => void;
  // Fereastra comună de 30s în care ambii jucători trebuie să-și plaseze avioanele
  // și să apese "Gata". `deadline` e un timestamp absolut (Date.now() + 30000).
  "placement:deadline": (payload: { gameId: string; deadline: number }) => void;
  // Fereastra de plasare a expirat fără ca AMBII jucători să fi confirmat -> partida
  // se anulează (fără câștigător/pierzător). Dacă doar unul dintre ei nu a apucat să
  // plaseze, `blamedPlayerId` indică cine e vinovat (acela e scos din sală, iar
  // celălalt vede mesaj de anulare, fără o fereastră nouă); dacă niciunul nu a
  // plasat, `blamedPlayerId` e null și pornește automat o fereastră nouă de 30s.
  "placement:cancelled": (payload: { gameId: string; blamedPlayerId: string | null; bothBlamed?: boolean }) => void;
  // Adversarul a ieșit din sală în timpul luptei -> are o perioadă de grație
  // (`deadline`, timestamp absolut) să revină înainte să fie declarat abandon automat.
  // Ceasul lui de șah continuă să curgă normal cât timp lipsește.
  "forfeit:pending": (payload: { gameId: string; playerId: string; deadline: number }) => void;
  // Jucătorul absent a revenit la timp -> anulăm numărătoarea de abandon afișată.
  "forfeit:cancelled": (payload: { gameId: string; playerId: string }) => void;
  // Ceasul de șah al luptei: cât timp (ms) mai are fiecare jucător, cine e la rând
  // acum și de când (ca și clientul să poată număra invers local, în siguranță).
  "battle:clock": (payload: {
    gameId: string;
    clockByPlayer: Record<string, number>;
    currentTurnPlayerId: string | null;
    turnStartedAt: number | null;
  }) => void;
  // Mesaj de chat difuzat tuturor celor din sală (jucători + spectatori).
  "room:chatMessage": (payload: { gameId: string; playerId: string; text: string; at: number }) => void;

  // Un jucător din sala terminată a cerut o revanșă - celălalt primește un
  // dialog de accept/refuz (la fel ca la o provocare directă). Dacă acceptă,
  // se folosește evenimentul existent "matchmaking:matched" (sală nouă, cu
  // aceiași doi jucători) - nu mai e nevoie de un eveniment separat de acceptare.
  "rematch:requested": (payload: { gameId: string; fromPlayerId: string }) => void;
  // Celălalt jucător a refuzat revanșa (sau a plecat din sală între timp).
  "rematch:declined": (payload: { gameId: string }) => void;
  // Trimis jucătorului care (re)intră într-o sală, ca să-și poată reconstrui local
  // starea jocului aflat deja în desfășurare (dacă a ieșit și a revenit, de exemplu).
  "battle:sync": (payload: {
    gameId: string;
    myPlanes: PlanePlacement[] | null;
    readyPlayerIds: string[];
    started: boolean;
    isMyTurn: boolean;
    winnerId: string | null;
    myShots: Shot[];
    incomingShots: Shot[];
    // Avioanele adversarului, populate doar dacă jocul s-a terminat deja (altfel `null`).
    opponentPlanes: PlanePlacement[] | null;
    // Timer state, ca la reconectare clientul să-și poată reconstrui corect
    // numărătoarea inversă (plasare sau ceas de luptă), fără să depindă de
    // propriul ceas local decalat.
    placementDeadline: number | null;
    clockByPlayer: Record<string, number>;
    turnStartedAt: number | null;
  }) => void;
  // Trimis exclusiv unui spectator care tocmai a intrat, ca să-și poată reconstrui
  // local loviturile deja date de ambii jucători (fără să vadă avioanele cât
  // timp jocul e încă în desfășurare).
  "spectator:sync": (payload: {
    gameId: string;
    started: boolean;
    winnerId: string | null;
    shotsByPlayer: Record<string, Shot[]>;
    planesByPlayer: Record<string, PlanePlacement[]> | null;
    placementDeadline: number | null;
    clockByPlayer: Record<string, number>;
    currentTurnPlayerId: string | null;
    turnStartedAt: number | null;
  }) => void;
}
