const { Pool } = require("pg");
require("dotenv").config({ override: true });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

pool.connect()
    .then(() => {
        console.log("PostgreSQL connected successfully!");
    })
    .catch((error) => {
        console.error("PostgreSQL connection failed:", error.message);
    });

module.exports = pool;