require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * db.js
 * Centralna konfiguracja połączenia z bazą danych MySQL.
 * Używana wspólnie przez app.js, seed.js, config-testowy.js oraz create-user.js.
 */
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'serwis_db',
    port: Number(process.env.DB_PORT) || 3306,
};

/** Tworzy pulę połączeń (używaną przez Express w app.js). */
const createPool = (overrides = {}) =>
    mysql.createPool({ ...dbConfig, waitForConnections: true, connectionLimit: 10, queueLimit: 0, ...overrides });

/** Tworzy pojedyncze połączenie (używane przez skrypty CLI: seed.js, config-testowy.js, create-user.js). */
const createConnection = (overrides = {}) =>
    mysql.createConnection({ ...dbConfig, ...overrides });

module.exports = { dbConfig, createPool, createConnection };

