require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('Brak JWT_SECRET w .env – nie startuję.');
    process.exit(1);
}

// --- Konfiguracja puli połączeń do bazy MySQL ---
let currentPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'serwis_db',
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test połączenia z bazą danych przy starcie
(async () => {
    try {
        const connection = await currentPool.getConnection();
        console.log('✅ Połączono z bazą danych MySQL (serwis_db).');
        connection.release();
    } catch (err) {
        console.error('❌ Błąd połączenia z bazą MySQL:', err.message);
        process.exit(1);
    }
})();

// --- Middlewares ---
app.use(cors());
app.use(express.json());
// Serwowanie plików statycznych (np. index.html)
app.use(express.static(path.join(__dirname, 'public')));

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

// --- Middleware autoryzacji roli administratora ---
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({
            error: 'Brak uprawnień. Wymagana rola: admin.'
        });
    }
    next();
}

// --- Endpointy API ---

// 1. Health check (opcjonalny, pomocny weryfikacji serwera)
app.get('/api/health', async (req, res) => {
    try {
        await currentPool.query('SELECT 1');
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
    } = req.body || {};

    const requiredFields = [
        { name: 'imie', value: imie, max: 50 },
        { name: 'nazwisko', value: nazwisko, max: 50 },
        { name: 'adres', value: adres, max: 65535 },
        { name: 'numer_telefonu', value: numer_telefonu, max: 20 },
        { name: 'email', value: email, max: 100 },
        { name: 'opis_usterki', value: opis_usterki, max: 65535 }
    ];

    // 1. Sprawdzenie typu tekstowego, obecności oraz limitu długości dla wymaganych pól (PRZED .trim())
    for (const field of requiredFields) {
        if (typeof field.value !== 'string') {
            return res.status(400).json({
                error: `Pole "${field.name}" musi być tekstem.`
            });
        }
        if (field.value.trim().length === 0) {
            return res.status(400).json({
                error: `Pole "${field.name}" nie może być puste.`
            });
        }
        if (field.value.trim().length > field.max) {
            return res.status(400).json({
                error: `Pole "${field.name}" przekracza maksymalną dozwoloną długość (${field.max} znaków).`
            });
        }
    }

    // 2. Walidacja czy imię i nazwisko nie zawierają cyfr i składają się z liter
    if (/\d/.test(imie)) {
        return res.status(400).json({
            error: 'Pole "imie" nie może zawierać cyfr.'
        });
    }
    if (/\d/.test(nazwisko)) {
        return res.status(400).json({
            error: 'Pole "nazwisko" nie może zawierać cyfr.'
        });
    }

    const nameRegex = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-']+$/;
    if (!nameRegex.test(imie.trim())) {
        return res.status(400).json({
            error: 'Pole "imie" może zawierać wyłącznie litery (brak cyfr i znaków specjalnych).'
        });
    }
    if (!nameRegex.test(nazwisko.trim())) {
        return res.status(400).json({
            error: 'Pole "nazwisko" może zawierać wyłącznie litery (brak cyfr i znaków specjalnych).'
        });
    }

    // 3. Walidacja opcjonalnego pola numer_fv (jeśli zostało podane)
    if (numer_fv !== undefined && numer_fv !== null && numer_fv !== '') {
        if (typeof numer_fv !== 'string') {
            return res.status(400).json({
                error: 'Pole "numer_fv" musi być tekstem.'
            });
        }
        if (numer_fv.trim().length > 50) {
            return res.status(400).json({
                error: 'Pole "numer_fv" przekracza maksymalną dozwoloną długość (50 znaków).'
            });
        }
    }

    // 3. Walidacja formatu adresu e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
            error: 'Pole "email" ma nieprawidłowy format adresu e-mail.'
        });
    }

    // 4. Walidacja formatu numeru telefonu (+48 i dokładnie 9 cyfr)
    const phoneRegex = /^\+48\d{9}$/;
    if (!phoneRegex.test(numer_telefonu.trim())) {
        return res.status(400).json({
            error: 'Pole "numer_telefonu" musi zawierać prefiks +48 oraz dokładnie 9 cyfr.'
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

        const [result] = await currentPool.query(query, values);

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

// Rate limiting dla logowania (10 prób / 15 minut z 1 IP)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    limit: 10, // 10 prób z jednego adresu IP
    message: {
        error: 'Zbyt wiele prób logowania z tego adresu IP. Spróbuj ponownie za 15 minut.'
    },
    standardHeaders: true, // Zwraca nagłówki RateLimit-*
    legacyHeaders: false // Wyłącza nagłówki X-RateLimit-*
});

// 3. POST /api/login - Logowanie użytkownika i generowanie tokenu JWT (wyłącznie username, rate limited)
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const loginUsername = (username || '').trim();

    if (!loginUsername || !password) {
        return res.status(400).json({
            error: 'Podaj nazwę użytkownika oraz hasło.'
        });
    }

    try {
        const [rows] = await currentPool.query(
            'SELECT id, username, password_hash, role FROM uzytkownicy WHERE username = ?',
            [loginUsername]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Nieprawidłowa nazwa użytkownika lub hasło.'
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
        }

        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Nieprawidłowa nazwa użytkownika lub hasło.'
            });
        }

        // Generowanie tokenu JWT ważnego przez 24 godziny
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
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
                username: user.username,
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
        const [rows] = await currentPool.query(
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
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({
            error: 'Nieprawidłowe ID zgłoszenia. Wymagana jest liczba całkowita.'
        });
    }
    const { status } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
            error: `Nieprawidłowy status. Dozwolone wartości to: ${ALLOWED_STATUSES.join(', ')}.`
        });
    }

    try {
        const [result] = await currentPool.query(
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

// 6. DELETE /api/zgloszenia/:id - Usunięcie zgłoszenia (chroniony, tylko admin)
app.delete('/api/zgloszenia/:id', authenticateToken, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({
            error: 'Nieprawidłowe ID zgłoszenia. Wymagana jest liczba całkowita.'
        });
    }

    try {
        const [result] = await currentPool.query(
            'DELETE FROM zgloszenia WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: `Nie znaleziono zgłoszenia o ID ${id}.`
            });
        }

        return res.json({
            message: 'Zgłoszenie zostało pomyślnie usunięte.',
            id
        });
    } catch (err) {
        console.error('Błąd podczas usuwania zgłoszenia:', err);
        return res.status(500).json({
            error: 'Błąd serwera podczas usuwania zgłoszenia z bazy danych.'
        });
    }
});

// 7. POST /api/admin/users - Tworzenie nowego użytkownika (chroniony, tylko admin)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role = 'pracownik' } = req.body;
    const cleanUsername = (username || '').trim();

    if (!cleanUsername || !password) {
        return res.status(400).json({ error: 'Podaj nazwę użytkownika i hasło.' });
    }

    const allowedRoles = ['admin', 'pracownik'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: `Nieprawidłowa rola. Dozwolone: ${allowedRoles.join(', ')}` });
    }

    try {
        const [existing] = await currentPool.query(
            'SELECT id FROM uzytkownicy WHERE username = ?',
            [cleanUsername]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Użytkownik o tej nazwie już istnieje.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await currentPool.query(
            'INSERT INTO uzytkownicy (username, password_hash, role) VALUES (?, ?, ?)',
            [cleanUsername, hashedPassword, role]
        );

        return res.status(201).json({
            message: 'Użytkownik został pomyślnie utworzony.',
            id: result.insertId,
            username: cleanUsername,
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
    console.log(`   - GET    http://localhost:${PORT}/api/zgloszenia (chroniony, wymaga JWT)`);
    console.log(`   - PATCH  http://localhost:${PORT}/api/zgloszenia/:id/status (chroniony, wymaga JWT)`);
    console.log(`   - DELETE http://localhost:${PORT}/api/zgloszenia/:id (chroniony, wymaga JWT)`);
});
