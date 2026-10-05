require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function seed() {
    console.log('--- Rozpoczynanie inicjalizacji i seedowania bazy danych ---');

    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'serwis_db';
    const port = Number(process.env.DB_PORT) || 3306;

    let connection;
    try {
        // Połączenie bez wybierania bazy, aby upewnić się że baza istnieje
        try {
            connection = await mysql.createConnection({
                host,
                user,
                password,
                port,
                multipleStatements: true
            });
        } catch (connErr) {
            if (connErr.code === 'ER_ACCESS_DENIED_ERROR' && password) {
                console.warn('⚠️ Hasło z .env zostało odrzucone przez MySQL. Łączenie z pustym hasłem...');
                connection = await mysql.createConnection({
                    host,
                    user,
                    password: '',
                    port,
                    multipleStatements: true
                });
            } else {
                throw connErr;
            }
        }

        // Wczytanie i wykonanie schematu
        const schemaPath = path.join(__dirname, 'schemat.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await connection.query(schemaSql);
            console.log('✅ Schemat bazy danych (schemat.sql) został zaaplikowany.');
        }

        await connection.changeUser({ database });

        // Upewnij się, że kolumna username istnieje w tabeli uzytkownicy
        try {
            const [usernameCol] = await connection.query("SHOW COLUMNS FROM uzytkownicy LIKE 'username'");
            if (usernameCol.length === 0) {
                await connection.query("ALTER TABLE uzytkownicy ADD COLUMN username VARCHAR(50) NULL UNIQUE AFTER id");
                await connection.query("UPDATE uzytkownicy SET username = SUBSTRING_INDEX(email, '@', 1) WHERE username IS NULL");
            }
        } catch (migErr) {
            console.warn('Uwaga przy sprawdzaniu kolumny username:', migErr.message);
        }

        // Sprawdzenie czy istnieje użytkownik admin
        const [users] = await connection.query('SELECT id, username, email FROM uzytkownicy WHERE username = ? OR email = ?', ['admin', 'admin@serwis.pl']);
        
        if (users.length === 0) {
            const defaultPassword = 'admin123';
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

            await connection.query(
                'INSERT INTO uzytkownicy (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                ['admin', 'admin@serwis.pl', passwordHash, 'admin']
            );
            console.log('✅ Utworzono domyślne konto administratora:');
            console.log('   Nazwa użytkownika: admin');
            console.log('   Email: admin@serwis.pl');
            console.log(`   Hasło: ${defaultPassword}`);
        } else {
            if (!users[0].username) {
                await connection.query("UPDATE uzytkownicy SET username = 'admin' WHERE id = ?", [users[0].id]);
            }
            console.log('ℹ️ Konto administratora (login: admin) już istnieje w bazie.');
        }

        // Inicjalizacja tabeli zgłoszeń (bez domyślnych danych testowych)
        console.log('ℹ️ Tabela zgłoszeń gotowa na nowe zgłoszenia.');

        console.log('--- Zakończono seedowanie pomyślnie ---');
    } catch (err) {
        console.error('❌ Błąd podczas seedowania bazy danych:', err);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seed();
