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
