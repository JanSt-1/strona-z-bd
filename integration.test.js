const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
if (!process.env.DB_NAME) {
    process.env.DB_NAME = 'serwis_db_test';
}

if (process.env.DB_NAME === 'serwis_db') {
    console.error('❌ Nie wolno uruchamiać testów integracyjnych na bazie produkcyjnej (DB_NAME=serwis_db)! Użyj DB_NAME=serwis_db_test.');
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
}

const app = require('./app');
const { createConnection, dbConfig } = require('./db');
const { migrate, checkPendingMigrations, executeMigrationSql } = require('./migrate');

const makeToken = (role, id = 1, username = 'test_user') =>
    jwt.sign({ id, username, role }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

// Test sprawdzający czy baza danych jest osiągalna
(async () => {
    let isDbConnected = false;
    let pool;
    try {
        const testConn = await createConnection({ database: undefined });
        await testConn.query('SELECT 1');
        await testConn.end();
        isDbConnected = true;
    } catch (err) {
        isDbConnected = false;
        if (process.env.CI) {
            console.error('❌ Baza danych w środowisku CI nie jest dostępna!', err.message);
        }
    }

    describe('Testy integracyjne z prawdziwą bazą danych MySQL/MariaDB', { skip: !isDbConnected }, () => {
        let dbConnection;
        let adminUser, pracownikUser, serwisantUser, magazynierUser;
        let adminToken, pracownikToken, serwisantToken, magazynierToken;

        before(async () => {
            // Uruchomienie pełnych migracji bazy danych
            await migrate();

            pool = app.getPool();
            dbConnection = await pool.getConnection();

            // Czyszczenie tabel przed testami
            await dbConnection.query('DELETE FROM historia_zgloszen');
            await dbConnection.query('DELETE FROM zgloszenia');
            await dbConnection.query('DELETE FROM uzytkownicy');

            const passwordHash = await bcrypt.hash('HasloTestowe123!', 10);

            const [resAdmin] = await dbConnection.query(
                'INSERT INTO uzytkownicy (username, password_hash, role, aktywny) VALUES (?, ?, ?, 1)',
                ['admin_db', passwordHash, 'admin']
            );
            adminUser = { id: resAdmin.insertId, username: 'admin_db', role: 'admin' };
            adminToken = makeToken('admin', adminUser.id, adminUser.username);

            const [resPracownik] = await dbConnection.query(
                'INSERT INTO uzytkownicy (username, password_hash, role, aktywny) VALUES (?, ?, ?, 1)',
                ['pracownik_db', passwordHash, 'pracownik']
            );
            pracownikUser = { id: resPracownik.insertId, username: 'pracownik_db', role: 'pracownik' };
            pracownikToken = makeToken('pracownik', pracownikUser.id, pracownikUser.username);

            const [resSerwisant] = await dbConnection.query(
                'INSERT INTO uzytkownicy (username, password_hash, role, aktywny) VALUES (?, ?, ?, 1)',
                ['serwisant_db', passwordHash, 'serwisant']
            );
            serwisantUser = { id: resSerwisant.insertId, username: 'serwisant_db', role: 'serwisant' };
            serwisantToken = makeToken('serwisant', serwisantUser.id, serwisantUser.username);

            const [resMagazynier] = await dbConnection.query(
                'INSERT INTO uzytkownicy (username, password_hash, role, aktywny) VALUES (?, ?, ?, 1)',
                ['magazynier_db', passwordHash, 'magazynier']
            );
            magazynierUser = { id: resMagazynier.insertId, username: 'magazynier_db', role: 'magazynier' };
            magazynierToken = makeToken('magazynier', magazynierUser.id, magazynierUser.username);
        });

        after(async () => {
            if (dbConnection) {
                dbConnection.release();
            }
        });

        it('1. Migracje: tabela schema_migrations zawiera wszystkie zaaplikowane wersje', async () => {
            const [rows] = await dbConnection.query('SELECT wersja FROM schema_migrations ORDER BY wersja ASC');
            const versions = rows.map(r => r.wersja);

            assert.ok(versions.includes('001_init.sql'), 'Brak 001_init.sql w schema_migrations');
            assert.ok(versions.includes('002_aktualizacja_kolumn_i_indeksow.sql'), 'Brak 002_aktualizacja_kolumn_i_indeksow.sql w schema_migrations');
            assert.ok(versions.includes('003_historia_szczegoly_mediumtext.sql'), 'Brak 003_historia_szczegoly_mediumtext.sql w schema_migrations');

            const pending = await checkPendingMigrations(pool);
            assert.strictEqual(pending.length, 0, 'Oczekiwano 0 oczekujących migracji');
        });

        it('2. Indeks na historia_zgloszen(zgloszenie_id) istnieje i zapobiega full-table scan', async () => {
            const [stats] = await dbConnection.query(
                'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                ['historia_zgloszen', 'zgloszenie_id']
            );
            assert.ok(stats.length > 0, 'Brak indeksu dla kolumny zgloszenie_id w tabeli historia_zgloszen');

            // Weryfikacja planu wykonania zapytania (EXPLAIN)
            const [explainRows] = await dbConnection.query('EXPLAIN SELECT * FROM historia_zgloszen WHERE zgloszenie_id = 99999');
            const plan = explainRows[0];
            assert.notStrictEqual(plan.type, 'ALL', 'Zapytanie po zgloszenie_id nie powinno wykonywać pełnego skanowania tabeli (ALL)');
            assert.ok(plan.key !== null, 'Zapytanie powinno wykorzystywać utworzony indeks');
        });

        it('3. Cały cykl życia zgłoszenia serwisowego przez HTTP z zapisem w bazie danych', async () => {
            // A. Utworzenie zgłoszenia przez klienta
            const newTicketData = {
                imie: 'Jan',
                nazwisko: 'Kowalski',
                nazwa_firmy: 'Kowalski Dev Sp. z o.o.',
                adres: 'ul. Marszałkowska 10/2',
                kod_pocztowy: '00-001',
                miasto: 'Warszawa',
                numer_telefonu: '500600700',
                telefon_stacjonarny: '228889900',
                email: 'jan@kowalski.pl',
                opis_usterki: 'Laptop wyłącza się pod obciążeniem po 5 minutach pracy.',
                numer_fv: 'FV/2026/10/01',
                nip: '5252525252',
                przedmiot_zgloszenia: 'Laptop Dell XPS 15',
                numer_seryjny: 'DELL-SN-12345',
                data_zakupu: '2025-05-10',
                zgoda_rodo: true
            };

            const resCreate = await request(app)
                .post('/api/zgloszenia')
                .send(newTicketData);

            assert.strictEqual(resCreate.status, 201);
            const ticketId = resCreate.body.id;
            assert.ok(ticketId > 0);

            // Sprawdzenie w tabeli zgloszenia
            const [ticketsDb] = await dbConnection.query('SELECT * FROM zgloszenia WHERE id = ?', [ticketId]);
            assert.strictEqual(ticketsDb.length, 1);
            const ticket = ticketsDb[0];
            assert.strictEqual(ticket.imie, 'Jan');
            assert.strictEqual(ticket.telefon_stacjonarny, '228889900');
            assert.strictEqual(ticket.status, 'nowe');
            assert.ok(ticket.zgoda_rodo_data !== null);

            // Sprawdzenie w tabeli historia_zgloszen
            const [historia1] = await dbConnection.query('SELECT * FROM historia_zgloszen WHERE zgloszenie_id = ?', [ticketId]);
            assert.strictEqual(historia1.length, 1);
            assert.strictEqual(historia1[0].akcja, 'utworzenie');
            assert.strictEqual(historia1[0].na_status, 'nowe');

            // B. Przypisanie pracownika (PATCH /api/zgloszenia/:id/przypisz)
            const resAssign = await request(app)
                .patch(`/api/zgloszenia/${ticketId}/przypisz`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: pracownikUser.id });

            assert.strictEqual(resAssign.status, 200);

            const [ticketsAfterAssign] = await dbConnection.query('SELECT status, przypisany_pracownik_id FROM zgloszenia WHERE id = ?', [ticketId]);
            assert.strictEqual(ticketsAfterAssign[0].status, 'w_realizacji');
            assert.strictEqual(ticketsAfterAssign[0].przypisany_pracownik_id, pracownikUser.id);

            // C. Opisanie i zakończenie naprawy (PATCH /api/zgloszenia/:id/naprawione)
            const resRepair = await request(app)
                .patch(`/api/zgloszenia/${ticketId}/naprawione`)
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Wymieniono pastę termoprzewodzącą i wentylator chłodzenia CPU.' });

            assert.strictEqual(resRepair.status, 200);

            const [ticketsAfterRepair] = await dbConnection.query('SELECT status, opis_naprawy, opis_naprawy_data FROM zgloszenia WHERE id = ?', [ticketId]);
            assert.strictEqual(ticketsAfterRepair[0].status, 'do_wysylki');
            assert.strictEqual(ticketsAfterRepair[0].opis_naprawy, 'Wymieniono pastę termoprzewodzącą i wentylator chłodzenia CPU.');
            assert.ok(ticketsAfterRepair[0].opis_naprawy_data !== null);

            // D. Wpisanie numeru listu i zakończenie zlecenia przez magazyniera (PATCH /api/zgloszenia/:id/status)
            const resShip = await request(app)
                .patch(`/api/zgloszenia/${ticketId}/status`)
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'PL-DPD-99887766' });

            assert.strictEqual(resShip.status, 200);

            const [ticketsFinal] = await dbConnection.query('SELECT status, numer_listu, data_wyslania FROM zgloszenia WHERE id = ?', [ticketId]);
            assert.strictEqual(ticketsFinal[0].status, 'zakończone');
            assert.strictEqual(ticketsFinal[0].numer_listu, 'PL-DPD-99887766');
            assert.ok(ticketsFinal[0].data_wyslania !== null);

            // E. Weryfikacja kompletnej historii zgłoszenia w bazie
            const [historiaAll] = await dbConnection.query('SELECT akcja, na_status FROM historia_zgloszen WHERE zgloszenie_id = ? ORDER BY id ASC', [ticketId]);
            assert.strictEqual(historiaAll.length, 4);
            assert.deepStrictEqual(historiaAll.map(h => h.akcja), ['utworzenie', 'przypisanie', 'naprawa', 'wysyłka']);
        });

        it('4. Długi polski tekst ze znakami diakrytycznymi i emoji zapisuje się bez zniekształceń (utf8mb4)', async () => {
            const polishPayload = {
                imie: 'Grzegorz',
                nazwisko: 'Brzęczyszczykiewicz',
                nazwa_firmy: 'Chrząszczyżewoszyce Powiat Łękołody Sp. z o.o.',
                adres: 'ul. Żółwia 15/9, Źródlana Część',
                kod_pocztowy: '99-300',
                miasto: 'Łódź',
                numer_telefonu: '601602603',
                telefon_stacjonarny: '426789012',
                email: 'grzegorz@chrzaszcz.pl',
                opis_usterki: 'Zażółć gęślą jaźń! ZAŻÓŁĆ GĘŚLĄ JAŹŃ.\nPróba znaków: ą, ć, ę, ł, ń, ó, ś, ź, ż. "Cudzysłów", \'apostrof\', oraz emotikony 🛠️💻📦 i znaki specjalne: §, ¶, ©, ®, €. Długi wielowierszowy tekst techniczny.',
                numer_fv: 'FV/ŁÓDŹ/2026/99',
                nip: '9998887766',
                przedmiot_zgloszenia: 'Płyta główna z procesorem 🚀',
                numer_seryjny: 'PL-ĄĆĘŁ-1234',
                data_zakupu: '2026-01-15',
                zgoda_rodo: true
            };

            const res = await request(app)
                .post('/api/zgloszenia')
                .send(polishPayload);

            assert.strictEqual(res.status, 201);
            const ticketId = res.body.id;

            const [rows] = await dbConnection.query('SELECT opis_usterki, przedmiot_zgloszenia, nazwisko, miasto FROM zgloszenia WHERE id = ?', [ticketId]);
            assert.strictEqual(rows[0].opis_usterki, polishPayload.opis_usterki);
            assert.strictEqual(rows[0].przedmiot_zgloszenia, polishPayload.przedmiot_zgloszenia);
            assert.strictEqual(rows[0].nazwisko, 'Brzęczyszczykiewicz');
            assert.strictEqual(rows[0].miasto, 'Łódź');
        });

        it('5. Równoległe wysyłanie zgłoszeń (brak wyścigów, unikalne ID i poprawne wpisy w historii)', async () => {
            const count = 10;
            const requests = Array.from({ length: count }, (_, i) =>
                request(app)
                    .post('/api/zgloszenia')
                    .send({
                        imie: `Klient_${i}`,
                        nazwisko: `Testowy_${i}`,
                        nazwa_firmy: `Firma_${i}`,
                        adres: `Ulica ${i}`,
                        kod_pocztowy: '00-001',
                        miasto: 'Warszawa',
                        numer_telefonu: `50000000${i}`,
                        email: `klient_${i}@test.pl`,
                        opis_usterki: `Równoległe zgłoszenie testowe numer ${i}`,
                        numer_fv: `FV/CONCURRENT/${i}`,
                        nip: '1234567890',
                        przedmiot_zgloszenia: `Sprzęt_${i}`,
                        data_zakupu: '2026-02-01',
                        zgoda_rodo: true
                    })
            );

            const responses = await Promise.all(requests);
            responses.forEach(res => assert.strictEqual(res.status, 201));

            const ids = responses.map(res => res.body.id);
            const uniqueIds = new Set(ids);
            assert.strictEqual(uniqueIds.size, count, 'Wszystkie wygenerowane ID muszą być unikalne');

            // Sprawdzenie w bazie danych
            const [dbTickets] = await dbConnection.query('SELECT id FROM zgloszenia WHERE id IN (?)', [ids]);
            assert.strictEqual(dbTickets.length, count);

            const [dbHistory] = await dbConnection.query('SELECT zgloszenie_id, akcja FROM historia_zgloszen WHERE zgloszenie_id IN (?)', [ids]);
            assert.strictEqual(dbHistory.length, count);
            assert.ok(dbHistory.every(h => h.akcja === 'utworzenie'));
        });

        it('6. Migracja ze starej wersji schematu (sprzed dodania telefonu stacjonarnego)', async () => {
            // Symulacja starej tabeli zgloszenia bez kolumny telefon_stacjonarny
            await dbConnection.query('DROP TABLE IF EXISTS test_stary_schemat');
            await dbConnection.query(`
                CREATE TABLE test_stary_schemat (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    imie VARCHAR(50) NOT NULL,
                    numer_telefonu VARCHAR(20) NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Bezpieczne dodanie kolumny przez executeMigrationSql
            const migrationSql = 'ALTER TABLE test_stary_schemat ADD COLUMN IF NOT EXISTS telefon_stacjonarny VARCHAR(20) NULL AFTER numer_telefonu;';
            await executeMigrationSql(dbConnection, migrationSql);

            // Sprawdzenie czy kolumna powstała
            const [cols] = await dbConnection.query(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                ['test_stary_schemat', 'telefon_stacjonarny']
            );
            assert.strictEqual(cols.length, 1, 'Kolumna telefon_stacjonarny powinna zostać dodana');

            // Ponowne uruchomienie tej samej migracji (idempotencja)
            await executeMigrationSql(dbConnection, migrationSql);
            await dbConnection.query('DROP TABLE test_stary_schemat');
        });

        it('7. Ponowne wywołanie migrate() nie psuje bazy i raportuje brak nowych migracji', async () => {
            const result = await migrate();
            assert.strictEqual(result.pending.length, 0);
        });

        it('8. Start serwera: checkPendingMigrations zwraca brakujące pliki jeśli migracja nie została zapisana', async () => {
            // Symulujemy niezastosowaną migrację poprzez usunięcie jednego wpisu z tabeli schema_migrations
            await dbConnection.query('DELETE FROM schema_migrations WHERE wersja = ?', ['002_aktualizacja_kolumn_i_indeksow.sql']);

            const pending = await checkPendingMigrations(pool);
            assert.ok(pending.includes('002_aktualizacja_kolumn_i_indeksow.sql'), 'checkPendingMigrations powinno wykryć brakującą migrację');

            // Przywracamy wpis
            await dbConnection.query('INSERT INTO schema_migrations (wersja) VALUES (?)', ['002_aktualizacja_kolumn_i_indeksow.sql']);
            const pendingAfter = await checkPendingMigrations(pool);
            assert.strictEqual(pendingAfter.length, 0);
        });

        it('9. Równoległe dwa żądania "wyślij" (Promise.all) na to samo zlecenie: dokładnie jedno 200 i jedno 409, jeden wpis "wysyłka"', async () => {
            const [ins] = await dbConnection.query(
                `INSERT INTO zgloszenia (imie, nazwisko, adres, kod_pocztowy, miasto, numer_telefonu, email, opis_usterki, numer_fv, nip, przedmiot_zgloszenia, data_zakupu, zgoda_rodo_data, status, przypisany_pracownik_id, opis_naprawy, opis_naprawy_data)
                 VALUES ('Adam', 'Nowak', 'ul. Prosta 1', '00-001', 'Warszawa', '+48500100200', 'adam@nowak.pl', 'Brak dźwięku', 'FV/2026/RACE', '1234567890', 'Projektory', '2026-01-10', NOW(), 'do_wysylki', ?, 'Wymieniono układ audio', NOW())`,
                [pracownikUser.id]
            );
            const ticketId = ins.insertId;

            const api = request(app);
            const [res1, res2] = await Promise.all([
                api
                    .patch(`/api/zgloszenia/${ticketId}/status`)
                    .set('Authorization', `Bearer ${magazynierToken}`)
                    .send({ status: 'zakończone', numer_listu: 'DPD-RACE-1' }),
                api
                    .patch(`/api/zgloszenia/${ticketId}/status`)
                    .set('Authorization', `Bearer ${magazynierToken}`)
                    .send({ status: 'zakończone', numer_listu: 'DPD-RACE-2' })
            ]);

            const statuses = [res1.status, res2.status].sort((a, b) => a - b);
            assert.deepStrictEqual(statuses, [200, 409], `Oczekiwano dokładnie jednego 200 i jednego 409, otrzymano: ${statuses.join(', ')}`);

            const conflictRes = res1.status === 409 ? res1 : res2;
            assert.strictEqual(conflictRes.body.error, 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.');

            const [historyRows] = await dbConnection.query(
                'SELECT akcja, szczegoly FROM historia_zgloszen WHERE zgloszenie_id = ?',
                [ticketId]
            );
            const wysylkaEntries = historyRows.filter(h => h.akcja === 'wysyłka');
            assert.strictEqual(wysylkaEntries.length, 1, 'W historii musi być dokładnie jeden wpis "wysyłka"');
        });

        it('10. Opis naprawy na 65 000 znaków zapisuje wpis "naprawa" w historii, a po cofnięciu opis pozostaje w historii (MEDIUMTEXT)', async () => {
            const [ins] = await dbConnection.query(
                `INSERT INTO zgloszenia (imie, nazwisko, adres, kod_pocztowy, miasto, numer_telefonu, email, opis_usterki, numer_fv, nip, przedmiot_zgloszenia, data_zakupu, zgoda_rodo_data, status, przypisany_pracownik_id)
                 VALUES ('Ewa', 'Wiśniewska', 'ul. Długa 5', '00-002', 'Warszawa', '+48500300400', 'ewa@wisniewska.pl', 'Uszkodzone podświetlenie', 'FV/2026/65K', '1234567890', 'Projektory', '2026-01-12', NOW(), 'w_realizacji', ?)`,
                [pracownikUser.id]
            );
            const ticketId = ins.insertId;
            const longOpis = 'N'.repeat(65000);

            const resRepair = await request(app)
                .patch(`/api/zgloszenia/${ticketId}/naprawione`)
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: longOpis });
            assert.strictEqual(resRepair.status, 200);

            const [histAfterRepair] = await dbConnection.query(
                "SELECT akcja, szczegoly FROM historia_zgloszen WHERE zgloszenie_id = ? AND akcja = 'naprawa'",
                [ticketId]
            );
            assert.strictEqual(histAfterRepair.length, 1, 'W historii musi istnieć wpis "naprawa"');
            assert.strictEqual(histAfterRepair[0].szczegoly, `Opis naprawy: ${longOpis}`);

            const resRollback = await request(app)
                .patch(`/api/zgloszenia/${ticketId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(resRollback.status, 200);

            const [histAfterRollback] = await dbConnection.query(
                "SELECT akcja, szczegoly FROM historia_zgloszen WHERE zgloszenie_id = ? AND akcja = 'zmiana_statusu'",
                [ticketId]
            );
            assert.strictEqual(histAfterRollback.length, 1, 'W historii musi istnieć wpis cofnięcia statusu');
            assert.ok(histAfterRollback[0].szczegoly.includes(longOpis), 'Pełny 65 000-znakowy opis naprawy musi być zachowany w historii po cofnięciu');
        });
    });
})();
