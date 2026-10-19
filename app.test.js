const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
}
const app = require('./app');

// Pomocnik do generowania poprawnych tokenów JWT dla konkretnych ról i ID
const makeToken = (role, id = 1, username = 'test_user') =>
    jwt.sign({ id, username, role }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

describe('Testy integracyjne API i reguł RBAC (node:test + supertest)', () => {
    let originalPool;

    // Stan mocka zgłoszenia oraz wykonanych zapytań
    let currentMockTicket = {
        id: 1,
        status: 'w_realizacji',
        przypisany_pracownik_id: 1,
        opis_naprawy: null
    };

    let lastExecutedQuery = null;
    let lastExecutedParams = null;
    let allExecutedQueries = [];

    const setMockTicket = (overrides) => {
        if (overrides === null) {
            currentMockTicket = null;
            return;
        }
        currentMockTicket = {
            id: 1,
            status: 'w_realizacji',
            przypisany_pracownik_id: 1,
            opis_naprawy: null,
            ...overrides
        };
    };

    // Predefiniowane tokeny dla poszczególnych ról
    const adminToken = makeToken('admin', 99, 'admin_testowy');
    const serwisantToken = makeToken('serwisant', 50, 'serwisant_testowy');
    const pracownikToken = makeToken('pracownik', 1, 'user_testowy');
    const innyPracownikToken = makeToken('pracownik', 20, 'inny_pracownik');
    const magazynierToken = makeToken('magazynier', 2, 'magazynier_testowy');

    before(async () => {
        process.env.NODE_ENV = 'test';
        originalPool = app.getPool();

        const testPasswordHash = await bcrypt.hash('prawidloweHaslo123', 10);

        // Konfigurowalny mock bazy danych
        const mockPool = {
            query: async (sql, values) => {
                lastExecutedQuery = sql;
                lastExecutedParams = values;
                allExecutedQueries.push({ sql, values });

                if (typeof sql === 'string') {
                    // Tabela historia_zgloszen - pobieranie historii
                    if (sql.includes('historia_zgloszen') && sql.includes('SELECT')) {
                        return [[
                            { id: 1, zgloszenie_id: 1, uzytkownik_id: null, username: null, akcja: 'utworzenie', z_statusu: null, na_status: 'nowe', szczegoly: 'Utworzono zgłoszenie serwisowe.', created_at: '2026-01-01 12:00:00' },
                            { id: 2, zgloszenie_id: 1, uzytkownik_id: 99, username: 'admin_testowy', akcja: 'przypisanie', z_statusu: 'nowe', na_status: 'w_realizacji', szczegoly: 'Przypisano pracownika: user_testowy', created_at: '2026-01-01 12:05:00' }
                        ]];
                    }

                    // Tabela zgloszenia - zliczanie COUNT(*) dla paginacji
                    if (sql.includes('SELECT COUNT(*)') && sql.includes('FROM zgloszenia')) {
                        return [[{ total: 1 }]];
                    }

                    // Tabela zgloszenia - pobranie po ID
                    if (sql.includes('FROM zgloszenia') && (sql.includes('WHERE id = ?') || sql.includes('WHERE z.id = ?'))) {
                        return currentMockTicket ? [[currentMockTicket]] : [[]];
                    }

                    // Tabela zgloszenia - pobranie listy (w tym z LEFT JOIN uzytkownicy)
                    if (sql.includes('FROM zgloszenia')) {
                        return currentMockTicket ? [[currentMockTicket]] : [[]];
                    }

                    // Tabela uzytkownicy
                    if (sql.includes('uzytkownicy')) {
                        const param = Array.isArray(values) ? values[0] : null;
                        if (param === 'user_testowy' || param === 1) {
                            return [[{ id: 1, username: 'user_testowy', password_hash: testPasswordHash, role: 'pracownik', aktywny: 1 }]];
                        }
                        if (param === 'serwisant_testowy' || param === 50) {
                            return [[{ id: 50, username: 'serwisant_testowy', password_hash: testPasswordHash, role: 'serwisant', aktywny: 1 }]];
                        }
                        if (param === 'admin_testowy' || param === 99) {
                            return [[{ id: 99, username: 'admin_testowy', password_hash: testPasswordHash, role: 'admin', aktywny: 1 }]];
                        }
                        if (param === 2 || param === 'magazynier_testowy') {
                            return [[{ id: 2, username: 'magazynier_testowy', password_hash: testPasswordHash, role: 'magazynier', aktywny: 1 }]];
                        }
                        if (param === 20 || param === 'inny_pracownik') {
                            return [[{ id: 20, username: 'inny_pracownik', password_hash: testPasswordHash, role: 'pracownik', aktywny: 1 }]];
                        }
                        if (param === 'zablokowany_user' || param === 77) {
                            return [[{ id: 77, username: 'zablokowany_user', password_hash: testPasswordHash, role: 'pracownik', aktywny: 0 }]];
                        }
                        if (sql.includes("role IN ('pracownik', 'serwisant', 'magazynier')") || sql.includes("role IN ('pracownik', 'serwisant')")) {
                            return [[
                                { id: 1, username: 'user_testowy', role: 'pracownik', aktywny: 1 },
                                { id: 2, username: 'magazynier_testowy', role: 'magazynier', aktywny: 1 },
                                { id: 50, username: 'serwisant_testowy', role: 'serwisant', aktywny: 1 }
                            ]];
                        }
                        if (sql.includes('SELECT id, username, role, aktywny, created_at FROM uzytkownicy')) {
                            return [[
                                { id: 1, username: 'user_testowy', role: 'pracownik', aktywny: 1, created_at: '2026-01-01' },
                                { id: 99, username: 'admin_testowy', role: 'admin', aktywny: 1, created_at: '2026-01-01' }
                            ]];
                        }
                        if (sql.includes('SELECT id FROM uzytkownicy WHERE username = ?')) {
                            return [[]];
                        }
                        if (sql.includes('INSERT INTO uzytkownicy')) {
                            return [{ insertId: 101, affectedRows: 1 }];
                        }
                        if (sql.includes('UPDATE uzytkownicy')) {
                            return [{ affectedRows: 1 }];
                        }
                        return [[]];
                    }

                    // Tabela zgloszenia - pobranie po ID gdy brak FROM (np. inne klauzule)
                    if (sql.includes('zgloszenia') && (sql.includes('WHERE id = ?') || sql.includes('WHERE z.id = ?'))) {
                        return currentMockTicket ? [[currentMockTicket]] : [[]];
                    }

                    // Modyfikacje UPDATE / DELETE / INSERT
                    if (sql.includes('UPDATE') || sql.includes('DELETE') || sql.includes('INSERT')) {
                        return [{ affectedRows: 1, insertId: 1 }];
                    }
                }

                return [[]];
            },
            getConnection: async () => ({
                release: () => { }
            })
        };

        app.setPool(mockPool);
    });

    after(() => {
        if (originalPool) {
            app.setPool(originalPool);
        }
    });

    describe('1. Uwierzytelnianie, logowanie i walidacja zgłoszeń', () => {
        it('POST /api/zgloszenia bez przesłanych pól w body powinien zwrócić status 400', async () => {
            const response = await request(app).post('/api/zgloszenia').send({});
            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error);
        });

        it('POST /api/zgloszenia dla monitora bez numeru seryjnego powinien zwrócić status 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Monitor interaktywny myBoard Titan (Android 15)',
                    numer_seryjny: '',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu'
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Pole "numer_seryjny" jest obowiązkowe dla wybranego przedmiotu zgłoszenia.');
        });

        it('POST /api/zgloszenia z nieistniejącą datą ("2026-02-31") powinien zwrócić status 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-02-31',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu'
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Pole "data_zakupu" zawiera nieprawidłową datę (nie istnieje w kalendarzu).');
        });

        it('POST /api/zgloszenia z datą zakupu z przyszłości ("2099-01-01") powinien zwrócić status 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2099-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu'
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Pole "data_zakupu" nie może być datą z przyszłości.');
        });

        it('POST /api/zgloszenia z wypełnionym honeypotem (pole website) zwraca 201 jak zwykle, ale nic nie zapisuje do bazy', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    website: 'http://spambot-link.example.com',
                    imie: 'Spambot',
                    nazwisko: 'Automatyczny',
                    adres: 'ul. Spamerska 99',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'bot@spambot.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/SPAM/2026',
                    nip: '1234567890',
                    opis_usterki: 'Spam text'
                });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.message, 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.');
            assert.strictEqual(response.body.id, 0);

            // Weryfikacja: ani jedno zapytanie INSERT nie zostało wykonane w bazie
            const insertQueries = allExecutedQueries.filter(q => q.sql.includes('INSERT'));
            assert.strictEqual(insertQueries.length, 0, 'Bot nie powinien wywołać żadnych zapytań INSERT do bazy');
        });

        it('POST /api/zgloszenia z pustym honeypotem zapisuje zgłoszenie standardowo (INSERT do bazy)', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    website: '',
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.message, 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.');

            // Weryfikacja: wykonano INSERT do tabeli zgloszenia oraz historia_zgloszen
            const insertZgloszenie = allExecutedQueries.find(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.ok(insertZgloszenie, 'Powinno wykonać INSERT INTO zgloszenia');
            const insertHistoria = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(insertHistoria, 'Powinno wykonać INSERT INTO historia_zgloszen');
        });

        it('POST /api/zgloszenia bez potwierdzenia klauzuli RODO (zgoda_rodo: false) zwraca błąd 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: false
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "zgoda_rodo" jest wymagane: należy potwierdzić zapoznanie się z informacją o przetwarzaniu danych osobowych.'
            );
        });

        it('POST /api/zgloszenia ze zgodą RODO zapisuje datę potwierdzenia w kolumnie zgoda_rodo_data', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            const insertZgloszenie = allExecutedQueries.find(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.ok(insertZgloszenie, 'Powinno wykonać INSERT INTO zgloszenia');
            assert.ok(insertZgloszenie.sql.includes('zgoda_rodo_data'), 'Zapytanie INSERT powinno zawierać kolumnę zgoda_rodo_data');
        });

        it('POST /api/zgloszenia bez pola zgoda_rodo (brak w obiekcie) zwraca błąd 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu'
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "zgoda_rodo" jest wymagane: należy potwierdzić zapoznanie się z informacją o przetwarzaniu danych osobowych.'
            );
        });

        it('POST /api/zgloszenia ze zgoda_rodo jako 1 lub "true" jest poprawnie akceptowane (201)', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: 'true'
                });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.message, 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.');
        });

        it('POST /api/zgloszenia bez pola website (pominięte) zapisuje zgłoszenie standardowo (INSERT)', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            const insertQueries = allExecutedQueries.filter(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.strictEqual(insertQueries.length, 1);
        });

        it('POST /api/zgloszenia z poprawnym opcjonalnym telefonem stacjonarnym zapisuje go w bazie', async () => {
            allExecutedQueries = [];
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    telefon_stacjonarny: '221234567',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            const insertQuery = allExecutedQueries.find(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.ok(insertQuery);
            assert.ok(insertQuery.values.includes('+48221234567'));
        });

        it('POST /api/zgloszenia z niepoprawnym telefonem stacjonarnym (mniej niż 9 cyfr) zwraca błąd 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    telefon_stacjonarny: '22123',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error.includes('telefon_stacjonarny'));
        });

        it('GET /api/zgloszenia bez tokenu powinien zwrócić status 401', async () => {
            const response = await request(app).get('/api/zgloszenia');
            assert.strictEqual(response.status, 401);
            assert.ok(response.body.error);
        });

        it('GET /api/zgloszenia z niepoprawnym tokenem powinien zwrócić status 401', async () => {
            const response = await request(app)
                .get('/api/zgloszenia')
                .set('Authorization', 'Bearer nieprawidlowy.token.jwt');
            assert.strictEqual(response.status, 401);
            assert.ok(response.body.error);
        });

        it('POST /api/login ze złym hasłem powinien zwrócić status 401', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({ username: 'user_testowy', password: 'złeHasło123' });
            assert.strictEqual(response.status, 401);
            assert.strictEqual(response.body.error, 'Nieprawidłowa nazwa użytkownika lub hasło.');
        });

        it('POST /api/login z poprawnymi danymi zwraca token JWT', async () => {
            const response = await request(app)
                .post('/api/login')
                .send({ username: 'user_testowy', password: 'prawidloweHaslo123' });
            assert.strictEqual(response.status, 200);
            assert.ok(response.body.token);
        });
    });

    describe('2. Przejście "nowe" → "w_realizacji"', () => {
        it('Serwisant może zmienić status z "nowe" na "w_realizacji" przez /status (200)', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'w_realizacji');
        });

        it('Admin może zmienić status z "nowe" na "w_realizacji" przez /status (200)', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'w_realizacji');
        });

        it('Pracownik NIE może zmienić statusu z "nowe" na "w_realizacji" przez /status (403)', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 403);
        });

        it('Magazynier NIE może zmienić statusu z "nowe" na "w_realizacji" przez /status (403)', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 403);
        });

        it('Przypisanie pracownika do zlecenia "nowe" automatycznie zmienia status na "w_realizacji" (200)', async () => {
            setMockTicket({ status: 'nowe', przypisany_pracownik_id: null });
            const response = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'w_realizacji');
            assert.strictEqual(response.body.przypisany_pracownik_id, 1);
        });
    });

    describe('3. Przejście "w_realizacji" → "do_wysylki" (wyłącznie przez /naprawione)', () => {
        it('Przypisany pracownik może oznaczyć zlecenie jako naprawione przez /naprawione (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: 'Wymieniono bezpiecznik zasilania.' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
            assert.strictEqual(response.body.opis_naprawy, 'Wymieniono bezpiecznik zasilania.');
        });

        it('Pracownik NIE może oznaczyć jako naprawione zlecenia przypisanego do kogoś innego (403)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 }); // przypisany do usera 1
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${innyPracownikToken}`) // user 20
                .send({ opis_naprawy: 'Próba naprawy cudzego zadania' });
            assert.strictEqual(response.status, 403);
            assert.strictEqual(response.body.error, 'Możesz oznaczyć jako naprawione tylko zlecenie przypisane do Ciebie.');
        });

        it('Serwisant może oznaczyć jako naprawione przypisane zlecenie w_realizacji (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Serwisant naprawił płytę główną.' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
        });

        it('Serwisant oznaczając nieprzypisane zlecenie jako naprawione zostaje do niego automatycznie przypisany (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: null });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Serwisant naprawił i przypisał automatycznie' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
            assert.strictEqual(response.body.przypisany_pracownik_id, 50);
            assert.strictEqual(response.body.przypisany_pracownik_username, 'serwisant_testowy');
        });

        it('Admin MOŻE oznaczyć jako naprawione zlecenie nieprzypisane do żadnego pracownika (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: null });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ opis_naprawy: 'Admin naprawił nieprzypisane zlecenie' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
        });

        it('Admin może oznaczyć jako naprawione dowolne zlecenie w_realizacji (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ opis_naprawy: 'Admin zatwierdził naprawę.' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
        });

        it('Magazynier NIE może oznaczać zleceń jako naprawione (403)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ opis_naprawy: 'Próba magazyniera' });
            assert.strictEqual(response.status, 403);
        });

        it('Próba zatwierdzenia naprawy bez opisu prac zwraca błąd 400', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: '   ' });
            assert.strictEqual(response.status, 400);
        });

        it('Próba oznaczenia /naprawione dla zlecenia w statusie "nowe" zwraca 409 Conflict', async () => {
            setMockTicket({ status: 'nowe', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ opis_naprawy: 'Naprawa przed rozpoczęciem' });
            assert.strictEqual(response.status, 409);
            assert.strictEqual(response.body.error, 'Nie można zmienić statusu z »nowe« na »do_wysylki«.');
        });

        it('Próba zmiany statusu na "do_wysylki" przez ogólny endpoint /status jest zablokowana (400)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'do_wysylki' });
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Zmiana statusu na "do_wysylki" jest dozwolona wyłącznie poprzez zatwierdzenie naprawy (endpoint /api/zgloszenia/:id/naprawione).'
            );
        });
    });

    describe('4. Przejście "do_wysylki" → "zakończone"', () => {
        it('Magazynier może oznaczyć jako zakończone podając numer_listu (200)', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'DPD-99887766' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'zakończone');
        });

        it('Magazynier NIE może oznaczyć jako zakończone bez numer_listu (400)', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: '' });
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Podanie numeru listu przewozowego jest obowiązkowe przy oznaczaniu zlecenia jako wysłane.'
            );
        });

        it('Próba podania numer_listu dłuższego niż 100 znaków zwraca błąd 400', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'A'.repeat(101) });
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "numer_listu" przekracza maksymalną dozwoloną długość (100 znaków).'
            );
        });

        it('Próba podania numer_listu dłuższego niż 100 znaków przy statusie już "zakończone" zwraca błąd 400', async () => {
            setMockTicket({ status: 'zakończone' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'A'.repeat(101) });
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "numer_listu" przekracza maksymalną dozwoloną długość (100 znaków).'
            );
        });

        it('Próba podania numer_listu niebędącego stringiem zwraca błąd 400', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 1234567 });
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "numer_listu" musi być tekstem.'
            );
        });

        it('Magazynier może zaktualizować numer_listu na zgłoszeniu już zakończonym (200)', async () => {
            setMockTicket({ status: 'zakończone' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'DPD-NEW-12345' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.numer_listu, 'DPD-NEW-12345');
        });

        it('Admin może oznaczyć jako zakończone ze statusu do_wysylki (200)', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'zakończone' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'zakończone');
        });

        it('Pracownik NIE może oznaczyć jako zakończone ze statusu do_wysylki (403)', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ status: 'zakończone' });
            assert.strictEqual(response.status, 403);
        });

        it('Serwisant NIE może oznaczyć jako zakończone ze statusu do_wysylki (403)', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ status: 'zakończone' });
            assert.strictEqual(response.status, 403);
        });
    });

    describe('5. Cofanie statusu (Rollback) – wyłącznie admin', () => {
        it('Admin może cofnąć status ze statusu "zakończone" do "w_realizacji" (200)', async () => {
            setMockTicket({ status: 'zakończone' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'w_realizacji');
        });

        it('Admin może cofnąć status ze statusu "w_realizacji" do "nowe" (200)', async () => {
            setMockTicket({ status: 'w_realizacji' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'nowe' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'nowe');
        });

        it('Pracownik NIE może cofnąć statusu z "w_realizacji" do "nowe" (403)', async () => {
            setMockTicket({ status: 'w_realizacji' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ status: 'nowe' });
            assert.strictEqual(response.status, 403);
            assert.strictEqual(response.body.error, 'Cofanie statusu zgłoszenia jest dozwolone wyłącznie dla administratora.');
        });

        it('Magazynier NIE może cofnąć statusu z "zakończone" do "w_realizacji" (403)', async () => {
            setMockTicket({ status: 'zakończone' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'w_realizacji' });
            assert.strictEqual(response.status, 403);
            assert.strictEqual(response.body.error, 'Cofanie statusu zgłoszenia jest dozwolone wyłącznie dla administratora.');
        });
    });

    describe('6. Niedozwolone skoki w przód (409 Conflict)', () => {
        it('Skok z "nowe" bezpośrednio do "zakończone" zwraca 409 Conflict nawet dla admina', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'zakończone' });
            assert.strictEqual(response.status, 409);
            assert.strictEqual(response.body.error, 'Nie można zmienić statusu z »nowe« na »zakończone«.');
        });

        it('Skok z "w_realizacji" bezpośrednio do "zakończone" zwraca 409 Conflict', async () => {
            setMockTicket({ status: 'w_realizacji' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'zakończone' });
            assert.strictEqual(response.status, 409);
            assert.strictEqual(response.body.error, 'Nie można zmienić statusu z »w_realizacji« na »zakończone«.');
        });
    });

    describe('7. Uprawnienia ról do dedykowanych endpointów (RBAC)', () => {
        it('Pracownik i magazynier NIE mogą przypisywać pracowników w /przypisz (403)', async () => {
            const respPracownik = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(respPracownik.status, 403);

            const respMagazynier = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(respMagazynier.status, 403);
        });

        it('Próba przypisania zlecenia do użytkownika o roli magazynier w /przypisz zwraca 400', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: 2 }); // ID 2 to magazynier
            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Zlecenie można przypisać wyłącznie do pracownika lub serwisanta.');
        });

        it('Próba przypisania zablokowanego użytkownika w /przypisz zwraca 400', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: 77 }); // ID 77 to zablokowany użytkownik
            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Nie można przypisać zlecenia do zablokowanego pracownika.');
        });

        it('Serwisant może przypisać pracownika w /przypisz (200)', async () => {
            setMockTicket({ status: 'w_realizacji' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.przypisany_pracownik_id, 1);
        });

        it('GET /api/pracownicy dostępny dla admina i serwisanta, zablokowany dla pracownika i magazyniera', async () => {
            const respPracownik = await request(app).get('/api/pracownicy').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(respPracownik.status, 403);

            const respMagazynier = await request(app).get('/api/pracownicy').set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(respMagazynier.status, 403);

            const respSerwisant = await request(app).get('/api/pracownicy').set('Authorization', `Bearer ${serwisantToken}`);
            assert.strictEqual(respSerwisant.status, 200);

            const respAdmin = await request(app).get('/api/pracownicy').set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(respAdmin.status, 200);
        });

        it('DELETE /api/zgloszenia/:id dostępny wyłącznie dla admina (403 dla serwisanta/pracownika/magazyniera)', async () => {
            const respPracownik = await request(app).delete('/api/zgloszenia/1').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(respPracownik.status, 403);

            const respSerwisant = await request(app).delete('/api/zgloszenia/1').set('Authorization', `Bearer ${serwisantToken}`);
            assert.strictEqual(respSerwisant.status, 403);

            const respMagazynier = await request(app).delete('/api/zgloszenia/1').set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(respMagazynier.status, 403);

            const respAdmin = await request(app).delete('/api/zgloszenia/1').set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(respAdmin.status, 200);
        });

        it('POST /api/admin/users dostępny wyłącznie dla admina', async () => {
            const respSerwisant = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ username: 'nowy', password: 'Haslo12345!', role: 'pracownik' });
            assert.strictEqual(respSerwisant.status, 403);

            const respAdmin = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'nowy_pracownik', password: 'Haslo12345!', role: 'pracownik' });
            assert.strictEqual(respAdmin.status, 201);
        });

        it('POST /api/admin/users z username dłuższym niż 50 znaków zwraca błąd 400', async () => {
            const resp = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'u'.repeat(51), password: 'Haslo12345!', role: 'pracownik' });
            assert.strictEqual(resp.status, 400);
            assert.strictEqual(resp.body.error, 'Pole "username" przekracza maksymalną dozwoloną długość (50 znaków).');
        });

        it('POST /api/admin/users z hasłem krótszym niż 8 znaków zwraca błąd 400', async () => {
            const resp = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'nowy_krotkie_haslo', password: '1234567', role: 'pracownik' });
            assert.strictEqual(resp.status, 400);
            assert.strictEqual(resp.body.error, 'Hasło musi mieć co najmniej 8 znaków.');
        });

        it('GET /api/zgloszenia filtruje zapytania zgodnie z rolą', async () => {
            // Pracownik: filtruje po przypisanym pracowniku
            const resP = await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(resP.status, 200);
            assert.ok(lastExecutedQuery.includes('WHERE z.przypisany_pracownik_id = ?'));
            assert.deepStrictEqual(lastExecutedParams, [1, 25, 0]);
            assert.strictEqual(resP.body.total, 1);
            assert.strictEqual(resP.body.page, 1);
            assert.strictEqual(resP.body.limit, 25);
            assert.ok(Array.isArray(resP.body.data));

            // Magazynier: filtruje po do_wysylki i zakończone
            const resM = await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(resM.status, 200);
            assert.ok(lastExecutedQuery.includes("WHERE z.status IN ('do_wysylki', 'zakończone')"));
            assert.deepStrictEqual(lastExecutedParams, [25, 0]);

            // Admin: pobiera wszystkie bez klauzuli WHERE dla ról
            const resA = await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(resA.status, 200);
            assert.ok(!lastExecutedQuery.includes('WHERE z.przypisany_pracownik_id'));
            assert.ok(!lastExecutedQuery.includes("WHERE z.status IN ('do_wysylki', 'zakończone')"));
            assert.deepStrictEqual(lastExecutedParams, [25, 0]);
        });

        it('GET /api/zgloszenia obsługuje parametry filtrowania (?status, ?pracownik, ?szukaj) oraz paginację i sortowanie', async () => {
            // Filtr statusu i pracownika
            await request(app)
                .get('/api/zgloszenia?status=w_realizacji&pracownik=50&strona=2&limit=10&sort=asc')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.ok(lastExecutedQuery.includes('z.status = ?'));
            assert.ok(lastExecutedQuery.includes('z.przypisany_pracownik_id = ?'));
            assert.ok(lastExecutedQuery.includes('ORDER BY z.created_at ASC'));
            assert.ok(lastExecutedQuery.includes('LIMIT ? OFFSET ?'));
            assert.deepStrictEqual(lastExecutedParams, ['w_realizacji', 50, 10, 10]);

            // Filtr pracownik=nieprzypisane
            await request(app)
                .get('/api/zgloszenia?pracownik=nieprzypisane')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.ok(lastExecutedQuery.includes('z.przypisany_pracownik_id IS NULL'));

            // Filtr wyszukiwania (?szukaj=) - wyłącznie przez placeholdery ?
            await request(app)
                .get('/api/zgloszenia?szukaj=Warszawa')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.ok(lastExecutedQuery.includes('LIKE ?'));
            // Upewniamy się, że ciąg 'Warszawa' NIE został wklejony do zapytania SQL
            assert.ok(!lastExecutedQuery.includes('Warszawa'));
            // I że znajduje się wyłącznie w parametrach jako '%Warszawa%'
            assert.strictEqual(lastExecutedParams.filter(p => p === '%Warszawa%').length, 14);

            // Łączenie reguły roli pracownika z filtrem statusu i szukaj
            await request(app)
                .get('/api/zgloszenia?status=nowe&szukaj=myBoard')
                .set('Authorization', `Bearer ${pracownikToken}`);
            assert.ok(lastExecutedQuery.includes('z.przypisany_pracownik_id = ?'));
            assert.ok(lastExecutedQuery.includes('z.status = ?'));
            assert.ok(lastExecutedQuery.includes('LIKE ?'));
            assert.strictEqual(lastExecutedParams[0], 1); // ID zalogowanego pracownika
            assert.strictEqual(lastExecutedParams[1], 'nowe'); // status
        });
    });

    describe('8. Jednostkowa weryfikacja funkcji czyMoznaZmienic(rola, zStatusu, naStatus)', () => {
        it('prawidłowo egzekwuje reguły 409 Conflict, 403 Forbidden oraz dozwolone przejścia', () => {
            const czyMoznaZmienic = app.czyMoznaZmienic;
            assert.strictEqual(typeof czyMoznaZmienic, 'function');

            // Niedozwolone przejścia w cyklu życia -> 409 Conflict
            const jumpNewToFinished = czyMoznaZmienic('admin', 'nowe', 'zakończone');
            assert.strictEqual(jumpNewToFinished.allowed, false);
            assert.strictEqual(jumpNewToFinished.status, 409);

            const jumpNewToShipping = czyMoznaZmienic('serwisant', 'nowe', 'do_wysylki');
            assert.strictEqual(jumpNewToShipping.allowed, false);
            assert.strictEqual(jumpNewToShipping.status, 409);

            // Brak uprawnień roli do dozwolonego kroku procesu -> 403 Forbidden
            const workerStart = czyMoznaZmienic('pracownik', 'nowe', 'w_realizacji');
            assert.strictEqual(workerStart.allowed, false);
            assert.strictEqual(workerStart.status, 403);

            const workerFinish = czyMoznaZmienic('pracownik', 'do_wysylki', 'zakończone');
            assert.strictEqual(workerFinish.allowed, false);
            assert.strictEqual(workerFinish.status, 403);

            // Cofanie statusu: nie-admin -> 403, admin -> dozwolone
            const workerRollback = czyMoznaZmienic('pracownik', 'w_realizacji', 'nowe');
            assert.strictEqual(workerRollback.allowed, false);
            assert.strictEqual(workerRollback.status, 403);

            const adminRollback = czyMoznaZmienic('admin', 'w_realizacji', 'nowe');
            assert.strictEqual(adminRollback.allowed, true);

            // Prawidłowe przejścia dla uprawnionych ról -> allowed: true
            assert.strictEqual(czyMoznaZmienic('serwisant', 'nowe', 'w_realizacji').allowed, true);
            assert.strictEqual(czyMoznaZmienic('admin', 'nowe', 'w_realizacji').allowed, true);
            assert.strictEqual(czyMoznaZmienic('pracownik', 'w_realizacji', 'do_wysylki').allowed, true);
            assert.strictEqual(czyMoznaZmienic('magazynier', 'do_wysylki', 'zakończone').allowed, true);
            assert.strictEqual(czyMoznaZmienic('admin', 'do_wysylki', 'zakończone').allowed, true);
        });

        it('wyznaczDozwoloneAkcje wyznacza akcje z jednego źródła (Single Source of Truth) dla ról', () => {
            const wyznacz = app.wyznaczDozwoloneAkcje;
            assert.strictEqual(typeof wyznacz, 'function');

            const pracownik = { id: 10, role: 'pracownik' };
            const serwisant = { id: 20, role: 'serwisant' };
            const magazynier = { id: 30, role: 'magazynier' };
            const admin = { id: 40, role: 'admin' };

            // 1. Rola: PRACOWNIK
            // Na 'nowe' pracownik nie ma akcji (nie może rozpocząć ani cofnąć)
            assert.deepStrictEqual(wyznacz(pracownik, { id: 1, status: 'nowe', przypisany_pracownik_id: 10 }), []);
            // Na 'w_realizacji' pracownik przypisany widzi tylko 'naprawione'
            const pRealizacjiAssigned = wyznacz(pracownik, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 10 });
            assert.strictEqual(pRealizacjiAssigned.length, 1);
            assert.strictEqual(pRealizacjiAssigned[0].akcja, 'naprawione');
            assert.strictEqual(pRealizacjiAssigned[0].typ, 'naprawa');
            assert.strictEqual(pRealizacjiAssigned[0].na_status, 'do_wysylki');
            // Na 'w_realizacji' pracownik NIEprzypisany nie ma żadnych akcji
            assert.deepStrictEqual(wyznacz(pracownik, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 999 }), []);
            // Na 'do_wysylki' oraz 'zakończone' pracownik nie ma akcji
            assert.deepStrictEqual(wyznacz(pracownik, { id: 1, status: 'do_wysylki', przypisany_pracownik_id: 10 }), []);
            assert.deepStrictEqual(wyznacz(pracownik, { id: 1, status: 'zakończone', przypisany_pracownik_id: 10 }), []);

            // 2. Rola: SERWISANT
            const sNowe = wyznacz(serwisant, { id: 1, status: 'nowe' });
            assert.strictEqual(sNowe.length, 1);
            assert.strictEqual(sNowe[0].akcja, 'przypisz');
            assert.strictEqual(sNowe[0].typ, 'przypisanie');
            assert.strictEqual(sNowe[0].etykieta, 'Przypisz');
            assert.strictEqual(sNowe[0].na_status, 'w_realizacji');

            // Serwisant na 'w_realizacji': dla zlecenia nieprzypisanego widzi akcję 'naprawione' (automatycznie przypisze go przy naprawie)
            const sRealizacjiUnassigned = wyznacz(serwisant, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: null });
            assert.strictEqual(sRealizacjiUnassigned.length, 1);
            assert.strictEqual(sRealizacjiUnassigned[0].akcja, 'naprawione');
            assert.strictEqual(sRealizacjiUnassigned[0].na_status, 'do_wysylki');

            // Dla zlecenia przypisanego serwisant również widzi akcję 'naprawione'
            const sRealizacji = wyznacz(serwisant, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 5 });
            assert.strictEqual(sRealizacji.length, 1);
            assert.strictEqual(sRealizacji[0].akcja, 'naprawione');
            assert.strictEqual(sRealizacji[0].na_status, 'do_wysylki');

            assert.deepStrictEqual(wyznacz(serwisant, { id: 1, status: 'do_wysylki', przypisany_pracownik_id: 5 }), []);
            assert.deepStrictEqual(wyznacz(serwisant, { id: 1, status: 'zakończone', przypisany_pracownik_id: 5 }), []);

            // 3. Rola: MAGAZYNIER
            assert.deepStrictEqual(wyznacz(magazynier, { id: 1, status: 'nowe' }), []);
            assert.deepStrictEqual(wyznacz(magazynier, { id: 1, status: 'w_realizacji' }), []);
            const mWysylka = wyznacz(magazynier, { id: 1, status: 'do_wysylki' });
            assert.strictEqual(mWysylka.length, 1);
            assert.strictEqual(mWysylka[0].akcja, 'wyslij');
            assert.strictEqual(mWysylka[0].typ, 'wysylka');
            assert.strictEqual(mWysylka[0].etykieta, 'Oznacz jako wysłane');
            assert.strictEqual(mWysylka[0].na_status, 'zakończone');
            assert.deepStrictEqual(wyznacz(magazynier, { id: 1, status: 'zakończone' }), []);

            // 4. Rola: ADMIN (zawiera akcje w przód oraz cofanie do wcześniejszych etapów)
            const aNowe = wyznacz(admin, { id: 1, status: 'nowe' });
            assert.strictEqual(aNowe.length, 1);
            assert.strictEqual(aNowe[0].akcja, 'przypisz');
            assert.strictEqual(aNowe[0].typ, 'przypisanie');
            assert.strictEqual(aNowe[0].etykieta, 'Przypisz');

            const aRealizacji = wyznacz(admin, { id: 1, status: 'w_realizacji' });
            assert.strictEqual(aRealizacji.length, 2);
            assert.strictEqual(aRealizacji.some(a => a.typ === 'cofnij' && a.na_status === 'nowe'), true);
            assert.strictEqual(aRealizacji.some(a => a.typ === 'naprawa' && a.na_status === 'do_wysylki'), true);

            const aWysylka = wyznacz(admin, { id: 1, status: 'do_wysylki' });
            assert.strictEqual(aWysylka.length, 3);
            assert.strictEqual(aWysylka.some(a => a.typ === 'cofnij' && a.na_status === 'nowe'), true);
            assert.strictEqual(aWysylka.some(a => a.typ === 'cofnij' && a.na_status === 'w_realizacji'), true);
            assert.strictEqual(aWysylka.some(a => a.typ === 'wysylka' && a.na_status === 'zakończone'), true);

            const aZakonczone = wyznacz(admin, { id: 1, status: 'zakończone' });
            assert.strictEqual(aZakonczone.length, 3);
            assert.strictEqual(aZakonczone.every(a => a.typ === 'cofnij'), true);
        });

        it('GET /api/zgloszenia i GET /api/zgloszenia/:id zwracają dozwolone_akcje obliczone per rola', async () => {
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });

            // Pracownik (ID: 1) pobiera listę i widzi akcję naprawy
            const resListP = await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(resListP.status, 200);
            assert.ok(Array.isArray(resListP.body.data[0].dozwolone_akcje));
            assert.strictEqual(resListP.body.data[0].dozwolone_akcje[0].akcja, 'naprawione');

            // Szczegóły GET /api/zgloszenia/1
            const resDetailsP = await request(app).get('/api/zgloszenia/1').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(resDetailsP.status, 200);
            assert.ok(Array.isArray(resDetailsP.body.dozwolone_akcje));
            assert.strictEqual(resDetailsP.body.dozwolone_akcje[0].akcja, 'naprawione');

            // Admin widzi cofnięcie oraz naprawę
            const resDetailsA = await request(app).get('/api/zgloszenia/1').set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(resDetailsA.status, 200);
            assert.strictEqual(resDetailsA.body.dozwolone_akcje.length, 2);
        });
    });

    describe('9. Panel administratora - zarządzanie użytkownikami (RBAC i bezpieczeństwo)', () => {
        it('GET /api/admin/users bez tokenu zwraca 401', async () => {
            const res = await request(app).get('/api/admin/users');
            assert.strictEqual(res.status, 401);
        });

        it('GET /api/admin/users dla nie-admina (pracownik, serwisant, magazynier) zwraca 403', async () => {
            const resP = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(resP.status, 403);

            const resS = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${serwisantToken}`);
            assert.strictEqual(resS.status, 403);

            const resM = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(resM.status, 403);
        });

        it('GET /api/admin/users dla admina zwraca listę kont BEZ pola password_hash', async () => {
            const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
            assert.ok(res.body.length > 0);
            for (const u of res.body) {
                assert.strictEqual(u.password_hash, undefined, 'password_hash nie może być zwracane!');
                assert.ok('id' in u);
                assert.ok('username' in u);
                assert.ok('role' in u);
                assert.ok('aktywny' in u);
            }
        });

        it('PATCH /api/admin/users/:id zmiana roli: 403 dla nie-admina', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ role: 'admin' });
            assert.strictEqual(res.status, 403);
        });

        it('PATCH /api/admin/users/:id zmiana roli: 400 przy niepoprawnej roli', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'hacker' });
            assert.strictEqual(res.status, 400);
        });

        it('PATCH /api/admin/users/:id zmiana roli: 400 gdy admin próbuje odebrać rolę admina samemu sobie', async () => {
            const res = await request(app)
                .patch('/api/admin/users/99')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'pracownik' });
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('samemu sobie'));
        });

        it('PATCH /api/admin/users/:id zmiana roli: 404 dla nieistniejącego użytkownika', async () => {
            const res = await request(app)
                .patch('/api/admin/users/999')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'serwisant' });
            assert.strictEqual(res.status, 404);
        });

        it('PATCH /api/admin/users/:id zmiana roli: 200 dla poprawnej zmiany roli innego użytkownika', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'serwisant' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.role, 'serwisant');
        });

        it('PATCH /api/admin/users/:id/haslo: 403 dla nie-admina', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ password: 'NoweHaslo123' });
            assert.strictEqual(res.status, 403);
        });

        it('PATCH /api/admin/users/:id/haslo: 400 przy braku hasła', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: '   ' });
            assert.strictEqual(res.status, 400);
        });

        it('PATCH /api/admin/users/:id/haslo: 400 przy haśle krótszym niż 8 znaków', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: 'short' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Hasło musi mieć co najmniej 8 znaków.');
        });

        it('PATCH /api/admin/users/:id/haslo: 404 dla nieistniejącego użytkownika', async () => {
            const res = await request(app)
                .patch('/api/admin/users/999/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: 'NoweHaslo123' });
            assert.strictEqual(res.status, 404);
        });

        it('PATCH /api/admin/users/:id/haslo: 200 gdy admin ustawia nowe hasło', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: 'NoweBezpieczneHaslo123' });
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.message.includes('zostało pomyślnie zmienione'));
        });

        it('PATCH /api/admin/users/:id/status: 403 dla nie-admina', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('PATCH /api/admin/users/:id/status: 400 gdy admin próbuje zablokować samego siebie', async () => {
            const res = await request(app)
                .patch('/api/admin/users/99/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ aktywny: false });
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('samemu sobie') || res.body.error.includes('własnego konta'));
        });

        it('PATCH /api/admin/users/:id/status: 404 dla nieistniejącego użytkownika', async () => {
            const res = await request(app)
                .patch('/api/admin/users/999/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ aktywny: false });
            assert.strictEqual(res.status, 404);
        });

        it('PATCH /api/admin/users/:id/status: 200 przy przełączaniu blokady innego użytkownika', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/status')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok('aktywny' in res.body);
        });

        it('POST /api/login: zablokowany użytkownik otrzymuje status 403', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ username: 'zablokowany_user', password: 'prawidloweHaslo123' });
            assert.strictEqual(res.status, 403);
            assert.ok(res.body.error.includes('zablokowane'));
        });

        it('authenticateToken: token nieistniejącego użytkownika w bazie zwraca 401', async () => {
            const tokenNieistniejacy = makeToken('admin', 9999, 'nieznany_user');
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${tokenNieistniejacy}`);
            assert.strictEqual(res.status, 401);
            assert.ok(res.body.error.includes('nie istnieje') || res.body.error.includes('zablokowane'));
        });

        it('authenticateToken: token zablokowanego użytkownika (aktywny = 0) zwraca 401', async () => {
            const tokenZablokowany = makeToken('pracownik', 77, 'zablokowany_user');
            const res = await request(app)
                .get('/api/zgloszenia')
                .set('Authorization', `Bearer ${tokenZablokowany}`);
            assert.strictEqual(res.status, 401);
            assert.ok(res.body.error.includes('zablokowane') || res.body.error.includes('nie istnieje'));
        });

        it('authenticateToken: pobiera rolę z bazy, unieważniając spreparowaną rolę w payloadzie tokenu (403)', async () => {
            // Użytkownik o ID 1 ma w bazie rolę 'pracownik'.
            // Jeśli ktoś wygeneruje token z rolą 'admin', authenticateToken i tak pobierze 'pracownik' z bazy.
            const s偽sToken = makeToken('admin', 1, 'user_testowy');
            const res = await request(app)
                .delete('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${s偽sToken}`);
            // Endpoint usunięcia zgłoszenia wymaga roli admin. Skoro w bazie ma pracownik -> 403 Forbidden!
            assert.strictEqual(res.status, 403);
        });
    });

    describe('10. Zmiana własnego hasła użytkownika (PATCH /api/profil/haslo)', () => {
        it('PATCH /api/profil/haslo: brak tokenu zwraca 401', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .send({ currentPassword: 'stare', newPassword: 'NoweHaslo123' });
            assert.strictEqual(res.status, 401);
        });

        it('PATCH /api/profil/haslo: brak wymaganych pól hasła zwraca 400', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: '', newPassword: '' });
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('Podaj'));
        });

        it('PATCH /api/profil/haslo: nowe hasło krótsze niż 8 znaków zwraca 400', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'prawidloweHaslo123', newPassword: 'krotkie' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Nowe hasło musi mieć co najmniej 8 znaków.');
        });

        it('PATCH /api/profil/haslo: niepoprawne aktualne hasło zwraca 400', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'zleHaslo123', newPassword: 'NoweSuperHaslo123' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Aktualne hasło jest nieprawidłowe.');
        });

        it('PATCH /api/profil/haslo: poprawne aktualne i nowe hasło zwraca 200', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'prawidloweHaslo123', newPassword: 'NoweSuperHaslo123' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Twoje hasło zostało pomyślnie zmienione.');
        });
    });

    describe('11. Historia zgłoszeń (tabela historia_zgloszen i funkcja pomocnicza)', () => {
        beforeEach(() => {
            allExecutedQueries = [];
        });

        it('Utworzenie zgłoszenia przez POST /api/zgloszenia zapisuje wpis w historia_zgloszen', async () => {
            const resp = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 10',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/999/2026',
                    nip: '1234567890',
                    opis_usterki: 'Nie wyświetla obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(resp.status, 201);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            // Parametry: [zgloszenieId, uzytkownikId, akcja, zStatusu, naStatus, szczegoly]
            assert.strictEqual(historyInsert.values[2], 'utworzenie');
            assert.strictEqual(historyInsert.values[4], 'nowe');
        });

        it('Przypisanie pracownika przez PATCH /api/zgloszenia/:id/przypisz zapisuje wpis w historia_zgloszen', async () => {
            setMockTicket({ status: 'nowe', przypisany_pracownik_id: null });
            const resp = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: 1 });

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            assert.strictEqual(historyInsert.values[0], 1);
            assert.strictEqual(historyInsert.values[1], 99); // admin_testowy id
            assert.strictEqual(historyInsert.values[2], 'przypisanie');
            assert.strictEqual(historyInsert.values[3], 'nowe');
            assert.strictEqual(historyInsert.values[4], 'w_realizacji');
            assert.strictEqual(historyInsert.values[5], 'Przypisano pracownika: user_testowy');
        });

        it('Opisanie i zatwierdzenie naprawy przez PATCH /api/zgloszenia/:id/naprawione zapisuje wpis "naprawa"', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const resp = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: 'Wymieniono płytę główną zasilacza' });

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            assert.strictEqual(historyInsert.values[1], 1); // user_testowy id
            assert.strictEqual(historyInsert.values[2], 'naprawa');
            assert.strictEqual(historyInsert.values[3], 'w_realizacji');
            assert.strictEqual(historyInsert.values[4], 'do_wysylki');
            assert.strictEqual(historyInsert.values[5], 'Opis naprawy: Wymieniono płytę główną zasilacza');
        });

        it('Wysyłka i zakończenie zlecenia przez PATCH /api/zgloszenia/:id/status zapisuje wpis "wysyłka"', async () => {
            setMockTicket({ status: 'do_wysylki' });
            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'DPD-123456789' });

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            assert.strictEqual(historyInsert.values[1], 2); // magazynier_testowy id
            assert.strictEqual(historyInsert.values[2], 'wysyłka');
            assert.strictEqual(historyInsert.values[3], 'do_wysylki');
            assert.strictEqual(historyInsert.values[4], 'zakończone');
            assert.ok(historyInsert.values[5].includes('DPD-123456789'));
        });

        it('Aktualizacja samego numeru listu na statusie "zakończone" zapisuje wpis "zmiana_numeru_listu"', async () => {
            setMockTicket({ status: 'zakończone', numer_listu: 'DPD-OLD' });
            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ status: 'zakończone', numer_listu: 'DPD-NEW-999' });

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            assert.strictEqual(historyInsert.values[2], 'zmiana_numeru_listu');
            assert.strictEqual(historyInsert.values[3], 'zakończone');
            assert.strictEqual(historyInsert.values[4], 'zakończone');
            assert.ok(historyInsert.values[5].includes('DPD-NEW-999'));
        });

        it('Cofnięcie statusu przez admina zapisuje wpis "zmiana_statusu"', async () => {
            setMockTicket({ status: 'w_realizacji' });
            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'nowe' });

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen');
            assert.strictEqual(historyInsert.values[2], 'zmiana_statusu');
            assert.strictEqual(historyInsert.values[3], 'w_realizacji');
            assert.strictEqual(historyInsert.values[4], 'nowe');
        });

        it('Usunięcie zgłoszenia przez DELETE /api/zgloszenia/:id zapisuje wpis "usunięcie" ze szczegółem usunięcia przez X', async () => {
            setMockTicket({ status: 'nowe' });
            const resp = await request(app)
                .delete('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(resp.status, 200);
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert, 'Powinien zostać wykonany INSERT do historia_zgloszen przed usunięciem');
            assert.strictEqual(historyInsert.values[0], 1);
            assert.strictEqual(historyInsert.values[1], 99);
            assert.strictEqual(historyInsert.values[2], 'usunięcie');
            assert.strictEqual(historyInsert.values[3], 'nowe');
            assert.strictEqual(historyInsert.values[4], null);
            assert.strictEqual(historyInsert.values[5], 'Wpis usunięty przez admin_testowy');

            const deleteQuery = allExecutedQueries.find(q => q.sql.includes('DELETE FROM zgloszenia'));
            assert.ok(deleteQuery, 'Powinien nastąpić DELETE zgloszenia');
        });

        it('GET /api/zgloszenia/:id/historia zwraca listę wpisów historii zgłoszenia', async () => {
            const resp = await request(app)
                .get('/api/zgloszenia/1/historia')
                .set('Authorization', `Bearer ${pracownikToken}`);

            assert.strictEqual(resp.status, 200);
            assert.ok(Array.isArray(resp.body));
            assert.strictEqual(resp.body.length, 2);
            assert.strictEqual(resp.body[0].akcja, 'utworzenie');
            assert.strictEqual(resp.body[1].akcja, 'przypisanie');
            assert.strictEqual(resp.body[1].username, 'admin_testowy');
        });
    });

    describe('12. Endpoint GET /api/zgloszenia/:id oraz czyszczenie danych etapów przy rollbacku', () => {
        beforeEach(() => {
            allExecutedQueries = [];
        });

        it('GET /api/zgloszenia/:id bez tokenu zwraca 401', async () => {
            const resp = await request(app).get('/api/zgloszenia/1');
            assert.strictEqual(resp.status, 401);
        });

        it('GET /api/zgloszenia/:id z niepoprawnym ID zwraca 400', async () => {
            const resp = await request(app)
                .get('/api/zgloszenia/abc')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(resp.status, 400);
            assert.strictEqual(resp.body.error, 'Nieprawidłowe ID zgłoszenia. Wymagana jest liczba całkowita.');
        });

        it('GET /api/zgloszenia/:id dla nieistniejącego zgłoszenia zwraca 404', async () => {
            setMockTicket(null);
            const resp = await request(app)
                .get('/api/zgloszenia/999')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(resp.status, 404);
            assert.strictEqual(resp.body.error, 'Nie znaleziono zgłoszenia o ID 999.');
        });

        it('GET /api/zgloszenia/:id zwraca szczegóły zgłoszenia oraz tablicę historia dla admina', async () => {
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1, opis_usterki: 'Uszkodzona matryca' });
            const resp = await request(app)
                .get('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${adminToken}`);

            assert.strictEqual(resp.status, 200);
            assert.strictEqual(resp.body.id, 1);
            assert.strictEqual(resp.body.status, 'w_realizacji');
            assert.strictEqual(resp.body.opis_usterki, 'Uszkodzona matryca');
            assert.ok(Array.isArray(resp.body.historia));
            assert.strictEqual(resp.body.historia.length, 2);
            assert.strictEqual(resp.body.historia[0].akcja, 'utworzenie');
        });

        it('GET /api/zgloszenia/:id pracownik NIE może podejrzeć zlecenia przypisanego do innego pracownika (403)', async () => {
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 20 });
            const resp = await request(app)
                .get('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${pracownikToken}`);

            assert.strictEqual(resp.status, 403);
            assert.strictEqual(resp.body.error, 'Brak uprawnień do przeglądania tego zgłoszenia.');
        });

        it('GET /api/zgloszenia/:id pracownik może podejrzeć zlecenie przypisane do siebie (200)', async () => {
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const resp = await request(app)
                .get('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${pracownikToken}`);

            assert.strictEqual(resp.status, 200);
            assert.strictEqual(resp.body.id, 1);
            assert.ok(Array.isArray(resp.body.historia));
        });

        it('GET /api/zgloszenia/:id magazynier NIE może podejrzeć zlecenia w statusie "nowe" lub "w_realizacji" (403)', async () => {
            setMockTicket({ id: 1, status: 'nowe' });
            const resp = await request(app)
                .get('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${magazynierToken}`);

            assert.strictEqual(resp.status, 403);
            assert.strictEqual(resp.body.error, 'Brak uprawnień do przeglądania tego zgłoszenia.');
        });

        it('GET /api/zgloszenia/:id magazynier może podejrzeć zlecenie w statusie "do_wysylki" lub "zakończone" (200)', async () => {
            setMockTicket({ id: 1, status: 'do_wysylki' });
            const resp = await request(app)
                .get('/api/zgloszenia/1')
                .set('Authorization', `Bearer ${magazynierToken}`);

            assert.strictEqual(resp.status, 200);
            assert.strictEqual(resp.body.id, 1);
            assert.strictEqual(resp.body.status, 'do_wysylki');
            assert.ok(Array.isArray(resp.body.historia));
        });

        it('Cofnięcie ze statusu "zakończone" do "do_wysylki" czyści data_wyslania i numer_listu na NULL, zachowując opis naprawy', async () => {
            setMockTicket({
                id: 1,
                status: 'zakończone',
                numer_listu: 'DPD-123',
                data_wyslania: '2026-01-01',
                opis_naprawy: 'Wymieniono bezpiecznik'
            });

            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'do_wysylki' });

            assert.strictEqual(resp.status, 200);

            // Weryfikacja zapytania UPDATE:
            const updateQuery = allExecutedQueries.find(q => q.sql.includes('UPDATE zgloszenia'));
            assert.ok(updateQuery, 'Powinien zostać wykonany UPDATE zgloszenia');
            assert.ok(updateQuery.sql.includes('data_wyslania = NULL'));
            assert.ok(updateQuery.sql.includes('numer_listu = NULL'));
            assert.ok(!updateQuery.sql.includes('opis_naprawy = NULL'), 'Nie powinien czyścić opisu naprawy');

            // Weryfikacja wpisu w historii
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert);
            assert.strictEqual(historyInsert.values[2], 'zmiana_statusu');
            assert.strictEqual(historyInsert.values[3], 'zakończone');
            assert.strictEqual(historyInsert.values[4], 'do_wysylki');
        });

        it('Cofnięcie ze statusu "do_wysylki" do "w_realizacji" czyści opis_naprawy na NULL i zapisuje go w historii', async () => {
            setMockTicket({
                id: 1,
                status: 'do_wysylki',
                opis_naprawy: 'Wymieniono matrycę 65 cali'
            });

            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });

            assert.strictEqual(resp.status, 200);

            // Weryfikacja zapytania UPDATE:
            const updateQuery = allExecutedQueries.find(q => q.sql.includes('UPDATE zgloszenia'));
            assert.ok(updateQuery);
            assert.ok(updateQuery.sql.includes('opis_naprawy = NULL'));
            assert.ok(updateQuery.sql.includes('opis_naprawy_data = NULL'));

            // Weryfikacja historii:
            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert);
            assert.strictEqual(historyInsert.values[2], 'zmiana_statusu');
            assert.strictEqual(historyInsert.values[3], 'do_wysylki');
            assert.strictEqual(historyInsert.values[4], 'w_realizacji');
            assert.ok(historyInsert.values[5].includes('Wymieniono matrycę 65 cali'), 'Szczegóły historii powinny zawierać wycofany opis naprawy');
        });

        it('Cofnięcie ze statusu "zakończone" do "w_realizacji" czyści zarówno wysyłkę jak i naprawę, przenosząc opis do historii', async () => {
            setMockTicket({
                id: 1,
                status: 'zakończone',
                numer_listu: 'DPD-999',
                data_wyslania: '2026-01-01',
                opis_naprawy: 'Naprawa portu HDMI'
            });

            const resp = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });

            assert.strictEqual(resp.status, 200);

            const updateQuery = allExecutedQueries.find(q => q.sql.includes('UPDATE zgloszenia'));
            assert.ok(updateQuery);
            assert.ok(updateQuery.sql.includes('data_wyslania = NULL'));
            assert.ok(updateQuery.sql.includes('numer_listu = NULL'));
            assert.ok(updateQuery.sql.includes('opis_naprawy = NULL'));
            assert.ok(updateQuery.sql.includes('opis_naprawy_data = NULL'));

            const historyInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historyInsert);
            assert.ok(historyInsert.values[5].includes('Naprawa portu HDMI'));
        });
    });

    describe('13. Rate limiting (POST /api/zgloszenia oraz POST /api/login)', () => {
        it('zgloszeniaLimiter i loginLimiter są wyeksportowane i poprawnie skonfigurowane', () => {
            assert.ok(app.zgloszeniaLimiter, 'zgloszeniaLimiter powinien być zdefiniowany');
            assert.ok(app.loginLimiter, 'loginLimiter powinien być zdefiniowany');
        });

        it('W środowisku testowym (NODE_ENV === "test") rate limiter na POST /api/zgloszenia jest pomijany', async () => {
            assert.strictEqual(process.env.NODE_ENV, 'test');
            // Wykonujemy wielokrotne zapytania - żadne nie powinno zostać zablokowane kodem 429
            for (let i = 0; i < 7; i++) {
                const res = await request(app)
                    .post('/api/zgloszenia')
                    .send({}); // puste body zwróci 400 z walidacji, a nie 429 z rate limitera
                assert.strictEqual(res.status, 400);
            }
        });

        it('Gdy rate limit jest aktywny (np. poza testami), blokuje 6. żądanie kodem 429 i zwraca polski komunikat', async () => {
            const express = require('express');
            const rateLimit = require('express-rate-limit');

            const testApp = express();
            const limiter = rateLimit({
                windowMs: 60 * 60 * 1000,
                limit: 5,
                message: {
                    error: 'Zbyt wiele zgłoszeń z tego adresu IP. Dozwolony limit to 5 zgłoszeń na godzinę. Spróbuj ponownie później.'
                },
                standardHeaders: true,
                legacyHeaders: false
            });

            testApp.post('/test-zgloszenia', limiter, (req, res) => {
                res.status(201).json({ success: true });
            });

            // Pierwsze 5 żądań przechodzi ze statusem 201
            for (let i = 1; i <= 5; i++) {
                const res = await request(testApp).post('/test-zgloszenia');
                assert.strictEqual(res.status, 201);
                assert.strictEqual(res.body.success, true);
            }

            // 6. żądanie powinno zostać zablokowane kodem 429
            const blockedRes = await request(testApp).post('/test-zgloszenia');
            assert.strictEqual(blockedRes.status, 429);
            assert.strictEqual(
                blockedRes.body.error,
                'Zbyt wiele zgłoszeń z tego adresu IP. Dozwolony limit to 5 zgłoszeń na godzinę. Spróbuj ponownie później.'
            );
        });

        it('Gdy loginLimiter jest aktywny, blokuje 11. próbę logowania kodem 429 i zwraca polski komunikat', async () => {
            const express = require('express');
            const rateLimit = require('express-rate-limit');

            const testApp = express();
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000,
                limit: 10,
                message: {
                    error: 'Zbyt wiele nieudanych prób logowania z tego adresu IP. Spróbuj ponownie za 15 minut.'
                },
                standardHeaders: true,
                legacyHeaders: false
            });

            testApp.post('/test-login', limiter, (req, res) => {
                res.status(200).json({ success: true });
            });

            for (let i = 1; i <= 10; i++) {
                const res = await request(testApp).post('/test-login');
                assert.strictEqual(res.status, 200);
            }

            const blockedRes = await request(testApp).post('/test-login');
            assert.strictEqual(blockedRes.status, 429);
            assert.strictEqual(
                blockedRes.body.error,
                'Zbyt wiele nieudanych prób logowania z tego adresu IP. Spróbuj ponownie za 15 minut.'
            );
        });
    });

    describe('14. Limit rozmiaru ciała żądania JSON (express.json limit)', () => {
        it('POST /api/zgloszenia z maksymalnym dozwolonym opisem usterki (65535 znaków) mieści się w limicie express.json (70kb) i zwraca 201', async () => {
            allExecutedQueries = [];
            const maxOpis = 'a'.repeat(65535);
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: maxOpis,
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.message, 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.');
            const insertZgloszenie = allExecutedQueries.find(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.ok(insertZgloszenie, 'Powinno wykonać INSERT do tabeli zgloszenia');
            assert.strictEqual(insertZgloszenie.values[12].length, 65535);
        });

        it('Żądanie JSON przekraczające limit express.json (np. 80KB) zwraca błąd 413 Payload Too Large', async () => {
            const tooLargeOpis = 'a'.repeat(80000);
            const response = await request(app)
                .post('/api/zgloszenia')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({
                    opis_usterki: tooLargeOpis
                }));

            assert.strictEqual(response.status, 413);
            assert.strictEqual(response.body.error, 'Przesłany ładunek żądania (payload) przekracza dozwolony limit.');
        });

        it('POST /api/zgloszenia z opisem usterki przekraczającym maksymalną dozwoloną długość (65536 znaków) zwraca błąd walidacji 400', async () => {
            const invalidOpis = 'a'.repeat(65536);
            const response = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ul. Testowa 1',
                    kod_pocztowy: '00-001',
                    miasto: 'Warszawa',
                    numer_telefonu: '+48123456789',
                    email: 'jan@example.com',
                    przedmiot_zgloszenia: 'Projektory',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: invalidOpis,
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Pole "opis_usterki" przekracza maksymalną dozwoloną długość (65535 znaków).'
            );
        });

        it('Żądanie z nieprawidłowym formatem JSON zwraca błąd 400', async () => {
            const response = await request(app)
                .post('/api/zgloszenia')
                .set('Content-Type', 'application/json')
                .send('{ niepoprawny_json: true, }');

            assert.strictEqual(response.status, 400);
            assert.strictEqual(response.body.error, 'Nieprawidłowy format JSON w ciele żądania.');
        });
    });

    describe('15. Nagłówki bezpieczeństwa HTTP (helmet)', () => {
        it('Odpowiedź serwera zawiera nagłówek X-Content-Type-Options: nosniff', async () => {
            const res = await request(app).get('/api/health');
            assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
        });

        it('Odpowiedź serwera zawiera nagłówek X-Frame-Options: SAMEORIGIN', async () => {
            const res = await request(app).get('/api/health');
            assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
        });

        it('Odpowiedź serwera zawiera nagłówki ochrony przeglądarki (X-Download-Options, X-Permitted-Cross-Domain-Policies)', async () => {
            const res = await request(app).get('/api/health');
            assert.strictEqual(res.headers['x-download-options'], 'noopen');
            assert.strictEqual(res.headers['x-permitted-cross-domain-policies'], 'none');
        });

        it('Nagłówek Content-Security-Policy jest wyłączony na czas kompilacji JSX w przeglądarce', async () => {
            const res = await request(app).get('/api/health');
            assert.strictEqual(res.headers['content-security-policy'], undefined);
        });
    });

    describe('16. Endpoint /api/health (bezpieczny health check)', () => {
        it('GET /api/health gdy baza danych działa zwraca 200 i { status: "ok" }', async () => {
            const res = await request(app).get('/api/health');
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body, { status: 'ok' });
        });

        it('GET /api/health gdy zapytanie do bazy zawiedzie zwraca 500 i { status: "error" } bez ujawniania err.message', async () => {
            const currentPool = app.getPool();
            const failingPool = {
                query: async () => {
                    throw new Error('Access denied for user root@localhost (using password: YES)');
                }
            };
            app.setPool(failingPool);
            const origError = console.error;
            let loggedError = null;
            console.error = (...args) => { loggedError = args; };
            try {
                const res = await request(app).get('/api/health');
                assert.strictEqual(res.status, 500);
                assert.deepStrictEqual(res.body, { status: 'error' });
                assert.strictEqual(res.body.message, undefined);
                assert.ok(loggedError, 'Szczegóły błędu powinny trafić do console.error');
            } finally {
                console.error = origError;
                app.setPool(currentPool);
            }
        });
    });

    describe('17. Cache-Control dla plików statycznych (express.static)', () => {
        const staticDir = path.join(__dirname, 'frontend', 'dist');
        const testHashedJs = path.join(staticDir, 'bundle.a1b2c3d4.js');
        const testHashedCss = path.join(staticDir, 'style-D7x2v_4z.css');
        const testIndexHtml = path.join(staticDir, 'index.html');
        const testLogo = path.join(staticDir, 'logo_mentor4.svg');

        before(() => {
            fs.mkdirSync(staticDir, { recursive: true });
            fs.writeFileSync(testHashedJs, 'console.log("hashed bundle");');
            fs.writeFileSync(testHashedCss, 'body { color: red; }');
            if (!fs.existsSync(testIndexHtml)) fs.writeFileSync(testIndexHtml, '<!doctype html><html></html>');
            if (!fs.existsSync(testLogo)) fs.writeFileSync(testLogo, '<svg></svg>');
        });

        after(() => {
            if (fs.existsSync(testHashedJs)) fs.unlinkSync(testHashedJs);
            if (fs.existsSync(testHashedCss)) fs.unlinkSync(testHashedCss);
        });

        it('GET / oraz GET /index.html zwracają Cache-Control: no-store', async () => {
            const resRoot = await request(app).get('/');
            assert.strictEqual(resRoot.status, 200);
            assert.match(resRoot.headers['cache-control'], /no-store/);
            assert.strictEqual(resRoot.headers['pragma'], 'no-cache');
            assert.strictEqual(resRoot.headers['expires'], '0');

            const resIndex = await request(app).get('/index.html');
            assert.strictEqual(resIndex.status, 200);
            assert.match(resIndex.headers['cache-control'], /no-store/);
            assert.strictEqual(resIndex.headers['pragma'], 'no-cache');
            assert.strictEqual(resIndex.headers['expires'], '0');
        });

        it('Pliki statyczne bez hasha (np. /logo_mentor4.svg) NIE posiadają no-store i mają standardowy cache', async () => {
            const res = await request(app).get('/logo_mentor4.svg');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.headers['cache-control'].includes('no-store'), false);
            assert.match(res.headers['cache-control'], /max-age=86400/);
            assert.strictEqual(res.headers['pragma'], undefined);
        });

        it('Pliki z buildu z hashem w nazwie mają długi czas cache\'owania (max-age 1 rok, immutable)', async () => {
            const resJs = await request(app).get('/bundle.a1b2c3d4.js');
            assert.strictEqual(resJs.status, 200);
            assert.strictEqual(resJs.headers['cache-control'], 'public, max-age=31536000, immutable');

            const resCss = await request(app).get('/style-D7x2v_4z.css');
            assert.strictEqual(resCss.status, 200);
            assert.strictEqual(resCss.headers['cache-control'], 'public, max-age=31536000, immutable');
        });

        it('Funkcja pomocnicza isHashedFile prawidłowo klasyfikuje nazwy plików z hashem', () => {
            assert.strictEqual(app.isHashedFile('main.8f3a1b2c.js'), true);
            assert.strictEqual(app.isHashedFile('assets/index-D7x2v_4z.js'), true);
            assert.strictEqual(app.isHashedFile('app.12345678.css'), true);
            assert.strictEqual(app.isHashedFile('vendor-a1b2c3d4e5f6.js'), true);
            assert.strictEqual(app.isHashedFile('index.html'), false);
            assert.strictEqual(app.isHashedFile('logo_mentor4.svg'), false);
            assert.strictEqual(app.isHashedFile('bundle.min.js'), false);
            assert.strictEqual(app.isHashedFile('style.css'), false);
        });
    });
});