require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createConnection, dbConfig } = require('./db');

/**
 * Wykonuje skrypt migracji SQL z obsługą idempotencji zarówno dla MariaDB jak i MySQL 8.
 * W MariaDB klauzule IF NOT EXISTS (dla kolumn i indeksów) są natywne.
 * W MySQL 8 klauzula IF NOT EXISTS nie jest wspierana dla ALTER TABLE ADD COLUMN / CREATE INDEX,
 * dlatego sprawdzamy obecność w information_schema przed wykonaniem.
 */
async function executeMigrationSql(connection, sql) {
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
        // 1. Bezpieczne dodawanie kolumn (ALTER TABLE <table> ADD COLUMN IF NOT EXISTS ...)
        const addColMatch = statement.match(/ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?([a-zA-Z0-9_]+)`?\s+(.+)/i)
            || statement.match(/ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD\s+IF\s+NOT\s+EXISTS\s+`?([a-zA-Z0-9_]+)`?\s+(.+)/i);

        if (addColMatch) {
            const [, tableName, colName, colDef] = addColMatch;
            const [cols] = await connection.query(
                'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                [tableName, colName]
            );
            if (cols.length === 0) {
                try {
                    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${colDef}`);
                } catch (err) {
                    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
                        throw err;
                    }
                }
            }
            continue;
        }

        // 2. Bezpieczne tworzenie indeksów (CREATE INDEX IF NOT EXISTS <idx> ON <table> ...)
        const createIdxMatch = statement.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+`?([a-zA-Z0-9_]+)`?\s+ON\s+`?([a-zA-Z0-9_]+)`?\s*\((.+)\)/i);
        if (createIdxMatch) {
            const [, indexName, tableName, colDefs] = createIdxMatch;
            const [idxs] = await connection.query(
                'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
                [tableName, indexName]
            );
            if (idxs.length === 0) {
                try {
                    await connection.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${colDefs})`);
                } catch (err) {
                    if (err.code !== 'ER_DUP_KEYNAME' && err.errno !== 1061) {
                        throw err;
                    }
                }
            }
            continue;
        }

        // 3. Pozostałe polecenia (np. CREATE TABLE IF NOT EXISTS)
        await connection.query(statement);
    }
}

/**
 * Sprawdza czy w katalogu migrations/ znajdują się migracje, które nie zostały jeszcze zaaplikowane w bazie.
 */
async function checkPendingMigrations(pool) {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {
        return [];
    }

    const [tables] = await pool.query(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        ['schema_migrations']
    );

    if (tables.length === 0) {
        return files;
    }

    const [rows] = await pool.query('SELECT wersja FROM schema_migrations');
    const applied = new Set(rows.map(r => r.wersja));
    return files.filter(f => !applied.has(f));
}

/**
 * Uruchamia wszystkie zaległe migracje w kolejności alfabetycznej, każdą w osobnej transakcji.
 */
async function migrate() {
    console.log('--- Uruchamianie migracji bazy danych ---');
    let connection;
    try {
        try {
            connection = await createConnection({ database: undefined, multipleStatements: true });
            await connection.query(
                `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );
            await connection.changeUser({ database: dbConfig.database });
        } catch (err) {
            if (connection) {
                try { await connection.end(); } catch (_) { }
            }
            connection = await createConnection({ database: dbConfig.database, multipleStatements: true });
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                wersja VARCHAR(255) NOT NULL PRIMARY KEY,
                zastosowano_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const [rows] = await connection.query('SELECT wersja FROM schema_migrations');
        const applied = new Set(rows.map(r => r.wersja));

        const migrationsDir = path.join(__dirname, 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.log('ℹ️ Brak katalogu migrations/.');
            return { applied: [], pending: [] };
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        const pending = files.filter(f => !applied.has(f));

        if (pending.length === 0) {
            console.log('ℹ️ Brak nowych migracji do zaaplikowania.');
            return { applied: Array.from(applied), pending: [] };
        }

        const executedNow = [];
        for (const file of pending) {
            console.log(`➡️ Aplikowanie migracji: ${file}...`);
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            await connection.beginTransaction();
            try {
                await executeMigrationSql(connection, sql);
                await connection.query('INSERT INTO schema_migrations (wersja) VALUES (?)', [file]);
                await connection.commit();
                console.log(`✅ Zastosowano migrację: ${file}`);
                executedNow.push(file);
            } catch (err) {
                await connection.rollback();
                console.error(`❌ Błąd podczas aplikacji migracji ${file}:`, err.message);
                throw err;
            }
        }

        console.log('--- Wszystkie migracje zostały pomyślnie zaaplikowane ---');
        return { applied: [...applied, ...executedNow], executedNow };
    } catch (err) {
        console.error('❌ Błąd migracji bazy danych:', err.message);
        if (require.main === module) {
            process.exit(1);
        }
        throw err;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    migrate();
}

module.exports = {
    migrate,
    checkPendingMigrations,
    executeMigrationSql
};
