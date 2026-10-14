/**
 * seed-zgloszenia.js
 * Skrypt generujący i wstawiający do bazy danych 200 realistycznych zgłoszeń serwisowych
 * wraz z powiązaną historią zdarzeń (historia_zgloszen).
 *
 * Użycie:
 *   node seed-zgloszenia.js
 *   node seed-zgloszenia.js 200
 *   node seed-zgloszenia.js --clean (czyści poprzednie zgłoszenia przed wstawieniem)
 */

require('dotenv').config();
const { createConnection, dbConfig } = require('./db');

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

const REPAIR_DESCRIPTIONS = [
    'Wymieniono uszkodzoną płytę główną oraz moduł zasilacza. Zaktualizowano oprogramowanie układowe do najnowszej wersji. Testy dotyku i portów HDMI zakończone sukcesem.',
    'Wymieniono taśmę sygnałową LVDS łączącą matrycę z płytą główną. Przetestowano równomierność podświetlenia i czas reakcji dotyku.',
    'Wykonano reflow kontrolera dotyku oraz ponowną kalibrację matrycy IR. Monitor przeszedł 24-godzinny test obciążeniowy bez zakłóceń.',
    'Wymieniono uszkodzone gniazdo HDMI 1 oraz gniazdo USB-C. Przeprowadzono testy przesyłu obrazu w rozdzielczości 4K przy 60Hz.',
    'Wgrano czysty obraz systemu Android oraz zaktualizowano oprogramowanie modułu OPS. Sprawdzono działanie modułów Wi-Fi i Bluetooth.',
    'Wymieniono głośniki wewnętrzne na nowe oryginalne podzespoły. Sprawdzono tor audio na generatorze częstotliwości.',
    'Wymieniono zespół wentylatorów chłodzących oraz wyczyszczono układ odprowadzania ciepła z kurzu. Wymieniono pastę termoprzewodzącą.',
    'Wymieniono odbiornik podczerwieni pilota oraz sparowano nowy dedykowany pilot serwisowy.'
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
    const isMonitor = lower.includes('monitor interaktywny') && !lower.includes('akcesoria');
    const isTablica = lower.includes('tablica interaktywna') && !lower.includes('akcesoria');
    return isMonitor || isTablica;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(num, size = 2) {
    let s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d}`;
}

function formatDateTime(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

async function run() {
    const args = process.argv.slice(2);
    const shouldClean = args.includes('--clean');
    const countArg = args.find(a => !isNaN(parseInt(a, 10)));
    const targetCount = countArg ? parseInt(countArg, 10) : 200;

    console.log(`=== Rozpoczynanie generowania ${targetCount} zgłoszeń serwisowych ===`);

    let conn;
    try {
        conn = await createConnection();

        // 1. Opcjonalne czyszczenie
        if (shouldClean) {
            console.log('🧹 Czyszczenie dotychczasowych zgłoszeń i historii...');
            await conn.query('DELETE FROM historia_zgloszen');
            await conn.query('DELETE FROM zgloszenia');
            await conn.query('ALTER TABLE zgloszenia AUTO_INCREMENT = 1');
            await conn.query('ALTER TABLE historia_zgloszen AUTO_INCREMENT = 1');
            console.log('✅ Tabele zostały wyczyszczone.');
        }

        // 2. Pobranie aktywnych pracowników z bazy do przypisań
        const [users] = await conn.query(
            "SELECT id, username, role FROM uzytkownicy WHERE aktywny = TRUE AND role IN ('pracownik', 'serwisant', 'admin')"
        );
        console.log(`ℹ️ Znaleziono ${users.length} aktywnych użytkowników do ewentualnego przypisania.`);

        // 3. Statusy do rozłożenia proporcjonalnie
        // ~30% nowe, ~25% w_realizacji, ~20% do_wysylki, ~25% zakończone
        const statusDistribution = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];

        const baseDate = new Date(); // Dziś (np. październik 2026)

        let insertedCount = 0;

        for (let i = 1; i <= targetCount; i++) {
            const imie = randomChoice(FIRST_NAMES);
            const nazwisko = randomChoice(LAST_NAMES);
            const firma = randomChoice(COMPANIES);
            const cityObj = randomChoice(CITIES_WITH_POSTAL);
            const miasto = cityObj.city;
            const kod_pocztowy = cityObj.postal;
            const adres = `ul. ${randomChoice(STREETS)} ${randomInt(1, 140)}${Math.random() > 0.7 ? '/' + randomInt(1, 30) : ''}`;
            const numer_telefonu = `+48${randomChoice(['50', '51', '60', '69', '78', '88'])}${randomInt(1000000, 9999999)}`;
            
            // Bezpieczny e-mail bez polskich znaków
            const normalizedImie = imie.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const normalizedNazwisko = nazwisko.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const email = `${normalizedImie}.${normalizedNazwisko}${randomInt(10, 999)}@${randomChoice(['gmail.com', 'wp.pl', 'onet.pl', 'szkola.edu.pl', 'firma.pl'])}`;
            
            const opis_usterki = randomChoice(FAULT_DESCRIPTIONS);
            const numer_fv = `FV/${randomInt(2023, 2026)}/${pad(randomInt(1, 12))}/${pad(randomInt(1, 999), 4)}`;
            
            // 10 cyfrowy NIP
            const nip = `${randomInt(100, 999)}${randomInt(100, 999)}${randomInt(10, 99)}${randomInt(10, 99)}`;

            const przedmiot = randomChoice(ALLOWED_PRZEDMIOTY);
            const numer_seryjny = isSerialNumberAllowed(przedmiot)
                ? `MB-${randomInt(2022, 2026)}-${pad(randomInt(1, 99999), 5)}`
                : null;

            // Data zakupu: od 2022 roku do maksymalnie 30 dni wstecz
            const purchaseDaysAgo = randomInt(30, 1200);
            const purchaseDateObj = new Date(baseDate.getTime() - purchaseDaysAgo * 24 * 60 * 60 * 1000);
            const data_zakupu = formatDate(purchaseDateObj);

            // Data utworzenia zgłoszenia: od 1 do 90 dni wstecz
            const createdDaysAgo = randomInt(1, 90);
            const createdDateObj = new Date(baseDate.getTime() - createdDaysAgo * 24 * 60 * 60 * 1000);
            createdDateObj.setHours(randomInt(8, 17), randomInt(0, 59), randomInt(0, 59));
            const created_at = formatDateTime(createdDateObj);

            // Dobór statusu
            let status;
            const randPercent = Math.random();
            if (randPercent < 0.30) {
                status = 'nowe';
            } else if (randPercent < 0.55) {
                status = 'w_realizacji';
            } else if (randPercent < 0.75) {
                status = 'do_wysylki';
            } else {
                status = 'zakończone';
            }

            let przypisany_pracownik_id = null;
            let opis_naprawy = null;
            let opis_naprawy_data = null;
            let data_wyslania = null;
            let numer_listu = null;

            const assignedUser = users.length > 0 ? randomChoice(users) : null;

            if (status !== 'nowe') {
                przypisany_pracownik_id = assignedUser ? assignedUser.id : null;
            }

            if (status === 'do_wysylki' || status === 'zakończone') {
                opis_naprawy = randomChoice(REPAIR_DESCRIPTIONS);
                const repairDateObj = new Date(createdDateObj.getTime() + randomInt(1, 4) * 24 * 60 * 60 * 1000);
                repairDateObj.setHours(randomInt(9, 16), randomInt(0, 59), randomInt(0, 59));
                opis_naprawy_data = formatDateTime(repairDateObj);
            }

            if (status === 'zakończone') {
                const repairTime = new Date(opis_naprawy_data).getTime();
                const shipDateObj = new Date(repairTime + randomInt(1, 3) * 24 * 60 * 60 * 1000);
                shipDateObj.setHours(randomInt(10, 16), randomInt(0, 59), randomInt(0, 59));
                data_wyslania = formatDateTime(shipDateObj);

                const courier = randomChoice(['DPD', 'DHL', 'INPOST', 'FEDEX', 'UPS']);
                numer_listu = `${courier}-${randomInt(1000000000, 9999999999)}`;
            }

            // Wstawienie zgłoszenia
            const [resZgloszenie] = await conn.query(
                `INSERT INTO zgloszenia (
                    imie, nazwisko, nazwa_firmy, adres, kod_pocztowy, miasto,
                    numer_telefonu, email, opis_usterki, numer_fv, nip,
                    przedmiot_zgloszenia, numer_seryjny, data_zakupu, zgoda_rodo_data,
                    przypisany_pracownik_id, opis_naprawy, opis_naprawy_data,
                    data_wyslania, numer_listu, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    imie, nazwisko, firma, adres, kod_pocztowy, miasto,
                    numer_telefonu, email, opis_usterki, numer_fv, nip,
                    przedmiot, numer_seryjny, data_zakupu, created_at,
                    przypisany_pracownik_id, opis_naprawy, opis_naprawy_data,
                    data_wyslania, numer_listu, status, created_at
                ]
            );

            const zgloszenieId = resZgloszenie.insertId;

            // Wstawienie wpisów do historia_zgloszen
            // 1. Utworzenie
            await conn.query(
                `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [zgloszenieId, null, 'utworzenie', null, 'nowe', 'Utworzono zgłoszenie serwisowe.', created_at]
            );

            // 2. Przypisanie (jeśli status wyszedł poza 'nowe')
            if (status !== 'nowe' && przypisany_pracownik_id) {
                const assignDate = new Date(createdDateObj.getTime() + 2 * 60 * 60 * 1000); // 2h po utworzeniu
                await conn.query(
                    `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        zgloszenieId,
                        przypisany_pracownik_id,
                        'przypisanie',
                        'nowe',
                        'w_realizacji',
                        `Przypisano pracownika (ID: ${przypisany_pracownik_id}).`,
                        formatDateTime(assignDate)
                    ]
                );
            }

            // 3. Naprawa (jeśli do_wysylki lub zakończone)
            if ((status === 'do_wysylki' || status === 'zakończone') && opis_naprawy) {
                await conn.query(
                    `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        zgloszenieId,
                        przypisany_pracownik_id,
                        'naprawa',
                        'w_realizacji',
                        'do_wysylki',
                        `Wykonano naprawę. Opis: ${opis_naprawy}`,
                        opis_naprawy_data
                    ]
                );
            }

            // 4. Wysyłka (jeśli zakończone)
            if (status === 'zakończone') {
                await conn.query(
                    `INSERT INTO historia_zgloszen (zgloszenie_id, uzytkownik_id, akcja, z_statusu, na_status, szczegoly, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        zgloszenieId,
                        przypisany_pracownik_id,
                        'wysyłka',
                        'do_wysylki',
                        'zakończone',
                        `Wysłano urządzenie do klienta. Nr listu przewozowego: ${numer_listu}`,
                        data_wyslania
                    ]
                );
            }

            insertedCount++;
            if (insertedCount % 50 === 0 || insertedCount === targetCount) {
                console.log(`➡️  Wstawiono ${insertedCount}/${targetCount} zgłoszeń...`);
            }
        }

        const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM zgloszenia');
        const [[{ historyTotal }]] = await conn.query('SELECT COUNT(*) AS historyTotal FROM historia_zgloszen');

        console.log('');
        console.log(`✅ Zakończono pomyślnie!`);
        console.log(`   Łączna liczba zgłoszeń w bazie:       ${total}`);
        console.log(`   Łączna liczba wpisów historii w bazie: ${historyTotal}`);
        console.log('');
    } catch (err) {
        console.error('❌ Błąd podczas generowania zgłoszeń:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

run();
