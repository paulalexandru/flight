import { Router } from "express";
import { getGameHistoryForPlayer, getMovesForGame } from "../db/gamesRepository";

export const historyRouter = Router();

historyRouter.get("/players/:playerId/games", async (req, res) => {
  try {
    const games = await getGameHistoryForPlayer(req.params.playerId);
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: "Nu s-a putut încărca istoricul.", error: (error as Error).message });
  }
});

historyRouter.get("/games/:gameId/moves", async (req, res) => {
  try {
    const moves = await getMovesForGame(req.params.gameId);
    res.json(moves);
  } catch (error) {
    res.status(500).json({ message: "Nu s-au putut încărca mutările.", error: (error as Error).message });
  }
});
