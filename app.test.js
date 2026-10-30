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
    let currentMockTotal = 1;

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
                        return [[{ total: currentMockTotal }]];
                    }

                    // Tabela zgloszenia - pobranie po ID
                    if (sql.includes('SELECT') && sql.includes('FROM zgloszenia') && (sql.includes('WHERE id = ?') || sql.includes('WHERE z.id = ?'))) {
                        return currentMockTicket ? [[currentMockTicket]] : [[]];
                    }

                    // Tabela zgloszenia - pobranie listy (w tym z LEFT JOIN uzytkownicy)
                    if (sql.includes('SELECT') && sql.includes('FROM zgloszenia')) {
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
                    if (sql.includes('SELECT') && sql.includes('zgloszenia') && (sql.includes('WHERE id = ?') || sql.includes('WHERE z.id = ?'))) {
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
                query: (sql, values) => mockPool.query(sql, values),
                beginTransaction: async () => { },
                commit: async () => { },
                rollback: async () => { },
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
            assert.strictEqual(response.body.error, 'Pole „Numer seryjny (S/N)” jest obowiązkowe dla wybranego przedmiotu zgłoszenia.');
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
            assert.strictEqual(response.body.error, 'Pole „Data zakupu” zawiera nieprawidłową datę (nie istnieje w kalendarzu).');
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
            assert.strictEqual(response.body.error, 'Pole „Data zakupu” nie może być datą z przyszłości.');
        });

        it('POST /api/zgloszenia normalizuje przedmiot_zgloszenia do kanonicznej wartości z ALLOWED_PRZEDMIOTY (np. "inne" → "Inne")', async () => {
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
                    przedmiot_zgloszenia: 'inne',
                    data_zakupu: '2026-01-01',
                    numer_fv: 'FV/123/2026',
                    nip: '1234567890',
                    opis_usterki: 'Brak obrazu',
                    zgoda_rodo: true
                });

            assert.strictEqual(response.status, 201);
            const insertZgloszenie = allExecutedQueries.find(q => q.sql.includes('INSERT INTO zgloszenia'));
            assert.ok(insertZgloszenie);
            assert.strictEqual(insertZgloszenie.values[9], 'Inne');
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
                'Należy potwierdzić zapoznanie się z informacją o przetwarzaniu danych osobowych.'
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
                'Należy potwierdzić zapoznanie się z informacją o przetwarzaniu danych osobowych.'
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
            assert.ok(response.body.error.includes('Pole „Telefon stacjonarny”'));
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

        it('POST /api/login dla nieistniejącego użytkownika wykonuje bcrypt.compare ze stałym hashem (ochrona przed timing attack) i zwraca 401', async () => {
            const origCompare = bcrypt.compare;
            const compareCalls = [];
            bcrypt.compare = async (pass, hash) => {
                compareCalls.push({ pass, hash });
                return origCompare.call(bcrypt, pass, hash);
            };

            try {
                const response = await request(app)
                    .post('/api/login')
                    .send({ username: 'nieistniejacy_uzytkownik_xyz', password: 'DowolneHaslo123' });

                assert.strictEqual(response.status, 401);
                assert.strictEqual(response.body.error, 'Nieprawidłowa nazwa użytkownika lub hasło.');
                assert.strictEqual(compareCalls.length, 1, 'bcrypt.compare powinno zostać wywołane dokładnie raz');
                assert.strictEqual(compareCalls[0].pass, 'DowolneHaslo123');
                assert.strictEqual(compareCalls[0].hash, app.DUMMY_PASSWORD_HASH);
            } finally {
                bcrypt.compare = origCompare;
            }
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

        it('Serwisant może oznaczyć jako naprawione zlecenie w_realizacji przypisane do siebie (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 50 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Serwisant naprawił płytę główną.' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.status, 'do_wysylki');
        });

        it('Serwisant NIE może oznaczyć jako naprawione zlecenia przypisanego do innego pracownika (403)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Próba opisania cudzego zlecenia przez serwisanta' });
            assert.strictEqual(response.status, 403);
            assert.strictEqual(response.body.error, 'Serwisant nie może opisać zlecenia przypisanego do innego pracownika.');
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

        it('Magazynier może zaktualizować numer_listu na zgłoszeniu już zakończonym przez /numer-listu (200)', async () => {
            setMockTicket({ status: 'zakończone' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/numer-listu')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ numer_listu: 'DPD-NEW-12345' });
            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.numer_listu, 'DPD-NEW-12345');
            assert.strictEqual(response.body.status, 'zakończone');
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

        it('Dwa równoległe POST /api/admin/users na ten sam login (ER_DUP_ENTRY na INSERT) zwracają 201 i 409 "Taki użytkownik już istnieje." zamiast 500', async () => {
            const currentPool = app.getPool();
            let inserted = false;
            const dupPool = {
                query: async (sql, values) => {
                    if (typeof sql === 'string' && sql.includes('SELECT id FROM uzytkownicy WHERE username = ?')) {
                        // Oba równoległe żądania przechodzą SELECT zanim którekolwiek skończy bcrypt.hash (~70 ms)
                        return [[]];
                    }
                    if (typeof sql === 'string' && sql.includes('INSERT INTO uzytkownicy')) {
                        if (!inserted) {
                            inserted = true;
                            return [{ insertId: 777, affectedRows: 1 }];
                        }
                        const dupErr = new Error("Duplicate entry 'duplikat_user' for key 'username'");
                        dupErr.code = 'ER_DUP_ENTRY';
                        throw dupErr;
                    }
                    return currentPool.query(sql, values);
                }
            };

            app.setPool(dupPool);
            try {
                const [res1, res2] = await Promise.all([
                    request(app)
                        .post('/api/admin/users')
                        .set('Authorization', `Bearer ${adminToken}`)
                        .send({ username: 'duplikat_user', password: 'Haslo12345!', role: 'pracownik' }),
                    request(app)
                        .post('/api/admin/users')
                        .set('Authorization', `Bearer ${adminToken}`)
                        .send({ username: 'duplikat_user', password: 'Haslo12345!', role: 'pracownik' })
                ]);

                const statuses = [res1.status, res2.status].sort((a, b) => a - b);
                assert.deepStrictEqual(statuses, [201, 409]);
                const conflictRes = res1.status === 409 ? res1 : res2;
                assert.strictEqual(conflictRes.body.error, 'Taki użytkownik już istnieje.');
            } finally {
                app.setPool(currentPool);
            }
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
            currentMockTotal = 25;
            try {
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

            // Nieprawidłowe wartości ?pracownik= (np. 3abc, xyz, -5) zwracają 400 zamiast cichego ignorowania
            for (const badPracownik of ['3abc', 'xyz', '-5']) {
                const resBadPrac = await request(app)
                    .get(`/api/zgloszenia?pracownik=${badPracownik}`)
                    .set('Authorization', `Bearer ${adminToken}`);
                assert.strictEqual(resBadPrac.status, 400, `pracownik=${badPracownik} powinno zwrócić 400`);
            }

            // Filtr wyszukiwania (?szukaj=) - wyłącznie przez placeholdery ?
            await request(app)
                .get('/api/zgloszenia?szukaj=Warszawa')
                .set('Authorization', `Bearer ${adminToken}`);
            assert.ok(lastExecutedQuery.includes('LIKE ?'));
            // Upewniamy się, że ciąg 'Warszawa' NIE został wklejony do zapytania SQL
            assert.ok(!lastExecutedQuery.includes('Warszawa'));
            // I że znajduje się wyłącznie w parametrach jako '%Warszawa%'
            assert.strictEqual(lastExecutedParams.filter(p => p === '%Warszawa%').length, 14);

            // Escapowanie znaków specjalnych LIKE (\, %, _) w ?szukaj=
            await request(app)
                .get(`/api/zgloszenia?szukaj=${encodeURIComponent('FV_2026%\\test')}`)
                .set('Authorization', `Bearer ${adminToken}`);
            assert.strictEqual(lastExecutedParams.filter(p => p === '%FV\\_2026\\%\\\\test%').length, 14);

            // Łączenie reguły roli pracownika z filtrem statusu i szukaj
            await request(app)
                .get('/api/zgloszenia?status=nowe&szukaj=myBoard')
                .set('Authorization', `Bearer ${pracownikToken}`);
            assert.ok(lastExecutedQuery.includes('z.przypisany_pracownik_id = ?'));
            assert.ok(lastExecutedQuery.includes('z.status = ?'));
            assert.ok(lastExecutedQuery.includes('LIKE ?'));
            assert.strictEqual(lastExecutedParams[0], 1); // ID zalogowanego pracownika
            assert.strictEqual(lastExecutedParams[1], 'nowe'); // status
            } finally {
                currentMockTotal = 1;
            }
        });

        it('GET /api/zgloszenia z ogromnym numerem strony (?strona=99999999999999999999) ogranicza page do totalPages i zwraca 200 bez błędu SQL', async () => {
            currentMockTotal = 60; // przy limit=25 daje totalPages = 3
            try {
                const res = await request(app)
                    .get('/api/zgloszenia?strona=99999999999999999999&limit=25')
                    .set('Authorization', `Bearer ${adminToken}`);
                assert.strictEqual(res.status, 200);
                assert.strictEqual(res.body.totalPages, 3);
                assert.strictEqual(res.body.page, 3);
                // Parametry zapytania SELECT: [limit, offset] = [25, 50] (zamiast 2.5e+21)
                assert.deepStrictEqual(lastExecutedParams, [25, 50]);
            } finally {
                currentMockTotal = 1;
            }
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
            assert.strictEqual(sRealizacjiUnassigned.length, 2);
            assert.strictEqual(sRealizacjiUnassigned.some(a => a.akcja === 'przypisz' && a.etykieta === 'Zmień przypisanie'), true);
            assert.strictEqual(sRealizacjiUnassigned[0].akcja, 'naprawione');
            assert.strictEqual(sRealizacjiUnassigned[0].na_status, 'do_wysylki');

            // Dla zlecenia przypisanego do siebie serwisant widzi akcję 'naprawione', ale dla przypisanego komuś innemu - brak akcji
            const sRealizacjiOwn = wyznacz(serwisant, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 20 });
            assert.strictEqual(sRealizacjiOwn.length, 2);
            assert.strictEqual(sRealizacjiOwn.some(a => a.akcja === 'przypisz' && a.etykieta === 'Zmień przypisanie'), true);
            assert.strictEqual(sRealizacjiOwn[0].akcja, 'naprawione');
            assert.strictEqual(sRealizacjiOwn[0].na_status, 'do_wysylki');
            assert.deepStrictEqual(wyznacz(serwisant, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 5 }), [
                { akcja: 'przypisz', na_status: 'w_realizacji', etykieta: 'Zmień przypisanie', typ: 'przypisanie' }
            ]);

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
            assert.deepStrictEqual(wyznacz(magazynier, { id: 1, status: 'zakończone' }), [
                { akcja: 'edytuj_numer_listu', na_status: 'zakończone', etykieta: 'Edytuj numer listu', typ: 'numer_listu' }
            ]);

            // 4. Rola: ADMIN (zawiera akcje w przód oraz cofanie do wcześniejszych etapów)
            const aNowe = wyznacz(admin, { id: 1, status: 'nowe' });
            assert.strictEqual(aNowe.length, 1);
            assert.strictEqual(aNowe[0].akcja, 'przypisz');
            assert.strictEqual(aNowe[0].typ, 'przypisanie');
            assert.strictEqual(aNowe[0].etykieta, 'Przypisz');

            const aRealizacji = wyznacz(admin, { id: 1, status: 'w_realizacji' });
            assert.strictEqual(aRealizacji.length, 3);
            assert.strictEqual(aRealizacji.some(a => a.typ === 'przypisanie' && a.etykieta === 'Zmień przypisanie'), true);
            assert.strictEqual(aRealizacji.some(a => a.typ === 'cofnij' && a.na_status === 'nowe'), true);
            assert.strictEqual(aRealizacji.some(a => a.typ === 'naprawa' && a.na_status === 'do_wysylki'), true);

            const aWysylka = wyznacz(admin, { id: 1, status: 'do_wysylki' });
            assert.strictEqual(aWysylka.length, 4);
            assert.strictEqual(aWysylka.some(a => a.akcja === 'edytuj_numer_listu' && a.na_status === 'do_wysylki'), true);
            assert.strictEqual(aWysylka.some(a => a.typ === 'cofnij' && a.na_status === 'nowe'), true);
            assert.strictEqual(aWysylka.some(a => a.typ === 'cofnij' && a.na_status === 'w_realizacji'), true);
            assert.strictEqual(aWysylka.some(a => a.typ === 'wysylka' && a.na_status === 'zakończone'), true);

            const aZakonczone = wyznacz(admin, { id: 1, status: 'zakończone' });
            assert.strictEqual(aZakonczone.length, 4);
            assert.strictEqual(aZakonczone.filter(a => a.typ === 'cofnij').length, 3);
            assert.strictEqual(aZakonczone.some(a => a.akcja === 'edytuj_numer_listu' && a.na_status === 'zakończone'), true);
            assert.strictEqual(aNowe.some(a => a.akcja === 'edytuj_numer_listu'), false);
            assert.strictEqual(aRealizacji.some(a => a.akcja === 'edytuj_numer_listu'), false);
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
            assert.strictEqual(resDetailsA.body.dozwolone_akcje.length, 3);
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

        it('PATCH /api/admin/users/:id/status: odrzuca wartości inne niż boolean (np. null, "nie", 0, 1) kodem 400', async () => {
            for (const badVal of [null, 'nie', 'tak', 0, 1, {}, []]) {
                const res = await request(app)
                    .patch('/api/admin/users/1/status')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ aktywny: badVal });
                assert.strictEqual(res.status, 400, `Wartość aktywny=${JSON.stringify(badVal)} powinna zwrócić 400`);
                assert.strictEqual(res.body.error, 'Pole "aktywny" musi mieć wartość true lub false.');
            }
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

        it('Ochrona przed próbami obejścia walidacji hasła spacjami, koercją typów i błędnymi ID', async () => {
            // 1. Próba utworzenia użytkownika z hasłem z samych spacji lub krótkim hasłem dopełnionym spacjami
            const resSpaces = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'user_spacje', password: '        ', role: 'pracownik' });
            assert.strictEqual(resSpaces.status, 400);

            const resPadded = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'user_padded', password: '  abc  ', role: 'pracownik' });
            assert.strictEqual(resPadded.status, 400);
            assert.strictEqual(resPadded.body.error, 'Hasło musi mieć co najmniej 8 znaków.');

            const resTooLong = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'user_toolong', password: 'a'.repeat(73), role: 'pracownik' });
            assert.strictEqual(resTooLong.status, 400);
            assert.strictEqual(resTooLong.body.error, 'Hasło nie może przekraczać 72 znaków.');

            // 2. Próba zablokowania samego siebie przez admina z użyciem stringów "0" lub "false"
            const resSelfZero = await request(app)
                .patch('/api/admin/users/99/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ aktywny: '0' });
            assert.strictEqual(resSelfZero.status, 400);
            assert.ok(resSelfZero.body.error.includes('true lub false'));

            const resSelfFalseStr = await request(app)
                .patch('/api/admin/users/99/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ aktywny: 'false' });
            assert.strictEqual(resSelfFalseStr.status, 400);

            // 3. Częściowo liczbowe ID (np. 99abc) nie przechodzi przez parsePositiveInt
            const resPartialId = await request(app)
                .patch('/api/admin/users/99abc/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ aktywny: false });
            assert.strictEqual(resPartialId.status, 400);

            // 4. POST /api/login z nie-tekstowym username/password zwraca 400 zamiast 500
            const resBadLoginTypes = await request(app)
                .post('/api/login')
                .send({ username: ['admin'], password: { $ne: null } });
            assert.strictEqual(resBadLoginTypes.status, 400);
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

        it('PATCH /api/profil/haslo: limiter po req.user.id blokuje 6. próbę w ciągu 15 minut kodem 429, nie blokując innego użytkownika z tego samego IP', async () => {
            assert.ok(app.hasloLimiter, 'hasloLimiter powinien być wyeksportowany');
            const prevEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            try {
                for (let i = 1; i <= 5; i++) {
                    const res = await request(app)
                        .patch('/api/profil/haslo')
                        .set('Authorization', `Bearer ${pracownikToken}`)
                        .send({ currentPassword: 'zleHaslo123', newPassword: 'NoweSuperHaslo123' });
                    assert.strictEqual(res.status, 400);
                }

                // 6. próba dla tego samego req.user.id (1) zostaje zablokowana (429)
                const blockedRes = await request(app)
                    .patch('/api/profil/haslo')
                    .set('Authorization', `Bearer ${pracownikToken}`)
                    .send({ currentPassword: 'prawidloweHaslo123', newPassword: 'NoweSuperHaslo123' });
                assert.strictEqual(blockedRes.status, 429);
                assert.strictEqual(blockedRes.body.error, 'Zbyt wiele prób zmiany hasła. Spróbuj ponownie za 15 minut.');

                // Inny zalogowany użytkownik (req.user.id = 20) z tego samego IP nie jest zablokowany
                const otherUserRes = await request(app)
                    .patch('/api/profil/haslo')
                    .set('Authorization', `Bearer ${innyPracownikToken}`)
                    .send({ currentPassword: 'prawidloweHaslo123', newPassword: 'NoweSuperHaslo123' });
                assert.strictEqual(otherUserRes.status, 200);
            } finally {
                process.env.NODE_ENV = prevEnv;
                if (typeof app.hasloLimiter.resetKey === 'function') {
                    app.hasloLimiter.resetKey('1');
                    app.hasloLimiter.resetKey('20');
                }
            }
        });

        it('Hasło ze spacją na początku/końcu ("  Haslo123  ") nie jest przycinane przy tworzeniu konta, resecie ani zmianie hasła', async () => {
            const passWithSpaces = '  Haslo123  ';

            // 1. Tworzenie konta przez admina z hasłem "  Haslo123  "
            allExecutedQueries = [];
            const resCreate = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'nowy_spacje', password: passWithSpaces, role: 'pracownik' });
            assert.strictEqual(resCreate.status, 201);
            const createInsert = allExecutedQueries.find(q => q.sql.includes('INSERT INTO uzytkownicy'));
            assert.ok(createInsert, 'Powinien zapisać nowego użytkownika');
            assert.strictEqual(await bcrypt.compare(passWithSpaces, createInsert.values[1]), true);
            assert.strictEqual(await bcrypt.compare(passWithSpaces.trim(), createInsert.values[1]), false);

            // 2. Reset hasła przez admina z hasłem "  Haslo123  "
            allExecutedQueries = [];
            const resReset = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: passWithSpaces });
            assert.strictEqual(resReset.status, 200);
            const resetUpdate = allExecutedQueries.find(q => q.sql.includes('UPDATE uzytkownicy SET password_hash'));
            assert.ok(resetUpdate, 'Powinien zaktualizować password_hash');
            assert.strictEqual(await bcrypt.compare(passWithSpaces, resetUpdate.values[0]), true);

            // 3. Zmiana własnego hasła na "  Haslo123  "
            allExecutedQueries = [];
            const resOwn = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'prawidloweHaslo123', newPassword: passWithSpaces });
            assert.strictEqual(resOwn.status, 200);
            const ownUpdate = allExecutedQueries.find(q => q.sql.includes('UPDATE uzytkownicy SET password_hash'));
            assert.ok(ownUpdate, 'Powinien zaktualizować własny password_hash');
            assert.strictEqual(await bcrypt.compare(passWithSpaces, ownUpdate.values[0]), true);
        });

        it('Limit hasła liczony w bajtach (Buffer.byteLength <= 72): odrzuca 36 × "ą" + cokolwiek (81 bajtów) we wszystkich endpointach haseł', async () => {
            const multiByteTooLong = 'ą'.repeat(36) + 'cokolwiek'; // 45 znaków, ale 81 bajtów w UTF-8 (> 72)
            assert.strictEqual(multiByteTooLong.length, 45);
            assert.strictEqual(Buffer.byteLength(multiByteTooLong), 81);

            const resCreate = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ username: 'user_utf8_pass', password: multiByteTooLong, role: 'pracownik' });
            assert.strictEqual(resCreate.status, 400);

            const resReset = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: multiByteTooLong });
            assert.strictEqual(resReset.status, 400);

            const resOwn = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'prawidloweHaslo123', newPassword: multiByteTooLong });
            assert.strictEqual(resOwn.status, 400);

            // Dokładnie 72 bajty (36 × "ą") jest akceptowane
            const exact72Bytes = 'ą'.repeat(36);
            assert.strictEqual(Buffer.byteLength(exact72Bytes), 72);
            const resExact = await request(app)
                .patch('/api/admin/users/1/haslo')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: exact72Bytes });
            assert.strictEqual(resExact.status, 200);
        });

        it('PATCH /api/profil/haslo: poprawne aktualne i nowe hasło zwraca 200', async () => {
            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ currentPassword: 'prawidloweHaslo123', newPassword: 'NoweSuperHaslo123' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Twoje hasło zostało pomyślnie zmienione. Pozostałe sesje zostały wylogowane.');
            assert.ok(res.body.token, 'Zmiana własnego hasła zwraca nowy token dla bieżącej karty');
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
                .patch('/api/zgloszenia/1/numer-listu')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ numer_listu: 'DPD-NEW-999' });

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
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
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

        it('GET /api/zgloszenia/:id/historia blokuje dostęp (403) pracownikowi do cudzego zlecenia i magazynierowi do zlecenia w realizacji', async () => {
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 20 });
            const respPracownik = await request(app)
                .get('/api/zgloszenia/1/historia')
                .set('Authorization', `Bearer ${pracownikToken}`);
            assert.strictEqual(respPracownik.status, 403);
            assert.strictEqual(respPracownik.body.error, 'Brak uprawnień do przeglądania tego zgłoszenia.');

            const respMagazynier = await request(app)
                .get('/api/zgloszenia/1/historia')
                .set('Authorization', `Bearer ${magazynierToken}`);
            assert.strictEqual(respMagazynier.status, 403);
            assert.strictEqual(respMagazynier.body.error, 'Brak uprawnień do przeglądania tego zgłoszenia.');
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
        it('zgloszeniaLimiter, loginLimiter i hasloLimiter są wyeksportowane i poprawnie skonfigurowane', () => {
            assert.ok(app.zgloszeniaLimiter, 'zgloszeniaLimiter powinien być zdefiniowany');
            assert.ok(app.loginLimiter, 'loginLimiter powinien być zdefiniowany');
            assert.ok(app.hasloLimiter, 'hasloLimiter powinien być zdefiniowany');
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

        it('Aplikacja ma skonfigurowane app.set("trust proxy", "loopback")', () => {
            assert.strictEqual(app.get('trust proxy'), 'loopback');
        });

        it('Bezpośrednio na instancji app za reverse proxy: 6. zgłoszenie z X-Forwarded-For: 1.1.1.1 zwraca 429, a z X-Forwarded-For: 2.2.2.2 zwraca 201', async () => {
            const prevEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            const validPayload = {
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
            };
            try {
                for (let i = 1; i <= 5; i++) {
                    const res = await request(app)
                        .post('/api/zgloszenia')
                        .set('X-Forwarded-For', '1.1.1.1')
                        .send(validPayload);
                    assert.strictEqual(res.status, 201);
                }

                const blockedRes = await request(app)
                    .post('/api/zgloszenia')
                    .set('X-Forwarded-For', '1.1.1.1')
                    .send(validPayload);
                assert.strictEqual(blockedRes.status, 429);

                const otherIpRes = await request(app)
                    .post('/api/zgloszenia')
                    .set('X-Forwarded-For', '2.2.2.2')
                    .send(validPayload);
                assert.strictEqual(otherIpRes.status, 201);
            } finally {
                process.env.NODE_ENV = prevEnv;
                if (typeof app.zgloszeniaLimiter.resetKey === 'function') {
                    app.zgloszeniaLimiter.resetKey('1.1.1.1');
                    app.zgloszeniaLimiter.resetKey('2.2.2.2');
                }
            }
        });

        it('Za reverse proxy (trust proxy: loopback) z włączonym limiterem: 6. zgłoszenie z X-Forwarded-For: 1.1.1.1 zwraca 429, a z X-Forwarded-For: 2.2.2.2 zwraca 201', async () => {
            const express = require('express');
            const rateLimit = require('express-rate-limit');

            const testApp = express();
            testApp.set('trust proxy', 'loopback');
            const limiter = rateLimit({
                windowMs: 60 * 60 * 1000,
                limit: 5,
                message: {
                    error: 'Zbyt wiele zgłoszeń z tego adresu IP. Dozwolony limit to 5 zgłoszeń na godzinę. Spróbuj ponownie później.'
                },
                standardHeaders: true,
                legacyHeaders: false
            });

            testApp.post('/api/zgloszenia', limiter, (req, res) => {
                res.status(201).json({ id: 1, message: 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.' });
            });

            // Pierwsze 5 zgłoszeń z adresu 1.1.1.1 przechodzi pomyślnie (201)
            for (let i = 1; i <= 5; i++) {
                const res = await request(testApp)
                    .post('/api/zgloszenia')
                    .set('X-Forwarded-For', '1.1.1.1');
                assert.strictEqual(res.status, 201);
            }

            // 6. zgłoszenie z adresu 1.1.1.1 zostaje zablokowane kodem 429
            const blockedRes = await request(testApp)
                .post('/api/zgloszenia')
                .set('X-Forwarded-For', '1.1.1.1');
            assert.strictEqual(blockedRes.status, 429);
            assert.strictEqual(
                blockedRes.body.error,
                'Zbyt wiele zgłoszeń z tego adresu IP. Dozwolony limit to 5 zgłoszeń na godzinę. Spróbuj ponownie później.'
            );

            // Zgłoszenie z innego adresu IP (2.2.2.2) przechodzi pomyślnie (201)
            const otherIpRes = await request(testApp)
                .post('/api/zgloszenia')
                .set('X-Forwarded-For', '2.2.2.2');
            assert.strictEqual(otherIpRes.status, 201);
        });

        it('loginLimiter ma skonfigurowane skipSuccessfulRequests: true - udane logowania nie zużywają puli prób', async () => {
            const express = require('express');
            const rateLimit = require('express-rate-limit');

            const testApp = express();
            testApp.set('trust proxy', 'loopback');
            const limiter = rateLimit({
                windowMs: 15 * 60 * 1000,
                limit: 10,
                skipSuccessfulRequests: true,
                message: {
                    error: 'Zbyt wiele prób logowania z tego adresu IP. Spróbuj ponownie za 15 minut.'
                },
                standardHeaders: true,
                legacyHeaders: false
            });

            let failAuth = false;
            testApp.post('/api/login', limiter, (req, res) => {
                if (failAuth) {
                    res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
                } else {
                    res.status(200).json({ token: 'mock-jwt-token' });
                }
            });

            // 15 udanych logowań z jednego IP (np. 1.1.1.1) nie blokuje IP
            for (let i = 0; i < 15; i++) {
                const res = await request(testApp)
                    .post('/api/login')
                    .set('X-Forwarded-For', '1.1.1.1');
                assert.strictEqual(res.status, 200);
            }

            // Teraz 10 nieudanych prób logowania z tego samego IP
            failAuth = true;
            for (let i = 1; i <= 10; i++) {
                const res = await request(testApp)
                    .post('/api/login')
                    .set('X-Forwarded-For', '1.1.1.1');
                assert.strictEqual(res.status, 401);
            }

            // 11. próba logowania z tego samego IP zostaje zablokowana (429)
            const blocked = await request(testApp)
                .post('/api/login')
                .set('X-Forwarded-For', '1.1.1.1');
            assert.strictEqual(blocked.status, 429);

            // Inny użytkownik z innego IP (2.2.2.2) może wysłać próbę logowania
            const otherUser = await request(testApp)
                .post('/api/login')
                .set('X-Forwarded-For', '2.2.2.2');
            assert.strictEqual(otherUser.status, 401); // 401 z logowania, a nie 429
        });
    });

    describe('14. Limit rozmiaru ciała żądania JSON (express.json limit)', () => {
        it('POST /api/zgloszenia z maksymalnym dozwolonym opisem usterki (5000 znaków) i adresem (500 znaków) mieści się w limicie i zwraca 201', async () => {
            allExecutedQueries = [];
            const maxOpis = 'ż'.repeat(5000);
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
            assert.strictEqual(insertZgloszenie.values[12].length, 5000);
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

        it('POST /api/zgloszenia z opisem usterki przekraczającym maksymalną dozwoloną długość (5001 znaków lub 34 000 × "ż") zwraca błąd walidacji 400', async () => {
            const invalidOpis = 'ż'.repeat(34000);
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
                'Pole „Opis usterki” przekracza maksymalną dozwoloną długość (5000 znaków).'
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

        it('Żądanie z nieprawidłowo zakodowanym parametrem URI (np. GET /api/zgloszenia/%E0%A4%A) zwraca JSON 400 bez wycieku stack trace\'a', async () => {
            const response = await request(app).get('/api/zgloszenia/%E0%A4%A');

            assert.strictEqual(response.status, 400);
            assert.match(response.headers['content-type'], /application\/json/);
            assert.strictEqual(response.body.error, 'Nieprawidłowe parametry zapytania URL.');
            assert.strictEqual(response.text.includes('URIError'), false);
            assert.strictEqual(response.text.includes('node_modules'), false);
            assert.strictEqual(response.text.includes('<!DOCTYPE html>'), false);
        });

        it('POST /api/zgloszenia z adresem > 500 znaków oraz PATCH /naprawione z opisem naprawy > 5000 znaków zwracają 400', async () => {
            const resAdres = await request(app)
                .post('/api/zgloszenia')
                .send({
                    imie: 'Jan',
                    nazwisko: 'Kowalski',
                    adres: 'ż'.repeat(501),
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
            assert.strictEqual(resAdres.status, 400);
            assert.strictEqual(resAdres.body.error, 'Pole „Adres” przekracza maksymalną dozwoloną długość (500 znaków).');

            const resNaprawa = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: 'ż'.repeat(5001) });
            assert.strictEqual(resNaprawa.status, 400);
            assert.strictEqual(resNaprawa.body.error, 'Pole "opis_naprawy" przekracza maksymalną dozwoloną długość (5000 znaków).');
        });

        it('.env.example zawiera zdefiniowaną zmienną NODE_ENV=production wraz z opisem', () => {
            const envExample = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
            assert.ok(envExample.includes('NODE_ENV=production'));
            assert.ok(envExample.includes('stack trace'));
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

        it('Nagłówek Content-Security-Policy jest aktywny i zawiera ścisłe dyrektywy bezpieczeństwa', async () => {
            const res = await request(app).get('/api/health');
            const csp = res.headers['content-security-policy'];
            assert.ok(csp, 'Nagłówek Content-Security-Policy powinien być obecny');
            assert.ok(csp.includes("default-src 'self'"));
            assert.ok(csp.includes("script-src 'self'"));
            assert.ok(!csp.includes("'unsafe-eval'"));
            assert.ok(csp.includes("object-src 'none'"));
            assert.ok(csp.includes('https://fonts.googleapis.com'));
            assert.ok(csp.includes('https://fonts.gstatic.com'));
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

        let createdIndexHtml = false;
        let createdLogo = false;
        let createdStaticDir = false;

        before(() => {
            if (!fs.existsSync(staticDir)) {
                fs.mkdirSync(staticDir, { recursive: true });
                createdStaticDir = true;
            }
            fs.writeFileSync(testHashedJs, 'console.log("hashed bundle");');
            fs.writeFileSync(testHashedCss, 'body { color: red; }');
            if (!fs.existsSync(testIndexHtml)) {
                fs.writeFileSync(testIndexHtml, '<!doctype html><html></html>');
                createdIndexHtml = true;
            }
            if (!fs.existsSync(testLogo)) {
                fs.writeFileSync(testLogo, '<svg></svg>');
                createdLogo = true;
            }
        });

        after(() => {
            if (fs.existsSync(testHashedJs)) fs.unlinkSync(testHashedJs);
            if (fs.existsSync(testHashedCss)) fs.unlinkSync(testHashedCss);
            if (createdIndexHtml && fs.existsSync(testIndexHtml)) fs.unlinkSync(testIndexHtml);
            if (createdLogo && fs.existsSync(testLogo)) fs.unlinkSync(testLogo);
            if (fs.existsSync(staticDir) && fs.readdirSync(staticDir).length === 0) {
                fs.rmdirSync(staticDir);
            }
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

    describe('18. Konfiguracja adresu nasłuchiwania (HOST)', () => {
        it('Serwer uruchomiony z domyślnym HOST nasłuchuje na 127.0.0.1 (ochrona przed niezaszyfrowanym ruchem z sieci zewnętrznej)', async () => {
            const host = process.env.HOST || '127.0.0.1';
            const server = app.listen(0, host);
            await new Promise((resolve) => server.once('listening', resolve));
            try {
                const addr = server.address();
                assert.strictEqual(addr.address, '127.0.0.1');
            } finally {
                await new Promise((resolve) => server.close(resolve));
            }
        });

        it('Gdy HOST=0.0.0.0, serwer świadomie binduje się do wszystkich interfejsów sieciowych', async () => {
            const server = app.listen(0, '0.0.0.0');
            await new Promise((resolve) => server.once('listening', resolve));
            try {
                const addr = server.address();
                assert.strictEqual(addr.address, '0.0.0.0');
            } finally {
                await new Promise((resolve) => server.close(resolve));
            }
        });
    });

    describe('19. Walidacja bezpieczeństwa sekretu JWT (JWT_SECRET)', () => {
        const { validateJwtSecret } = require('./jwt-validation');

        it('Brak sekretu JWT lub pusty ciąg znaków zwraca błąd walidacji', () => {
            assert.strictEqual(validateJwtSecret(null).valid, false);
            assert.strictEqual(validateJwtSecret('').valid, false);
            assert.strictEqual(validateJwtSecret('   ').valid, false);
            assert.strictEqual(validateJwtSecret(undefined).valid, false);
        });

        it('Domyślna wartość "wygeneruj_wlasny" z .env.example / README zostaje odrzucona', () => {
            const res = validateJwtSecret('wygeneruj_wlasny');
            assert.strictEqual(res.valid, false);
            assert.match(res.reason, /domyślną\/przykładową wartość JWT_SECRET/);
        });

        it('Domyślna wartość "twoj_klucz_jtw" z README zostaje odrzucona', () => {
            const res = validateJwtSecret('twoj_klucz_jtw');
            assert.strictEqual(res.valid, false);
            assert.match(res.reason, /domyślną\/przykładową wartość JWT_SECRET/);
        });

        it('Sekret krótszy niż 32 znaki zostaje odrzucony ze względów bezpieczeństwa', () => {
            const res = validateJwtSecret('krotki-sekret-123');
            assert.strictEqual(res.valid, false);
            assert.match(res.reason, /zbyt krótka.*minimum 32 znaki/);
        });

        it('Sekret o długości co najmniej 32 znaków, niebędący wartością z szablonu, przechodzi walidację', () => {
            const validSecret = 'a'.repeat(32);
            assert.strictEqual(validateJwtSecret(validSecret).valid, true);

            const randomHex = crypto.randomBytes(32).toString('hex');
            assert.strictEqual(validateJwtSecret(randomHex).valid, true);
        });

        it('Uruchomienie index.js z JWT_SECRET=wygeneruj_wlasny kończy się kodem wyjścia 1 i wypisuje instrukcję generowania klucza', async () => {
            const { spawn } = require('child_process');
            const proc = spawn(process.execPath, ['index.js'], {
                cwd: __dirname,
                env: { ...process.env, JWT_SECRET: 'wygeneruj_wlasny' }
            });

            let stderr = '';
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const exitCode = await new Promise((resolve) => proc.on('close', resolve));
            assert.strictEqual(exitCode, 1);
            assert.match(stderr, /Błąd konfiguracji JWT/);
            assert.match(stderr, /Wygeneruj bezpieczny/);
            assert.match(stderr, /randomBytes\(32\)/);
        });
    });

    describe('20. Bezpieczne logowanie błędów bez danych osobowych (RODO/GDPR - brak err.sql w logach)', () => {
        it('Wymuszenie błędu bazy przy zapisie zgłoszenia (POST /api/zgloszenia) nie ujawnia w logu żadnych danych z formularza (err.sql)', async () => {
            const currentPool = app.getPool();

            const formPayload = {
                imie: 'Aureliusz',
                nazwisko: 'Kwiatkowski',
                adres: 'ul. Tajemnicza 99',
                kod_pocztowy: '01-234',
                miasto: 'Warszawa',
                numer_telefonu: '+48600111222',
                telefon_stacjonarny: '221234567',
                email: 'aureliusz.kwiatkowski.tajny@example.com',
                przedmiot_zgloszenia: 'Projektory',
                data_zakupu: '2026-01-01',
                opis_usterki: 'Poważna awaria zasilania',
                numer_fv: 'FV/999/2026',
                nip: '5250001099',
                zgoda_rodo: true
            };

            // Symulacja błędu mysql2, w którym obiekt błędu zawiera zapytanie z podstawionymi wartościami (err.sql)
            const simulatedMysqlError = new Error("Data too long for column 'opis_usterki' at row 1");
            simulatedMysqlError.code = 'ER_DATA_TOO_LONG';
            simulatedMysqlError.errno = 1406;
            simulatedMysqlError.sql = `INSERT INTO zgloszenia VALUES ('${formPayload.imie}', '${formPayload.nazwisko}', '${formPayload.email}', '${formPayload.numer_telefonu}', '${formPayload.nip}')`;
            simulatedMysqlError.sqlMessage = "Data too long for column 'opis_usterki' at row 1";

            const failingPool = {
                query: async () => {
                    throw simulatedMysqlError;
                }
            };
            app.setPool(failingPool);

            const interceptedLogs = [];
            const originalConsoleError = console.error;
            console.error = (...args) => {
                interceptedLogs.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
            };

            try {
                const response = await request(app)
                    .post('/api/zgloszenia')
                    .send(formPayload);

                assert.strictEqual(response.status, 500);
                assert.strictEqual(response.body.error, 'Błąd serwera podczas zapisywania zgłoszenia do bazy danych.');

                const combinedLogs = interceptedLogs.join('\n');

                // W logach NIE MOŻE być żadnej wartości z formularza (ochrona RODO)
                assert.strictEqual(combinedLogs.includes('Aureliusz'), false, 'Imię nie może trafić do logów');
                assert.strictEqual(combinedLogs.includes('Kwiatkowski'), false, 'Nazwisko nie może trafić do logów');
                assert.strictEqual(combinedLogs.includes('aureliusz.kwiatkowski.tajny@example.com'), false, 'Email nie może trafić do logów');
                assert.strictEqual(combinedLogs.includes('600111222'), false, 'Telefon nie może trafić do logów');
                assert.strictEqual(combinedLogs.includes('5250001099'), false, 'NIP nie może trafić do logów');
                assert.strictEqual(combinedLogs.includes('INSERT INTO'), false, 'err.sql nie może trafić do logów');

                // W logach POWINNA znaleźć się informacja diagnostyczna (kod i treść błędu)
                assert.ok(combinedLogs.includes('ER_DATA_TOO_LONG'), 'Kod błędu powinien być w logach');
                assert.ok(combinedLogs.includes("Data too long for column 'opis_usterki'"), 'Komunikat błędu powinien być w logach');
            } finally {
                console.error = originalConsoleError;
                app.setPool(currentPool);
            }
        });

        it('Funkcja pomocnicza logError loguje wyłącznie err.code i err.message bez właściwości err.sql i err.sqlMessage', () => {
            const interceptedArgs = [];
            const originalConsoleError = console.error;
            console.error = (...args) => {
                interceptedArgs.push(args);
            };

            try {
                const sensitiveError = new Error('Przekroczono limit połączeń');
                sensitiveError.code = 'ER_CON_COUNT_ERROR';
                sensitiveError.sql = "SELECT * FROM users WHERE password_hash = '$2b$10$supersecretpasshash'";
                sensitiveError.sqlMessage = 'Przekroczono limit połączeń';

                app.logError('Błąd bazy danych:', sensitiveError);

                assert.strictEqual(interceptedArgs.length, 1);
                const loggedOutput = interceptedArgs[0].join(' ');

                assert.strictEqual(loggedOutput.includes('$2b$10$supersecretpasshash'), false);
                assert.strictEqual(loggedOutput.includes('SELECT * FROM users'), false);
                assert.ok(loggedOutput.includes('ER_CON_COUNT_ERROR'));
                assert.ok(loggedOutput.includes('Przekroczono limit połączeń'));
            } finally {
                console.error = originalConsoleError;
            }
        });
    });

    describe('21. Transakcje bazodanowe, ochrona przed wyścigami (CAS / 409) i pełna historia 65 000 znaków', () => {
        beforeEach(() => {
            allExecutedQueries = [];
        });

        it('Gdy UPDATE zwraca affectedRows: 0 (ktoś wyprzedził żądanie), endpointy zwracają 409 i robią rollback transakcji', async () => {
            const currentPool = app.getPool();
            let rollbackCount = 0;
            let commitCount = 0;
            let historyInsertCount = 0;

            const casConflictPool = {
                query: async (sql, values) => currentPool.query(sql, values),
                getConnection: async () => ({
                    query: async (sql, values) => {
                        if (typeof sql === 'string' && sql.includes('UPDATE zgloszenia')) {
                            return [{ affectedRows: 0 }];
                        }
                        if (typeof sql === 'string' && sql.includes('INSERT INTO historia_zgloszen')) {
                            historyInsertCount++;
                        }
                        return currentPool.query(sql, values);
                    },
                    beginTransaction: async () => { },
                    commit: async () => { commitCount++; },
                    rollback: async () => { rollbackCount++; },
                    release: () => { }
                })
            };

            app.setPool(casConflictPool);
            try {
                // 1. PATCH /api/zgloszenia/:id/status (np. wysyłka)
                setMockTicket({ id: 1, status: 'do_wysylki' });
                const resStatus = await request(app)
                    .patch('/api/zgloszenia/1/status')
                    .set('Authorization', `Bearer ${magazynierToken}`)
                    .send({ status: 'zakończone', numer_listu: 'DPD-CONFLICT-1' });
                assert.strictEqual(resStatus.status, 409);
                assert.strictEqual(resStatus.body.error, 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.');

                // 2. PATCH /api/zgloszenia/:id/naprawione
                setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
                const resNaprawione = await request(app)
                    .patch('/api/zgloszenia/1/naprawione')
                    .set('Authorization', `Bearer ${pracownikToken}`)
                    .send({ opis_naprawy: 'Naprawa podczas wyścigu' });
                assert.strictEqual(resNaprawione.status, 409);
                assert.strictEqual(resNaprawione.body.error, 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.');

                // 3. PATCH /api/zgloszenia/:id/przypisz na zleceniu "nowe" (ktoś je w międzyczasie przypisał)
                setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });
                const resPrzypisz = await request(app)
                    .patch('/api/zgloszenia/1/przypisz')
                    .set('Authorization', `Bearer ${serwisantToken}`)
                    .send({ pracownik_id: 1 });
                assert.strictEqual(resPrzypisz.status, 409);
                assert.strictEqual(resPrzypisz.body.error, 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.');

                // 4. PATCH /api/zgloszenia/:id/przypisz na zleceniu "w_realizacji", które w międzyczasie przeszło do "do_wysylki"
                setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
                const resPrzepnij = await request(app)
                    .patch('/api/zgloszenia/1/przypisz')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ pracownik_id: 20 });
                assert.strictEqual(resPrzepnij.status, 409);
                assert.strictEqual(resPrzepnij.body.error, 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.');

                assert.strictEqual(rollbackCount, 4, 'Każdy konflikt CAS powinien wywołać rollback()');
                assert.strictEqual(commitCount, 0, 'Żaden konflikt CAS nie może wywołać commit()');
                assert.strictEqual(historyInsertCount, 0, 'Przy konflikcie CAS wpis historii nie może powstać');
            } finally {
                app.setPool(currentPool);
            }
        });

        it('Gdy INSERT do historia_zgloszen rzuca błąd, endpoint zwraca 500 i wykonuje rollback(), a nie commit()', async () => {
            const currentPool = app.getPool();
            let beginCount = 0;
            let rollbackCount = 0;
            let commitCount = 0;
            let releaseCount = 0;

            const failingHistoryPool = {
                query: async (sql, values) => currentPool.query(sql, values),
                getConnection: async () => ({
                    query: async (sql, values) => {
                        if (typeof sql === 'string' && sql.includes('INSERT INTO historia_zgloszen')) {
                            const err = new Error("Data too long for column 'szczegoly' at row 1");
                            err.code = 'ER_DATA_TOO_LONG';
                            throw err;
                        }
                        return currentPool.query(sql, values);
                    },
                    beginTransaction: async () => { beginCount++; },
                    commit: async () => { commitCount++; },
                    rollback: async () => { rollbackCount++; },
                    release: () => { releaseCount++; }
                })
            };

            const origConsoleError = console.error;
            console.error = () => { };
            app.setPool(failingHistoryPool);
            try {
                // 1. PATCH /api/zgloszenia/:id/naprawione
                setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
                const resNaprawione = await request(app)
                    .patch('/api/zgloszenia/1/naprawione')
                    .set('Authorization', `Bearer ${pracownikToken}`)
                    .send({ opis_naprawy: 'Opis naprawy powodujący błąd historii' });
                assert.strictEqual(resNaprawione.status, 500);

                // 2. PATCH /api/zgloszenia/:id/status
                setMockTicket({ id: 1, status: 'do_wysylki', przypisany_pracownik_id: 1 });
                const resStatus = await request(app)
                    .patch('/api/zgloszenia/1/status')
                    .set('Authorization', `Bearer ${magazynierToken}`)
                    .send({ status: 'zakończone', numer_listu: 'DPD-ERR-500' });
                assert.strictEqual(resStatus.status, 500);

                // 3. PATCH /api/zgloszenia/:id/przypisz
                setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: null });
                const resPrzypisz = await request(app)
                    .patch('/api/zgloszenia/1/przypisz')
                    .set('Authorization', `Bearer ${serwisantToken}`)
                    .send({ pracownik_id: 1 });
                assert.strictEqual(resPrzypisz.status, 500);

                // 4. DELETE /api/zgloszenia/:id
                setMockTicket({ id: 1, status: 'nowe' });
                const resDelete = await request(app)
                    .delete('/api/zgloszenia/1')
                    .set('Authorization', `Bearer ${adminToken}`);
                assert.strictEqual(resDelete.status, 500);

                // 5. POST /api/zgloszenia
                const resCreate = await request(app)
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
                assert.strictEqual(resCreate.status, 500);

                assert.strictEqual(beginCount, 5, 'Powinno rozpocząć 5 transakcji');
                assert.strictEqual(rollbackCount, 5, 'Każdy błąd zapisu historii musi wywołać rollback()');
                assert.strictEqual(commitCount, 0, 'Żadna transakcja z błędem historii nie może wywołać commit()');
                assert.strictEqual(releaseCount, 5, 'Każde połączenie musi zostać zwolnione (release)');
            } finally {
                console.error = origConsoleError;
                app.setPool(currentPool);
            }
        });

        it('W DELETE /api/zgloszenia/:id wpis historii i usunięcie są w jednej transakcji: błąd DELETE wycofuje wpis "usunięcie"', async () => {
            const currentPool = app.getPool();
            let rollbackCount = 0;
            let commitCount = 0;

            const failingDeletePool = {
                query: async (sql, values) => currentPool.query(sql, values),
                getConnection: async () => ({
                    query: async (sql, values) => {
                        if (typeof sql === 'string' && sql.includes('DELETE FROM zgloszenia')) {
                            throw new Error('Deadlock found when trying to get lock');
                        }
                        return currentPool.query(sql, values);
                    },
                    beginTransaction: async () => { },
                    commit: async () => { commitCount++; },
                    rollback: async () => { rollbackCount++; },
                    release: () => { }
                })
            };

            const origConsoleError = console.error;
            console.error = () => { };
            app.setPool(failingDeletePool);
            try {
                setMockTicket({ id: 1, status: 'nowe' });
                const res = await request(app)
                    .delete('/api/zgloszenia/1')
                    .set('Authorization', `Bearer ${adminToken}`);

                assert.strictEqual(res.status, 500);
                assert.strictEqual(rollbackCount, 1, 'Błąd DELETE musi wycofać transakcję wraz z wpisem historii');
                assert.strictEqual(commitCount, 0);
            } finally {
                console.error = origConsoleError;
                app.setPool(currentPool);
            }
        });

        it('PATCH /api/zgloszenia/:id/przypisz nie nadpisuje statusu gdy status się nie zmienia, a dla "nowe" zmienia status warunkowo WHERE status = "nowe"', async () => {
            // 1. Zlecenie w statusie 'w_realizacji' -> UPDATE tylko przypisany_pracownik_id (bez status = ?)
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: null });
            const resWRealizacji = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(resWRealizacji.status, 200);

            const updatesWRealizacji = allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia'));
            assert.strictEqual(updatesWRealizacji.length, 1);
            const setClause = updatesWRealizacji[0].sql.split('WHERE')[0];
            assert.strictEqual(setClause.includes('status'), false, 'Samo przypisanie nie może nadpisywać kolumny status');
            assert.ok(updatesWRealizacji[0].sql.includes('WHERE id = ? AND status = ? AND przypisany_pracownik_id <=> ?'), 'Przypisanie musi używać CAS na statusie i dotychczasowym przypisaniu');
            assert.deepStrictEqual(updatesWRealizacji[0].values, [1, 1, 'w_realizacji', null]);

            // 2. Zlecenie w statusie 'nowe' -> osobny UPDATE statusu z WHERE status = 'nowe'
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });
            const resNowe = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 1 });
            assert.strictEqual(resNowe.status, 200);

            const updatesNowe = allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia'));
            assert.strictEqual(updatesNowe.length, 2);
            assert.ok(updatesNowe[0].sql.includes('SET przypisany_pracownik_id = ? WHERE id = ? AND status = ? AND przypisany_pracownik_id <=> ?'));
            assert.ok(updatesNowe[1].sql.includes("WHERE id = ? AND status = 'nowe'"));
        });

        it('Opis naprawy na 65 000 znaków zapisuje pełny wpis "naprawa" w historii, a po cofnięciu statusu pełny opis pozostaje w historii (MEDIUMTEXT)', async () => {
            const longOpis = 'N'.repeat(5000);

            // 1. Zatwierdzenie naprawy na 65 000 znaków
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const resRepair = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${pracownikToken}`)
                .send({ opis_naprawy: longOpis });

            assert.strictEqual(resRepair.status, 200);
            const repairHistory = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen') && q.values[2] === 'naprawa');
            assert.ok(repairHistory, 'Wpis "naprawa" musi zostać zapisany w historia_zgloszen');
            assert.strictEqual(repairHistory.values[5], `Opis naprawy: ${longOpis}`);
            assert.strictEqual(repairHistory.values[5].length, 5014);

            // 2. Cofnięcie statusu przez admina z do_wysylki do w_realizacji
            allExecutedQueries = [];
            const opis65k = 'N'.repeat(65000);
            setMockTicket({ id: 1, status: 'do_wysylki', przypisany_pracownik_id: 1, opis_naprawy: opis65k });
            const resRollback = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'w_realizacji' });

            assert.strictEqual(resRollback.status, 200);
            const rollbackHistory = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen') && q.values[2] === 'zmiana_statusu');
            assert.ok(rollbackHistory, 'Wpis cofnięcia statusu musi zostać zapisany w historia_zgloszen');
            assert.ok(rollbackHistory.values[5].includes(opis65k), 'Pełny 65 000-znakowy opis naprawy musi zachować się w historii po cofnięciu');
            assert.ok(rollbackHistory.values[5].length > 65000);

            // 3. Weryfikacja migracji i schematu (MEDIUMTEXT dla historia_zgloszen.szczegoly)
            const migrationSql = fs.readFileSync(path.join(__dirname, 'migrations', '003_historia_szczegoly_mediumtext.sql'), 'utf8');
            assert.match(migrationSql, /ALTER TABLE historia_zgloszen MODIFY COLUMN szczegoly MEDIUMTEXT NULL/i);
            const schematSql = fs.readFileSync(path.join(__dirname, 'schemat.sql'), 'utf8');
            assert.match(schematSql, /szczegoly\s+MEDIUMTEXT\s+NULL/i);
        });

        it('Brak sieci w frontend/src/api.js rzuca polskie "Brak połączenia z serwerem...", a ErrorBoundary w App.jsx nie wyświetla surowego error.message', async () => {
            const origFetch = global.fetch;
            const origLocalStorage = global.localStorage;
            try {
                global.localStorage = {
                    getItem: () => 'fake-token',
                    setItem: () => {},
                    removeItem: () => {}
                };
                global.fetch = async () => {
                    throw new TypeError('Failed to fetch');
                };

                const { apiFetch, authApi, ticketApi } = await import('./frontend/src/api.js');
                const expectedMsg = 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';

                await assert.rejects(() => apiFetch('/zgloszenia'), { message: expectedMsg });
                await assert.rejects(() => authApi.login('admin', 'secret'), { message: expectedMsg });
                await assert.rejects(() => ticketApi.createTicket({}), { message: expectedMsg });
            } finally {
                global.fetch = origFetch;
                global.localStorage = origLocalStorage;
            }

            const appJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'App.jsx'), 'utf8');
            assert.strictEqual(appJsx.includes('this.state.error?.message'), false);
            assert.ok(appJsx.includes('Nieoczekiwany błąd w interfejsie użytkownika.'));
        });

        it('Usunięcie ostatniego zgłoszenia na stronie w Dashboard.jsx przełącza na poprzednią stronę i pobiera świeżą listę z serwera', () => {
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('remainingOnPage === 0 && page > 1 ? page - 1 : page'));
            assert.ok(dashboardJsx.includes('fetchTickets({ page: targetPage })'));
            assert.strictEqual(dashboardJsx.includes('setTotal((prev) => Math.max(0, prev - 1))'), false);
        });

        it('Szybka zmiana filtrów w Dashboard.jsx ignoruje nieaktualne odpowiedzi sieciowe (ochrona przed race condition / fetchRequestIdRef)', () => {
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('fetchRequestIdRef'));
            assert.ok(dashboardJsx.includes('requestId !== fetchRequestIdRef.current'));
        });

        it('TicketDetailsDrawer nie wykonuje powtórnych zapytań przy zmianie onClose i wyświetla błąd pobierania historii', () => {
            const drawerJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'TicketDetailsDrawer.jsx'), 'utf8');
            assert.ok(drawerJsx.includes('historyError'));
            assert.strictEqual(drawerJsx.includes('.catch(() => {})'), false);
            assert.ok(drawerJsx.includes('}, [ticket?.id]);'));
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('onClose={handleCloseDrawer}'));
            assert.ok(dashboardJsx.includes('handleCloseDrawer = useCallback'));
        });

        it('Polskie etykiety ze STATUS_LABELS i HISTORY_ACTION_LABELS są używane zamiast surowych kodów technicznych', () => {
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('STATUS_LABELS[targetStatus] || targetStatus'));

            const assignModalJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AssignWorkerModal.jsx'), 'utf8');
            assert.ok(assignModalJsx.includes('STATUS_LABELS[ticket.status] || ticket.status'));

            const drawerJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'TicketDetailsDrawer.jsx'), 'utf8');
            assert.ok(drawerJsx.includes('HISTORY_ACTION_LABELS[h.akcja]'));
            assert.ok(drawerJsx.includes('STATUS_LABELS[h.z_statusu]'));
            assert.ok(drawerJsx.includes('STATUS_LABELS[h.na_status]'));
        });

        it('Daty są ujednolicone: serwer zwraca standardowe kolumny timestamp, a frontend używa formatDate i formatDateTime', async () => {
            const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
            assert.strictEqual(appSource.includes("DATE_FORMAT(z.opis_naprawy_data, '%Y-%m-%d %H:%i:%s')"), false);
            assert.strictEqual(appSource.includes("DATE_FORMAT(z.data_wyslania, '%Y-%m-%d %H:%i:%s')"), false);
            assert.strictEqual(appSource.includes("DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i:%s')"), false);

            const { formatDate, formatDateTime } = await import('./frontend/src/constants.js');
            assert.strictEqual(formatDate('2026-10-21'), '21.10.2026');
            assert.strictEqual(formatDate(null), '—');
            assert.ok(formatDateTime('2026-10-21T10:08:42.000Z').includes('2026'));

            const drawerJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'TicketDetailsDrawer.jsx'), 'utf8');
            assert.ok(drawerJsx.includes('formatDateTime(currentTicket.opis_naprawy_data)'));
            assert.ok(drawerJsx.includes('formatDateTime(currentTicket.data_wyslania)'));
            assert.ok(drawerJsx.includes('formatDateTime(h.created_at)'));
            assert.ok(drawerJsx.includes('formatDate(currentTicket.data_zakupu)'));
        });

        it('Lista pracowników do przypisania i filtrowania jest zawsze świeża po zmianach w panelu użytkowników i w modalu przypisania', () => {
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('fetchWorkers = useCallback'));
            assert.ok(dashboardJsx.includes('onWorkersChanged={fetchWorkers}'));
            assert.ok(dashboardJsx.includes('onWorkersLoaded={setWorkers}'));
            assert.ok(dashboardJsx.includes("dashboardTab === 'tickets'"));

            const adminPanelJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AdminUsersPanel.jsx'), 'utf8');
            assert.ok(adminPanelJsx.includes('onWorkersChanged'));
            assert.ok(adminPanelJsx.includes('onWorkersChanged?.()'));

            const assignModalJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AssignWorkerModal.jsx'), 'utf8');
            assert.ok(assignModalJsx.includes('workerApi.getWorkers()'));
            assert.ok(assignModalJsx.includes('onWorkersLoaded?.(freshWorkers)'));
            assert.ok(assignModalJsx.includes('konto zablokowane / nieaktywne'));
            assert.ok(assignModalJsx.includes('Wybrany pracownik jest zablokowany lub nieaktywny'));
        });

        it('Cofnięcie przypisania na zleceniu "nowe" lub nieprzypisanym zwraca 400 i nie tworzy wpisu historii, a na przypisanym unieważnia przypisanie', async () => {
            // 1. Zlecenie w statusie 'nowe' bez pracownika - próba cofnięcia zwraca 400 i nie dodaje historii
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });
            const resNoweEmpty = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `${adminToken}`)
                .send({ pracownik_id: null });
            assert.strictEqual(resNoweEmpty.status, 400);
            assert.ok(resNoweEmpty.body.error.includes('nowego zlecenia'));
            const historyNowe = allExecutedQueries.filter(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.strictEqual(historyNowe.length, 0, 'Nie wolno dodawać wpisu historii przy błędnym cofnięciu na nowym zleceniu');

            // 2. Zlecenie w statusie 'w_realizacji' bez przypisanego pracownika - próba cofnięcia zwraca 400
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: null });
            const resUnassigned = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `${adminToken}`)
                .send({ pracownik_id: '' });
            assert.strictEqual(resUnassigned.status, 400);
            assert.ok(resUnassigned.body.error.includes('nie ma przypisanego pracownika'));
            const historyUnassigned = allExecutedQueries.filter(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.strictEqual(historyUnassigned.length, 0);

            // 3. Zlecenie w statusie 'w_realizacji' z przypisanym pracownikiem 1 - cofnięcie przypisania zwraca 200 i dodaje wpis
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const resAssigned = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `${adminToken}`)
                .send({ pracownik_id: null });
            assert.strictEqual(resAssigned.status, 200);
            assert.strictEqual(resAssigned.body.przypisany_pracownik_id, null);
            const historySuccess = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(historySuccess);
            assert.strictEqual(historySuccess.values[5], 'Cofnięto przypisanie pracownika');
        });

        it('AssignWorkerModal dla nieprzypisanego zlecenia ma wyłączony placeholder, blokuje zatwierdzenie i nie pozwala wybrać "Cofnij przypisanie"', () => {
            const assignModalJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AssignWorkerModal.jsx'), 'utf8');
            assert.ok(assignModalJsx.includes('const isAssigned = Boolean(ticket?.przypisany_pracownik_id);'));
            assert.ok(assignModalJsx.includes('!isAssigned ? ('));
            assert.ok(assignModalJsx.includes('— Wybierz pracownika z listy —'));
            assert.ok(assignModalJsx.includes('disabled={saving || (!isAssigned && !selectedWorkerId)}'));
            assert.ok(assignModalJsx.includes("setError('Wybierz pracownika do realizacji zlecenia.');"));
        });

        it('Weryfikacja usunięcia martwego kodu, zagnieżdżonych main, dvh oraz spójności filtrów i resetu telefonu', async () => {
            // 1. Serwer: GET /api/zgloszenia nie zawiera zdublowanego pola zgloszenia
            const listRes = await request(app).get('/api/zgloszenia').set('Authorization', `${adminToken}`);
            assert.strictEqual(listRes.status, 200);
            assert.ok(Array.isArray(listRes.body.data));
            assert.strictEqual(listRes.body.zgloszenia, undefined, 'Pole zgloszenia nie powinno dublować data');

            // 2. Serwer: wyznaczDozwoloneAkcje nie ma nieosiągalnej gałęzi zmien_status
            const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
            assert.strictEqual(appCode.includes("akcja: 'zmien_status'"), false);

            // 3. Serwer: próba przypisania zlecenia do admina zwraca 400
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: null });
            const resAssignAdmin = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `${adminToken}`)
                .send({ pracownik_id: 99 }); // ID 99 to admin w mockUsers
            assert.strictEqual(resAssignAdmin.status, 400);
            assert.strictEqual(resAssignAdmin.body.error, 'Zlecenie można przypisać wyłącznie do pracownika lub serwisanta.');

            // 4. Frontend constants: EMPTY_TICKET_FORM ma numer_telefonu '+48 ' i brak 'rozpocznij_realizacje'
            const constantsCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'constants.js'), 'utf8');
            assert.ok(constantsCode.includes("numer_telefonu: '+48 '"));
            assert.strictEqual(constantsCode.includes("'rozpocznij_realizacje'"), false);

            // 5. Frontend PublicTicketForm: brak zagnieżdżonych tagów <main>
            const formCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'PublicTicketForm.jsx'), 'utf8');
            assert.strictEqual(formCode.includes('<main'), false);
            assert.strictEqual(formCode.includes('</main'), false);

            // 6. Frontend CSS: .modal-card używa 100dvh
            const cssCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'index.css'), 'utf8');
            assert.ok(cssCode.includes('max-height: calc(100dvh - 2rem);'));

            // 7. Frontend modal i dashboard filtrują pracowników bez roli admin
            const assignModalCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AssignWorkerModal.jsx'), 'utf8');
            assert.ok(assignModalCode.includes(".filter((w) => w.role === 'pracownik' || w.role === 'serwisant')"));
            assert.strictEqual(assignModalCode.includes("w.role === 'admin'"), false);

            const dashCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashCode.includes(".filter((w) => w.role === 'pracownik' || w.role === 'serwisant')"));
            assert.strictEqual(dashCode.includes('data.zgloszenia'), false);
            assert.strictEqual(dashCode.includes('Array.isArray(data) ?'), false);

            // 8. AdminUsersPanel nie ma podwójnego pobierania w useEffect
            const adminPanelCode = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'AdminUsersPanel.jsx'), 'utf8');
            assert.ok(adminPanelCode.includes('fetchUsers();'));
            assert.strictEqual(/userApi\s*\.getUsers\(\)\s*\.then/.test(adminPanelCode), false);
        });

        it('Promise.all z dwóch równoległych żądań "wyślij" na to samo zlecenie zwraca dokładnie jedno 200 i jedno 409 oraz tworzy tylko jeden wpis "wysyłka"', async () => {
            const currentPool = app.getPool();
            let currentDbStatus = 'do_wysylki';
            const recordedHistory = [];

            const concurrentPool = {
                query: async (sql, values) => {
                    if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('FROM zgloszenia')) {
                        // Oba równoległe żądania odczytują stan początkowy 'do_wysylki'
                        return [[{ id: 1, status: 'do_wysylki', przypisany_pracownik_id: 1, opis_naprawy: 'Naprawiono' }]];
                    }
                    return currentPool.query(sql, values);
                },
                getConnection: async () => ({
                    query: async (sql, values) => {
                        if (typeof sql === 'string' && sql.includes('UPDATE zgloszenia') && sql.includes('AND status = ?')) {
                            const expectedStatus = values[values.length - 1];
                            if (currentDbStatus !== expectedStatus) {
                                return [{ affectedRows: 0 }];
                            }
                            currentDbStatus = values[0];
                            return [{ affectedRows: 1 }];
                        }
                        if (typeof sql === 'string' && sql.includes('INSERT INTO historia_zgloszen')) {
                            recordedHistory.push({ akcja: values[2], szczegoly: values[5] });
                            return [{ affectedRows: 1, insertId: recordedHistory.length }];
                        }
                        return currentPool.query(sql, values);
                    },
                    beginTransaction: async () => { },
                    commit: async () => { },
                    rollback: async () => { },
                    release: () => { }
                })
            };

            app.setPool(concurrentPool);
            try {
                const api = request(app);
                const [res1, res2] = await Promise.all([
                    api
                        .patch('/api/zgloszenia/1/status')
                        .set('Authorization', `Bearer ${magazynierToken}`)
                        .send({ status: 'zakończone', numer_listu: 'DPD-111' }),
                    api
                        .patch('/api/zgloszenia/1/status')
                        .set('Authorization', `Bearer ${magazynierToken}`)
                        .send({ status: 'zakończone', numer_listu: 'DPD-222' })
                ]);

                const statuses = [res1.status, res2.status].sort((a, b) => a - b);
                assert.deepStrictEqual(statuses, [200, 409]);
                assert.strictEqual(recordedHistory.length, 1);
                assert.strictEqual(recordedHistory[0].akcja, 'wysyłka');
            } finally {
                app.setPool(currentPool);
            }
        });

        it('magazynier, pracownik, serwisant i admin wołają /naprawione na do_wysylki i zakończone -> 403 albo 409, żaden UPDATE nie poszedł', async () => {
            const roles = [
                { name: 'magazynier', token: magazynierToken, expectedStatus: 403 },
                { name: 'pracownik', token: pracownikToken, expectedStatus: 409 },
                { name: 'serwisant', token: serwisantToken, expectedStatus: 409 },
                { name: 'admin', token: adminToken, expectedStatus: 409 }
            ];

            for (const status of ['do_wysylki', 'zakończone']) {
                for (const role of roles) {
                    allExecutedQueries = [];
                    setMockTicket({ id: 1, status, przypisany_pracownik_id: 1 });
                    const res = await request(app)
                        .patch('/api/zgloszenia/1/naprawione')
                        .set('Authorization', `Bearer ${role.token}`)
                        .send({ opis_naprawy: 'Próba nadpisania opisu' });
                    assert.strictEqual(
                        res.status,
                        role.expectedStatus,
                        `Oczekiwano ${role.expectedStatus} dla roli ${role.name} na statusie ${status}, otrzymano ${res.status}`
                    );
                    const updates = allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia'));
                    assert.strictEqual(updates.length, 0, `Nie powinien pójść żaden UPDATE dla ${role.name} na statusie ${status}`);
                }
            }
        });

        it('serwisant nie może przejąć ani odpiąć cudzego zlecenia (blokada obejścia /naprawione), ale może przepiąć je na innego pracownika', async () => {
            // 1. Zlecenie w_realizacji przypisane do pracownika ID 1, serwisant ma ID 50 w serwisantToken
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });

            // Bezpośrednia próba opisu cudzego zlecenia bez przepisania zwraca 403
            const resDirectRepair = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Próba opisu cudzego zlecenia' });
            assert.strictEqual(resDirectRepair.status, 403);

            // Przepięcie na siebie oraz odpięcie cudzego zlecenia -> 403, bez UPDATE
            for (const pracownik_id of [50, null]) {
                allExecutedQueries = [];
                const res = await request(app)
                    .patch('/api/zgloszenia/1/przypisz')
                    .set('Authorization', `Bearer ${serwisantToken}`)
                    .send({ pracownik_id });
                assert.strictEqual(res.status, 403, `Oczekiwano 403 dla pracownik_id=${pracownik_id}`);
                assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);
            }

            // Zlecenie dalej przypisane do innego pracownika, więc /naprawione nadal zwraca 403
            allExecutedQueries = [];
            const resRepairAfter = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Próba opisu po nieudanym przejęciu' });
            assert.strictEqual(resRepairAfter.status, 403);
            assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);

            // Serwisant przepisuje zgłoszenie w statusie w_realizacji na innego pracownika (ID 20) -> 200 (np. L4, zablokowane konto)
            const resReassignOther = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 20 });
            assert.strictEqual(resReassignOther.status, 200);
            assert.strictEqual(resReassignOther.body.przypisany_pracownik_id, 20);

            // Zlecenie przypisane do samego serwisanta może przepiąć na innego pracownika
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 50 });
            const resReassignOwn = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 20 });
            assert.strictEqual(resReassignOwn.status, 200);

            // 2. Nieprzypisane zlecenie w statusie nowe -> serwisant może przypisać siebie lub innego pracownika
            setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });
            const resAssignNowe = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 50 });
            assert.strictEqual(resAssignNowe.status, 200);
            assert.strictEqual(resAssignNowe.body.status, 'w_realizacji');
            assert.strictEqual(resAssignNowe.body.przypisany_pracownik_id, 50);

            const resAssignNoweOther = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ pracownik_id: 20 });
            assert.strictEqual(resAssignNoweOther.status, 200);
            assert.strictEqual(resAssignNoweOther.body.status, 'w_realizacji');
            assert.strictEqual(resAssignNoweOther.body.przypisany_pracownik_id, 20);
        });

        it('/przypisz na do_wysylki oraz zakończone zwraca 409 i nie wykonuje UPDATE', async () => {
            for (const status of ['do_wysylki', 'zakończone']) {
                for (const token of [serwisantToken, adminToken]) {
                    allExecutedQueries = [];
                    setMockTicket({ id: 1, status, przypisany_pracownik_id: 1 });
                    const res = await request(app)
                        .patch('/api/zgloszenia/1/przypisz')
                        .set('Authorization', `Bearer ${token}`)
                        .send({ pracownik_id: 1 });
                    assert.strictEqual(res.status, 409, `Oczekiwano 409 na statusie ${status}`);
                    const updates = allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia'));
                    assert.strictEqual(updates.length, 0);
                }
            }
        });

        it('cofnięcie do nowe czyści przypisany_pracownik_id (NULL w UPDATE) i zapisuje poprzedniego pracownika w historii', async () => {
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1, opis_naprawy: null });

            const res = await request(app)
                .patch('/api/zgloszenia/1/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'nowe' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.status, 'nowe');
            assert.strictEqual(res.body.przypisany_pracownik_id, null);

            const updateQ = allExecutedQueries.find(q => q.sql.includes('UPDATE zgloszenia'));
            assert.ok(updateQ, 'Powinno pójść zapytanie UPDATE zgloszenia');
            assert.ok(updateQ.sql.includes('przypisany_pracownik_id = NULL'), 'UPDATE powinien ustawiać przypisany_pracownik_id = NULL');

            const histQ = allExecutedQueries.find(q => q.sql.includes('INSERT INTO historia_zgloszen'));
            assert.ok(histQ, 'Powinien powstać wpis w historii');
            assert.ok(histQ.values[5].includes('Poprzednio przypisany pracownik: user_testowy'));
        });

        it('magazynier PATCH /status na zleceniu nowe zwraca 403 bez wycieku statusu w odpowiedzi', async () => {
            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });

            for (const targetStatus of ['nowe', 'w_realizacji', 'zakończone']) {
                const res = await request(app)
                    .patch('/api/zgloszenia/1/status')
                    .set('Authorization', `Bearer ${magazynierToken}`)
                    .send({ status: targetStatus });
                assert.strictEqual(res.status, 403);
                assert.strictEqual(res.body.status, undefined);
                assert.strictEqual(res.body.error.includes('nowe'), false, `Komunikat błędu nie może zdradzać statusu "nowe": ${res.body.error}`);
            }
        });

        it('w panelu serwisant i admin widzą "Zmień przypisanie" na zleceniu w w_realizacji (z dozwolone_akcje)', () => {
            const wyznacz = app.wyznaczDozwoloneAkcje;
            const sActions = wyznacz({ id: 50, role: 'serwisant' }, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
            assert.ok(sActions.some(a => a.akcja === 'przypisz' && a.etykieta === 'Zmień przypisanie'));

            const aActions = wyznacz({ id: 99, role: 'admin' }, { id: 1, status: 'w_realizacji', przypisany_pracownik_id: 1 });
            assert.ok(aActions.some(a => a.akcja === 'przypisz' && a.etykieta === 'Zmień przypisanie'));

            const constantsJs = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'constants.js'), 'utf8');
            assert.ok(constantsJs.includes("const assignAction = actions.find((a) => a.typ === 'przypisanie' || a.akcja === 'przypisz') || null;"));
            assert.strictEqual(constantsJs.includes("curStatus === 'nowe'"), false, 'constants.js nie powinien hardkodować curStatus === nowe');

            const statusControlJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'StatusControl.jsx'), 'utf8');
            assert.ok(statusControlJsx.includes("assignAction?.etykieta || (curStatus === 'w_realizacji' ? 'Zmień przypisanie' : 'Przypisz')"));
        });

        it('PATCH /numer-listu na do_wysylki i zakończone (admin) nie zmienia statusu i zapisuje tylko "zmiana_numeru_listu"', async () => {
            for (const status of ['do_wysylki', 'zakończone']) {
                allExecutedQueries = [];
                setMockTicket({ id: 1, status, przypisany_pracownik_id: 1, numer_listu: 'DPD-OLD' });
                const res = await request(app)
                    .patch('/api/zgloszenia/1/numer-listu')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ numer_listu: '  DPD-POPRAWIONY  ' });
                assert.strictEqual(res.status, 200, `Oczekiwano 200 na statusie ${status}`);
                assert.strictEqual(res.body.status, status);
                assert.strictEqual(res.body.numer_listu, 'DPD-POPRAWIONY');

                const updates = allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia'));
                assert.strictEqual(updates.length, 1);
                assert.ok(updates[0].sql.includes('SET numer_listu = ? WHERE id = ? AND status = ?'));
                assert.strictEqual(updates[0].sql.split('WHERE')[0].includes('status'), false, 'Edycja numeru listu nie może zmieniać statusu');
                assert.deepStrictEqual(updates[0].values, ['DPD-POPRAWIONY', 1, status]);

                const history = allExecutedQueries.filter(q => q.sql.includes('INSERT INTO historia_zgloszen'));
                assert.strictEqual(history.length, 1);
                assert.strictEqual(history[0].values[2], 'zmiana_numeru_listu');
                assert.strictEqual(history[0].values[3], status);
                assert.strictEqual(history[0].values[4], status);
            }
        });

        it('PATCH /numer-listu: pracownik i serwisant -> 403, magazynier na do_wysylki -> 403, admin przed do_wysylki -> 409; bez UPDATE', async () => {
            const cases = [
                { token: pracownikToken, status: 'zakończone', expected: 403 },
                { token: serwisantToken, status: 'zakończone', expected: 403 },
                { token: pracownikToken, status: 'do_wysylki', expected: 403 },
                { token: serwisantToken, status: 'do_wysylki', expected: 403 },
                { token: magazynierToken, status: 'do_wysylki', expected: 403 },
                { token: adminToken, status: 'nowe', expected: 409 },
                { token: adminToken, status: 'w_realizacji', expected: 409 }
            ];
            for (const c of cases) {
                allExecutedQueries = [];
                setMockTicket({ id: 1, status: c.status, przypisany_pracownik_id: 1 });
                const res = await request(app)
                    .patch('/api/zgloszenia/1/numer-listu')
                    .set('Authorization', `Bearer ${c.token}`)
                    .send({ numer_listu: 'DPD-1' });
                assert.strictEqual(res.status, c.expected, `Oczekiwano ${c.expected} na statusie ${c.status}`);
                assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);
            }
        });

        it('PATCH /numer-listu: magazynier na niewidocznym zleceniu dostaje 403 bez statusu, a pusty numer na zakończonym -> 400', async () => {
            setMockTicket({ id: 1, status: 'nowe', przypisany_pracownik_id: null });
            const resHidden = await request(app)
                .patch('/api/zgloszenia/1/numer-listu')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ numer_listu: 'DPD-1' });
            assert.strictEqual(resHidden.status, 403);
            assert.strictEqual(resHidden.body.error.includes('nowe'), false);

            allExecutedQueries = [];
            setMockTicket({ id: 1, status: 'zakończone', numer_listu: 'DPD-OLD' });
            const resEmpty = await request(app)
                .patch('/api/zgloszenia/1/numer-listu')
                .set('Authorization', `Bearer ${magazynierToken}`)
                .send({ numer_listu: '   ' });
            assert.strictEqual(resEmpty.status, 400);
            assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);

            const resMissing = await request(app)
                .patch('/api/zgloszenia/1/numer-listu')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});
            assert.strictEqual(resMissing.status, 400);
        });

        it('/status nie przyjmuje numer_listu poza wysyłką (ten sam status ani cofnięcie) -> 400 bez UPDATE', async () => {
            const cases = [
                { token: adminToken, current: 'do_wysylki', body: { status: 'do_wysylki', numer_listu: 'DPD-1' } },
                { token: adminToken, current: 'zakończone', body: { status: 'do_wysylki', numer_listu: 'DPD-1' } }
            ];
            for (const c of cases) {
                allExecutedQueries = [];
                setMockTicket({ id: 1, status: c.current, przypisany_pracownik_id: 1 });
                const res = await request(app)
                    .patch('/api/zgloszenia/1/status')
                    .set('Authorization', `Bearer ${c.token}`)
                    .send(c.body);
                assert.strictEqual(res.status, 400, `Oczekiwano 400 dla ${JSON.stringify(c.body)} na ${c.current}`);
                assert.ok(res.body.error.includes('Edytuj numer listu'));
                assert.ok(!res.body.error.includes('/api/'), 'Komunikat nie powinien zawierać ścieżek API');
                assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);
            }
        });

        it('Wyścig wysyłki: zlecenie już wysłane przez kogoś innego -> 409 z czytelnym komunikatem, bez UPDATE', async () => {
            for (const token of [adminToken, magazynierToken]) {
                allExecutedQueries = [];
                setMockTicket({ id: 1, status: 'zakończone', przypisany_pracownik_id: 1, numer_listu: 'INPOST-777' });
                const res = await request(app)
                    .patch('/api/zgloszenia/1/status')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ status: 'zakończone', numer_listu: 'DPD-1' });
                assert.strictEqual(res.status, 409);
                assert.ok(res.body.error.includes('zostało już oznaczone jako wysłane'));
                assert.ok(res.body.error.includes('INPOST-777'));
                assert.ok(!res.body.error.includes('/api/'));
                assert.strictEqual(allExecutedQueries.filter(q => q.sql.includes('UPDATE zgloszenia')).length, 0);
            }
        });

        it('Frontend: konflikt 409 zostawia okno otwarte z błędem i odświeża widok w tle (api.js przekazuje status błędu)', () => {
            const apiJs = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'api.js'), 'utf8');
            const dashboard = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            const shipModal = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'ShipModal.jsx'), 'utf8');
            assert.ok(apiJs.includes('err.status = response.status'));
            const conflictBranch = dashboard.match(/if \(err\.status === 409\) \{([\s\S]*?)\}/);
            assert.ok(conflictBranch, 'Brak obsługi 409 w runTicketMutation');
            assert.ok(conflictBranch[1].includes('fetchTickets()') && conflictBranch[1].includes('refreshDrawerTicket('));
            assert.ok(!conflictBranch[1].includes('closeFn'), 'Przy 409 okno nie może się zamykać jak przy sukcesie');
            assert.ok(!conflictBranch[1].includes('return'), 'Przy 409 błąd musi trafić do okna (throw)');
            assert.ok(/if \(err\.status === 409\) \{[\s\S]{0,200}setConflict\(true\)/.test(shipModal));
            assert.ok(shipModal.includes('{!conflict && ('), 'Po konflikcie przycisk zatwierdzenia ma zniknąć');
        });

        it('panel zapisuje numer listu przez /numer-listu bez statusu, a przycisk "Edytuj" bierze się z dozwolone_akcje (także dla magazyniera)', () => {
            const mAkcje = app.wyznaczDozwoloneAkcje({ id: 2, role: 'magazynier' }, { id: 1, status: 'zakończone' });
            assert.ok(mAkcje.some(a => a.akcja === 'edytuj_numer_listu'));

            const apiJs = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'api.js'), 'utf8');
            assert.ok(apiJs.includes('/numer-listu'));
            assert.ok(/saveTrackingNumber\(ticketId, numerListu\)/.test(apiJs), 'saveTrackingNumber nie może przyjmować statusu');

            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.strictEqual(dashboardJsx.includes("|| 'zakończone'"), false, 'Dashboard nie może zgadywać statusu przy zapisie numeru listu');

            const drawerJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'TicketDetailsDrawer.jsx'), 'utf8');
            assert.ok(drawerJsx.includes('trackingAction'));
            assert.strictEqual(drawerJsx.includes("user?.role === 'admin' && onOpenTrackingModal"), false);
        });
    });
    describe('22. Formularz publiczny: wklejony telefon, wspólne reguły walidacji, limit zgłoszeń i data w Polsce', () => {
        const validTicket = () => ({
            imie: 'Jan',
            nazwisko: 'Kowalski',
            adres: 'ul. Testowa 1',
            kod_pocztowy: '00-001',
            miasto: 'Warszawa',
            numer_telefonu: '+48600700800',
            email: 'jan@example.com',
            przedmiot_zgloszenia: 'Projektory',
            data_zakupu: '2026-01-01',
            numer_fv: 'FV/123/2026',
            nip: '1234567890',
            opis_usterki: 'Brak obrazu',
            zgoda_rodo: true
        });

        it('wklejenie numeru w każdym formacie daje +48 600 700 800 (pole z prefiksem "+48 " i po zaznaczeniu całości)', async () => {
            const { normalizePhoneDigits, formatPhone, PHONE_PREFIX } = await import('./frontend/src/constants.js');
            const pasted = ['+48600700800', '48600700800', '0048600700800', '+48 600 700 800', '0048 600 700 800', '600700800', '600-700-800'];
            for (const value of pasted) {
                for (const fieldValue of [PHONE_PREFIX + value, value]) {
                    assert.strictEqual(formatPhone(normalizePhoneDigits(fieldValue)), '+48 600 700 800', `Wklejone: ${JSON.stringify(fieldValue)}`);
                }
            }
            // wpisywanie cyfra po cyfrze i numer zaczynający się od 48 (np. Radom) nie tracą cyfr
            assert.strictEqual(formatPhone(normalizePhoneDigits('+48 600 70')), '+48 600 70');
            assert.strictEqual(formatPhone(normalizePhoneDigits('+48 481 234 567')), '+48 481 234 567');
            assert.strictEqual(formatPhone(normalizePhoneDigits('+48 481 234 5678')), '+48 481 234 567');
            assert.strictEqual(formatPhone(normalizePhoneDigits('+48 ')), '+48 ');

            const formJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'PublicTicketForm.jsx'), 'utf8');
            assert.strictEqual(formJsx.includes('maxLength={15}'), false, 'maxLength=15 ucina wklejany numer, zanim trafi do onChange');
        });

        it('frontend i serwer mają te same reguły (etykiety, długości, regex imienia i e-maila)', async () => {
            const fe = await import('./frontend/src/constants.js');
            const be = app.ticketFormRules;
            assert.deepStrictEqual({ ...fe.FIELD_LABELS }, be.FIELD_LABELS);
            assert.deepStrictEqual({ ...fe.FIELD_MAX_LENGTHS }, be.FIELD_MAX_LENGTHS);
            assert.strictEqual(fe.NAME_REGEX.source, be.NAME_REGEX.source);
            assert.strictEqual(fe.NAME_REGEX.flags, be.NAME_REGEX.flags);
            assert.strictEqual(fe.EMAIL_REGEX.source, be.EMAIL_REGEX.source);
        });

        it('walidacja w przeglądarce odrzuca błędne dane bez żądania do serwera i wskazuje pole', async () => {
            const { validateTicketForm, EMPTY_TICKET_FORM } = await import('./frontend/src/constants.js');
            const form = (patch) => ({
                ...EMPTY_TICKET_FORM,
                ...validTicket(),
                numer_telefonu: '+48 600 700 800',
                ...patch
            });
            assert.strictEqual(validateTicketForm(form({})), null);
            for (const imie of ['José', 'Müller', 'O’Brien', "O'Brien", 'Anna-Maria', 'Łukasz']) {
                assert.strictEqual(validateTicketForm(form({ imie })), null, `${imie} powinno przejść`);
            }
            for (const [patch, field] of [
                [{ imie: 'Jan2' }, 'imie'],
                [{ nazwisko: 'Kowalski!' }, 'nazwisko'],
                [{ imie: '   ' }, 'imie'],
                [{ email: 'jan@' }, 'email'],
                [{ adres: '' }, 'adres'],
                [{ miasto: ' ' }, 'miasto'],
                [{ opis_usterki: '' }, 'opis_usterki'],
                [{ opis_usterki: 'a'.repeat(5001) }, 'opis_usterki'],
                [{ numer_telefonu: '+48 600 700' }, 'numer_telefonu'],
                [{ zgoda_rodo: false }, 'zgoda_rodo']
            ]) {
                const err = validateTicketForm(form(patch));
                assert.ok(err, `Oczekiwano błędu dla ${JSON.stringify(patch).slice(0, 60)}`);
                assert.strictEqual(err.field, field);
                assert.ok(!/opis_usterki|"imie"/.test(err.message), `Komunikat z surową nazwą pola: ${err.message}`);
            }
            assert.strictEqual(validateTicketForm(form({ opis_usterki: '' })).message, 'Pole „Opis usterki” jest wymagane.');
        });

        it('serwer przyjmuje imiona spoza polskiego alfabetu i zwraca polskie nazwy pól w błędach', async () => {
            for (const [imie, nazwisko] of [['José', 'Müller'], ['Seán', 'O’Brien']]) {
                const res = await request(app).post('/api/zgloszenia').send({ ...validTicket(), imie, nazwisko });
                assert.strictEqual(res.status, 201, `${imie} ${nazwisko}: ${res.body.error}`);
            }
            const resDigits = await request(app).post('/api/zgloszenia').send({ ...validTicket(), imie: 'Jan2' });
            assert.strictEqual(resDigits.status, 400);
            assert.ok(resDigits.body.error.startsWith('Pole „Imię”'));

            const resEmpty = await request(app).post('/api/zgloszenia').send({ ...validTicket(), opis_usterki: '   ' });
            assert.strictEqual(resEmpty.status, 400);
            assert.strictEqual(resEmpty.body.error, 'Pole „Opis usterki” jest wymagane.');

            const resRodo = await request(app).post('/api/zgloszenia').send({ ...validTicket(), zgoda_rodo: false });
            assert.strictEqual(resRodo.status, 400);
            assert.strictEqual(resRodo.body.error.includes('zgoda_rodo'), false);
        });

        it('limit zgłoszeń liczy tylko przyjęte: 6 odrzuconych z rzędu, potem poprawne -> 201 (limiter włączony)', async () => {
            const prevEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            const ip = '3.3.3.3';
            try {
                for (let i = 1; i <= 6; i++) {
                    const res = await request(app)
                        .post('/api/zgloszenia')
                        .set('X-Forwarded-For', ip)
                        .send({ ...validTicket(), opis_usterki: '' });
                    assert.strictEqual(res.status, 400, `Próba ${i}`);
                }
                const ok = await request(app).post('/api/zgloszenia').set('X-Forwarded-For', ip).send(validTicket());
                assert.strictEqual(ok.status, 201);
            } finally {
                process.env.NODE_ENV = prevEnv;
                app.zgloszeniaLimiter.resetKey(ip);
            }
        });

        it('honeypot (201) nadal zużywa limit: 6. zgłoszenie bota z tego samego IP -> 429', async () => {
            const prevEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            const ip = '4.4.4.4';
            try {
                for (let i = 1; i <= 5; i++) {
                    const res = await request(app).post('/api/zgloszenia').set('X-Forwarded-For', ip).send({ website: 'spam' });
                    assert.strictEqual(res.status, 201);
                }
                const blocked = await request(app).post('/api/zgloszenia').set('X-Forwarded-For', ip).send({ website: 'spam' });
                assert.strictEqual(blocked.status, 429);
            } finally {
                process.env.NODE_ENV = prevEnv;
                app.zgloszeniaLimiter.resetKey(ip);
            }
        });

        it('data zakupu: zegar 23:30 UTC (01:30 w Polsce) - dzisiejsza polska data przechodzi po obu stronach', async () => {
            const fe = await import('./frontend/src/constants.js');
            const summer = new Date('2026-07-14T23:30:00Z'); // 01:30 15 lipca w Polsce (CEST)
            const winter = new Date('2026-01-14T23:30:00Z'); // 00:30 15 stycznia w Polsce (CET)
            for (const [now, today, tomorrow] of [[summer, '2026-07-15', '2026-07-16'], [winter, '2026-01-15', '2026-01-16']]) {
                assert.strictEqual(fe.todayInPoland(now), today);
                assert.strictEqual(app.validatePurchaseDate(today, now), null);
                assert.strictEqual(fe.validatePurchaseDate(today, now), null);
                assert.ok(app.validatePurchaseDate(tomorrow, now));
                assert.ok(fe.validatePurchaseDate(tomorrow, now));
            }

            const formJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'PublicTicketForm.jsx'), 'utf8');
            assert.strictEqual(formJsx.includes('toISOString().split'), false, 'Dzisiejsza data nie może być liczona w UTC');
            assert.ok(formJsx.includes('max={todayInPoland()}'), 'Atrybut max ma być liczony przy renderze');
        });

        it('błędy formularza nie znikają same, timer alertu jest czyszczony, a zaślepki treści są tylko w tresci.js', () => {
            const formJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'PublicTicketForm.jsx'), 'utf8');
            const showAlert = formJsx.match(/function showAlert\([^)]*\) \{([\s\S]*?)\n  \}/);
            assert.ok(showAlert, 'Brak showAlert');
            assert.ok(showAlert[1].includes('clearTimeout(alertTimerRef.current)'));
            assert.ok(/if \(type === 'success'\) \{\s*alertTimerRef\.current = setTimeout/.test(showAlert[1]), 'Automatycznie znika tylko sukces');
            assert.ok(formJsx.includes('scrollIntoView') && formJsx.includes('.focus('), 'Błąd ma być przewinięty i dostać fokus');

            assert.strictEqual(/\[X\]|Placeholder/.test(formJsx), false, 'Zaślepki treści mają być wyłącznie w tresci.js');
            const tresci = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'tresci.js'), 'utf8');
            assert.ok(tresci.includes('CZAS_KONTAKTU_DNI_ROBOCZYCH') && tresci.includes('KLAUZULA_INFORMACYJNA'));
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
            assert.strictEqual(pkg.scripts['check:placeholders'], 'node scripts/check-placeholders.js');
        });
    });
    describe('23. Unieważnianie sesji (token_version), GET /api/me i "Wyloguj wszędzie"', () => {
        let mockPoolBefore;
        let users;

        // Mock bazy z pamięcią stanu użytkowników (token_version, hasło, rola)
        const statefulPool = {
            query: async (sql, values = []) => {
                if (typeof sql !== 'string' || !sql.includes('uzytkownicy')) return [[]];
                if (sql.startsWith('UPDATE uzytkownicy')) {
                    const user = users.get(Number(values[values.length - 1]));
                    if (!user) return [{ affectedRows: 0 }];
                    if (sql.includes('password_hash = ?')) user.password_hash = values[0];
                    if (sql.includes('role = ?')) user.role = values[0];
                    if (sql.includes('token_version = token_version + 1')) user.token_version += 1;
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('WHERE username = ?')) {
                    const user = [...users.values()].find(u => u.username === values[0]);
                    return [user ? [{ ...user }] : []];
                }
                if (sql.includes('WHERE id = ?')) {
                    const user = users.get(Number(values[0]));
                    return [user ? [{ ...user }] : []];
                }
                return [[]];
            },
            getConnection: async () => ({
                query: (sql, values) => statefulPool.query(sql, values),
                beginTransaction: async () => { },
                commit: async () => { },
                rollback: async () => { },
                release: () => { }
            })
        };

        const login = async (username, password) => {
            const res = await request(app).post('/api/login').send({ username, password });
            assert.strictEqual(res.status, 200, `Logowanie ${username}: ${res.body.error}`);
            return res.body.token;
        };
        const me = (token) => request(app).get('/api/me').set('Authorization', `Bearer ${token}`);

        before(async () => {
            mockPoolBefore = app.getPool();
            app.setPool(statefulPool);
        });

        after(() => {
            app.setPool(mockPoolBefore);
        });

        beforeEach(async () => {
            const hash = await bcrypt.hash('StareHaslo123', 4);
            users = new Map([
                [5, { id: 5, username: 'jan_serwisant', password_hash: hash, role: 'serwisant', aktywny: 1, token_version: 0 }],
                [6, { id: 6, username: 'szef_admin', password_hash: hash, role: 'admin', aktywny: 1, token_version: 0 }]
            ]);
        });

        it('logowanie -> zmiana własnego hasła -> stary token dostaje 401, nowy token z odpowiedzi działa', async () => {
            const oldToken = await login('jan_serwisant', 'StareHaslo123');
            assert.strictEqual(jwt.decode(oldToken).tv, 0);

            const res = await request(app)
                .patch('/api/profil/haslo')
                .set('Authorization', `Bearer ${oldToken}`)
                .send({ currentPassword: 'StareHaslo123', newPassword: 'NoweHaslo456' });
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body.user, { id: 5, username: 'jan_serwisant', role: 'serwisant' });

            const resOld = await me(oldToken);
            assert.strictEqual(resOld.status, 401);
            assert.ok(resOld.body.error.includes('Sesja została zakończona'));
            assert.strictEqual((await me(res.body.token)).status, 200);
            assert.strictEqual((await request(app).post('/api/login').send({ username: 'jan_serwisant', password: 'StareHaslo123' })).status, 401);
        });

        it('reset hasła przez admina unieważnia tokeny użytkownika, a admin dalej działa', async () => {
            const userToken = await login('jan_serwisant', 'StareHaslo123');
            const adminTok = await login('szef_admin', 'StareHaslo123');

            const res = await request(app)
                .patch('/api/admin/users/5/haslo')
                .set('Authorization', `Bearer ${adminTok}`)
                .send({ password: 'ResetHaslo789' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.token, undefined, 'Nowy token dostaje tylko admin resetujący własne hasło');

            assert.strictEqual((await me(userToken)).status, 401);
            assert.strictEqual((await me(adminTok)).status, 200);
        });

        it('admin resetujący własne hasło dostaje nowy token, stary przestaje działać', async () => {
            const adminTok = await login('szef_admin', 'StareHaslo123');
            const res = await request(app)
                .patch('/api/admin/users/6/haslo')
                .set('Authorization', `Bearer ${adminTok}`)
                .send({ password: 'ResetHaslo789' });
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.token);
            assert.strictEqual((await me(adminTok)).status, 401);
            assert.strictEqual((await me(res.body.token)).status, 200);
        });

        it('zmiana roli: stary token dostaje 401, po ponownym logowaniu /api/me zwraca nową rolę', async () => {
            const userToken = await login('jan_serwisant', 'StareHaslo123');
            const adminTok = await login('szef_admin', 'StareHaslo123');
            assert.strictEqual((await me(userToken)).body.role, 'serwisant');

            const res = await request(app)
                .patch('/api/admin/users/5')
                .set('Authorization', `Bearer ${adminTok}`)
                .send({ role: 'pracownik' });
            assert.strictEqual(res.status, 200);

            assert.strictEqual((await me(userToken)).status, 401);
            const newToken = await login('jan_serwisant', 'StareHaslo123');
            assert.deepStrictEqual((await me(newToken)).body, { id: 5, username: 'jan_serwisant', role: 'pracownik' });

            // Zapis tej samej roli niczego nie zmienia, więc nie wylogowuje
            const resSame = await request(app)
                .patch('/api/admin/users/5')
                .set('Authorization', `Bearer ${adminTok}`)
                .send({ role: 'pracownik' });
            assert.strictEqual(resSame.status, 200);
            assert.strictEqual((await me(newToken)).status, 200);
        });

        it('"Wyloguj wszędzie" unieważnia wszystkie tokeny użytkownika, łącznie z bieżącym', async () => {
            const tokenA = await login('jan_serwisant', 'StareHaslo123');
            const tokenB = await login('jan_serwisant', 'StareHaslo123');
            const res = await request(app).post('/api/wyloguj-wszedzie').set('Authorization', `Bearer ${tokenA}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual((await me(tokenA)).status, 401);
            assert.strictEqual((await me(tokenB)).status, 401);
            assert.strictEqual((await me(await login('jan_serwisant', 'StareHaslo123'))).status, 200);
        });

        it('token bez claimu "tv" (wydany przed migracją 004) działa, dopóki wersja w bazie to 0', async () => {
            const legacy = makeToken('serwisant', 5, 'jan_serwisant');
            assert.strictEqual((await me(legacy)).status, 200);
            users.get(5).token_version = 1;
            assert.strictEqual((await me(legacy)).status, 401);
        });

        it('/api/me bierze rolę z bazy, a nie z tokenu', async () => {
            const token = await login('jan_serwisant', 'StareHaslo123');
            users.get(5).role = 'magazynier'; // np. zmiana bezpośrednio w bazie, bez podbicia wersji
            const res = await me(token);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.role, 'magazynier');
        });

        // Pamięć typu localStorage/sessionStorage dla testów modułów frontendu w Node
        const memoryStorage = (initial = {}) => {
            const data = new Map(Object.entries(initial));
            return {
                getItem: (k) => (data.has(k) ? data.get(k) : null),
                setItem: (k, v) => data.set(k, String(v)),
                removeItem: (k) => data.delete(k),
                data
            };
        };
        const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

        it('panel: 401 czyści sesję i przekazuje komunikat "Sesja wygasła" do ekranu logowania', async () => {
            const origFetch = global.fetch;
            const origLocalStorage = global.localStorage;
            const { apiPatch, onUnauthorized, SESSION_EXPIRED_MESSAGE } = await import('./frontend/src/api.js');
            const messages = [];
            const off = onUnauthorized((m) => messages.push(m));
            try {
                global.localStorage = memoryStorage({ serwis_token: 'smieci', serwis_user: '{"id":5}' });
                global.fetch = async () => jsonResponse(401, { error: 'Odmowa dostępu: Nieprawidłowy lub wygasły token JWT' });
                const result = await apiPatch('/zgloszenia/1/naprawione', { opis_naprawy: 'x' });
                assert.strictEqual(result, null);
                assert.deepStrictEqual(messages, [SESSION_EXPIRED_MESSAGE]);
                assert.ok(SESSION_EXPIRED_MESSAGE.startsWith('Sesja wygasła'));
                assert.strictEqual(global.localStorage.getItem('serwis_token'), null);
            } finally {
                off();
                global.fetch = origFetch;
                global.localStorage = origLocalStorage;
            }
        });

        it('panel: 401 starego tokenu nie wylogowuje sesji, którą w międzyczasie zalogowała inna karta', async () => {
            const origFetch = global.fetch;
            const origLocalStorage = global.localStorage;
            const { apiJson, onUnauthorized } = await import('./frontend/src/api.js');
            let called = 0;
            const off = onUnauthorized(() => called++);
            try {
                global.localStorage = memoryStorage({ serwis_token: 'token-admina' });
                global.fetch = async () => {
                    global.localStorage.setItem('serwis_token', 'token-magazyniera'); // logowanie w innej karcie w trakcie żądania
                    return jsonResponse(401, { error: 'x' });
                };
                assert.strictEqual(await apiJson('/zgloszenia'), null);
                assert.strictEqual(called, 0);
                assert.strictEqual(global.localStorage.getItem('serwis_token'), 'token-magazyniera');
            } finally {
                off();
                global.fetch = origFetch;
                global.localStorage = origLocalStorage;
            }
        });

        it('panel: po 403 pobiera /api/me i aktualizuje rolę w sesji, a zmiana własnego hasła zapisuje nowy token', async () => {
            const origFetch = global.fetch;
            const origLocalStorage = global.localStorage;
            const { apiJson, onSessionUpdated, userApi } = await import('./frontend/src/api.js');
            const updates = [];
            const off = onSessionUpdated((token, user) => updates.push({ token, user }));
            try {
                global.localStorage = memoryStorage({
                    serwis_token: 'tok',
                    serwis_user: JSON.stringify({ id: 5, username: 'jan', role: 'serwisant' })
                });
                const calls = [];
                global.fetch = async (url, opts = {}) => {
                    calls.push(url);
                    if (url === '/api/me') return jsonResponse(200, { id: 5, username: 'jan', role: 'pracownik' });
                    if (url === '/api/profil/haslo') return jsonResponse(200, { message: 'ok', token: 'nowy-tok', user: { id: 5, username: 'jan', role: 'pracownik' } });
                    return jsonResponse(403, { error: 'Brak uprawnień.' });
                };
                await assert.rejects(() => apiJson('/zgloszenia/1/przypisz', { method: 'PATCH' }), { status: 403 });
                await new Promise((r) => setTimeout(r, 20));
                assert.ok(calls.includes('/api/me'), 'Po 403 panel pyta /api/me');
                assert.strictEqual(JSON.parse(global.localStorage.getItem('serwis_user')).role, 'pracownik');
                assert.deepStrictEqual(updates.at(-1), { token: 'tok', user: { id: 5, username: 'jan', role: 'pracownik' } });

                await userApi.changeOwnPassword({ currentPassword: 'a', newPassword: 'b' });
                assert.strictEqual(global.localStorage.getItem('serwis_token'), 'nowy-tok');
                assert.strictEqual(updates.at(-1).token, 'nowy-tok');
            } finally {
                off();
                global.fetch = origFetch;
                global.localStorage = origLocalStorage;
            }
        });

        it('panel: szkice (opis naprawy, numer listu) i okno do przywrócenia są przypisane do użytkownika i znikają po udanym zapisie', async () => {
            const origWindow = global.window;
            global.window = { sessionStorage: memoryStorage() };
            try {
                const szkice = await import('./frontend/src/szkice.js');
                const key = szkice.modalDraftKey('repair', 5, 39);
                szkice.writeDraft(key, 'Długi opis naprawy');
                szkice.rememberOpenModal('repair', 5, 39);
                assert.strictEqual(szkice.readDraft(key), 'Długi opis naprawy');
                assert.deepStrictEqual(szkice.pendingModal(5), { kind: 'repair', ticketId: 39 });
                assert.strictEqual(szkice.pendingModal(6), null, 'Inny użytkownik w tej karcie nie dostaje cudzego okna');
                assert.notStrictEqual(szkice.modalDraftKey('repair', 6, 39), key);
                szkice.clearDraft(key);
                szkice.forgetOpenModal();
                assert.strictEqual(szkice.readDraft(key), null);
                assert.strictEqual(szkice.pendingModal(5), null);

                // Numer listu: osobne szkice dla "Oznacz jako wysłane" i edycji numeru, niezależne od szkicu naprawy
                const shipKey = szkice.modalDraftKey('ship', 5, 39);
                const trackingKey = szkice.modalDraftKey('tracking', 5, 39);
                assert.strictEqual(new Set([key, shipKey, trackingKey]).size, 3);
                szkice.writeDraft(shipKey, 'DPD0123456789PL');
                szkice.rememberOpenModal('ship', 5, 39);
                assert.deepStrictEqual(szkice.pendingModal(5), { kind: 'ship', ticketId: 39 });
                assert.strictEqual(szkice.readDraft(shipKey), 'DPD0123456789PL');
                assert.strictEqual(szkice.readDraft(trackingKey), null);
                szkice.rememberOpenModal('tracking', 5, 39);
                assert.deepStrictEqual(szkice.pendingModal(5), { kind: 'tracking', ticketId: 39 });
                szkice.rememberOpenModal('nieznane', 5, 39);
                assert.strictEqual(szkice.pendingModal(5), null, 'Nieznany rodzaj okna nie jest przywracany');
            } finally {
                global.window = origWindow;
            }

            const repairJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'RepairModal.jsx'), 'utf8');
            assert.ok(repairJsx.includes('readDraft(draftKey) ?? ticket?.opis_naprawy'));
            assert.ok(/const saved = await onSubmit\([\s\S]{0,60}if \(saved\) clearDraft\(draftKey\)/.test(repairJsx), 'Szkic znika tylko po udanym zapisie');
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('if (!data) return false;'), 'runTicketMutation odróżnia wygasłą sesję od sukcesu');
            assert.ok(dashboardJsx.includes('pendingModal(user?.id)'));
            assert.ok(dashboardJsx.includes("rememberOpenModal('ship', user?.id, ticket.id)"));
            assert.ok(dashboardJsx.includes("rememberOpenModal('tracking', user?.id, ticket.id)"));
            assert.ok(dashboardJsx.includes('onOpenTrackingModal={handleOpenTrackingModal}'));
            assert.strictEqual((dashboardJsx.match(/userId=\{user\?\.id\}/g) || []).length, 3, 'RepairModal i oba ShipModal dostają userId');

            const shipJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'components', 'ShipModal.jsx'), 'utf8');
            assert.ok(shipJsx.includes('readDraft(draftKey) ?? savedNumer'));
            assert.ok(/const saved = await handler\([\s\S]{0,60}if \(saved\) clearDraft\(draftKey\)/.test(shipJsx), 'Szkic numeru listu znika tylko po udanym zapisie');
            assert.ok(!/await handler\([^)]*\);\s*onClose\(\)/.test(shipJsx), 'Po wygaśnięciu sesji okno nie może się zamknąć i skasować okna do przywrócenia');
            assert.ok(/setConflict\(true\);\s*clearDraft\(draftKey\)/.test(shipJsx), 'Po 409 nieaktualny szkic jest usuwany');
        });

        it('panel: synchronizacja kart (zdarzenie storage), świeży Dashboard dla innego użytkownika/roli i komunikat na ekranie logowania', () => {
            const appJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'App.jsx'), 'utf8');
            assert.ok(appJsx.includes("window.addEventListener('storage', handleStorage)"));
            assert.ok(appJsx.includes("setLoginNotice('Wylogowano w innej karcie przeglądarki.')"));
            assert.ok(appJsx.includes('key={`${user?.id}:${user?.role}`}'));
            assert.ok(appJsx.includes('if (token) authApi.me();'));
            const loginJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'LoginForm.jsx'), 'utf8');
            assert.ok(loginJsx.includes("notice ? { message: notice, type: 'info' }"));
            const dashboardJsx = fs.readFileSync(path.join(__dirname, 'frontend', 'src', 'pages', 'Dashboard.jsx'), 'utf8');
            assert.ok(dashboardJsx.includes('onClick={() => onLogout()}'), 'Zdarzenie kliknięcia nie może trafić do onLogout jako komunikat');
            assert.ok(dashboardJsx.includes('authApi.logoutEverywhere()'));
        });

        it('migracja 004 dodaje uzytkownicy.token_version, a schemat referencyjny ją zawiera', () => {
            const migration = fs.readFileSync(path.join(__dirname, 'migrations', '004_uzytkownicy_token_version.sql'), 'utf8');
            assert.ok(/ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0/.test(migration));
            const schema = fs.readFileSync(path.join(__dirname, 'schemat.sql'), 'utf8');
            assert.ok(schema.includes('token_version INT NOT NULL DEFAULT 0'));
        });
    });

    describe('24. Dostępność panelu: klawiatura, okna dialogowe, etykiety pól i linter jsx-a11y', () => {
        const src = (...parts) => fs.readFileSync(path.join(__dirname, 'frontend', 'src', ...parts), 'utf8');
        const allSources = () => {
            const files = [];
            const walk = (dir) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) walk(full);
                    else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push([path.relative(__dirname, full), fs.readFileSync(full, 'utf8')]);
                }
            };
            walk(path.join(__dirname, 'frontend', 'src'));
            return files;
        };

        it('zgłoszenie otwiera się z klawiatury: numer w wierszu i na karcie to przycisk, bez stopPropagation', () => {
            const dashboardJsx = src('pages', 'Dashboard.jsx');
            assert.strictEqual((dashboardJsx.match(/aria-label=\{`Szczegóły zgłoszenia #\$\{t\.id\}`\}/g) || []).length, 2, 'Przycisk z numerem w tabeli i na karcie mobilnej');
            assert.strictEqual((dashboardJsx.match(/onClick=\{\(e\) => handleTicketAreaClick\(e, t\)\}/g) || []).length, 2);
            assert.ok(dashboardJsx.includes("e.target.closest('button, a, input, select, textarea, label')"), 'Kliknięcie w przycisk w wierszu nie otwiera panelu');
            assert.strictEqual(dashboardJsx.includes('stopPropagation'), false);
        });

        it('Modal i panel szczegółów są oknami dialogowymi z tytułem i nazwanym przyciskiem zamknięcia', () => {
            const modalJsx = src('components', 'Modal.jsx');
            const drawerJsx = src('components', 'TicketDetailsDrawer.jsx');
            for (const [name, code] of [['Modal', modalJsx], ['TicketDetailsDrawer', drawerJsx]]) {
                assert.ok(code.includes('<dialog'), `${name}: <dialog>`);
                assert.ok(code.includes('aria-modal="true"'), `${name}: aria-modal`);
                assert.ok(code.includes('aria-labelledby={titleId}') && code.includes('id={titleId}'), `${name}: aria-labelledby na tytuł`);
                assert.ok(code.includes('useDialog(dialogRef, onClose)'), `${name}: wspólna obsługa klawiatury`);
                assert.strictEqual(code.includes("addEventListener('keydown'"), false, `${name}: Escape nie może być nasłuchiwany osobno na window`);
            }
            assert.ok(modalJsx.includes('aria-label="Zamknij"'));
            assert.ok(drawerJsx.includes('aria-label="Zamknij panel szczegółów"'));
            // Przewijana treść panelu dostaje fokus po otwarciu, żeby strzałki / PageDown przewijały ją z klawiatury
            assert.ok(/<section\s+aria-label=\{`Szczegóły zgłoszenia #\$\{ticket\.id\}`\}\s+tabIndex=\{0\}\s+data-autofocus\s+className="flex-1 overflow-y-auto/.test(drawerJsx), 'Przewijana treść panelu musi być osiągalna z klawiatury');
        });

        it('useDialog: Escape i Tab tylko dla okna na wierzchu, pułapka fokusu i powrót fokusu do przycisku', () => {
            const hook = src('useDialog.js');
            assert.ok(hook.includes('if (topDialog() !== entry || !node) return;'), 'Okno pod spodem ignoruje Escape i Tab');
            assert.ok(hook.includes("if (e.key === 'Escape')"));
            assert.ok(/e\.shiftKey && active === first[\s\S]{0,80}last\.focus\(\)/.test(hook), 'Shift+Tab z pierwszego elementu przechodzi na ostatni');
            assert.ok(/!e\.shiftKey && active === last[\s\S]{0,80}first\.focus\(\)/.test(hook), 'Tab z ostatniego elementu wraca na pierwszy');
            assert.ok(hook.includes('const opener = document.activeElement;'));
            assert.ok(hook.includes('opener?.isConnected'), 'Po zamknięciu fokus wraca do elementu, który otworzył okno');
            assert.ok(hook.includes("querySelector('[data-autofocus]')"));
        });

        it('pola mają etykiety: hasła z autoComplete, rola użytkownika, cofnięcie statusu, wyszukiwarka i filtry', () => {
            const passwordJsx = src('components', 'PasswordModal.jsx');
            for (const id of ['currentPassword', 'newPassword', 'confirmPassword']) {
                assert.ok(passwordJsx.includes(`htmlFor="${id}"`) && passwordJsx.includes(`id="${id}"`), id);
            }
            assert.ok(passwordJsx.includes('autoComplete="current-password"'));
            assert.strictEqual((passwordJsx.match(/autoComplete="new-password"/g) || []).length, 2);

            const adminJsx = src('components', 'AdminUsersPanel.jsx');
            for (const id of ['newUserUsername', 'newUserPassword', 'newUserRole']) {
                assert.ok(adminJsx.includes(`htmlFor="${id}"`) && adminJsx.includes(`id="${id}"`), id);
            }
            assert.ok(adminJsx.includes('htmlFor={`userRole-${u.id}`}'));
            assert.ok(adminJsx.includes('aria-label={id ? undefined : `Rola użytkownika ${u.username}`}'));
            assert.strictEqual(adminJsx.includes('focus:border-primary/30'), false, 'Prawie niewidoczny fokus');

            const rollbackJsx = src('components', 'RollbackStatusModal.jsx');
            assert.ok(/rollbackActions\.length === 1 \? \(\s*<div[^>]*>Status docelowy:<\/div>\s*\) : \(\s*<label htmlFor="targetStatusSelect"/.test(rollbackJsx), 'Etykieta tylko wtedy, gdy istnieje pole wyboru');

            const dashboardJsx = src('pages', 'Dashboard.jsx');
            for (const label of ['Szukaj w zgłoszeniach', 'Filtruj według statusu zgłoszenia', 'Filtruj według przypisanego pracownika', 'Kolejność sortowania po dacie', 'Wyczyść szukanie']) {
                assert.ok(dashboardJsx.includes(`aria-label="${label}"`), label);
            }
        });

        it('brak autoFocus i outline-none bez widocznego zamiennika fokusu w całym frontendzie', () => {
            for (const [file, code] of allSources()) {
                assert.strictEqual(/\bautoFocus\b/.test(code), false, `${file}: autoFocus (użyj data-autofocus)`);
                for (const cls of code.match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) || []) {
                    if (/\boutline-none\b/.test(cls)) {
                        assert.ok(/focus(-visible)?:ring|\b(modal-card|drawer-panel)\b/.test(cls), `${file}: outline-none bez zamiennika: ${cls}`);
                    }
                }
            }
            const formJsx = src('pages', 'PublicTicketForm.jsx');
            assert.ok(/<summary className="[^"]*focus-visible:ring-2/.test(formJsx));
        });

        it('linter: wtyczka jsx-a11y włączona, a ostrzeżenia przerywają CI', () => {
            const oxlintrc = JSON.parse(fs.readFileSync(path.join(__dirname, 'frontend', '.oxlintrc.json'), 'utf8'));
            assert.ok(oxlintrc.plugins.includes('jsx-a11y'));
            assert.deepStrictEqual(oxlintrc.rules['jsx-a11y/no-noninteractive-tabindex'][1].tags, ['section'], 'tabIndex dozwolony tylko dla przewijanej sekcji');
            const frontendPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'frontend', 'package.json'), 'utf8'));
            assert.ok(frontendPkg.scripts.lint.includes('--deny-warnings'));
            const ci = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'ci.yml'), 'utf8');
            assert.ok(ci.includes('run: npm run lint'));
        });
    });
});
