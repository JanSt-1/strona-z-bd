/**
 * config-testowy.js
 * Skrypt konfiguracyjno-testowy:
 * 1. Tworzy (lub aktualizuje) 4 konta testowe z hasłem "admin123":
 *    - admin (rola: admin)
 *    - pracownik (rola: pracownik)
 *    - serwisant (rola: serwisant)
 *    - magazynier (rola: magazynier)
 * 2. Generuje zgłoszenia serwisowe wyłącznie ze statusem "nowe" wraz z wpisem utworzenia w historia_zgloszen.
 *
 * Użycie:
 *   node config-testowy.js
 *   node config-testowy.js 200
 *   node config-testowy.js --clean
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { createConnection } = require('./db');

const TEST_USERS = [
    { username: 'admin', role: 'admin', password: 'admin123' },
    { username: 'pracownik', role: 'pracownik', password: 'admin123' },
    { username: 'serwisant', role: 'serwisant', password: 'admin123' },
    { username: 'magazynier', role: 'magazynier', password: 'admin123' }
];

const FIRST_NAMES = [
    'Jan', 'Anna', 'Piotr', 'Maria', 'Krzysztof', 'Katarzyna', 'Tomasz', 'Agnieszka',
    'Paweł', 'Magdalena', 'Michał', 'Joanna', 'Marcin', 'Ewa', 'Jakub', 'Barbara',
    'Mateusz', 'Aleksandra', 'Łukasz', 'Monika', 'Wojciech', 'Natalia', 'Adam', 'Karolina',
    'Grzegorz', 'Zofia', 'Rafał', 'Paulina', 'Maciej', 'Patrycja', 'Bartosz', 'Marta',
    'Kamil', 'Justyna', 'Dawid', 'Sylwia', 'Filip', 'Dorota', 'Szymon', 'Dominika'
];

const LAST_NAMES = [
    'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski',
    'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur',
    'Wojciechowski', 'Kwiatkowski', 'Krawczyk', 'Kaczmarek', 'Piotrowski', 'Grabowski',
    'Pawłowski', 'Michalski', 'Nowicki', 'Adamczyk', 'Dudek', 'Zając', 'Wieczorek',
    'Jabłoński', 'Król', 'Majewski', 'Olszewski', 'Jaworski', 'Malinowski', 'Stępień'
];

const COMPANIES = [
    'Szkoła Podstawowa nr 15', 'Liceum Ogólnokształcące im. KEN', 'EduTech Polska Sp. z o.o.',
    'Akademia Przyszłości', 'Centrum Kształcenia Zawodowego', 'Zespół Szkół Ogólnokształcących nr 3',
    'Politechnika Innowacji', 'Przedszkole Miejskie Bajka', 'Nowoczesna Szkoła SA',
    'Centrum Konferencyjno-Szkoleniowe', 'Instytut Badań Edukacyjnych', 'Soft-Solutions Sp. k.',
    'Urząd Gminy i Miasta', 'Biblioteka Pedagogiczna', 'Fundacja Rozwoju Dzieci', null
];

const CITIES_WITH_POSTAL = [
    { city: 'Warszawa', postal: '00-001' },
    { city: 'Warszawa', postal: '02-495' },
    { city: 'Kraków', postal: '30-001' },
    { city: 'Kraków', postal: '31-150' },
    { city: 'Wrocław', postal: '50-001' },
    { city: 'Wrocław', postal: '53-200' },
    { city: 'Poznań', postal: '60-001' },
    { city: 'Poznań', postal: '61-800' },
    { city: 'Gdańsk', postal: '80-001' },
    { city: 'Gdańsk', postal: '80-288' },
    { city: 'Łódź', postal: '90-001' },
    { city: 'Łódź', postal: '91-340' },
    { city: 'Katowice', postal: '40-001' },
    { city: 'Katowice', postal: '40-120' },
    { city: 'Lublin', postal: '20-001' },
    { city: 'Szczecin', postal: '70-001' },
    { city: 'Białystok', postal: '15-001' },
    { city: 'Rzeszów', postal: '35-001' },
    { city: 'Bydgoszcz', postal: '85-001' },
    { city: 'Toruń', postal: '87-100' },
    { city: 'Kielce', postal: '25-001' },
    { city: 'Olsztyn', postal: '10-001' }
];

const STREETS = [
    'Szkolna', 'Mickiewicza', 'Słowackiego', 'Piłsudskiego', 'Długa', 'Kwiatowa',
    'Polna', 'Leśna', 'Fabryczna', 'Lipowa', 'Ogrodowa', 'Kościuszki', 'Główna',
    'Krótka', 'Sportowa', 'Słoneczna', 'Brzozowa', 'Sosnowa', 'Parkowa', 'Kolejowa'
];

const FAULT_DESCRIPTIONS = [
    'Brak reakcji na dotyk w prawej części ekranu. Lewa strona działa poprawnie.',
    'Monitor nie włącza się po podłączeniu do zasilania, dioda czuwania mruga na czerwono.',
    'Pionowe kolorowe pasy na matrycy po kilku minutach od uruchomienia urządzenia.',
    'Uszkodzony port HDMI 1 – brak sygnału z komputera, port HDMI 2 działa poprawnie.',
    'Tablica interaktywna gubi kalibrację punktów dotyku po restarcie systemu.',
    'Wbudowane głośniki trzeszczą i generują zniekształcenia przy głośności powyżej 30%.',
    'System Android zawiesza się na ekranie powitalnym z logo producenta i restartuje w pętli.',
    'Brak łączności z siecią Wi-Fi oraz Bluetooth, moduł OPS nie uruchamia się.',
    'Rysik interaktywny nie jest wykrywany na powierzchni ekranu, drugi rysik działa bez problemu.',
    'Zniekształcony obraz, migotanie podświetlenia LED przy jasności ustawionej powyżej 60%.',
    'Projektor zgłasza błąd przegrzania (Overheat) i wyłącza lampę po około 10 minutach pracy.',
    'Brak reakcji na pilota zdalnego sterowania pomimo wymiany baterii na fabrycznie nowe.',
    'Port USB-C nie przesyła sygnału wideo ani nie ładuje podłączonego laptopa.',
    'Podłoga interaktywna nie rejestruje ruchów użytkowników, kamera kalibracyjna gubi ostrość.',
    'Matryca ma plamę martwych pikseli w centralnym obszarze roboczym ekranu.'
];

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
    'Inne'
];

function isSerialNumberAllowed(product) {
    const lower = product.toLowerCase();
    return (lower.includes('monitor interaktywny') || lower.includes('tablica interaktywna')) && !lower.includes('akcesoria');
}

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pad = (num, size = 2) => String(num).padStart(size, '0');
const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatDateTime = (d) => `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

async function run() {
    const args = process.argv.slice(2);
    const shouldClean = args.includes('--clean');
    const countArg = args.find(a => !isNaN(parseInt(a, 10)));
    const targetCount = countArg ? parseInt(countArg, 10) : 200;

    console.log('=== Konfiguracja środowiska testowego ===');

    let conn;
    try {
        conn = await createConnection();

        if (shouldClean) {
            console.log('🧹 Czyszczenie dotychczasowych zgłoszeń i historii...');
            await conn.query('DELETE FROM historia_zgloszen');
            await conn.query('DELETE FROM zgloszenia');
            await conn.query('ALTER TABLE zgloszenia AUTO_INCREMENT = 1');
            await conn.query('ALTER TABLE historia_zgloszen AUTO_INCREMENT = 1');
            console.log('✅ Tabele zgłoszeń i historii zostały wyczyszczone.');
        }

        // 1. Tworzenie / aktualizacja kont testowych
        console.log('👤 Tworzenie kont testowych (hasło: admin123)...');
        for (const u of TEST_USERS) {
            const passwordHash = await bcrypt.hash(u.password, 10);
            await conn.query(
                `INSERT INTO uzytkownicy (username, password_hash, role, aktywny)
                 VALUES (?, ?, ?, TRUE)
                 ON DUPLICATE KEY UPDATE
                     password_hash = VALUES(password_hash),
                     role = VALUES(role),
                     aktywny = TRUE`,
                [u.username, passwordHash, u.role]
            );
            console.log(`   ✔ Konto "${u.username}" (rola: ${u.role})`);
        }

        // 2. Generowanie zgłoszeń wyłącznie ze statusem "nowe"
        console.log(`📝 Generowanie ${targetCount} zgłoszeń ze statusem "nowe"...`);
        const baseDate = new Date();

        for (let i = 1; i <= targetCount; i++) {
            const imie = randomChoice(FIRST_NAMES);
            const nazwisko = randomChoice(LAST_NAMES);
            const firma = randomChoice(COMPANIES);
            const { city: miasto, postal: kod_pocztowy } = randomChoice(CITIES_WITH_POSTAL);
            const adres = `ul. ${randomChoice(STREETS)} ${randomInt(1, 140)}${Math.random() > 0.7 ? '/' + randomInt(1, 30) : ''}`;
            const numer_telefonu = `+48${randomChoice(['50', '51', '60', '69', '78', '88'])}${randomInt(1000000, 9999999)}`;

            const normImie = imie.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const normNazwisko = nazwisko.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const email = `${normImie}.${normNazwisko}${randomInt(10, 999)}@${randomChoice(['gmail.com', 'wp.pl', 'onet.pl', 'szkola.edu.pl', 'firma.pl'])}`;

            const opis_usterki = randomChoice(FAULT_DESCRIPTIONS);
            const numer_fv = `FV/${randomInt(2023, 2026)}/${pad(randomInt(1, 12))}/${pad(randomInt(1, 999), 4)}`;
            const nip = `${randomInt(100, 999)}${randomInt(100, 999)}${randomInt(10, 99)}${randomInt(10, 99)}`;
            const przedmiot = randomChoice(ALLOWED_PRZEDMIOTY);
            const numer_seryjny = isSerialNumberAllowed(przedmiot)
                ? `MB-${randomInt(2022, 2026)}-${pad(randomInt(1, 99999), 5)}`
                : null;

            const purchaseDateObj = new Date(baseDate.getTime() - randomInt(30, 1200) * 24 * 60 * 60 * 1000);
            const data_zakupu = formatDate(purchaseDateObj);

            const createdDateObj = new Date(baseDate.getTime() - randomInt(1, 90) * 24 * 60 * 60 * 1000);
            createdDateObj.setHours(randomInt(8, 17), randomInt(0, 59), randomInt(0, 59));
            const created_at = formatDateTime(createdDateObj);

            const [resZgloszenie] = await conn.query(
                `INSERT INTO zgloszenia (
                    imie, nazwisko, nazwa_firmy, adres, kod_pocztowy, miasto,
                    numer_telefonu, email, opis_usterki, numer_fv, nip,
                    przedmiot_zgloszenia, numer_seryjny, data_zakupu, zgoda_rodo_data,
                    status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nowe', ?)`,
                [
                    imie, nazwisko, firma, adres, kod_pocztowy, miasto,
                    numer_telefonu, email, opis_usterki, numer_fv, nip,
                    przedmiot, numer_seryjny, data_zakupu, created_at,
                    created_at
                ]
            );

            await conn.query(
                `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly, created_at)
                 VALUES (?, NULL, 'utworzenie', NULL, 'nowe', 'Utworzono zgłoszenie serwisowe.', ?)`,
                [resZgloszenie.insertId, created_at]
            );

            if (i % 50 === 0 || i === targetCount) {
                console.log(`➡️  Wstawiono ${i}/${targetCount} zgłoszeń...`);
            }
        }

        const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM zgloszenia');
        const [[{ historyTotal }]] = await conn.query('SELECT COUNT(*) AS historyTotal FROM historia_zgloszen');

        console.log('\n✅ Zakończono pomyślnie!');
        console.log(`   Łączna liczba zgłoszeń w bazie:       ${total}`);
        console.log(`   Łączna liczba wpisów historii w bazie: ${historyTotal}\n`);
    } catch (err) {
        console.error('❌ Błąd podczas wykonywania config-testowy:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

run();
