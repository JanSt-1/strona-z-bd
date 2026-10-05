require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'domyslny_tajny_klucz_jwt_zmien_w_env';

// --- Konfiguracja puli połączeń do bazy MySQL ---
let currentPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '5476',
    database: process.env.DB_NAME || 'serwis_db',
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Proxy dla puli połączeń zapewniające stabilne działanie nawet przy zmianie instancji puli w locie
const pool = new Proxy({}, {
    get(target, prop) {
        return typeof currentPool[prop] === 'function' ? currentPool[prop].bind(currentPool) : currentPool[prop];
    }
});

// Test połączenia z bazą danych przy starcie z automatycznym fallbackiem hasła
(async () => {
    try {
        const connection = await currentPool.getConnection();
        console.log('✅ Połączono z bazą danych MySQL (serwis_db).');
        connection.release();
    } catch (err) {
        if (err.code === 'ER_ACCESS_DENIED_ERROR' && process.env.DB_PASSWORD) {
            console.warn('⚠️ Hasło z .env zostało odrzucone przez MySQL. Automatyczna próba połączenia z pustym hasłem...');
            try {
                const fallbackPool = mysql.createPool({
                    host: process.env.DB_HOST || 'localhost',
                    user: process.env.DB_USER || 'root',
                    password: '',
                    database: process.env.DB_NAME || 'serwis_db',
                    port: Number(process.env.DB_PORT) || 3306,
                    waitForConnections: true,
                    connectionLimit: 10,
                    queueLimit: 0
                });
                const connection = await fallbackPool.getConnection();
                console.log('✅ Połączono z bazą danych MySQL (serwis_db) za pomocą domyślnego pustego hasła.');
                connection.release();
                currentPool = fallbackPool;
                return;
            } catch (fallbackErr) {
                console.error('❌ Błąd połączenia fallback z bazą MySQL:', fallbackErr.message);
            }
        }
        console.error('❌ Błąd połączenia z bazą MySQL:', err.message);
    }
})();

// --- Middlewares ---
app.use(cors());
app.use(express.json());
// Serwowanie plików statycznych (np. index.html)
app.use(express.static(__dirname));

// --- Middleware autoryzacji JWT ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({
            error: 'Brak autoryzacji: Wymagany nagłówek Authorization (np. Bearer <token>)'
        });
    }

    // Obsługa formatu "Bearer <token>" oraz samego tokenu
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

    if (!token) {
        return res.status(401).json({
            error: 'Brak tokenu JWT w nagłówku Authorization'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            return res.status(403).json({
                error: 'Odmowa dostępu: Nieprawidłowy lub wygasły token JWT'
            });
        }
        req.user = decodedUser;
        next();
    });
}

// --- Endpointy API ---

// 1. Health check (opcjonalny, pomocny weryfikacji serwera)
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

// 2. POST /api/zgloszenia - Publiczne dodawanie nowego zgłoszenia serwisowego
app.post('/api/zgloszenia', async (req, res) => {
    const {
        imie,
        nazwisko,
        adres,
        numer_telefonu,
        email,
        opis_usterki,
        numer_fv
    } = req.body;

    // Walidacja wymaganych pól
    if (!imie || !nazwisko || !adres || !numer_telefonu || !email || !opis_usterki) {
        return res.status(400).json({
            error: 'Wszystkie wymagane pola muszą być uzupełnione: imie, nazwisko, adres, numer_telefonu, email, opis_usterki.'
        });
    }

    try {
        const query = `
            INSERT INTO zgloszenia (imie, nazwisko, adres, numer_telefonu, email, opis_usterki, numer_fv, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'nowe')
        `;
        const values = [
            imie.trim(),
            nazwisko.trim(),
            adres.trim(),
            numer_telefonu.trim(),
            email.trim(),
            opis_usterki.trim(),
            numer_fv ? numer_fv.trim() : null
        ];

        const [result] = await pool.query(query, values);

        return res.status(201).json({
            message: 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.',
            id: result.insertId
        });
    } catch (err) {
        console.error('Błąd podczas zapisywania zgłoszenia:', err);
        return res.status(500).json({
            error: 'Błąd serwera podczas zapisywania zgłoszenia do bazy danych.'
        });
    }
});

// 3. POST /api/login - Logowanie użytkownika i generowanie tokenu JWT
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: 'Podaj adres email oraz hasło.'
        });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, email, password_hash, role FROM uzytkownicy WHERE email = ?',
            [email.trim()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Nieprawidłowy email lub hasło.'
            });
        }

        const user = rows[0];
        const isBcryptHash = user.password_hash &&
            (user.password_hash.startsWith('$2a$') ||
                user.password_hash.startsWith('$2b$') ||
                user.password_hash.startsWith('$2y$'));

        let isPasswordValid = false;

        if (isBcryptHash) {
            // Standardowe porównanie przez bcrypt
            isPasswordValid = await bcrypt.compare(password, user.password_hash);
        } else {
            // Fallback: hasło przechowywane jako plaintext (np. dodane ręcznie do bazy)
            isPasswordValid = (password === user.password_hash);

            if (isPasswordValid) {
                // Automatyczna migracja: zahashuj hasło przy pierwszym logowaniu
                console.log(`🔐 Migracja hasła dla użytkownika: ${user.email}`);
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.query('UPDATE uzytkownicy SET password_hash = ? WHERE id = ?', [hashedPassword, user.id]);
            }
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Nieprawidłowy email lub hasło.'
            });
        }

        // Generowanie tokenu JWT ważnego przez 24 godziny
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.json({
            message: 'Zalogowano pomyślnie.',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Błąd podczas logowania:', err);
        return res.status(500).json({
            error: 'Błąd serwera podczas procesu logowania.'
        });
    }
});

// 4. GET /api/zgloszenia - Chroniony endpoint do pobierania listy wszystkich zgłoszeń (wymaga JWT)
app.get('/api/zgloszenia', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, imie, nazwisko, adres, numer_telefonu, email, opis_usterki, numer_fv, status, created_at FROM zgloszenia ORDER BY created_at DESC'
        );

        return res.json(rows);
    } catch (err) {
        console.error('Błąd podczas pobierania zgłoszeń:', err);
        return res.status(500).json({
            error: 'Błąd serwera podczas pobierania listy zgłoszeń.'
        });
    }
});

// 5. PATCH/PUT /api/zgloszenia/:id/status - Aktualizacja statusu zgłoszenia (chroniony, wymaga JWT)
const ALLOWED_STATUSES = ['nowe', 'w_realizacji', 'zakończone'];

async function handleUpdateStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
            error: `Nieprawidłowy status. Dozwolone wartości to: ${ALLOWED_STATUSES.join(', ')}.`
        });
    }

    try {
        const [result] = await pool.query(
            'UPDATE zgloszenia SET status = ? WHERE id = ?',
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: `Nie znaleziono zgłoszenia o ID ${id}.`
            });
        }

        return res.json({
            message: 'Status zgłoszenia został zaktualizowany.',
            id: Number(id),
            status
        });
    } catch (err) {
        console.error('Błąd podczas aktualizacji statusu:', err);
        return res.status(500).json({
            error: 'Błąd serwera podczas aktualizacji statusu zgłoszenia.'
        });
    }
}

app.patch('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);
app.put('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);

// 6. POST /api/admin/users - Tworzenie nowego użytkownika (chroniony, tylko admin)
app.post('/api/admin/users', authenticateToken, async (req, res) => {
    // Tylko admin może tworzyć konta
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Brak uprawnień. Wymagana rola: admin.' });
    }

    const { email, password, role = 'pracownik' } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Podaj email i hasło.' });
    }

    const allowedRoles = ['admin', 'pracownik'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: `Nieprawidłowa rola. Dozwolone: ${allowedRoles.join(', ')}` });
    }

    try {
        const [existing] = await pool.query('SELECT id FROM uzytkownicy WHERE email = ?', [email.trim()]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Użytkownik z tym adresem email już istnieje.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO uzytkownicy (email, password_hash, role) VALUES (?, ?, ?)',
            [email.trim(), hashedPassword, role]
        );

        return res.status(201).json({
            message: 'Użytkownik został pomyślnie utworzony.',
            id: result.insertId,
            email: email.trim(),
            role
        });
    } catch (err) {
        console.error('Błąd podczas tworzenia użytkownika:', err);
        return res.status(500).json({ error: 'Błąd serwera podczas tworzenia użytkownika.' });
    }
});


// Obsługa błędów 404 dla nieistniejących tras API
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API nie został odnaleziony.' });
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 Serwer Express.js działa na http://localhost:${PORT}`);
    console.log(`📡 Dostępne endpointy:`);
    console.log(`   - POST  http://localhost:${PORT}/api/zgloszenia (publiczny)`);
    console.log(`   - POST  http://localhost:${PORT}/api/login (publiczny, generuje JWT)`);
    console.log(`   - GET   http://localhost:${PORT}/api/zgloszenia (chroniony, wymaga JWT)`);
    console.log(`   - PATCH http://localhost:${PORT}/api/zgloszenia/:id/status (chroniony, wymaga JWT)`);
});
