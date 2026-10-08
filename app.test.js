const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'klucz_jwt_do_izolowanych_testow_1234567890';
}
const app = require('./app');

describe('Testy integracyjne API (node:test + supertest)', () => {
    let originalPool;

    before(async () => {
        process.env.NODE_ENV = 'test';
        originalPool = app.getPool();

        // Przygotowujemy zahaszowane hasło dla użytkownika testowego
        const testPasswordHash = await bcrypt.hash('prawidloweHaslo123', 10);

        // Mock puli bazy danych – uniezależnia testy integracyjne od stanu zewnętrznego serwera MySQL
        const mockPool = {
            query: async (sql, values) => {
                // Zapytanie o użytkownika podczas logowania
                if (typeof sql === 'string' && sql.includes('uzytkownicy')) {
                    const username = Array.isArray(values) ? values[0] : null;
                    if (username === 'user_testowy') {
                        return [
                            [
                                {
                                    id: 1,
                                    username: 'user_testowy',
                                    password_hash: testPasswordHash,
                                    role: 'pracownik'
                                }
                            ]
                        ];
                    }
                    return [[]];
                }

                // Zapytanie o zgłoszenie po ID
                if (typeof sql === 'string' && sql.includes('zgloszenia') && sql.includes('WHERE id = ?')) {
                    return [
                        [
                            {
                                id: 1,
                                status: 'w_realizacji',
                                przypisany_pracownik_id: 1,
                                opis_naprawy: null
                            }
                        ]
                    ];
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

    // 1. POST /api/zgloszenia bez przesłanych pól w body ma zwrócić status 400
    it('POST /api/zgloszenia bez przesłanych pól w body powinien zwrócić status 400', async () => {
        const response = await request(app)
            .post('/api/zgloszenia')
            .send({});

        assert.strictEqual(response.status, 400);
        assert.ok(response.body.error, 'Odpowiedź powinna zawierać komunikat błędu');
    });

    // 2. GET /api/zgloszenia bez podanego tokenu autoryzacyjnego w nagłówku ma zwrócić status 401
    it('GET /api/zgloszenia bez podanego tokenu autoryzacyjnego w nagłówku powinien zwrócić status 401', async () => {
        const response = await request(app)
            .get('/api/zgloszenia');

        assert.strictEqual(response.status, 401);
        assert.ok(response.body.error, 'Odpowiedź powinna zawierać komunikat błędu autoryzacji');
    });

    // 3. GET /api/zgloszenia z niepoprawnym tokenem ma zwrócić status 403
    it('GET /api/zgloszenia z niepoprawnym tokenem powinien zwrócić status 403', async () => {
        const response = await request(app)
            .get('/api/zgloszenia')
            .set('Authorization', 'Bearer nieprawidlowy.token.jwt');

        assert.strictEqual(response.status, 403);
        assert.ok(response.body.error, 'Odpowiedź powinna zawierać komunikat odmowy dostępu');
    });

    // 4. Próba logowania (np. POST /api/login) ze złym hasłem ma zwrócić status 401
    it('POST /api/login ze złym hasłem powinien zwrócić status 401', async () => {
        const response = await request(app)
            .post('/api/login')
            .send({
                username: 'user_testowy',
                password: 'złeHasło123'
            });

        assert.strictEqual(response.status, 401);
        assert.strictEqual(
            response.body.error,
            'Nieprawidłowa nazwa użytkownika lub hasło.',
            'Powinien zostać zwrócony komunikat o błędnych danych logowania'
        );
    });

    // 5. GET /api/pracownicy bez podanego tokenu ma zwrócić status 401
    it('GET /api/pracownicy bez tokenu powinien zwrócić status 401', async () => {
        const response = await request(app).get('/api/pracownicy');
        assert.strictEqual(response.status, 401);
        assert.ok(response.body.error);
    });

    // 6. PATCH /api/zgloszenia/1/przypisz bez podanego tokenu ma zwrócić status 401
    it('PATCH /api/zgloszenia/1/przypisz bez tokenu powinien zwrócić status 401', async () => {
        const response = await request(app)
            .patch('/api/zgloszenia/1/przypisz')
            .send({ pracownik_id: 1 });
        assert.strictEqual(response.status, 401);
        assert.ok(response.body.error);
    });

    // 7. PATCH /api/zgloszenia/1/naprawione bez podanego tokenu ma zwrócić status 401
    it('PATCH /api/zgloszenia/1/naprawione bez tokenu powinien zwrócić status 401', async () => {
        const response = await request(app)
            .patch('/api/zgloszenia/1/naprawione')
            .send({ opis_naprawy: 'Wymieniono kabel' });
        assert.strictEqual(response.status, 401);
        assert.ok(response.body.error);
    });

    // 8. POST /api/zgloszenia z monitorem interaktywnym bez numeru seryjnego ma zwrócić status 400
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
        assert.strictEqual(
            response.body.error,
            'Pole "numer_seryjny" jest obowiązkowe dla wybranego przedmiotu zgłoszenia.'
        );
    });

    // 9. Poprawne logowanie zwraca token JWT, który pozwala na dostęp do chronionego GET /api/zgloszenia
    it('POST /api/login z poprawnymi danymi zwraca token JWT i pozwala na autoryzowany dostęp', async () => {
        const loginResponse = await request(app)
            .post('/api/login')
            .send({
                username: 'user_testowy',
                password: 'prawidloweHaslo123'
            });

        assert.strictEqual(loginResponse.status, 200);
        assert.ok(loginResponse.body.token, 'Odpowiedź powinna zawierać token');

        const authResponse = await request(app)
            .get('/api/zgloszenia')
            .set('Authorization', `Bearer ${loginResponse.body.token}`);

        assert.strictEqual(authResponse.status, 200);
        assert.ok(Array.isArray(authResponse.body), 'Odpowiedź powinna być tablicą');
    });

    // 10. Próba cofnięcia statusu przez pracownika (z w_realizacji do nowe) zwraca status 403
    it('PATCH /api/zgloszenia/1/status cofanie statusu przez pracownika powinno zwrócić status 403', async () => {
        const loginResponse = await request(app)
            .post('/api/login')
            .send({
                username: 'user_testowy',
                password: 'prawidloweHaslo123'
            });

        const token = loginResponse.body.token;

        const response = await request(app)
            .patch('/api/zgloszenia/1/status')
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'nowe' });

        assert.strictEqual(response.status, 403);
        assert.strictEqual(
            response.body.error,
            'Cofanie statusu zgłoszenia jest dozwolone wyłącznie dla administratora.'
        );
    });
});



