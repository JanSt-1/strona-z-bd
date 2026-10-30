require('dotenv').config();
const { migrate } = require('./migrate');

async function seed() {
    console.log('--- Rozpoczynanie inicjalizacji i seedowania bazy danych ---');
    try {
        await migrate();
        console.log('ℹ️ Tabele bazy danych są gotowe. Użytkowników twórz za pomocą: node create-user.js');
        console.log('ℹ️ Tabela zgłoszeń gotowa na nowe zgłoszenia.');
        console.log('--- Zakończono seedowanie pomyślnie ---');
    } catch (err) {
        console.error('❌ Błąd podczas seedowania bazy danych:', err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    seed();
}

module.exports = { seed };