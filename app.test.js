const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'klucz_jwt_do_izolowanych_testow_1234567890';
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

    const setMockTicket = (overrides) => {
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

                if (typeof sql === 'string') {
                    // Tabela uzytkownicy
                    if (sql.includes('uzytkownicy')) {
                        const param = Array.isArray(values) ? values[0] : null;
                        if (param === 'user_testowy' || param === 1) {
                            return [[{ id: 1, username: 'user_testowy', password_hash: testPasswordHash, role: 'pracownik' }]];
                        }
                        if (param === 'serwisant_testowy' || param === 50) {
                            return [[{ id: 50, username: 'serwisant_testowy', password_hash: testPasswordHash, role: 'serwisant' }]];
                        }
                        if (param === 'admin_testowy' || param === 99) {
                            return [[{ id: 99, username: 'admin_testowy', password_hash: testPasswordHash, role: 'admin' }]];
                        }
                        if (param === 2 || param === 'magazynier_testowy') {
                            return [[{ id: 2, username: 'magazynier_testowy', password_hash: testPasswordHash, role: 'magazynier' }]];
                        }
                        if (sql.includes("role IN ('pracownik', 'serwisant')")) {
                            return [[
                                { id: 1, username: 'user_testowy', role: 'pracownik' },
                                { id: 50, username: 'serwisant_testowy', role: 'serwisant' }
                            ]];
                        }
                        if (sql.includes('SELECT id FROM uzytkownicy WHERE username = ?')) {
                            return [[]];
                        }
                        if (sql.includes('INSERT INTO uzytkownicy')) {
                            return [{ insertId: 101, affectedRows: 1 }];
                        }
                        return [[]];
                    }

                    // Tabela zgloszenia - pobranie po ID
                    if (sql.includes('zgloszenia') && sql.includes('WHERE id = ?')) {
                        return [[currentMockTicket]];
                    }

                    // Tabela zgloszenia - pobranie listy
                    if (sql.includes('FROM zgloszenia')) {
                        return [[currentMockTicket]];
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
                    wojewodztwo: 'mazowieckie',
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

        it('Serwisant może oznaczyć jako naprawione dowolne zlecenie w_realizacji (200)', async () => {
            setMockTicket({ status: 'w_realizacji', przypisany_pracownik_id: 1 });
            const response = await request(app)
                .patch('/api/zgloszenia/1/naprawione')
                .set('Authorization', `Bearer ${serwisantToken}`)
                .send({ opis_naprawy: 'Serwisant naprawił płytę główną.' });
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

        it('Próba przypisania użytkownika o roli magazynier w /przypisz zwraca 400', async () => {
            setMockTicket({ status: 'nowe' });
            const response = await request(app)
                .patch('/api/zgloszenia/1/przypisz')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ pracownik_id: 2 }); // ID 2 to magazynier
            assert.strictEqual(response.status, 400);
            assert.strictEqual(
                response.body.error,
                'Zlecenie można przypisać wyłącznie do użytkownika o roli pracownik lub serwisant.'
            );
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

        it('GET /api/zgloszenia filtruje zapytania zgodnie z rolą', async () => {
            // Pracownik: filtruje po przypisanym pracowniku
            await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${pracownikToken}`);
            assert.ok(lastExecutedQuery.includes('WHERE z.przypisany_pracownik_id = ?'));
            assert.deepStrictEqual(lastExecutedParams, [1]);

            // Magazynier: filtruje po do_wysylki i zakończone
            await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${magazynierToken}`);
            assert.ok(lastExecutedQuery.includes("WHERE z.status IN ('do_wysylki', 'zakończone')"));

            // Admin: pobiera wszystkie bez klauzuli WHERE dla ról
            await request(app).get('/api/zgloszenia').set('Authorization', `Bearer ${adminToken}`);
            assert.ok(!lastExecutedQuery.includes('WHERE z.przypisany_pracownik_id'));
            assert.ok(!lastExecutedQuery.includes("WHERE z.status IN ('do_wysylki', 'zakończone')"));
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
    });
});