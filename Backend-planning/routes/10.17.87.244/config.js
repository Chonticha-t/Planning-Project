const { Pool } = require("pg");

//pool_database
const pool_smart = new Pool({
  host: process.env.POSTGRES_HOST_NAME_10_17_87_244,
  port: process.env.POSTGRES_PORTS_10_17_87_244,
  user: process.env.POSTGRES_USER_NAME_10_17_87_244,
  password: process.env.POSTGRES_PASSWORD_10_17_87_244,
  database: process.env.POSTGRES_DATABASE_NAME_10_17_87_244 || "smart",
});

pool_smart.on("error", (err) => {
  console.error("Unexpected error on idle client (pool_smart):", err.message);
});

module.exports = { pool_smart };
