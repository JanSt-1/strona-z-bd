require('dotenv').config();

const { validateJwtSecret } = require('./jwt-validation');

const jwtValidation = validateJwtSecret(process.env.JWT_SECRET);
if (!jwtValidation.valid) {
    console.error(`❌ Błąd konfiguracji JWT: ${jwtValidation.reason}`);
    console.error('Wygeneruj bezpieczny, co najmniej 32-znakowy klucz poleceniem:');
    console.error('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

const app = require('./app');
const { checkPendingMigrations } = require('./migrate');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

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

        app.listen(PORT, HOST, () => console.log(`🚀 Serwer Express.js działa na http://${HOST}:${PORT}`));
    } catch (err) {
        console.error('❌ Błąd połączenia z bazą MySQL:', err.message);
        process.exit(1);
    }
})();

