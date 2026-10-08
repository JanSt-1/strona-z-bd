# System Obsługi Zgłoszeń Serwisowych

To pełna aplikacja webowa (SPA) umożliwiająca klientom szybkie rejestrowanie usterek urządzeń poprzez formularz publiczny. Pracownicy serwisu, serwisanci, magazynierzy oraz administratorzy mają do dyspozycji chroniony tokenem JWT panel zarządzania, w którym monitorują zgłoszenia, modyfikują ich statusy, przypisują zadania, sporządzają raporty napraw oraz rejestrują wysyłki paczek z numerem listu przewozowego. Rozwiązanie łączy backend w technologii Express.js i MySQL z nowoczesnym, responsywnym frontendem napisanym w React 18.

---

## Architektura i Separation of Concerns

Aplikacja backendowa jest rozdzielona zgodnie z zasadą separacji odpowiedzialności:
- **`app.js`**: Wyodrębniona instancja aplikacji Express – konfiguracja middleware (CORS, JSON, pliki statyczne), autoryzacji JWT, kontroli dostępu RBAC, rate-limitera oraz tras API. Udostępnia metody `app.setPool()` i `app.getPool()` do zarządzania pulą bazy danych. **Nie wywołuje `app.listen()`**, co pozwala na łatwy import w testach integracyjnych.
- **`index.js`**: Główny punkt wejściowy serwera produkcyjnego. Odpowiada za wczytanie konfiguracji `.env`, weryfikację połączenia z bazą MySQL, automatyczną weryfikację/migrację brakujących kolumn tabeli `zgloszenia` oraz uruchomienie nasłuchiwania (`app.listen()`).
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

### Krok 3: Inicjalizacja bazy danych (Seed)
Uruchom skrypt tworzący bazę `serwis_db` oraz tabele na podstawie schematu `schemat.sql`:
```bash
npm run seed
```
*(Uwaga: Podczas startu serwera plik `index.js` automatycznie sprawdza strukturę tabeli i uzupełnia brakujące kolumny, w tym `numer_listu`, `data_wyslania`, `opis_naprawy` itp.).*

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
3. `GET /api/zgloszenia` z nieprawidłowym tokenem JWT -> **403 Forbidden**.
4. `POST /api/login` z błędnym hasłem -> **401 Unauthorized**.
5. `GET /api/pracownicy` bez tokenu -> **401 Unauthorized**.
6. `PATCH /api/zgloszenia/:id/przypisz` bez tokenu -> **401 Unauthorized**.
7. `PATCH /api/zgloszenia/:id/naprawione` bez tokenu -> **401 Unauthorized**.
8. `POST /api/zgloszenia` dla monitora interaktywnego bez numeru seryjnego -> **400 Bad Request**.

---

## Role użytkowników i obsługa zleceń

W systemie zaimplementowano role:
- **`admin`**: Pełny wgląd we wszystkie zlecenia, przypisywanie pracownikom i serwisantom, bezpośrednia modyfikacja statusów z listy, usuwanie zgłoszeń, tworzenie użytkowników przez API.
- **`serwisant`**: Przegląd wszystkich zleceń i przypisywanie ich pracownikom. Nie posiada uprawnień do zmiany statusu ani opisywania napraw (może wyłącznie koordynować i delegować zadania).
- **`pracownik`**: Domyślnie widzi wyłącznie zlecenia przypisane do siebie. Zlecenie po przypisaniu ma status **"nowe"** – pracownik musi sam kliknąć przycisk **„Rozpocznij realizację”** (zmiana statusu na **"w realizacji"**). Po ukończeniu naprawy klika **„Oznacz jako naprawione”** i sporządza wymagany opis prac (automatycznie datowany z godziną i minutą). Po zatwierdzeniu zlecenie trafia do magazynu ze statusem **"Do wysyłki"**.
- **`magazynier`**: Domyślnie nie widzi zleceń nowych ani w trakcie naprawy – widzi je dopiero po zakończeniu i opisaniu naprawy przez pracownika (ze statusem **"Do wysyłki"**). Ma możliwość wpisania numeru listu przewozowego (`numer_listu`) oraz oznaczenia przesyłki jako wysłana (**"zakończone"**), co automatycznie odnotowuje datę i godzinę wysyłki (`data_wyslania`).

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