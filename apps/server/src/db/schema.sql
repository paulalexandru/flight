-- Schema inițială pentru "Flight" (joc Avioane).
-- Rulează manual sau printr-un script de migrare (ex: npm run db:migrate, de adăugat ulterior).

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rating INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) PRIMARY KEY,
  player1_id CHAR(36) NOT NULL,
  player2_id CHAR(36) NULL,
  status ENUM('waiting', 'placing', 'in_progress', 'finished') NOT NULL DEFAULT 'waiting',
  winner_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  FOREIGN KEY (player1_id) REFERENCES users(id),
  FOREIGN KEY (player2_id) REFERENCES users(id),
  FOREIGN KEY (winner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS moves (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  player_id CHAR(36) NOT NULL,
  row_index TINYINT NOT NULL,
  col_index TINYINT NOT NULL,
  result ENUM('hit', 'miss', 'sunk') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id),
  FOREIGN KEY (player_id) REFERENCES users(id)
);
