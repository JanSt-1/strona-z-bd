# System Obsługi Zgłoszeń Serwisowych

To pełna aplikacja webowa (SPA) umożliwiająca klientom szybkie rejestrowanie usterek urządzeń poprzez formularz publiczny. Pracownicy serwisu, serwisanci, magazynierzy oraz administratorzy mają do dyspozycji chroniony tokenem JWT panel zarządzania, w którym monitorują zgłoszenia, modyfikują ich statusy, przypisują zadania, sporządzają raporty napraw oraz rejestrują wysyłki paczek z numerem listu przewozowego. Rozwiązanie łączy backend w technologii Express.js i MySQL z nowoczesnym, responsywnym frontendem napisanym w React 18.

---

## Architektura i Separation of Concerns

Aplikacja backendowa jest rozdzielona zgodnie z zasadą separacji odpowiedzialności:
- **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` do zarządzania pulą bazy danych. **Nie wywołuje `app.listen()`**, co pozwala na łatwy import w testach integracyjnych.
- **`index.js`**: Główny punkt wejściowy serwera produkcyjnego. Odpowiada za wczytanie konfiguracji `.env`, weryfikację obecności `JWT_SECRET`, test połączenia z bazą MySQL oraz uruchomienie nasłuchiwania HTTP (`app.listen()`).
- **`app.test.js`**: Zestaw testów integracyjnych API bazujący na natywnym runnerze `node:test` oraz bibliotece `supertest`.

---

## Wymagania wstępne

Przed uruchomieniem projektu upewnij się, że masz zainstalowane:
- **Node.js** (wersja 18 lub nowsza, zalecana 20+ z obsługą `node:test`) oraz menedżer pakietów **npm**
- **MySQL** lub **MariaDB** (np. zainstalowany lokalnie serwer MySQL, pakiet XAMPP, Laragon lub kontener Docker)

---

## Uruchomienie krok po kroku

### Krok 1: Instalacja zależności
W głównym katalogu projektu zainstaluj niezbędne biblioteki:
```bash
npm install
```

### Krok 2: Konfiguracja zmiennych środowiskowych (`.env`)
Utwórz plik `.env` w katalogu głównym (lub skopiuj z przygotowanego szablonu `.env.example`):
```bash
cp .env.example .env
```
Wypełnij plik danymi dostępowymi do lokalnej bazy MySQL oraz własnym kluczem JWT:
```ini
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=serwis_db
DB_PORT=3306
JWT_SECRET=twoj_klucz_jtw
```
`JWT_SECRET` jest wymagany (brak domyślnej wartości – serwer się nie uruchomi). Wygeneruj silny klucz:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Krok 3: Inicjalizacja bazy danych (Seed)
Uruchom skrypt tworzący bazę `serwis_db` oraz tabele na podstawie schematu `schemat.sql`:
```bash
npm run seed
```
*(Skrypt ten aplikuje pełną strukturę tabel `uzytkownicy` i `zgloszenia` z pliku `schemat.sql`, w tym pola `numer_listu`, `data_wyslania`, `opis_naprawy` itp.).*

### Krok 4: Utworzenie pierwszych kont użytkowników
Skorzystaj z wbudowanego narzędzia CLI `create-user.js`:
```bash
# Konto administratora
node create-user.js nazwa_admina HasloAdmina admin

# Konto serwisanta
node create-user.js nazwa_serwisanta HasloSerwisanta serwisant

# Konto pracownika
node create-user.js nazwa_pracownika HasloPracownika pracownik

# Konto magazyniera
node create-user.js nazwa_magazyniera HasloMagazyniera magazynier
```

### Krok 5: Uruchomienie serwera
Uruchom aplikację w trybie produkcyjnym:
```bash
npm start
```
Lub w trybie deweloperskim z automatycznym restartem po zmianach w kodzie:
```bash
npm run dev
```

Po uruchomieniu aplikacja dostępna jest pod adresem:
👉 **http://localhost:3000**

---

## Testy integracyjne

Projekt posiada zestaw testów integracyjnych weryfikujących poprawność działania kluczowych endpointów API (walidacja, autoryzacja, mechanizm logowania, uprawnienia tras).

Uruchomienie testów:
```bash
npm test
```
*Skrypt wykonuje polecenie `node --test` z użyciem `supertest`. Dzięki wbudowanemu mockowaniu puli bazy danych w `app.test.js`, testy wykonują się błyskawicznie i nie wymagają aktywnego serwera MySQL.*

Pokryte przypadki testowe:
1. `POST /api/zgloszenia` bez wymaganych pól w body -> **400 Bad Request**.
2. `GET /api/zgloszenia` bez nagłówka Authorization -> **401 Unauthorized**.
3. `GET /api/zgloszenia` z nieprawidłowym tokenem JWT -> **401 Unauthorized** (403 oznacza wyłącznie brak uprawnień roli).
4. `POST /api/login` z błędnym hasłem -> **401 Unauthorized**.
5. `GET /api/pracownicy` bez tokenu -> **401 Unauthorized**.
6. `PATCH /api/zgloszenia/:id/przypisz` bez tokenu -> **401 Unauthorized**.
7. `PATCH /api/zgloszenia/:id/naprawione` bez tokenu -> **401 Unauthorized**.
8. `POST /api/zgloszenia` dla monitora interaktywnego bez numeru seryjnego -> **400 Bad Request**.
9. `POST /api/login` z poprawnymi danymi zwraca token JWT i pozwala na autoryzowany dostęp -> **200 OK**.
10. `PATCH /api/zgloszenia/1/status` próba cofnięcia statusu przez pracownika -> **403 Forbidden**.
11. Walidacja `data_zakupu` (nieistniejąca data `2026-02-31`, data z przyszłości) -> **400**.
12. Limity długości: `numer_listu` (max 100) oraz `username` w `POST /api/admin/users` (max 50) -> **400**.
13. Pełna macierz reguł ról i przejść statusów (409 dla niedozwolonych skoków, 403 dla braku uprawnień, cofanie tylko admin, pracownik tylko własne zlecenia) – łącznie 45 testów.

---

## Role użytkowników i przejścia statusów

W systemie zaimplementowano role oraz ścisłą mapę przejść statusów (`PRZEJSCIA`):
- **`admin`**: Pełny wgląd we wszystkie zlecenia, przypisywanie zadań, zmiana statusów, wyłączne uprawnienie do cofania statusów wstecz, usuwanie zgłoszeń, tworzenie użytkowników przez API.
- **`serwisant`**: Przegląd wszystkich zleceń i przypisywanie ich pracownikom (przypisanie zlecenia o statusie "nowe" automatycznie zmienia status na "w realizacji"). Może również oznaczyć zlecenie jako naprawione ("w realizacji" -> "do wysyłki") z opisem naprawy.
- **`pracownik`**: Domyślnie widzi wyłącznie zlecenia przypisane do siebie. Może oznaczyć zlecenie jako naprawione ("w realizacji" -> "do wysyłki") ze sporządzeniem wymaganego opisu prac.
- **`magazynier`**: Widzi zlecenia gotowe do wysyłki ("do wysyłki") oraz zakończone. Może oznaczyć zlecenie jako wysłane ("do wysyłki" -> "zakończone") podając numer listu przewozowego (`numer_listu`).

---

## Jak założyć konto użytkownika

W projekcie dostępny jest skrypt `create-user.js`, który bezpiecznie haszuje hasło za pomocą **bcrypt** i zapisuje konto w tabeli `uzytkownicy`.

### Składnia:
```bash
node create-user.js <nazwa_uzytkownika> <haslo> [rola]
```
- Dostępne role: `admin`, `serwisant`, `pracownik`, `magazynier` (domyślnie: `pracownik`).
- Przykłady:
  ```bash
  node create-user.js admin HasloAdmina123 admin
  node create-user.js tomasz HasloSerwisanta123 serwisant
  node create-user.js marek HasloPracownika123 pracownik
  node create-user.js janusz HasloMagazyniera123 magazynier
  ```
  
Po utworzeniu konta przejdź w przeglądarce do zakładki **„Panel pracownika”** i zaloguj się podaną nazwą użytkownika oraz hasłem.