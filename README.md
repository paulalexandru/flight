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
3. Copiază `.env.example` în `.env` în `apps/server` și ajustează dacă e nevoie.
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
