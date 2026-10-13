require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * db.js
 * Centralna konfiguracja połączenia z bazą danych MySQL.
 * Używana wspólnie przez app.js, seed.js oraz create-user.js.
 */
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'serwis_db',
    port: Number(process.env.DB_PORT) || 3306,
};

/**
 * Tworzy pulę połączeń (używaną przez Express w app.js).
 */
function createPool(overrides = {}) {
    return mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ...overrides
    });
}

/**
 * Tworzy pojedyncze połączenie (używane przez skrypty CLI: seed.js, create-user.js).
 */
async function createConnection(overrides = {}) {
    return await mysql.createConnection({
        ...dbConfig,
        ...overrides
    });
}

module.exports = {
    dbConfig,
    createPool,
    createConnection
};
