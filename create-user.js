/**
 * create-user.js
 * Skrypt CLI do tworzenia użytkowników z poprawnie zahaszowanym hasłem.
 *
 * Użycie:
 *   node create-user.js <email> <haslo> [rola]
 *
 * Przykład:
 *   node create-user.js pracownik@serwis.pl MojeHaslo123 admin
 *   node create-user.js jan@serwis.pl Tajne456 pracownik
 *
 * Dostępne role: admin, pracownik (domyślnie: pracownik)
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const [,, email, password, role = 'pracownik'] = process.argv;

if (!email || !password) {
    console.error('❌ Użycie: node create-user.js <email> <haslo> [rola]');
    console.error('   Przykład: node create-user.js jan@serwis.pl Haslo123 pracownik');
    process.exit(1);
}

const allowedRoles = ['admin', 'pracownik'];
if (!allowedRoles.includes(role)) {
    console.error(`❌ Nieprawidłowa rola: "${role}". Dostępne: admin, pracownik`);
    process.exit(1);
}

async function createUser() {
    let conn;
    try {
        // Próba połączenia z hasłem z .env, fallback na puste hasło
        try {
            conn = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '5476',
                database: process.env.DB_NAME || 'serwis_db',
            });
        } catch (err) {
            if (err.code === 'ER_ACCESS_DENIED_ERROR') {
                conn = await mysql.createConnection({
                    host: process.env.DB_HOST || 'localhost',
                    user: process.env.DB_USER || 'root',
                    password: '',
                    database: process.env.DB_NAME || 'serwis_db',
                });
            } else {
                throw err;
            }
        }

        // Sprawdź czy email już istnieje
        const [existing] = await conn.query(
            'SELECT id FROM uzytkownicy WHERE email = ?',
            [email.trim()]
        );

        if (existing.length > 0) {
            console.error(`❌ Użytkownik o emailu "${email}" już istnieje w bazie.`);
            process.exit(1);
        }

        // Hashowanie hasła
        console.log('🔐 Hashowanie hasła...');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Zapis do bazy
        const [result] = await conn.query(
            'INSERT INTO uzytkownicy (email, password_hash, role) VALUES (?, ?, ?)',
            [email.trim(), hashedPassword, role]
        );

        console.log('✅ Użytkownik utworzony pomyślnie!');
        console.log(`   ID:    ${result.insertId}`);
        console.log(`   Email: ${email.trim()}`);
        console.log(`   Rola:  ${role}`);
        console.log('');
        console.log('Możesz teraz zalogować się tymi danymi w panelu pracownika.');

    } catch (err) {
        console.error('❌ Błąd:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

createUser();
