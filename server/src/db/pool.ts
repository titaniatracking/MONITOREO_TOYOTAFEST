import mysql from "mysql2/promise";
import { config } from "../config";

export function createServerPool(database?: string) {
  return mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
  });
}

export const pool = createServerPool(config.db.database);
