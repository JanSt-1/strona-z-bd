/**
 * fix-passwords.js
 * Skrypt jednorazowy: zahashuje hasła użytkowników przechowywanych jako plaintext.
 * Uruchom: node fix-passwords.js
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'serwis_db',
};

async function fixPasswords() {
  const conn = await mysql.createConnection(DB_CONFIG).catch(async (err) => {
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      return mysql.createConnection({ ...DB_CONFIG, password: '5476' });
    }
    throw err;
  });

  const [rows] = await conn.query('SELECT id, email, password_hash FROM uzytkownicy');

  let fixed = 0;
  for (const row of rows) {
    const isHashed =
      row.password_hash &&
      (row.password_hash.startsWith('$2a$') ||
        row.password_hash.startsWith('$2b$') ||
        row.password_hash.startsWith('$2y$'));

    if (!isHashed && row.password_hash) {
      console.log(`Hashowanie hasła dla: ${row.email}`);
      const hashed = await bcrypt.hash(row.password_hash, 10);
      await conn.query('UPDATE uzytkownicy SET password_hash = ? WHERE id = ?', [hashed, row.id]);
      fixed++;
    }
  }

  await conn.end();
  console.log(`Gotowe! Zahashowano ${fixed} haseł.`);
}

fixPasswords().catch((err) => {
  console.error('Błąd:', err.message);
  process.exit(1);
});
