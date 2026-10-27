require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createPool } = require('./db');

const app = express();
app.set('trust proxy', 'loopback');
const { validateJwtSecret } = require('./jwt-validation');

const jwtValidation = validateJwtSecret(process.env.JWT_SECRET);
if (!jwtValidation.valid) {
    throw new Error(`Krytyczny błąd konfiguracji: ${jwtValidation.reason} Wygeneruj klucz poleceniem: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
}
const JWT_SECRET = process.env.JWT_SECRET.trim();

// --- Konfiguracja puli połączeń do bazy MySQL ---
let currentPool = createPool();
app.setPool = (pool) => { currentPool = pool; };
app.getPool = () => currentPool;

// --- Middlewares ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            upgradeInsecureRequests: null
        }
    }
}));
app.use(express.json({ limit: '70kb' }));

const isHashedFile = (filePath) => {
    const fileName = path.basename(filePath);
    return /[.-][a-f0-9]{8,}\./i.test(fileName) || /[.-][a-zA-Z0-9_-]{8,}\./i.test(fileName);
};
app.isHashedFile = isHashedFile;

const staticDir = path.join(__dirname, 'frontend', 'dist');
app.staticDir = staticDir;

app.use(express.static(staticDir, {
    setHeaders: (res, filePath) => {
        const fileName = path.basename(filePath).toLowerCase();
        if (fileName === 'index.html') {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
        } else if (isHashedFile(filePath)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            res.set('Cache-Control', 'public, max-age=86400');
        }
    }
}));

// --- Pomocniki ---
const fail = (res, error, status = 400) => res.status(status).json({ error });

// Bezpieczne logowanie błędów backendu (ochrona RODO: bez wycieku err.sql / err.sqlMessage z danymi osobowymi i haszami)
function logError(msg, err) {
    if (!err) {
        console.error(msg);
        return;
    }
    const code = err.code ? `[${err.code}] ` : '';
    const message = err.message || (typeof err === 'string' ? err : 'Nieznany błąd');
    console.error(`${msg} ${code}${message}`.trim());
}

const safe = (logMsg, errMsg, handler) => async (req, res) => {
    try {
        return await handler(req, res);
    } catch (err) {
        logError(logMsg, err);
        return fail(res, errMsg, 500);
    }
};

const ID_ERR = 'Nieprawidłowe ID zgłoszenia.';
const ID_ERR_INT = 'Nieprawidłowe ID zgłoszenia. Wymagana jest liczba całkowita.';
const USER_ID_ERR_INT = 'Nieprawidłowe ID użytkownika. Wymagana jest liczba całkowita.';
const ALLOWED_ROLES = ['admin', 'pracownik', 'serwisant', 'magazynier'];

const isUserActive = (u) => Boolean(u && u.aktywny !== 0 && u.aktywny !== false && u.aktywny !== '0' && u.aktywny !== 'false');
const parsePositiveInt = (val) => {
    if (typeof val === 'number') return Number.isInteger(val) && val > 0 ? val : NaN;
    if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
        const n = parseInt(val.trim(), 10);
        return n > 0 ? n : NaN;
    }
    return NaN;
};
const isAssignedToOther = (ticket, userId) =>
    ticket.przypisany_pracownik_id !== null &&
    ticket.przypisany_pracownik_id !== undefined &&
    Number(ticket.przypisany_pracownik_id) !== Number(userId);
const canViewTicket = (user, ticket) => {
    if (user?.role === 'pracownik') return Number(ticket.przypisany_pracownik_id) === Number(user.id);
    if (user?.role === 'magazynier') return ['do_wysylki', 'zakończone'].includes(ticket.status);
    return true;
};

const CONFLICT_ERR = 'Zlecenie zostało w międzyczasie zmienione, odśwież widok.';

async function getTransactionConnection() {
    const rawConn = typeof currentPool.getConnection === 'function'
        ? await currentPool.getConnection()
        : null;
    return {
        query: (sql, params) => (rawConn && typeof rawConn.query === 'function')
            ? rawConn.query(sql, params)
            : currentPool.query(sql, params),
        beginTransaction: async () => {
            if (rawConn && typeof rawConn.beginTransaction === 'function') {
                await rawConn.beginTransaction();
            }
        },
        commit: async () => {
            if (rawConn && typeof rawConn.commit === 'function') {
                await rawConn.commit();
            }
        },
        rollback: async () => {
            if (rawConn && typeof rawConn.rollback === 'function') {
                await rawConn.rollback();
            }
        },
        release: () => {
            if (rawConn && typeof rawConn.release === 'function') {
                rawConn.release();
            }
        }
    };
}

async function dodajWpisHistorii(connOrId, zgloszenieId, uzytkownikId, akcja, zStatusu = null, naStatus = null, szczegoly = null) {
    const hasConn = connOrId && typeof connOrId === 'object' && typeof connOrId.query === 'function';
    const conn = hasConn ? connOrId : currentPool;
    const [id, userId, act, fromSt, toSt, details] = hasConn
        ? [zgloszenieId, uzytkownikId, akcja, zStatusu, naStatus, szczegoly]
        : [connOrId, zgloszenieId, uzytkownikId, akcja, zStatusu, naStatus];

    await conn.query(
        `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId || null, act, fromSt || null, toSt || null, details || null]
    );
}

// --- Middleware autoryzacji JWT ---
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return fail(res, 'Brak autoryzacji: Wymagany nagłówek Authorization (np. Bearer <token>)', 401);
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (!token) {
        return fail(res, 'Brak tokenu JWT w nagłówku Authorization', 401);
    }

    let decodedUser;
    try {
        decodedUser = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        return fail(res, 'Odmowa dostępu: Nieprawidłowy lub wygasły token JWT', 401);
    }

    try {
        const [rows] = await currentPool.query(
            'SELECT id, username, role, aktywny FROM uzytkownicy WHERE id = ?',
            [decodedUser.id]
        );
        const dbUser = rows?.[0];
        if (!isUserActive(dbUser)) {
            return fail(res, 'Odmowa dostępu: Konto użytkownika nie istnieje lub zostało zablokowane.', 401);
        }

        req.user = { id: dbUser.id, username: dbUser.username, role: dbUser.role };
        next();
    } catch (err) {
        logError('Błąd podczas weryfikacji użytkownika w authenticateToken:', err);
        return fail(res, 'Błąd serwera podczas autoryzacji użytkownika.', 500);
    }
}

const requireRoles = (...roles) => (req, res, next) =>
    roles.includes(req.user?.role)
        ? next()
        : fail(res, `Brak uprawnień. Wymagana rola: ${roles.join(' lub ')}.`, 403);

const requireAdmin = requireRoles('admin');
const requireAdminOrSerwisant = requireRoles('admin', 'serwisant');

// --- Endpointy API ---

// 1. Health check serwera i bazy danych (na zewnątrz wyłącznie status ok / error, szczegóły błędu do console.error)
app.get('/api/health', async (req, res) => {
    try {
        await currentPool.query('SELECT 1');
        return res.json({ status: 'ok' });
    } catch (err) {
        logError('Błąd połączenia z bazą danych w /api/health:', err);
        return res.status(500).json({ status: 'error' });
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

// Pomocnik: sprawdza czy dla wybranego przedmiotu dopuszczony jest numer seryjny
// (wyłącznie monitory interaktywne lub tablice interaktywne, z wyłączeniem akcesoriów)
function isSerialNumberAllowed(product) {
    if (!product || typeof product !== 'string') return false;
    const lower = product.toLowerCase();
    const isMonitor = lower.includes('monitor interaktywny') && !lower.includes('akcesoria');
    const isTablica = lower.includes('tablica interaktywna') && !lower.includes('akcesoria');
    return isMonitor || isTablica;
}

// Pomocnik walidacji daty zakupu:
// - Sprawdza format RRRR-MM-DD
// - Weryfikuje istnienie daty w kalendarzu (zapobiega przelewaniu nieistniejących dni np. 2026-02-31 przez Date.parse)
// - Blokuje daty z przyszłości
function validatePurchaseDate(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return 'Pole "data_zakupu" musi mieć poprawny format daty (RRRR-MM-DD).';
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
        isNaN(parsedDate.getTime()) ||
        parsedDate.getUTCFullYear() !== year ||
        (parsedDate.getUTCMonth() + 1) !== month ||
        parsedDate.getUTCDate() !== day
    ) {
        return 'Pole "data_zakupu" zawiera nieprawidłową datę (nie istnieje w kalendarzu).';
    }
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    if (parsedDate > today) {
        return 'Pole "data_zakupu" nie może być datą z przyszłości.';
    }
    return null;
}

// Rate limiting dla dodawania zgłoszeń (5 zgłoszeń / 1 godzinę z 1 IP)
const zgloszeniaLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    limit: 5, // 5 zgłoszeń z jednego adresu IP
    message: {
        error: 'Zbyt wiele zgłoszeń z tego adresu IP. Dozwolony limit to 5 zgłoszeń na godzinę. Spróbuj ponownie później.'
    },
    standardHeaders: true, // Zwraca nagłówki RateLimit-*
    legacyHeaders: false, // Wyłącza nagłówki X-RateLimit-*
    skip: () => process.env.NODE_ENV === 'test'
});

const REQUIRED_FIELDS = [
    'imie', 'nazwisko', 'adres', 'kod_pocztowy', 'miasto', 'numer_telefonu',
    'email', 'przedmiot_zgloszenia', 'data_zakupu', 'opis_usterki', 'numer_fv', 'nip'
];
const FIELD_MAX_LENGTHS = {
    imie: 50, nazwisko: 50, adres: 500, kod_pocztowy: 6, miasto: 100,
    numer_telefonu: 20, email: 100, przedmiot_zgloszenia: 100, data_zakupu: 10,
    opis_usterki: 5000, numer_fv: 50, nip: 10
};

// 2. POST /api/zgloszenia - Publiczne dodawanie nowego zgłoszenia serwisowego
app.post('/api/zgloszenia', zgloszeniaLimiter, async (req, res) => {
    const { website, nazwa_firmy, numer_seryjny, przedmiot_zgloszenia, zgoda_rodo, telefon_stacjonarny } = req.body || {};

    // Zabezpieczenie Honeypot: ukryte pole website przeciwko botom spamującym
    const isHoneypotTriggered = typeof website === 'string' ? website.trim().length > 0 : Boolean(website);
    if (isHoneypotTriggered) {
        // Odpowiadamy 201 jak zwykle, ale nic nie zapisujemy do bazy danych
        return res.status(201).json({
            message: 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.',
            id: 0
        });
    }

    // 1. Sprawdzenie typu tekstowego, obecności oraz limitu długości dla wymaganych pól
    const c = {}; // wartości wymaganych pól po .trim()
    for (const name of REQUIRED_FIELDS) {
        const value = (req.body || {})[name];
        const error = typeof value !== 'string' ? 'musi być tekstem.'
            : value.trim().length === 0 ? 'nie może być puste.'
                : value.trim().length > FIELD_MAX_LENGTHS[name]
                    ? `przekracza maksymalną dozwoloną długość (${FIELD_MAX_LENGTHS[name]} znaków).`
                    : null;
        if (error) return fail(res, `Pole "${name}" ${error}`);
        c[name] = value.trim();
    }

    // 2-10. Pozostałe walidacje (w kolejności sprawdzania; pierwszy błąd kończy żądanie)
    const nameRegex = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-']+$/;
    const firmaProvided = nazwa_firmy !== undefined && nazwa_firmy !== null && nazwa_firmy !== '';
    const canonicalPrzedmiot = ALLOWED_PRZEDMIOTY.find(item => item.toLowerCase() === c.przedmiot_zgloszenia.toLowerCase());
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
        // adres e-mail
        [!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email), 'Pole "email" ma nieprawidłowy format adresu e-mail.'],
        // numer telefonu (+48 i dokładnie 9 cyfr)
        [!/^\+48\d{9}$/.test(c.numer_telefonu), 'Pole "numer_telefonu" musi zawierać prefiks +48 oraz dokładnie 9 cyfr.'],
        // przedmiot zgłoszenia z listy
        [!canonicalPrzedmiot,
        `Pole "przedmiot_zgloszenia" zawiera nieprawidłową wartość. Dozwolone: ${ALLOWED_PRZEDMIOTY.join(', ')}`],
        // data zakupu (RRRR-MM-DD, prawidłowa w kalendarzu, nie z przyszłości)
        [Boolean(validatePurchaseDate(c.data_zakupu)), validatePurchaseDate(c.data_zakupu)]
    ];
    const failed = checks.find(([invalid]) => invalid);
    if (failed) return fail(res, failed[1]);
    c.przedmiot_zgloszenia = canonicalPrzedmiot;

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

    // 11a. Walidacja opcjonalnego telefonu stacjonarnego (jeśli podano)
    let cleanTelefonStacjonarny = null;
    const stacjonarnyProvided = telefon_stacjonarny !== undefined && telefon_stacjonarny !== null && String(telefon_stacjonarny).trim() !== '';
    if (stacjonarnyProvided) {
        if (typeof telefon_stacjonarny !== 'string') {
            return fail(res, 'Pole "telefon_stacjonarny" musi być tekstem.');
        }
        const trimmedStacjonarny = telefon_stacjonarny.trim();
        if (trimmedStacjonarny.length > 20) {
            return fail(res, 'Pole "telefon_stacjonarny" przekracza maksymalną dozwoloną długość (20 znaków).');
        }
        const digitsOnly = trimmedStacjonarny.replace(/\D/g, '');
        const digits = digitsOnly.startsWith('48') && digitsOnly.length === 11 ? digitsOnly.slice(2) : digitsOnly;
        if (digits.length !== 9) {
            return fail(res, 'Pole "telefon_stacjonarny" musi zawierać 9 cyfr numeru stacjonarnego (np. 22 123 45 67 lub z prefiksem +48).');
        }
        cleanTelefonStacjonarny = `+48${digits}`;
    }

    // 12. Walidacja akceptacji klauzuli RODO (wymagany checkbox)
    const isZgodaRodo = zgoda_rodo === true || zgoda_rodo === 'true' || zgoda_rodo === 1 || zgoda_rodo === '1';
    if (!isZgodaRodo) {
        return fail(res, 'Pole "zgoda_rodo" jest wymagane: należy potwierdzić zapoznanie się z informacją o przetwarzaniu danych osobowych.');
    }

    let conn;
    try {
        conn = await getTransactionConnection();
        await conn.beginTransaction();

        const query = `
            INSERT INTO zgloszenia (imie, nazwisko, nazwa_firmy, adres, kod_pocztowy, miasto, numer_telefonu, telefon_stacjonarny, email, przedmiot_zgloszenia, numer_seryjny, data_zakupu, zgoda_rodo_data, opis_usterki, numer_fv, nip, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, 'nowe')
        `;
        const values = [
            c.imie,
            c.nazwisko,
            (typeof nazwa_firmy === 'string' && nazwa_firmy.trim()) || null,
            c.adres,
            c.kod_pocztowy,
            c.miasto,
            c.numer_telefonu,
            cleanTelefonStacjonarny,
            c.email,
            c.przedmiot_zgloszenia,
            cleanNumerSeryjny,
            c.data_zakupu,
            c.opis_usterki,
            c.numer_fv,
            c.nip
        ];

        const [result] = await conn.query(query, values);

        await dodajWpisHistorii(
            conn,
            result.insertId,
            null,
            'utworzenie',
            null,
            'nowe',
            'Utworzono zgłoszenie serwisowe.'
        );

        await conn.commit();

        return res.status(201).json({
            message: 'Zgłoszenie serwisowe zostało pomyślnie przyjęte.',
            id: result.insertId
        });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (_) { /* ignore */ }
        }
        logError('Błąd podczas zapisywania zgłoszenia:', err);
        return fail(res, 'Błąd serwera podczas zapisywania zgłoszenia do bazy danych.', 500);
    } finally {
        if (conn) conn.release();
    }
});

// Rate limiting dla logowania (10 prób / 15 minut z 1 IP)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    limit: 10, // 10 prób z jednego adresu IP
    skipSuccessfulRequests: true, // Udane logowania nie zużywają puli prób
    message: {
        error: 'Zbyt wiele prób logowania z tego adresu IP. Spróbuj ponownie za 15 minut.'
    },
    standardHeaders: true, // Zwraca nagłówki RateLimit-*
    legacyHeaders: false, // Wyłącza nagłówki X-RateLimit-*
    skip: () => process.env.NODE_ENV === 'test'
});

// Stały hash bcrypt (koszt 10) używany do porównania hasła, gdy użytkownik nie istnieje w bazie (ochrona przed enumeracją loginów po czasie odpowiedzi)
const DUMMY_PASSWORD_HASH = '$2b$10$eGNTFcaRQvqm.RrAD/kcSOQNfCFTrnqt8/1IiVV7woTU4BTCSvvXe';

// 3. POST /api/login - Logowanie użytkownika i generowanie tokenu JWT (wyłącznie username, rate limited)
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    const loginUsername = typeof username === 'string' ? username.trim() : '';

    if (!loginUsername || typeof password !== 'string' || !password.trim()) {
        return fail(res, 'Podaj nazwę użytkownika oraz hasło.');
    }

    return safe('Błąd podczas logowania:', 'Błąd serwera podczas procesu logowania.', async () => {
        const [rows] = await currentPool.query(
            'SELECT id, username, password_hash, role, aktywny FROM uzytkownicy WHERE username = ?',
            [loginUsername]
        );

        const user = rows?.[0];
        // Hasło porównywane wyłącznie przez bcrypt (hash musi mieć prefiks $2a$/$2b$/$2y$); gdy użytkownika nie ma, porównujemy ze stałym hashem (ochrona przed timing attack)
        const hasValidHash = Boolean(user && typeof user.password_hash === 'string' && /^\$2[aby]\$/.test(user.password_hash));
        const hashToCompare = hasValidHash ? user.password_hash : DUMMY_PASSWORD_HASH;
        const passwordMatches = await bcrypt.compare(password, hashToCompare);
        const isPasswordValid = hasValidHash && passwordMatches;

        if (!isPasswordValid) {
            return fail(res, 'Nieprawidłowa nazwa użytkownika lub hasło.', 401);
        }

        if (!isUserActive(user)) {
            return fail(res, 'Konto użytkownika zostało zablokowane. Skontaktuj się z administratorem.', 403);
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
            "SELECT id, username, role FROM uzytkownicy WHERE role IN ('pracownik', 'serwisant') AND (aktywny IS NULL OR aktywny = 1) ORDER BY username ASC"
        );
        return res.json(rows);
    }));

// Mapa dozwolonych przejść statusów i ról uprawnionych do ich wykonania:
// - nowe -> w_realizacji: automatycznie przy przypisaniu lub rozpoczęciu (admin, serwisant)
// - w_realizacji -> do_wysylki: przypisany pracownik, serwisant, admin (tylko z opisem naprawy)
// - do_wysylki -> zakończone: magazynier, admin
// - cofanie statusu: tylko admin
const STATUS_ORDER = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];
const ALLOWED_STATUSES = STATUS_ORDER;

const STATUS_LABELS = {
    nowe: 'Nowe',
    w_realizacji: 'W realizacji',
    do_wysylki: 'Do wysyłki',
    'zakończone': 'Zakończone'
};

const PRZEJSCIA = {
    nowe: { w_realizacji: ['admin', 'serwisant'] },
    w_realizacji: { do_wysylki: ['admin', 'serwisant', 'pracownik'] },
    do_wysylki: { 'zakończone': ['admin', 'magazynier'] }
};

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

/**
 * Wyznacza listę dozwolonych akcji/przejść dla danego użytkownika i zgłoszenia na podstawie czyMoznaZmienic i PRZEJSCIA.
 * Frontend korzysta z tej listy jako jedynego źródła prawdy o dostępnych przyciskach/kontrolkach.
 *
 * @param {object} user - obiekt req.user { id, role, ... }
 * @param {object} ticket - obiekt zgłoszenia { id, status, przypisany_pracownik_id, ... }
 * @returns {Array<{ akcja: string, na_status: string, etykieta: string, typ: string }>}
 */
function wyznaczDozwoloneAkcje(user, ticket) {
    if (!user || !user.role || !ticket || !ticket.status) {
        return [];
    }

    const { role, id: userId } = user;
    const currentStatus = ticket.status;
    const currentIndex = STATUS_ORDER.indexOf(currentStatus);
    if (currentIndex === -1) {
        return [];
    }

    const akcje = [];

    for (const targetStatus of STATUS_ORDER) {
        if (targetStatus === currentStatus) {
            continue;
        }

        const check = czyMoznaZmienic(role, currentStatus, targetStatus);
        if (!check.allowed) {
            continue;
        }

        const targetIndex = STATUS_ORDER.indexOf(targetStatus);

        // 1. Cofanie statusu (wyłącznie admin, targetIndex < currentIndex)
        if (check.isRollback || targetIndex < currentIndex) {
            akcje.push({
                akcja: 'cofnij',
                na_status: targetStatus,
                etykieta: `Cofnij do: ${STATUS_LABELS[targetStatus] || targetStatus}`,
                typ: 'cofnij'
            });
            continue;
        }

        // 2. Przejście w przód:
        // A. w_realizacji -> do_wysylki (wymaga opisu naprawy przez /naprawione)
        if (targetStatus === 'do_wysylki') {
            if (role === 'pracownik' && Number(ticket.przypisany_pracownik_id) !== Number(userId)) continue;
            if (role === 'serwisant' && isAssignedToOther(ticket, userId)) continue;
            akcje.push({
                akcja: 'naprawione',
                na_status: 'do_wysylki',
                etykieta: 'Oznacz jako naprawione',
                typ: 'naprawa'
            });
            continue;
        }

        // B. do_wysylki -> zakończone (wymaga wysyłki z numerem listu)
        if (targetStatus === 'zakończone') {
            akcje.push({
                akcja: 'wyslij',
                na_status: 'zakończone',
                etykieta: 'Oznacz jako wysłane',
                typ: 'wysylka'
            });
            continue;
        }

        // C. nowe -> w_realizacji (przypisanie pracownika i rozpoczęcie realizacji)
        if (targetStatus === 'w_realizacji' && currentStatus === 'nowe') {
            akcje.push({
                akcja: 'przypisz',
                na_status: 'w_realizacji',
                etykieta: 'Przypisz',
                typ: 'przypisanie'
            });
            continue;
        }

        // D. Inne dozwolone zmiany statusu
        akcje.push({
            akcja: 'zmien_status',
            na_status: targetStatus,
            etykieta: `Zmień na: ${STATUS_LABELS[targetStatus] || targetStatus}`,
            typ: 'status'
        });
    }

    return akcje;
}

const TICKET_SELECT_FIELDS = `
    z.id, z.imie, z.nazwisko, z.nazwa_firmy, z.adres, z.kod_pocztowy, z.miasto, 
    z.numer_telefonu, z.telefon_stacjonarny, z.email, z.przedmiot_zgloszenia, z.numer_seryjny, 
    DATE_FORMAT(z.data_zakupu, '%Y-%m-%d') AS data_zakupu, 
    z.opis_usterki, z.numer_fv, z.nip, z.status, z.created_at,
    z.przypisany_pracownik_id,
    u.username AS przypisany_pracownik_username,
    z.opis_naprawy,
    DATE_FORMAT(z.opis_naprawy_data, '%Y-%m-%d %H:%i:%s') AS opis_naprawy_data,
    DATE_FORMAT(z.data_wyslania, '%Y-%m-%d %H:%i:%s') AS data_wyslania,
    z.numer_listu
`;

const SEARCH_COLUMNS = [
    'z.imie', 'z.nazwisko', 'z.nazwa_firmy', 'z.email', 'z.numer_telefonu',
    'z.telefon_stacjonarny', 'z.przedmiot_zgloszenia', 'z.numer_seryjny',
    'z.numer_fv', 'z.nip', 'z.miasto', 'z.opis_usterki', 'z.numer_listu', 'u.username'
];

async function pobierzHistorieZgloszenia(zgloszenieId) {
    const [rows] = await currentPool.query(`
        SELECT h.id, h.zgloszenie_id, h.uzytkownik_id, u.username, h.akcja, h.z_statusu, h.na_status, h.szczegoly,
                DATE_FORMAT(h.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM historia_zgloszen h
        LEFT JOIN uzytkownicy u ON h.uzytkownik_id = u.id
        WHERE h.zgloszenie_id = ?
        ORDER BY h.id ASC
    `, [zgloszenieId]);
    return rows;
}

// 5. GET /api/zgloszenia - Pobieranie zgłoszeń w zależności od roli użytkownika oraz parametrów filtrowania/paginacji:
app.get('/api/zgloszenia', authenticateToken,
    safe('Błąd podczas pobierania zgłoszeń:', 'Błąd serwera podczas pobierania listy zgłoszeń.', async (req, res) => {
        const role = req.user?.role;
        const whereConditions = [];
        const params = [];

        if (role === 'pracownik') {
            whereConditions.push('z.przypisany_pracownik_id = ?');
            params.push(req.user.id);
        } else if (role === 'magazynier') {
            whereConditions.push("z.status IN ('do_wysylki', 'zakończone')");
        }

        const statusQuery = typeof req.query.status === 'string' ? req.query.status.trim() : '';
        if (statusQuery) {
            whereConditions.push('z.status = ?');
            params.push(statusQuery);
        }

        const pracownikQuery = typeof req.query.pracownik === 'string' ? req.query.pracownik.trim() : '';
        if (pracownikQuery) {
            if (['nieprzypisane', '0', 'null'].includes(pracownikQuery.toLowerCase())) {
                whereConditions.push('z.przypisany_pracownik_id IS NULL');
            } else {
                const pracownikId = parsePositiveInt(pracownikQuery);
                if (isNaN(pracownikId)) return fail(res, 'Nieprawidłowa wartość parametru "pracownik".', 400);
                if (true) {
                    whereConditions.push('z.przypisany_pracownik_id = ?');
                    params.push(pracownikId);
                }
            }
        }

        const szukajQuery = typeof req.query.szukaj === 'string' ? req.query.szukaj.trim() : '';
        if (szukajQuery) {
            const escapedSzukaj = szukajQuery.replace(/[\\%_]/g, '\\$&');
            const likePattern = `%${escapedSzukaj}%`;
            whereConditions.push(`(${SEARCH_COLUMNS.map(col => `${col} LIKE ?`).join(' OR ')})`);
            SEARCH_COLUMNS.forEach(() => params.push(likePattern));
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        const [countRows] = await currentPool.query(`
            SELECT COUNT(*) AS total
            FROM zgloszenia z
            LEFT JOIN uzytkownicy u ON z.przypisany_pracownik_id = u.id
            ${whereClause}
        `, params);
        const total = countRows?.[0]?.total ? Number(countRows[0].total) : 0;



        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 25));
        const totalPages = Math.ceil(total / limit) || 1;
        const page = Math.min(Math.max(1, parseInt(req.query.strona, 10) || 1), totalPages);
        const offset = (page - 1) * limit;

        const sortDirection = String(req.query.sort || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const [rows] = await currentPool.query(`
            SELECT ${TICKET_SELECT_FIELDS}
            FROM zgloszenia z
            LEFT JOIN uzytkownicy u ON z.przypisany_pracownik_id = u.id
            ${whereClause}
            ORDER BY z.created_at ${sortDirection}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const rowsWithActions = rows.map((t) => ({
            ...t,
            dozwolone_akcje: wyznaczDozwoloneAkcje(req.user, t)
        }));

        return res.json({
            total,
            page,
            limit,
            totalPages,
            data: rowsWithActions,
            zgloszenia: rowsWithActions
        });
    }));

// 5a. GET /api/zgloszenia/:id - Pobieranie szczegółów wybranego zgłoszenia wraz z historią
app.get('/api/zgloszenia/:id', authenticateToken,
    safe('Błąd podczas pobierania szczegółów zgłoszenia:', 'Błąd serwera podczas pobierania szczegółów zgłoszenia.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, ID_ERR_INT);

        const [tickets] = await currentPool.query(`
            SELECT ${TICKET_SELECT_FIELDS}
            FROM zgloszenia z
            LEFT JOIN uzytkownicy u ON z.przypisany_pracownik_id = u.id
            WHERE z.id = ?
        `, [id]);

        if (!tickets || tickets.length === 0) {
            return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        }

        const ticket = tickets[0];
        if (!canViewTicket(req.user, ticket)) {
            return fail(res, 'Brak uprawnień do przeglądania tego zgłoszenia.', 403);
        }

        const historia = await pobierzHistorieZgloszenia(id);
        const ticketWithActions = { ...ticket, dozwolone_akcje: wyznaczDozwoloneAkcje(req.user, ticket) };

        return res.json({
            ...ticketWithActions,
            historia,
            zgloszenie: ticketWithActions
        });
    }));

// 6. PATCH /api/zgloszenia/:id/przypisz - Przypisanie zlecenia pracownikowi (admin i serwisant)
app.patch('/api/zgloszenia/:id/przypisz', authenticateToken, requireAdminOrSerwisant,
    safe('Błąd podczas przypisywania pracownika:', 'Błąd serwera podczas przypisywania pracownika.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, ID_ERR);

        const { pracownik_id } = req.body || {};
        let assignedId = null;
        let assignedUsername = null;

        if (pracownik_id !== undefined && pracownik_id !== null && pracownik_id !== '') {
            const parsedPracownikId = parsePositiveInt(pracownik_id);
            if (isNaN(parsedPracownikId)) return fail(res, 'Nieprawidłowe ID pracownika.');

            const [users] = await currentPool.query(
                'SELECT id, username, role, aktywny FROM uzytkownicy WHERE id = ?',
                [parsedPracownikId]
            );
            if (!users || users.length === 0) return fail(res, 'Nie znaleziono wybranego pracownika.', 404);

            const candidate = users[0];
            const assignableRoles = req.user.role === 'admin'
                ? ['pracownik', 'serwisant', 'admin']
                : ['pracownik', 'serwisant'];
            if (!assignableRoles.includes(candidate.role)) {
                return fail(res, 'Zlecenie można przypisać wyłącznie do pracownika lub serwisanta.', 400);
            }
            if (!isUserActive(candidate)) {
                return fail(res, 'Nie można przypisać zlecenia do zablokowanego pracownika.', 400);
            }
            assignedId = parsedPracownikId;
            assignedUsername = candidate.username;
        }

        const [tickets] = await currentPool.query('SELECT id, status FROM zgloszenia WHERE id = ?', [id]);
        if (!tickets || tickets.length === 0) return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        const ticket = tickets[0];

        let targetStatus = ticket.status;
        if (ticket.status === 'nowe' && assignedId !== null) {
            targetStatus = 'w_realizacji';
            const check = czyMoznaZmienic(req.user.role, ticket.status, targetStatus);
            if (!check.allowed) return fail(res, check.error, check.status);
        }

        const conn = await getTransactionConnection();
        try {
            await conn.beginTransaction();

            const [assignResult] = await conn.query(
                'UPDATE zgloszenia SET przypisany_pracownik_id = ? WHERE id = ?',
                [assignedId, id]
            );
            if (assignResult && assignResult.affectedRows === 0) {
                await conn.rollback();
                return fail(res, CONFLICT_ERR, 409);
            }

            if (ticket.status === 'nowe' && assignedId !== null) {
                const [statusResult] = await conn.query(
                    "UPDATE zgloszenia SET status = 'w_realizacji' WHERE id = ? AND status = 'nowe'",
                    [id]
                );
                if (statusResult && statusResult.affectedRows === 0) {
                    await conn.rollback();
                    return fail(res, CONFLICT_ERR, 409);
                }
            }

            await dodajWpisHistorii(
                conn, id, req.user.id, 'przypisanie', ticket.status, targetStatus,
                assignedId ? `Przypisano pracownika: ${assignedUsername}` : 'Cofnięto przypisanie pracownika'
            );

            await conn.commit();
        } catch (err) {
            try { await conn.rollback(); } catch (_) { /* ignore */ }
            throw err;
        } finally {
            conn.release();
        }

        return res.json({
            message: assignedId
                ? `Zlecenie #${id} zostało przypisane pracownikowi ${assignedUsername}.`
                : `Cofnięto przypisanie zlecenia #${id}.`,
            id,
            przypisany_pracownik_id: assignedId,
            przypisany_pracownik_username: assignedUsername,
            status: targetStatus,
            dozwolone_akcje: wyznaczDozwoloneAkcje(req.user, {
                id,
                status: targetStatus,
                przypisany_pracownik_id: assignedId
            })
        });
    }));

// 7. PATCH /api/zgloszenia/:id/naprawione - Opisanie naprawy przez przypisanego pracownika, serwisanta lub admina
app.patch('/api/zgloszenia/:id/naprawione', authenticateToken,
    safe('Błąd podczas zatwierdzania naprawy:', 'Błąd serwera podczas zatwierdzania naprawy zgłoszenia.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, ID_ERR);

        const { opis_naprawy } = req.body || {};
        if (!opis_naprawy || typeof opis_naprawy !== 'string' || opis_naprawy.trim().length === 0) {
            return fail(res, 'Przed oznaczeniem zlecenia jako naprawione wymagany jest opis wykonanych prac naprawczych (np. co zostało zrobione).');
        }
        const cleanOpis = opis_naprawy.trim();
        if (cleanOpis.length > 5000) {
            return fail(res, 'Pole "opis_naprawy" przekracza maksymalną dozwoloną długość (5000 znaków).');
        }

        const [rows] = await currentPool.query('SELECT id, status, przypisany_pracownik_id FROM zgloszenia WHERE id = ?', [id]);
        if (!rows || rows.length === 0) return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        const ticket = rows[0];

        const check = czyMoznaZmienic(req.user.role, ticket.status, 'do_wysylki');
        if (!check.allowed) return fail(res, check.error, check.status);

        if (req.user.role === 'pracownik' && Number(ticket.przypisany_pracownik_id) !== Number(req.user.id)) {
            return fail(res, 'Możesz oznaczyć jako naprawione tylko zlecenie przypisane do Ciebie.', 403);
        }

        if (req.user.role === 'serwisant' && isAssignedToOther(ticket, req.user.id)) {
            return fail(res, 'Serwisant nie może opisać zlecenia przypisanego do innego pracownika.', 403);
        }

        const newAssignedId = req.user.role === 'serwisant' ? req.user.id : ticket.przypisany_pracownik_id;

        const conn = await getTransactionConnection();
        try {
            await conn.beginTransaction();

            const [updateResult] = await conn.query(
                "UPDATE zgloszenia SET opis_naprawy = ?, opis_naprawy_data = NOW(), status = 'do_wysylki', przypisany_pracownik_id = ? WHERE id = ? AND status = ?",
                [cleanOpis, newAssignedId, id, ticket.status]
            );
            if (updateResult && updateResult.affectedRows === 0) {
                await conn.rollback();
                return fail(res, CONFLICT_ERR, 409);
            }

            if (ticket.przypisany_pracownik_id !== newAssignedId) {
                await dodajWpisHistorii(
                    conn, id, req.user.id, 'przypisanie', ticket.status, ticket.status,
                    `Automatycznie przypisano serwisanta: ${req.user.username}`
                );
            }

            await dodajWpisHistorii(conn, id, req.user.id, 'naprawa', ticket.status, 'do_wysylki', `Opis naprawy: ${cleanOpis}`);

            await conn.commit();
        } catch (err) {
            try { await conn.rollback(); } catch (_) { /* ignore */ }
            throw err;
        } finally {
            conn.release();
        }

        return res.json({
            message: 'Zlecenie zostało opisane i przekazane do magazynu ze statusem "Do wysyłki".',
            id,
            status: 'do_wysylki',
            przypisany_pracownik_id: newAssignedId,
            przypisany_pracownik_username: req.user.role === 'serwisant' ? req.user.username : undefined,
            opis_naprawy: cleanOpis,
            dozwolone_akcje: wyznaczDozwoloneAkcje(req.user, {
                id,
                status: 'do_wysylki',
                przypisany_pracownik_id: newAssignedId
            })
        });
    }));

// 8. PATCH/PUT /api/zgloszenia/:id/status - Aktualizacja statusu zgłoszenia
const handleUpdateStatus = safe('Błąd podczas aktualizacji statusu:', 'Błąd serwera podczas aktualizacji statusu zgłoszenia.', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (isNaN(id)) return fail(res, ID_ERR_INT);
    const { status, numer_listu } = req.body || {};

    if (numer_listu !== undefined && numer_listu !== null) {
        if (typeof numer_listu !== 'string') return fail(res, 'Pole "numer_listu" musi być tekstem.');
        if (numer_listu.trim().length > 100) {
            return fail(res, 'Pole "numer_listu" przekracza maksymalną dozwoloną długość (100 znaków).');
        }
    }

    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return fail(res, `Nieprawidłowy status. Dozwolone wartości to: ${ALLOWED_STATUSES.join(', ')}.`);
    }

    const [rows] = await currentPool.query('SELECT id, status, przypisany_pracownik_id, opis_naprawy FROM zgloszenia WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
    const ticket = rows[0];

    if (ticket.status === status) {
        if (numer_listu !== undefined) {
            if (req.user.role !== 'magazynier' && req.user.role !== 'admin') {
                return fail(res, 'Brak uprawnień do edycji numeru listu przewozowego.', 403);
            }
            if (req.user.role === 'magazynier' && status !== 'zakończone') {
                return fail(res, 'Magazynier może edytować numer listu tylko dla zgłoszeń o statusie "zakończone".', 403);
            }
            const listu = numer_listu ? numer_listu.trim() : null;
            if (req.user.role === 'magazynier' && !listu) {
                return fail(res, 'Podanie numeru listu przewozowego jest obowiązkowe przy oznaczaniu zlecenia jako wysłane.');
            }
            const conn = await getTransactionConnection();
            try {
                await conn.beginTransaction();
                const [updateResult] = await conn.query(
                    'UPDATE zgloszenia SET numer_listu = ? WHERE id = ? AND status = ?',
                    [listu, id, ticket.status]
                );
                if (updateResult && updateResult.affectedRows === 0) {
                    await conn.rollback();
                    return fail(res, CONFLICT_ERR, 409);
                }
                await dodajWpisHistorii(
                    conn, id, req.user.id, 'zmiana_numeru_listu', status, status,
                    listu ? `Zaktualizowano numer listu: ${listu}` : 'Usunięto numer listu przewozowego'
                );
                await conn.commit();
            } catch (err) {
                try { await conn.rollback(); } catch (_) { /* ignore */ }
                throw err;
            } finally {
                conn.release();
            }
            return res.json({
                message: 'Numer listu przewozowego został zaktualizowany.',
                id: Number(id),
                status,
                numer_listu: listu
            });
        }
        return res.json({
            message: 'Status zgłoszenia pozostaje bez zmian.',
            id: Number(id),
            status
        });
    }

    const check = czyMoznaZmienic(req.user.role, ticket.status, status);
    if (!check.allowed) return fail(res, check.error, check.status);

    if (status === 'do_wysylki' && !check.isRollback) {
        return fail(res, 'Zmiana statusu na "do_wysylki" jest dozwolona wyłącznie poprzez zatwierdzenie naprawy (endpoint /api/zgloszenia/:id/naprawione).', 400);
    }

    if (req.user.role === 'pracownik' && Number(ticket.przypisany_pracownik_id) !== Number(req.user.id)) {
        return fail(res, 'Możesz zmieniać status tylko zlecenia przypisanego do Ciebie.', 403);
    }

    let updateQuery = 'UPDATE zgloszenia SET status = ? WHERE id = ? AND status = ?';
    let updateParams = [status, id, ticket.status];
    let akcja = 'zmiana_statusu';
    let szczegoly = `Zmieniono status z "${ticket.status}" na "${status}"`;

    if (check.isRollback) {
        const targetIndex = STATUS_ORDER.indexOf(status);
        const clearWysylka = targetIndex < STATUS_ORDER.indexOf('zakończone');
        const clearNaprawa = targetIndex < STATUS_ORDER.indexOf('do_wysylki');

        const setClauses = ['status = ?'];
        updateParams = [status];

        if (clearWysylka) setClauses.push('data_wyslania = NULL', 'numer_listu = NULL');
        if (clearNaprawa) {
            setClauses.push('opis_naprawy = NULL', 'opis_naprawy_data = NULL');
            if (ticket.opis_naprawy) szczegoly += `. Poprzedni opis naprawy: ${ticket.opis_naprawy}`;
        }

        updateQuery = `UPDATE zgloszenia SET ${setClauses.join(', ')} WHERE id = ? AND status = ?`;
        updateParams.push(id, ticket.status);
    } else if (status === 'zakończone') {
        const listu = (numer_listu && typeof numer_listu === 'string') ? numer_listu.trim() : null;
        if (req.user.role === 'magazynier' && !listu) {
            return fail(res, 'Podanie numeru listu przewozowego jest obowiązkowe przy oznaczaniu zlecenia jako wysłane.');
        }
        updateQuery = 'UPDATE zgloszenia SET status = ?, data_wyslania = NOW(), numer_listu = ? WHERE id = ? AND status = ?';
        updateParams = [status, listu, id, ticket.status];
        akcja = 'wysyłka';
        szczegoly = `Wysłano przesyłkę. Numer listu: ${listu || 'brak'}`;
    } else if (req.user.role === 'admin' && numer_listu !== undefined) {
        const listu = numer_listu ? numer_listu.trim() : null;
        updateQuery = 'UPDATE zgloszenia SET status = ?, numer_listu = ? WHERE id = ? AND status = ?';
        updateParams = [status, listu, id, ticket.status];
        szczegoly = `Zmieniono status z "${ticket.status}" na "${status}". Numer listu: ${listu || 'brak'}`;
    }

    const conn = await getTransactionConnection();
    try {
        await conn.beginTransaction();

        const [updateResult] = await conn.query(updateQuery, updateParams);
        if (updateResult && updateResult.affectedRows === 0) {
            await conn.rollback();
            return fail(res, CONFLICT_ERR, 409);
        }

        await dodajWpisHistorii(conn, id, req.user.id, akcja, ticket.status, status, szczegoly);

        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        conn.release();
    }

    return res.json({
        message: 'Status zgłoszenia został zaktualizowany.',
        id: Number(id),
        status,
        dozwolone_akcje: wyznaczDozwoloneAkcje(req.user, {
            id: Number(id),
            status,
            przypisany_pracownik_id: ticket.przypisany_pracownik_id
        })
    });
});

app.patch('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);
app.put('/api/zgloszenia/:id/status', authenticateToken, handleUpdateStatus);

// 6. DELETE /api/zgloszenia/:id - Usunięcie zgłoszenia (chroniony, tylko admin)
app.delete('/api/zgloszenia/:id', authenticateToken, requireAdmin,
    safe('Błąd podczas usuwania zgłoszenia:', 'Błąd serwera podczas usuwania zgłoszenia z bazy danych.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, ID_ERR_INT);

        const [tickets] = await currentPool.query('SELECT id, status FROM zgloszenia WHERE id = ?', [id]);
        if (!tickets || tickets.length === 0) return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        const ticket = tickets[0];

        const conn = await getTransactionConnection();
        try {
            await conn.beginTransaction();

            await dodajWpisHistorii(conn, id, req.user.id, 'usunięcie', ticket.status, null, `Wpis usunięty przez ${req.user.username}`);

            const [result] = await conn.query('DELETE FROM zgloszenia WHERE id = ?', [id]);
            if (result && result.affectedRows === 0) {
                await conn.rollback();
                return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
            }

            await conn.commit();
        } catch (err) {
            try { await conn.rollback(); } catch (_) { /* ignore */ }
            throw err;
        } finally {
            conn.release();
        }

        return res.json({ message: 'Zgłoszenie zostało pomyślnie usunięte.', id });
    }));

// GET /api/zgloszenia/:id/historia - Pobieranie historii zgłoszenia (z weryfikacją uprawnień RBAC)
app.get('/api/zgloszenia/:id/historia', authenticateToken,
    safe('Błąd podczas pobierania historii zgłoszenia:', 'Błąd serwera podczas pobierania historii zgłoszenia.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, ID_ERR_INT);

        const [tickets] = await currentPool.query('SELECT id, status, przypisany_pracownik_id FROM zgloszenia WHERE id = ?', [id]);
        if (!tickets || tickets.length === 0) return fail(res, `Nie znaleziono zgłoszenia o ID ${id}.`, 404);
        if (!canViewTicket(req.user, tickets[0])) {
            return fail(res, 'Brak uprawnień do przeglądania tego zgłoszenia.', 403);
        }

        const rows = await pobierzHistorieZgloszenia(id);
        return res.json(rows);
    }));

// 7. POST /api/admin/users - Tworzenie nowego użytkownika (chroniony, tylko admin)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    const { username, password, role = 'pracownik' } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        return fail(res, 'Podaj nazwę użytkownika i hasło.');
    }
    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername || !password.trim()) return fail(res, 'Podaj nazwę użytkownika i hasło.');
    if (cleanUsername.length > 50) return fail(res, 'Pole "username" przekracza maksymalną dozwoloną długość (50 znaków).');
    if (cleanPassword.length < 8) return fail(res, 'Hasło musi mieć co najmniej 8 znaków.');
    if (Buffer.byteLength(cleanPassword) > 72) return fail(res, 'Hasło nie może przekraczać 72 znaków.');
    if (!ALLOWED_ROLES.includes(role)) {
        return fail(res, `Nieprawidłowa rola. Dozwolone: ${ALLOWED_ROLES.join(', ')}`);
    }

    return safe('Błąd podczas tworzenia użytkownika:', 'Błąd serwera podczas tworzenia użytkownika.', async () => {
        const [existing] = await currentPool.query('SELECT id FROM uzytkownicy WHERE username = ?', [cleanUsername]);
        if (existing.length > 0) return fail(res, 'Taki użytkownik już istnieje.', 409);

        const hashedPassword = await bcrypt.hash(password, 10);
        let result;
        try {
            [result] = await currentPool.query(
                'INSERT INTO uzytkownicy (username, password_hash, role) VALUES (?, ?, ?)',
                [cleanUsername, hashedPassword, role]
            );
        } catch (err) {
            if (err && err.code === 'ER_DUP_ENTRY') {
                return fail(res, 'Taki użytkownik już istnieje.', 409);
            }
            throw err;
        }

        return res.status(201).json({
            message: 'Użytkownik został pomyślnie utworzony.',
            id: result.insertId,
            username: cleanUsername,
            role,
            aktywny: true
        });
    })(req, res);
});

// 8. GET /api/admin/users - Pobieranie listy kont użytkowników (chroniony, tylko admin, BEZ password_hash!)
app.get('/api/admin/users', authenticateToken, requireAdmin,
    safe('Błąd podczas pobierania listy użytkowników:', 'Błąd serwera podczas pobierania listy użytkowników.', async (req, res) => {
        const [rows] = await currentPool.query('SELECT id, username, role, aktywny, created_at FROM uzytkownicy ORDER BY id ASC');
        return res.json(rows.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            aktywny: isUserActive(u),
            created_at: u.created_at
        })));
    }));

// 9. PATCH /api/admin/users/:id - Zmiana roli użytkownika (chroniony, tylko admin)
app.patch('/api/admin/users/:id', authenticateToken, requireAdmin,
    safe('Błąd podczas zmiany roli użytkownika:', 'Błąd serwera podczas zmiany roli użytkownika.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, USER_ID_ERR_INT);

        const { role } = req.body || {};
        if (!role || !ALLOWED_ROLES.includes(role)) {
            return fail(res, `Nieprawidłowa rola. Dozwolone: ${ALLOWED_ROLES.join(', ')}`);
        }

        if (Number(req.user.id) === id && role !== 'admin') {
            return fail(res, 'Nie możesz odebrać uprawnień administratora samemu sobie.', 400);
        }

        const [users] = await currentPool.query('SELECT id, username, role FROM uzytkownicy WHERE id = ?', [id]);
        if (!users || users.length === 0) return fail(res, `Nie znaleziono użytkownika o ID ${id}.`, 404);

        await currentPool.query('UPDATE uzytkownicy SET role = ? WHERE id = ?', [role, id]);

        return res.json({
            message: `Rola użytkownika ${users[0].username} została zmieniona na "${role}".`,
            id,
            role
        });
    }));

// 10. PATCH /api/admin/users/:id/haslo - Administrator ustawia nowe hasło dla konta (chroniony, tylko admin)
app.patch('/api/admin/users/:id/haslo', authenticateToken, requireAdmin,
    safe('Błąd podczas zmiany hasła użytkownika:', 'Błąd serwera podczas zmiany hasła użytkownika.', async (req, res) => {
        const id = parsePositiveInt(req.params.id);
        if (isNaN(id)) return fail(res, USER_ID_ERR_INT);

        const password = (req.body?.password ?? req.body?.haslo ?? '');
        if (typeof password !== 'string' || password.trim().length === 0) {
            return fail(res, 'Podaj nowe hasło dla użytkownika.');
        }

        const cleanPassword = password;
        if (cleanPassword.length < 8) return fail(res, 'Hasło musi mieć co najmniej 8 znaków.');
        if (Buffer.byteLength(cleanPassword) > 72) return fail(res, 'Hasło nie może przekraczać 72 znaków.');

        const [users] = await currentPool.query('SELECT id, username FROM uzytkownicy WHERE id = ?', [id]);
        if (!users || users.length === 0) return fail(res, `Nie znaleziono użytkownika o ID ${id}.`, 404);

        const hashedPassword = await bcrypt.hash(password, 10);
        await currentPool.query('UPDATE uzytkownicy SET password_hash = ? WHERE id = ?', [hashedPassword, id]);

        return res.json({
            message: `Hasło dla użytkownika ${users[0].username} zostało pomyślnie zmienione.`,
            id
        });
    }));

// 11. PATCH /api/admin/users/:id/status (oraz alias /aktywny) - Blokowanie / odblokowywanie użytkownika
const handleToggleUserStatus = safe('Błąd podczas zmiany statusu konta:', 'Błąd serwera podczas zmiany statusu konta użytkownika.', async (req, res) => {
    const id = parsePositiveInt(req.params.id);
    if (isNaN(id)) return fail(res, USER_ID_ERR_INT);

    if (req.body && Object.keys(req.body).length > 0 && typeof req.body.aktywny !== 'boolean') {
        return fail(res, 'Pole "aktywny" musi mieć wartość true lub false.', 400);
    }

    const [users] = await currentPool.query('SELECT id, username, role, aktywny FROM uzytkownicy WHERE id = ?', [id]);
    if (!users || users.length === 0) return fail(res, `Nie znaleziono użytkownika o ID ${id}.`, 404);

    const target = users[0];
    const currentActive = isUserActive(target);
    const nextActive = typeof req.body?.aktywny === 'boolean'
        ? req.body.aktywny
        : !currentActive;

    if (Number(req.user.id) === id && !nextActive) {
        return fail(res, 'Nie możesz zablokować własnego konta administratora.', 400);
    }

    await currentPool.query('UPDATE uzytkownicy SET aktywny = ? WHERE id = ?', [nextActive ? 1 : 0, id]);

    return res.json({
        message: nextActive
            ? `Konto użytkownika ${target.username} zostało odblokowane.`
            : `Konto użytkownika ${target.username} zostało zablokowane.`,
        id,
        aktywny: nextActive
    });
});

app.patch('/api/admin/users/:id/status', authenticateToken, requireAdmin, handleToggleUserStatus);
app.patch('/api/admin/users/:id/aktywny', authenticateToken, requireAdmin, handleToggleUserStatus);

// Rate limiting dla zmiany własnego hasła (5 prób / 15 minut po req.user.id)
const hasloLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    limit: 5, // 5 prób na zalogowanego użytkownika (req.user.id)
    keyGenerator: (req) => String(req.user.id),
    message: {
        error: 'Zbyt wiele prób zmiany hasła. Spróbuj ponownie za 15 minut.'
    },
    standardHeaders: true, // Zwraca nagłówki RateLimit-*
    legacyHeaders: false, // Wyłącza nagłówki X-RateLimit-*
    skip: () => process.env.NODE_ENV === 'test'
});

// 12. PATCH /api/profil/haslo - Każdy zalogowany użytkownik może zmienić własne hasło (wymaga podania starego hasła)
app.patch('/api/profil/haslo', authenticateToken, hasloLimiter,
    safe('Błąd podczas zmiany własnego hasła:', 'Błąd serwera podczas zmiany hasła.', async (req, res) => {
        const { currentPassword, newPassword } = req.body || {};
        const oldPass = (currentPassword ?? req.body?.stare_haslo ?? '');
        const newPass = (newPassword ?? req.body?.nowe_haslo ?? '');

        if (typeof oldPass !== 'string' || oldPass.trim().length === 0 ||
            typeof newPass !== 'string' || newPass.trim().length === 0) {
            return fail(res, 'Podaj aktualne oraz nowe hasło.');
        }

        const cleanNewPass = newPass;
        if (cleanNewPass.length < 8) return fail(res, 'Nowe hasło musi mieć co najmniej 8 znaków.');
        if (Buffer.byteLength(cleanNewPass) > 72) return fail(res, 'Nowe hasło nie może przekraczać 72 znaków.');

        const [rows] = await currentPool.query(
            'SELECT id, username, password_hash, aktywny FROM uzytkownicy WHERE id = ?',
            [req.user.id]
        );
        if (!rows || rows.length === 0) return fail(res, 'Nie znaleziono konta użytkownika.', 404);

        const user = rows[0];
        const isPasswordValid = typeof user.password_hash === 'string' &&
            /^\$2[aby]\$/.test(user.password_hash) &&
            await bcrypt.compare(oldPass, user.password_hash);

        if (!isPasswordValid) return fail(res, 'Aktualne hasło jest nieprawidłowe.', 400);

        const hashedPassword = await bcrypt.hash(newPass, 10);
        await currentPool.query('UPDATE uzytkownicy SET password_hash = ? WHERE id = ?', [hashedPassword, user.id]);

        return res.json({ message: 'Twoje hasło zostało pomyślnie zmienione.' });
    }));


// Obsługa błędów 404 dla nieistniejących tras API
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API nie został odnaleziony.' });
});

// Centralna obsługa błędów aplikacji (zawsze zwraca JSON { error } bez ujawniania stack trace'a i ścieżek serwera)
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    logError('Błąd w middleware aplikacji:', err);

    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({ error: 'Przesłany ładunek żądania (payload) przekracza dozwolony limit.' });
    }
    if (err && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Nieprawidłowy format JSON w ciele żądania.' });
    }
    if (err instanceof URIError || err?.status === 400) {
        return res.status(400).json({ error: 'Nieprawidłowe parametry zapytania URL.' });
    }

    const statusCode = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    return res.status(statusCode).json({ error: 'Wystąpił wewnętrzny błąd serwera.' });
});

app.czyMoznaZmienic = czyMoznaZmienic;
app.wyznaczDozwoloneAkcje = wyznaczDozwoloneAkcje;
app.PRZEJSCIA = PRZEJSCIA;
app.STATUS_ORDER = STATUS_ORDER;
app.STATUS_LABELS = STATUS_LABELS;
app.dodajWpisHistorii = dodajWpisHistorii;
app.loginLimiter = loginLimiter;
app.zgloszeniaLimiter = zgloszeniaLimiter;
app.hasloLimiter = hasloLimiter;
app.DUMMY_PASSWORD_HASH = DUMMY_PASSWORD_HASH;
app.validateJwtSecret = validateJwtSecret;
app.logError = logError;

module.exports = app;
