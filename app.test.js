const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');
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
});
