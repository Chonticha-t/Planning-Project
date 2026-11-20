const { Pool } = require("pg");

/** A non-negative integer from the environment, or the fallback. 0 disables the timeouts below. */
const envInt = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};

//pool_database
const pool_smart = new Pool({
  host: process.env.POSTGRES_HOST_NAME_10_17_87_244,
  port: process.env.POSTGRES_PORTS_10_17_87_244,
  user: process.env.POSTGRES_USER_NAME_10_17_87_244,
  password: process.env.POSTGRES_PASSWORD_10_17_87_244,
  database: process.env.POSTGRES_DATABASE_NAME_10_17_87_244 || "smart",
  // Same size as the pg default; raise only together with the database's max_connections.
  max: envInt("PLANNING_DB_POOL_MAX", 10) || 10,
  idleTimeoutMillis: envInt("PLANNING_DB_IDLE_TIMEOUT_MS", 30000),
  // Fail a request that waits this long for a free connection instead of hanging indefinitely.
  connectionTimeoutMillis: envInt("PLANNING_DB_CONNECT_TIMEOUT_MS", 15000),
  // Server-side limits per session; a route can still lower them with SET LOCAL (In Gate uses 8s).
  statement_timeout: envInt("PLANNING_DB_STATEMENT_TIMEOUT_MS", 60000),
  idle_in_transaction_session_timeout: envInt("PLANNING_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 60000),
});

pool_smart.on("error", (err) => {
  console.error("Unexpected error on idle client (pool_smart):", err.message);
});

module.exports = { pool_smart };
