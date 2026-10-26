require('dotenv').config();

if (!process.env.JWT_SECRET) {
    console.error('❌ Brak JWT_SECRET w .env – nie startuję.');
    process.exit(1);
}

const app = require('./app');
const { checkPendingMigrations } = require('./migrate');
const PORT = process.env.PORT || 3000;

// Test połączenia z bazą danych przy starcie serwera, weryfikacja migracji i uruchomienie HTTP
(async () => {
    try {
        const connection = await app.getPool().getConnection();
        connection.release();
        console.log('✅ Połączono z bazą danych MySQL.');

        const pending = await checkPendingMigrations(app.getPool());
        if (pending.length > 0) {
            console.error(`❌ Wykryto niezastosowane migracje bazy danych (${pending.join(', ')}). Uruchom: npm run migrate`);
            process.exit(1);
        }

        app.listen(PORT, () => console.log(`🚀 Serwer Express.js działa na http://localhost:${PORT}`));
    } catch (err) {
        console.error('❌ Błąd połączenia z bazą MySQL:', err.message);
        process.exit(1);
    }
})();

