# Flight

Joc online 1v1 tip "Avioane" (echivalent Battleship românesc).

## Stack
- **Web:** React + Vite + TypeScript
- **Server:** Node.js + Express + Socket.io
- **DB:** MySQL (Docker pentru dev local)
- **Monorepo:** Turborepo + npm workspaces

## Structură
```
apps/
  server/       Node.js + Express + Socket.io
  web/          React (Vite)
packages/
  game-logic/   Regulile jocului, partajate server + client
  locales/      Traduceri RO (default) / EN
  types/        Tipuri TypeScript partajate (User, Game, Move, Socket events)
```

## Dezvoltare locală

1. Instalează dependențele:
   ```bash
   npm install
   ```
2. Pornește MySQL local (Docker):
   ```bash
   npm run db:up
   ```
3. Copiază `.env.example` în `.env` în `apps/server`. Pentru acces din rețeaua locală,
   adaugă la `CLIENT_ORIGIN` adresa IP a calculatorului pe portul `5173` (de exemplu
   `http://192.168.50.180:5173`).
4. Pornește server + web în paralel:
   ```bash
   npm run dev
   ```
   - Web: http://localhost:5173
   - Server: http://localhost:4000

## Oprire MySQL
```bash
npm run db:down
```

## Reguli meci online (timpi/ieșiri din sală)

- **Plasare avioane:** fereastră comună de **30s** pentru ambii jucători. Dacă unul
  singur nu apasă "Gata" la timp, e scos automat din sală și meciul se anulează
  pentru amândoi (id-ul de sală devine invalid, nu mai poate fi reintrat de niciunul).
  Dacă niciunul nu apasă "Gata", ambii sunt redirecționați automat pe homepage.
- **Ceas de luptă (chess clock):** fiecare jucător are **5 minute** în total, care
  scad DOAR cât timp e rândul lui să tragă. Dacă îi expiră timpul pe propria mutare,
  pierde automat.
- **Ieșire din sală înainte ca lupta să înceapă** (în timpul fazei de plasare):
  invalidează definitiv id-ul de sală — jucătorul care a ieșit nu mai poate reintra,
  și nici adversarul nu mai poate fi repartizat acolo prin matchmaking. Cât unul
  dintre jucători lipsește din sală în această fază, celuilalt i se dezactivează
  avioanele/butoanele (nu mai poate continua plasarea) și i se afișează un mesaj
  cu opțiunea de a încerca un meci nou.
- **Ieșire din sală în timpul luptei:** un jucător poate ieși din sală de **maxim 3
  ori** per meci. Cele 3 ieșiri împart un buget comun de **30s de grație** (nu 30s
  la fiecare ieșire) — de exemplu, dacă la prima ieșire stă afară 5s și revine la
  timp, la a doua ieșire mai are doar 25s din buget înainte să fie declarat abandon.
  Dacă bugetul de 30s se epuizează fără să revină, sau dacă iese a **4-a oară**,
  pierde automat meciul (abandon). Adversarul rămas în sală vede o numărătoare
  inversă (🔌) cu timpul rămas din bugetul de grație până la abandonul automat.
  Bugetul de ieșiri/grație se resetează complet la finalul fiecărui meci.
- **Ceasul de luptă în timpul unei ieșiri:** dacă jucătorul care iese NU este cel
  aflat la rând, ceasul jucătorului rămas (aflat la rând) intră în pauză cât timp
  adversarul lipsește, ca să nu piardă timp din propriile 5 minute; se repornește
  exact de unde a rămas dacă adversarul revine la timp. Dacă cel care iese este
  chiar cel aflat la rând, propriul lui ceas continuă să curgă normal (penalizare
  pentru că a plecat pe propria mutare).

## Layout responsive `.game-room`

Pagina de joc (`GameRoom.tsx` + `styles.css`) folosește 3 coloane: două grid-uri de joc
(`.game-room__board-col` + `.game-room__extra-col`, în `.game-room__work-row`, învelite în
`.game-room__main`) și sidebar-ul de notificări (`.game-room__sidebar`). Layout-ul e construit
ca o secvență de breakpointuri explicite (px fix, nu round numbers), fiecare rezolvând exact
un caz de "nu mai încape". **Nu rotunji breakpointurile** — sunt calculate exact din sumele de
lățimi de mai jos.

### Dimensiuni cheie
| Element | Max | Min |
|---|---|---|
| fiecare grid (`board-col` / `extra-col`) | 420px | 326px |
| `game-room__work-row` (2 griduri + 20px gap) | 860px | 672px |
| `game-room__sidebar` | 320px | 300px |
| meniu stânga (`app-sidebar`, altă componentă) | 172px | 64px (icon-only, breakpoint la 1250px) |

### Secvența breakpointurilor (de sus în jos = de la ecran mare la ecran mic)

```
 ≥1419px   [ grid 420 ][20][ grid 420 ]  [20]  [ sidebar 320 ]   ← toate la maxim, centrat (1200px total)
           └──────────── work-row 860px ───────────┘

1399-1418  [ grid 420 ][20][ grid 420 ]  [20]  [ sidebar 320→300 ]   ← doar sidebar se micsoreaza
           └──────────── work-row 860px (fix) ─────┘

1103-1398  [ grid 420→326 ][20][ grid 420→326 ]  [20]  [ sidebar 300 ]  ← sidebar la minim (fix),
           └────── work-row 860px→672px ─────┘                            gridurile se micsoreaza

 ≤1102px   sidebarul SARE pe linia de dedesubt (flex-wrap: wrap se activeaza doar sub acest prag)

  971-1102 [ grid 420 ][20][ grid 420 ]           ← linia 1: gridurile la maxim (860px)
           [        sidebar 320         ]         ← linia 2: sidebar la maxim, sub griduri

  784-970  [ grid 420→326 ][20][ grid 420→326 ]   ← linia 1: gridurile se micsoreaza (860→672px)
           [        sidebar 320         ]         ← linia 2: sidebar ramane la maxim

  ≤783px   [        grid 326-420 (max 420, width 100%)        ]   ← linia 1: primul grid
           [        grid 326-420 (max 420, width 100%)        ]   ← linia 2: al doilea grid (sub primul)
           [               sidebar 320                        ]   ← linia 3: sidebar
           (toate centrate orizontal — align-items: center pe .game-room__work-row)
```

### Reguli importante de reținut (bug-uri deja rezolvate, nu le reintroduce)
- `.game-room` trebuie sa fie `flex-wrap: nowrap` implicit, cu `wrap` activat **doar** in
  `@media (max-width: 1102px)`. Motiv: `flex-wrap` decide impachetarea pe baza `flex-basis`-ului
  (marimea inainte de shrink), nu pe latimea finala micsorata — daca `wrap` era mereu activ,
  sidebar-ul sarea pe linia noua prea devreme, inainte sa apuce sa se micsoreze la 300px.
- `.game-room__main` are nevoie de un `flex-basis` numeric explicit (`flex: 1 1 860px`), nu
  `flex: 0 1 auto` / `0 0 auto` — altfel Chromium calculeaza latimea copiilor dupa min-content
  si gridurile se prabusesc la ~373px in loc de 420px.
- Orice media query nou adaugat pentru `.game-room__sidebar` trebuie plasat **dupa** regula de
  baza `.game-room__sidebar { ... }` in fisier — CSS cascade: la aceeasi specificitate, regula
  declarata mai jos in fisier castiga, indiferent de breakpoint.
- Breakpoint-ul de 1250px pentru grid-uri/sidebar e aliniat intentionat cu breakpoint-ul
  existent al meniului din stanga (`.app-sidebar`, tot la 1250px) — cand meniul se ingusteaza
  la 64px, se elibereaza spatiu suplimentar pentru `.game-room`.
