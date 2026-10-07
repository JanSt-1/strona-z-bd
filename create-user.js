/**
 * create-user.js
 * Skrypt CLI do tworzenia użytkowników z poprawnie zahaszowanym hasłem.
 *
 * Użycie:
 *   node create-user.js <nazwa_uzytkownika> <haslo> [rola]
 *
 * Przykład:
 *   node create-user.js uzytkownik Haslo123 pracownik
 *   node create-user.js serwisant Tajne456 admin
 *
 * Dostępne role: admin, pracownik, serwisant, magazynier (domyślnie: pracownik)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const [, , username, password, role = 'pracownik'] = process.argv;

if (!username || !password) {
    console.error('❌ Użycie: node create-user.js <nazwa_uzytkownika> <haslo> [rola]');
    console.error('   Przykład: node create-user.js janek Haslo123 pracownik');
    process.exit(1);
}

const allowedRoles = ['admin', 'pracownik', 'serwisant', 'magazynier'];
if (!allowedRoles.includes(role)) {
    console.error(`❌ Nieprawidłowa rola: "${role}". Dostępne: admin, pracownik, serwisant, magazynier`);
    process.exit(1);
}

async function createUser() {
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'serwis_db',
        });

        // Sprawdź czy username już istnieje
        const [existing] = await conn.query(
            'SELECT id FROM uzytkownicy WHERE username = ?',
            [username.trim()]
        );

        if (existing.length > 0) {
            console.error(`❌ Użytkownik o nazwie "${username}" już istnieje w bazie.`);
            process.exit(1);
        }

        // Hashowanie hasła
        console.log('🔐 Hashowanie hasła...');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Zapis do bazy
        const [result] = await conn.query(
            'INSERT INTO uzytkownicy (username, password_hash, role) VALUES (?, ?, ?)',
            [username.trim(), hashedPassword, role]
        );

        console.log('✅ Użytkownik utworzony pomyślnie!');
        console.log(`   ID:        ${result.insertId}`);
        console.log(`   Username:  ${username.trim()}`);
        console.log(`   Rola:      ${role}`);
        console.log('');
        console.log('Możesz teraz zalogować się nazwą użytkownika w panelu pracownika.');

    } catch (err) {
        console.error('❌ Błąd:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

createUser();

