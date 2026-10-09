require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('Krytyczny błąd konfiguracji: Zmienna środowiskowa JWT_SECRET nie została zdefiniowana.');
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

// Udostępnienie metod do pobierania i podmiany puli połączeń (np. w testach jednostkowych/integracyjnych)
app.setPool = (pool) => {
    currentPool = pool;
    app.locals.pool = pool;
};
app.getPool = () => currentPool;
app.locals.pool = currentPool;

// --- Middlewares ---
app.use(cors());
app.use(express.json());
// Serwowanie plików statycznych (np. index.html) – całkowicie bez cache dla przeglądarki
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// --- Pomocniki ---

// Odpowiedź błędem w formacie { error } (domyślnie 400)
const fail = (res, error, status = 400) => res.status(status).json({ error });

// Opakowanie handlera: logowanie wyjątku i odpowiedź 500 z podanym komunikatem
const safe = (logMsg, errMsg, handler) => async (req, res) => {
    try {
        return await handler(req, res);
    } catch (err) {
        console.error(logMsg, err);
        return fail(res, errMsg, 500);
    }
};

const ID_ERR = 'Nieprawidłowe ID zgłoszenia.';
const ID_ERR_INT = 'Nieprawidłowe ID zgłoszenia. Wymagana jest liczba całkowita.';

// --- Middleware autoryzacji JWT ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return fail(res, 'Brak autoryzacji: Wymagany nagłówek Authorization (np. Bearer <token>)', 401);
    }

    // Obsługa formatu "Bearer <token>" oraz samego tokenu
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

    if (!token) {
        return fail(res, 'Brak tokenu JWT w nagłówku Authorization', 401);
    }

    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, decodedUser) => {
        if (err) {
            return fail(res, 'Odmowa dostępu: Nieprawidłowy lub wygasły token JWT', 401);
        }
        req.user = decodedUser;
        next();
    });
}

// --- Middleware autoryzacji ról (np. requireRoles('admin') lub requireRoles('admin', 'serwisant')) ---
const requireRoles = (...roles) => (req, res, next) =>
    roles.includes(req.user?.role)
        ? next()
        : fail(res, `Brak uprawnień. Wymagana rola: ${roles.join(' lub ')}.`, 403);

const requireAdmin = requireRoles('admin');
const requireAdminOrSerwisant = requireRoles('admin', 'serwisant');

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

//  LISTA DOZWOLONYCH PRZEDMIOTÓW ZGŁOSZENIA

const ALLOWED_PRZEDMIOTY = [
    'Monitor interaktywny myBoard Titan (Android 15)',
    'Monitor interaktywny myBoard Grey Arrow (Android 13)',
    'Monitor interaktywny myBoard Panda (Android 13)',
    'Monitor interaktywny myBoard Black Arrow (Android 13)',
    'Monitor interaktywny myBoard Grey Rock (Android 11)',
    'Monitor interaktywny myBoard Grey Rock 2.0 (Android 11)',
    'Monitor interaktywny myBoard White Arrow (Android 14)',
    'Monitor interaktywny myBoard Panda 2.0 (Android 14)',
    'Monitor interaktywny myBoard Black (Android 8)',
    'Monitor interaktywny myBoard Silver (Android 9)',
    'Monitor interaktywny myBoard Grey UP (Android 8)',
    'Monitor interaktywny (Model spoza listy)',
    'Tablica interaktywna myBoard Silver',
    'Tablica interaktywna myBoard Black',
    'Akcesoria do tablic interaktywnych myBoard',
    'Akcesoria dla monitorów interaktywnych myBoard',
    'Pracownie językowe',
    'Podłoga interaktywna SmartFloor',
    'Meble',
    'Systemy konferencyjne',
    'Projektory',
    'Laptop',
    'Inne',
];

// Lista 16 polskich województw
const ALLOWED_VOIVODESHIPS = [
    'dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie',
    'łódzkie', 'małopolskie', 'mazowieckie', 'opolskie',
    'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie',
    'świętokrzyskie', 'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie'
];

// Pomocnik: sprawdza czy dla wybranego przedmiotu dopuszczony jest numer seryjny
// (wyłącznie monitory interaktywne lub tablice interaktywne, z wyłączeniem akcesoriów)
function isSerialNumberAllowed(product) {
    if (!product || typeof product !== 'string') return false;
    const lower = product.toLowerCase();
    const isMonitor = lower.includes('monitor interaktywny') && !lower.includes('akcesoria');
    const isTablica = lower.includes('tablica interaktywna') && !lower.includes('akcesoria');
    return isMonitor || isTablica;
}

// 2. POST /api/zgloszenia - Publiczne dodawanie nowego zgłoszenia serwisowego
app.post('/api/zgloszenia', async (req, res) => {
    const { nazwa_firmy, numer_seryjny, przedmiot_zgloszenia } = req.body || {};

    const requiredFields = [
        'imie', 'nazwisko', 'adres', 'kod_pocztowy', 'miasto', 'wojewodztwo', 'numer_telefonu',
        'email', 'przedmiot_zgloszenia', 'data_zakupu', 'opis_usterki', 'numer_fv', 'nip'
    ];
    const maxLengths = {
        imie: 50, nazwisko: 50, adres: 65535, kod_pocztowy: 6, miasto: 100, wojewodztwo: 50,
        numer_telefonu: 20, email: 100, przedmiot_zgloszenia: 100, data_zakupu: 10,
        opis_usterki: 65535, numer_fv: 50, nip: 10
    };

    // 1. Sprawdzenie typu tekstowego, obecności oraz limitu długości dla wymaganych pól
    const c = {}; // wartości wymaganych pól po .trim()
    for (const name of requiredFields) {
        const value = (req.body || {})[name];
        const error = typeof value !== 'string' ? 'musi być tekstem.'
            : value.trim().length === 0 ? 'nie może być puste.'
                : value.trim().length > maxLengths[name]
                    ? `przekracza maksymalną dozwoloną długość (${maxLengths[name]} znaków).`
                    : null;
        if (error) return fail(res, `Pole "${name}" ${error}`);
        c[name] = value.trim();
    }

    // 2-10. Pozostałe walidacje (w kolejności sprawdzania; pierwszy błąd kończy żądanie)
    const nameRegex = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-']+$/;
    const firmaProvided = nazwa_firmy !== undefined && nazwa_firmy !== null && nazwa_firmy !== '';
    const checks = [
        // imię i nazwisko: bez cyfr, wyłącznie litery
        [/\d/.test(c.imie), 'Pole "imie" nie może zawierać cyfr.'],
        [/\d/.test(c.nazwisko), 'Pole "nazwisko" nie może zawierać cyfr.'],
        [!nameRegex.test(c.imie), 'Pole "imie" może zawierać wyłącznie litery (brak cyfr i znaków specjalnych).'],
        [!nameRegex.test(c.nazwisko), 'Pole "nazwisko" może zawierać wyłącznie litery (brak cyfr i znaków specjalnych).'],
        // opcjonalne pole nazwa_firmy (jeśli zostało podane)
        [firmaProvided && typeof nazwa_firmy !== 'string', 'Pole "nazwa_firmy" musi być tekstem.'],
        [firmaProvided && typeof nazwa_firmy === 'string' && nazwa_firmy.trim().length > 100, 'Pole "nazwa_firmy" przekracza maksymalną dozwoloną długość (100 znaków).'],
        // NIP (dokładnie 10 cyfr, bez myślników)
        [!/^\d{10}$/.test(c.nip), 'Pole "nip" musi składać się z dokładnie 10 cyfr (bez myślników).'],
        // kod pocztowy (dokładnie XX-XXX)
        [!/^\d{2}-\d{3}$/.test(c.kod_pocztowy), 'Pole "kod_pocztowy" musi mieć format XX-XXX (np. 00-001).'],
        // województwo (zgodność z listą)
        [!ALLOWED_VOIVODESHIPS.includes(c.wojewodztwo.toLowerCase()), 'Pole "wojewodztwo" zawiera nieprawidłową wartość. Wybierz województwo z listy.'],
        // adres e-mail
        [!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email), 'Pole "email" ma nieprawidłowy format adresu e-mail.'],
        // numer telefonu (+48 i dokładnie 9 cyfr)
        [!/^\+48\d{9}$/.test(c.numer_telefonu), 'Pole "numer_telefonu" musi zawierać prefiks +48 oraz dokładnie 9 cyfr.'],
        // przedmiot zgłoszenia z listy
        [!ALLOWED_PRZEDMIOTY.some(item => item.toLowerCase() === c.przedmiot_zgloszenia.toLowerCase()),
        `Pole "przedmiot_zgloszenia" zawiera nieprawidłową wartość. Dozwolone: ${ALLOWED_PRZEDMIOTY.join(', ')}`],
        // data zakupu (RRRR-MM-DD)
        [!/^\d{4}-\d{2}-\d{2}$/.test(c.data_zakupu) || isNaN(Date.parse(c.data_zakupu)), 'Pole "data_zakupu" musi mieć poprawny format daty (RRRR-MM-DD).']
    ];
    const failed = checks.find(([invalid]) => invalid);
    if (failed) return fail(res, failed[1]);

    // 11. Walidacja numeru seryjnego (obowiązkowy dla monitorów i tablic interaktywnych, dla innych ignorowany)
    let cleanNumerSeryjny = null;
    if (isSerialNumberAllowed(przedmiot_zgloszenia)) {
        const serial = typeof numer_seryjny === 'string' ? numer_seryjny.trim() : '';
        if (!serial) {
            return fail(res, 'Pole "numer_seryjny" jest obowiązkowe dla wybranego przedmiotu zgłoszenia.');
        }
        if (serial.length > 100) {
            return fail(res, 'Pole "numer_seryjny" przekracza maksymalną dozwoloną długość (100 znaków).');
        }
        cleanNumerSeryjny = serial;
    }

    try {
        const query = `
            INSERT INTO zgloszenia (imie, nazwisko, nazwa_firmy, adres, kod_pocztowy, miasto, wojewodztwo, numer_telefonu, email, przedmiot_zgloszenia, numer_seryjny, data_zakupu, opis_usterki, numer_fv, nip, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nowe')
        `;
        const values = [
            c.imie,
            c.nazwisko,
            (typeof nazwa_firmy === 'string' && nazwa_firmy.trim()) || null,
            c.adres,
            c.kod_pocztowy,
            c.miasto,
            c.wojewodztwo.toLowerCase(),
            c.numer_telefonu,
            c.email,
            c.przedmiot_zgloszenia,
            cleanNumerSeryjny,
            c.data_zakupu,
            c.opis_usterki,
            c.numer_fv,
            c.nip
        ];

        const [result] = await currentPool.query(query, values);

        return res.status(201).json({
            message: 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.',
            id: result.insertId
        });
    } catch (err) {
        console.error('Błąd podczas zapisywania zgłoszenia:', err);
        return fail(res, 'Błąd serwera podczas zapisywania zgłoszenia do bazy danych.', 500);
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
    legacyHeaders: false, // Wyłącza nagłówki X-RateLimit-*
    skip: () => process.env.NODE_ENV === 'test'
});

// 3. POST /api/login - Logowanie użytkownika i generowanie tokenu JWT (wyłącznie username, rate limited)
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const loginUsername = (username || '').trim();

    if (!loginUsername || !password) {
        return fail(res, 'Podaj nazwę użytkownika oraz hasło.');
    }

    return safe('Błąd podczas logowania:', 'Błąd serwera podczas procesu logowania.', async () => {
        const [rows] = await currentPool.query(
            'SELECT id, username, password_hash, role FROM uzytkownicy WHERE username = ?',
            [loginUsername]
        );

        const user = rows?.[0];
        // Hasło porównywane wyłącznie przez bcrypt (hash musi mieć prefiks $2a$/$2b$/$2y$)
        const isPasswordValid = !!user && typeof user.password_hash === 'string' &&
            /^\$2[aby]\$/.test(user.password_hash) &&
            await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return fail(res, 'Nieprawidłowa nazwa użytkownika lub hasło.', 401);
        }

        const payload = { id: user.id, username: user.username, role: user.role };

        // Generowanie tokenu JWT ważnego przez 24 godziny
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });

        return res.json({
            message: 'Zalogowano pomyślnie.',
            token,
            user: payload
        });
    })(req, res);
});

// 4. GET /api/pracownicy - Pobieranie listy pracowników do przypisywania zleceń (admin i serwisant)
app.get('/api/pracownicy', authenticateToken, requireAdminOrSerwisant,
    safe('Błąd podczas pobierania listy pracowników:', 'Błąd serwera podczas pobierania listy pracowników.', async (req, res) => {
        const [rows] = await currentPool.query(
            "SELECT id, username, role FROM uzytkownicy WHERE role IN ('pracownik', 'serwisant') ORDER BY username ASC"
        );
        return res.json(rows);
    }));

// 5. GET /api/zgloszenia - Pobieranie zgłoszeń w zależności od roli użytkownika
// - admin, serwisant: widzą wszystkie zlecenia
// - pracownik: widzi wyłącznie zlecenia przypisane do niego (domyślnie pusto)
// - magazynier: widzi wyłącznie zlecenia gotowe do wysyłki ('do_wysylki') oraz zakończone (domyślnie pusto)
app.get('/api/zgloszenia', authenticateToken,
    safe('Błąd podczas pobierania zgłoszeń:', 'Błąd serwera podczas pobierania listy zgłoszeń.', async (req, res) => {
        const role = req.user?.role;
        let whereClause = '';
        const params = [];

        if (role === 'pracownik') {
            whereClause = 'WHERE z.przypisany_pracownik_id = ?';
            params.push(req.user.id);
        } else if (role === 'magazynier') {
            whereClause = "WHERE z.status IN ('do_wysylki', 'zakończone')";
        }

        const query = `
            SELECT 
                z.id, z.imie, z.nazwisko, z.nazwa_firmy, z.adres, z.kod_pocztowy, z.miasto, z.wojewodztwo, 
                z.numer_telefonu, z.email, z.przedmiot_zgloszenia, z.numer_seryjny, 
                DATE_FORMAT(z.data_zakupu, '%Y-%m-%d') AS data_zakupu, 
                z.opis_usterki, z.numer_fv, z.nip, z.status, z.created_at,
                z.przypisany_pracownik_id,
                u.username AS przypisany_pracownik_username,
                z.opis_naprawy,
                DATE_FORMAT(z.opis_naprawy_data, '%Y-%m-%d %H:%i:%s') AS opis_naprawy_data,
                DATE_FORMAT(z.data_wyslania, '%Y-%m-%d %H:%i:%s') AS data_wyslania,
                z.numer_listu
            FROM zgloszenia z
            LEFT JOIN uzytkownicy u ON z.przypisany_pracownik_id = u.id
            ${whereClause}
            ORDER BY z.created_at DESC
        `;

        const [rows] = await currentPool.query(query, params);
        return res.json(rows);
    }));

// Mapa dozwolonych przejść statusów i ról uprawnionych do ich wykonania:
// - nowe -> w_realizacji: automatycznie przy przypisaniu (admin, serwisant)
// - w_realizacji -> do_wysylki: przypisany pracownik, serwisant, admin (tylko z opisem naprawy)
// - do_wysylki -> zakończone: magazynier, admin
// - cofanie statusu: tylko admin
const PRZEJSCIA = {
    nowe: { w_realizacji: ['admin', 'serwisant'] },
    w_realizacji: { do_wysylki: ['admin', 'serwisant', 'pracownik'] },
    do_wysylki: { 'zakończone': ['admin', 'magazynier'] }
};

const ALLOWED_STATUSES = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];
const STATUS_ORDER = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];

/**
 * Sprawdza, czy użytkownik o danej roli może zmienić status zgłoszenia.
 * - Niedozwolone przejście w cyklu życia -> 409 Conflict z komunikatem: Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.
 * - Brak uprawnień roli do danego przejścia lub cofania statusu -> 403 Forbidden.
 * @param {string} rola
 * @param {string} zStatusu
 * @param {string} naStatus
 * @returns {{ allowed: boolean, status?: number, error?: string, isRollback?: boolean }}
 */
function czyMoznaZmienic(rola, zStatusu, naStatus) {
    if (zStatusu === naStatus) {
        return { allowed: true };
    }

    const currentIndex = STATUS_ORDER.indexOf(zStatusu);
    const targetIndex = STATUS_ORDER.indexOf(naStatus);

    if (currentIndex === -1 || targetIndex === -1) {
        return {
            allowed: false,
            status: 409,
            error: `Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.`
        };
    }

    // Cofanie statusu (indeks maleje) - wyłącznie dla admina
    if (targetIndex < currentIndex) {
        if (rola !== 'admin') {
            return {
                allowed: false,
                status: 403,
                error: 'Cofanie statusu zgłoszenia jest dozwolone wyłącznie dla administratora.'
            };
        }
        return { allowed: true, isRollback: true };
    }

    // Przejście w przód - weryfikacja zdefiniowanego kroku w cyklu życia
    const dozwoloneRole = PRZEJSCIA[zStatusu]?.[naStatus];
    if (!dozwoloneRole) {
        return {
            allowed: false,
            status: 409,
            error: `Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.`
        };
    }

    // Przejście istnieje w procesie, ale sprawdzamy czy rola ma uprawnienia
    if (!dozwoloneRole.includes(rola)) {
        return {
            allowed: false,
            status: 403,
            error: `Brak uprawnień do zmiany statusu ze statusu "${zStatusu}" na "${naStatus}".`
        };
    }

    return { allowed: true };
}

// 6. PATCH /api/zgloszenia/:id/przypisz - Przypisanie zlecenia pracownikowi (admin i serwisant)
app.patch('/api/zgloszenia/:id/przypisz', authenticateToken, requireAdminOrSerwisant,
    safe('Błąd podczas przypisywania pracownika:', 'Błąd serwera podczas przypisywania pracownika.', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return fail(res, ID_ERR);
        }

        const { pracownik_id } = req.body || {};

        let assignedId = null;
        let assignedUsername = null;

        if (pracownik_id !== undefined && pracownik_id !== null && pracownik_id !== '') {
            const parsedPracownikId = parseInt(pracownik_id, 10);
            if (isNaN(parsedPracownikId)) {
                return fail(res, 'Nieprawidłowe ID pracownika.');
            }
            const [users] = await currentPool.query(
                'SELECT id, username, role FROM uzytkownicy WHERE id = ?',
                [parsedPracownikId]
            );
            if (!users || users.length === 0) {
                return fail(res, 'Nie znaleziono wybranego pracownika.', 404);
            }
            const candidate = users[0];
            if (!['pracownik', 'serwisant'].includes(candidate.role)) {
                return fail(res, 'Zlecenie można przypisać wyłącznie do użytkownika o roli pracownik lub serwisant.', 400);
            }
            assignedId = parsedPracownikId;
            assignedUsername = candidate.username;
        }

        const [tickets] = await currentPool.query('SELECT id, status FROM zgloszenia WHERE id = ?', [id]);
        if (!tickets || tickets.length === 0) {
            return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        }
        const ticket = tickets[0];

        let targetStatus = ticket.status;
        if (ticket.status === 'nowe' && assignedId !== null) {
            targetStatus = 'w_realizacji';
            const check = czyMoznaZmienic(req.user.role, ticket.status, targetStatus);
            if (!check.allowed) {
                return fail(res, check.error, check.status);
            }
        }

        await currentPool.query(
            `UPDATE zgloszenia 
             SET przypisany_pracownik_id = ?,
                 status = ?
             WHERE id = ?`,
            [assignedId, targetStatus, id]
        );

        return res.json({
            message: assignedId
                ? `Zlecenie #${id} zostało przypisane pracownikowi ${assignedUsername}.`
                : `Cofnięto przypisanie zlecenia #${id}.`,
            id,
            przypisany_pracownik_id: assignedId,
            przypisany_pracownik_username: assignedUsername,
            status: targetStatus
        });
    }));

// 7. PATCH /api/zgloszenia/:id/naprawione - Opisanie naprawy przez przypisanego pracownika, serwisanta lub admina
app.patch('/api/zgloszenia/:id/naprawione', authenticateToken,
    safe('Błąd podczas zatwierdzania naprawy:', 'Błąd serwera podczas zatwierdzania naprawy zgłoszenia.', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return fail(res, ID_ERR);
        }

        const { opis_naprawy } = req.body || {};
        if (!opis_naprawy || typeof opis_naprawy !== 'string' || opis_naprawy.trim().length === 0) {
            return fail(res, 'Przed oznaczeniem zlecenia jako naprawione wymagany jest opis wykonanych prac naprawczych (np. co zostało zrobione).');
        }

        const [rows] = await currentPool.query('SELECT id, status, przypisany_pracownik_id FROM zgloszenia WHERE id = ?', [id]);
        if (!rows || rows.length === 0) {
            return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        }

        const ticket = rows[0];

        // Weryfikacja przejścia statusu (z ticket.status na 'do_wysylki')
        const check = czyMoznaZmienic(req.user.role, ticket.status, 'do_wysylki');
        if (!check.allowed) {
            return fail(res, check.error, check.status);
        }

        // Pracownik może oznaczyć jako naprawione tylko zlecenie przypisane do siebie
        if (req.user.role === 'pracownik' && ticket.przypisany_pracownik_id !== req.user.id) {
            return fail(res, 'Możesz oznaczyć jako naprawione tylko zlecenie przypisane do Ciebie.', 403);
        }

        await currentPool.query(
            "UPDATE zgloszenia SET opis_naprawy = ?, opis_naprawy_data = NOW(), status = 'do_wysylki' WHERE id = ?",
            [opis_naprawy.trim(), id]
        );

        return res.json({
            message: 'Zlecenie zostało opisane i przekazane do magazynu ze statusem "Do wysyłki".',
            id,
            status: 'do_wysylki',
            opis_naprawy: opis_naprawy.trim()
        });
    }));

// 8. PATCH/PUT /api/zgloszenia/:id/status - Aktualizacja statusu zgłoszenia
const handleUpdateStatus = safe('Błąd podczas aktualizacji statusu:', 'Błąd serwera podczas aktualizacji statusu zgłoszenia.', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return fail(res, ID_ERR_INT);
    }
    const { status, numer_listu } = req.body || {};

    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return fail(res, `Nieprawidłowy status. Dozwolone wartości to: ${ALLOWED_STATUSES.join(', ')}.`);
    }

    const [rows] = await currentPool.query('SELECT id, status, przypisany_pracownik_id FROM zgloszenia WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
        return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
    }
    const ticket = rows[0];

    if (ticket.status === status) {
        return res.json({
            message: 'Status zgłoszenia pozostaje bez zmian.',
            id: Number(id),
            status
        });
    }

    // Jedna ścieżka do 'do_wysylki': wyłącznie przez dedykowany endpoint /api/zgloszenia/:id/naprawione
    if (status === 'do_wysylki') {
        return fail(res, 'Zmiana statusu na "do_wysylki" jest dozwolona wyłącznie poprzez zatwierdzenie naprawy (endpoint /api/zgloszenia/:id/naprawione).', 400);
    }

    // Weryfikacja przejścia statusu i uprawnień roli
    const check = czyMoznaZmienic(req.user.role, ticket.status, status);
    if (!check.allowed) {
        return fail(res, check.error, check.status);
    }

    // Pracownik może zmieniać status wyłącznie zlecenia przypisanego do siebie
    if (req.user.role === 'pracownik' && ticket.przypisany_pracownik_id !== req.user.id) {
        return fail(res, 'Możesz zmieniać status tylko zlecenia przypisanego do Ciebie.', 403);
    }

    let updateQuery = 'UPDATE zgloszenia SET status = ? WHERE id = ?';
    let updateParams = [status, id];

    // Jeśli status zmienia się na 'zakończone', zapisz czas wysyłki i numer listu (obowiązkowy dla magazyniera)
    if (status === 'zakończone') {
        const listu = (numer_listu && typeof numer_listu === 'string') ? numer_listu.trim() : null;
        if (req.user.role === 'magazynier' && !listu) {
            return fail(res, 'Podanie numeru listu przewozowego jest obowiązkowe przy oznaczaniu zlecenia jako wysłane.');
        }
        updateQuery = 'UPDATE zgloszenia SET status = ?, data_wyslania = NOW(), numer_listu = ? WHERE id = ?';
        updateParams = [status, listu, id];
    }

    await currentPool.query(updateQuery, updateParams);

    return res.json({
        message: 'Status zgłoszenia został zaktualizowany.',
        id: Number(id),
        status
    });
});

app.patch('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);
app.put('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);

// 6. DELETE /api/zgloszenia/:id - Usunięcie zgłoszenia (chroniony, tylko admin)
app.delete('/api/zgloszenia/:id', authenticateToken, requireAdmin,
    safe('Błąd podczas usuwania zgłoszenia:', 'Błąd serwera podczas usuwania zgłoszenia z bazy danych.', async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            return fail(res, ID_ERR_INT);
        }

        const [result] = await currentPool.query(
            'DELETE FROM zgloszenia WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        }

        return res.json({
            message: 'Zgłoszenie zostało pomyślnie usunięte.',
            id
        });
    }));

// 7. POST /api/admin/users - Tworzenie nowego użytkownika (chroniony, tylko admin)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role = 'pracownik' } = req.body || {};
    const cleanUsername = (username || '').trim();

    if (!cleanUsername || !password) {
        return fail(res, 'Podaj nazwę użytkownika i hasło.');
    }

    const allowedRoles = ['admin', 'pracownik', 'serwisant', 'magazynier'];
    if (!allowedRoles.includes(role)) {
        return fail(res, `Nieprawidłowa rola. Dozwolone: ${allowedRoles.join(', ')}`);
    }

    return safe('Błąd podczas tworzenia użytkownika:', 'Błąd serwera podczas tworzenia użytkownika.', async () => {
        const [existing] = await currentPool.query(
            'SELECT id FROM uzytkownicy WHERE username = ?',
            [cleanUsername]
        );
        if (existing.length > 0) {
            return fail(res, 'Użytkownik o tej nazwie już istnieje.', 409);
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
    })(req, res);
});


// Obsługa błędów 404 dla nieistniejących tras API
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API nie został odnaleziony.' });
});

app.czyMoznaZmienic = czyMoznaZmienic;
app.PRZEJSCIA = PRZEJSCIA;

module.exports = app;
