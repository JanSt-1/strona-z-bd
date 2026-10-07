require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('Brak JWT_SECRET w .env – nie startuję.');
    process.exit(1);
}

// Test połączenia z bazą danych przy starcie serwera
(async () => {
    try {
        const pool = app.getPool();
        const connection = await pool.getConnection();
        console.log('✅ Połączono z bazą danych MySQL (serwis_db).');

        // Upewniamy się, że tabela zgloszenia posiada wszystkie wymagane kolumny
        const columnsToCheck = [
            { name: 'nazwa_firmy', def: 'VARCHAR(100)' },
            { name: 'kod_pocztowy', def: 'VARCHAR(6) NOT NULL DEFAULT "00-000"' },
            { name: 'miasto', def: 'VARCHAR(100) NOT NULL DEFAULT ""' },
            { name: 'wojewodztwo', def: 'VARCHAR(50) NOT NULL DEFAULT ""' },
            { name: 'przedmiot_zgloszenia', def: 'VARCHAR(100) NOT NULL DEFAULT ""' },
            { name: 'numer_seryjny', def: 'VARCHAR(100)' },
            { name: 'data_zakupu', def: 'DATE NOT NULL DEFAULT "2026-01-01"' },
            { name: 'nip', def: 'VARCHAR(10) NOT NULL DEFAULT ""' },
            { name: 'przypisany_pracownik_id', def: 'INT NULL' },
            { name: 'opis_naprawy', def: 'TEXT NULL' },
            { name: 'opis_naprawy_data', def: 'DATETIME NULL' },
            { name: 'data_wyslania', def: 'DATETIME NULL' },
            { name: 'numer_listu', def: "VARCHAR(100) NULL" }
        ];

        for (const col of columnsToCheck) {
            try {
                await connection.query(`ALTER TABLE zgloszenia ADD COLUMN ${col.name} ${col.def}`);
            } catch (alterErr) {
                // Kod ER_DUP_FIELDNAME oznacza, że kolumna już istnieje
            }
        }

        // Zapewnienie, że kolumna status akceptuje status 'do_wysylki'
        try {
            await connection.query("ALTER TABLE zgloszenia MODIFY COLUMN status VARCHAR(50) DEFAULT 'nowe'");
        } catch (statusErr) {
            // Ignorujemy błędy przy modyfikacji typu kolumny status
        }

        connection.release();
    } catch (err) {
        console.error('❌ Błąd połączenia z bazą MySQL:', err.message);
        process.exit(1);
    }

    // Uruchomienie serwera HTTP
    app.listen(PORT, () => {
        console.log(`🚀 Serwer Express.js działa na http://localhost:${PORT}`);
        console.log(`📡 Dostępne endpointy:`);
        console.log(`   - POST   http://localhost:${PORT}/api/zgloszenia (publiczny)`);
        console.log(`   - POST   http://localhost:${PORT}/api/login (publiczny, generuje JWT)`);
        console.log(`   - GET    http://localhost:${PORT}/api/zgloszenia (chroniony, wymaga JWT)`);
        console.log(`   - PATCH  http://localhost:${PORT}/api/zgloszenia/:id/status (chroniony, wymaga JWT)`);
        console.log(`   - DELETE http://localhost:${PORT}/api/zgloszenia/:id (chroniony, wymaga JWT)`);
    });
})();
