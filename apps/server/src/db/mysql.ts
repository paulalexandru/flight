import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "flight",
  password: process.env.MYSQL_PASSWORD ?? "flight",
  database: process.env.MYSQL_DATABASE ?? "flight",
  waitForConnections: true,
  connectionLimit: 10,
});

export async function pingDatabase(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT 1");
  } finally {
    connection.release();
  }
}
