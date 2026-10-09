require('dotenv').config();
const mysql = require('mysql2/promise');
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
        connection = await mysql.createConnection({
            host,
            user,
            password,
            port,
            multipleStatements: true
        });

        // Wczytanie i wykonanie schematu
        const schemaPath = path.join(__dirname, 'schemat.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await connection.query(schemaSql);
            console.log('✅ Schemat bazy danych (schemat.sql) został zaaplikowany.');
        }

        await connection.changeUser({ database });

        // Inicjalizacja tabeli użytkowników i zgłoszeń (użytkownicy tworzeni są przez create-user.js)
        console.log('ℹ️ Tabele bazy danych są gotowe. Użytkowników twórz za pomocą: node create-user.js');

        // Inicjalizacja tabeli zgłoszeń (bez domyślnych danych testowych)
        console.log('ℹ️ Tabela zgłoszeń gotowa na nowe zgłoszenia.');

        console.log('--- Zakończono seedowanie pomyślnie ---');
    } catch (err) {
        console.error('❌ Błąd podczas seedowania bazy danych:', err.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

seed();