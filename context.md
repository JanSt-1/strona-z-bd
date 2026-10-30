# Project Context: Service Ticket Management System

Full-stack service ticket management system (SPA + REST API) built with **Express.js (v5)**, **MySQL (`mysql2/promise`)**, and **React 19** (`frontend/` with **Vite** and **Tailwind CSS v4**, compiled to `frontend/dist/`).

---

## 1. Architecture & File Structure

```
strona_z_bd/
├── .env / .env.example      # Env vars: NODE_ENV, PORT, HOST, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET (.env in .gitignore)
├── .github/workflows/ci.yml # GitHub Actions CI: lint + build + unit tests + MariaDB integration tests (npm run test:db)
├── app.js                   # Express app: middleware, RBAC, validation, JWT, transactions/CAS, routes, DB pool, static serving of frontend/dist/
├── db.js                    # Centralized MySQL config (DB_PORT, createPool, createConnection)
├── migrate.js               # Lightweight SQL migration runner (`npm run migrate`) & pending migration check
├── migrations/              # SQL migrations (001_init.sql, 002_aktualizacja_kolumn_i_indeksow.sql, 003_historia_szczegoly_mediumtext.sql, 004_uzytkownicy_token_version.sql)
├── jwt-validation.js        # validateJwtSecret + INSECURE_JWT_SECRETS (used by index.js, re-exported as app.validateJwtSecret)
├── index.js                 # Server entrypoint: .env & JWT_SECRET validation, DB connection & pending migrations check, app.listen(PORT, HOST)
├── app.test.js              # Unit & integration tests (node:test + supertest, mocked DB via app.setPool())
├── integration.test.js      # Real MySQL/MariaDB integration & concurrency tests (`npm run test:db` on serwis_db_test)
├── schemat.sql              # Current full MySQL schema (tables: uzytkownicy, zgloszenia, historia_zgloszen)
├── seed.js                  # DB initialization & migration runner (`npm run seed`)
├── config-testowy.js        # Local test setup (committed, never run in production): seeds 4 accounts (pass: admin123) + 'nowe' tickets (`npm run config:testowy`)
├── create-user.js           # CLI user creator with bcrypt hashing (`node create-user.js <user> <pass> [role]`)
├── frontend/                # React 19 + Vite + Tailwind CSS v4 SPA
│   ├── src/                 # App.jsx (with ErrorBoundary), main.jsx, components/, pages/, api.js, constants.js, index.css
│   ├── .oxlintrc.json       # oxlint config: plugins react, oxc, jsx-a11y (`npm run lint` = `oxlint --deny-warnings`)
│   ├── public/              # Static assets (logo_mentor4.svg, favicon.svg)
│   ├── dist/                # Production build served by Express (`npm run build`)
│   └── vite.config.js       # Vite config: /api proxy to backend, outDir: dist, emptyOutDir: true
└── context.md               # Architectural, security, and business rules for developers and AI agents
```

- **Separation of Concerns:** `app.js` exports the Express instance and exposes `app.setPool(pool)` / `app.getPool()`, `app.validateJwtSecret`, `app.czyMoznaZmienic`, `app.wyznaczDozwoloneAkcje`, and `app.logError`. `index.js` validates `JWT_SECRET`, tests the DB connection, verifies all SQL migrations are applied (`checkPendingMigrations()`), and starts the HTTP server (`app.listen(PORT, HOST)` with default `HOST = '127.0.0.1'`).
- **HTTP Security & Payload Limits:** `helmet` sets security headers (`nosniff`, `SAMEORIGIN`, `Strict-Transport-Security`, `X-Download-Options: noopen`, `X-Permitted-Cross-Domain-Policies: none`). `express.json({ limit: '70kb' })` fits the max text payload and rejects larger payloads with `413 Payload Too Large`.
- **Database (`db.js`) & Migrations (`migrate.js`):** `db.js` exports `dbConfig`, `createPool()`, and `createConnection()`. `migrate.js` tracks applied files in `schema_migrations`. All queries use parameterized `?` placeholders.
- **GDPR-Safe Error Logging (`logError`):** Never log full MySQL error objects directly, as `err.sql` and `err.sqlMessage` may contain personal data (PII). Always use `logError(contextMessage, err)`, which logs only `err.code` and `err.message`.

---

## 2. MySQL Database Schema (`schemat.sql` & `migrations/`, DB: `serwis_db`)

### Table `uzytkownicy`
- Columns: `id` (INT PK AI), `username` (VARCHAR(50) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `role` (VARCHAR(20) DEFAULT `'pracownik'`), `aktywny` (BOOLEAN NOT NULL DEFAULT TRUE), `token_version` (INT NOT NULL DEFAULT 0, migration 004), `created_at` (TIMESTAMP).
- **Allowed roles (`ALLOWED_ROLES`):** `admin`, `serwisant`, `pracownik`, `magazynier`.
- **Account blocking:** Users with `aktywny = FALSE` cannot log in (`403 Forbidden`) and are rejected in `authenticateToken` (`401 Unauthorized`). Admins toggle `aktywny` instead of deleting accounts linked to ticket history. Admins cannot block or demote themselves (`400`).
- **Session revocation (`token_version`):** The JWT carries `tv` = `token_version` at login (`signToken`). `authenticateToken` returns `401` (`SESSION_REVOKED_ERR`) when it differs from the DB value; tokens without `tv` (issued before migration 004) count as version `0`. `revokeUserTokens` runs `token_version = token_version + 1` on an admin password reset, an own password change, a real role change (saving the same role doesn't revoke), and `POST /api/wyloguj-wszedzie`. An own password change, or an admin resetting their own password, returns a fresh `{ token, user }` so the current tab stays logged in.

### Table `zgloszenia`
- Columns: `id` (INT PK AI), `imie` (VARCHAR(50)), `nazwisko` (VARCHAR(50)), `nazwa_firmy` (VARCHAR(100) NULL), `adres` (TEXT), `kod_pocztowy` (VARCHAR(6)), `miasto` (VARCHAR(100)), `numer_telefonu` (VARCHAR(20)), `telefon_stacjonarny` (VARCHAR(20) NULL), `email` (VARCHAR(100)), `opis_usterki` (TEXT), `numer_fv` (VARCHAR(50)), `nip` (VARCHAR(10)), `przedmiot_zgloszenia` (VARCHAR(100)), `numer_seryjny` (VARCHAR(100) NULL), `data_zakupu` (DATE), `zgoda_rodo_data` (DATETIME NULL), `status` (ENUM(`'nowe'`, `'w_realizacji'`, `'do_wysylki'`, `'zakończone'`) DEFAULT `'nowe'`), `created_at` (TIMESTAMP).
- **Workflow fields:** `przypisany_pracownik_id` (INT NULL FK -> `uzytkownicy.id` ON DELETE SET NULL), `opis_naprawy` (TEXT NULL), `opis_naprawy_data` (DATETIME NULL), `data_wyslania` (DATETIME NULL), `numer_listu` (VARCHAR(100) NULL).

### Table `historia_zgloszen`
- Columns: `id` (INT PK AI), `zgloszenie_id` (INT NOT NULL, indexed via `idx_historia_zgloszenie_id`), `uzytkownik_id` (INT NULL FK -> `uzytkownicy.id` ON DELETE SET NULL), `akcja` (VARCHAR(100) NOT NULL), `z_statusu` (VARCHAR(50) NULL), `na_status` (VARCHAR(50) NULL), `szczegoly` (**`MEDIUMTEXT NULL`** — migration `003_historia_szczegoly_mediumtext.sql`), `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
- **Transactional Audit Persistence:** Records every ticket event (`utworzenie`, `przypisanie`, `naprawa`, `zmiana_statusu`, `zmiana_numeru_listu`, `wysyłka`, `usunięcie`) via `dodajWpisHistorii(conn, ...)`. Every ticket mutation and its history insert execute inside a single database transaction (`conn.beginTransaction()` → `conn.commit()`, with `conn.rollback()` on error). `dodajWpisHistorii` does not swallow errors — if the history insert fails, the entire ticket update or deletion rolls back and returns `500`.
- **Optimistic Locking (Compare-And-Swap / CAS):** Every status/workflow update uses `WHERE id = ? AND status = ?` with the status read before validation. If `affectedRows === 0`, another request modified the ticket concurrently — the transaction rolls back and the endpoint returns `409 Conflict` (`Zlecenie zostało w międzyczasie zmienione, odśwież widok.`).
- **No `ON DELETE CASCADE` on `zgloszenie_id`:** Intentionally omitted so that when an admin deletes a ticket (`DELETE /api/zgloszenia/:id`), its audit trail and the final `usunięcie` entry remain in `historia_zgloszen`.

---

## 3. Role-Based Access Control (RBAC) & Status Lifecycle

### Status Transitions (`PRZEJSCIA` & `czyMoznaZmienic(rola, zStatusu, naStatus)`)
```javascript
const STATUS_ORDER = ['nowe', 'w_realizacji', 'do_wysylki', 'zakończone'];
const PRZEJSCIA = {
    nowe:         { w_realizacji: ['admin', 'serwisant'] },
    w_realizacji: { do_wysylki: ['admin', 'serwisant', 'pracownik'] },
    do_wysylki:   { 'zakończone': ['admin', 'magazynier'] }
};
```
- **409 Conflict:** Invalid lifecycle jump (e.g., `nowe` → `zakończone`) — returns `Nie można zmienić statusu z »${zStatusu}« na »${naStatus}«.`.
- **403 Forbidden:** Valid lifecycle transition or rollback, but the user's role lacks permission.

| Transition | Allowed Roles | Rules & Side Effects |
| :--- | :--- | :--- |
| `nowe` → `w_realizacji` | `admin`, `serwisant` | Triggered automatically when assigning a worker (`PATCH /api/zgloszenia/:id/przypisz`) or via `/status`. |
| `w_realizacji` → `do_wysylki` | Assigned `pracownik`, `serwisant`, `admin` | **Exclusively via `PATCH /api/zgloszenia/:id/naprawione`** (`requireRoles('admin', 'serwisant', 'pracownik')`, hard condition `ticket.status === 'w_realizacji'`, otherwise `409 Conflict`; requires `opis_naprawy`, sets `opis_naprawy_data = NOW()`). Blocked (`400`) on `/status`. **`serwisant` cannot describe a ticket assigned to another worker (`403`)**; describing an unassigned ticket auto-assigns it to that `serwisant`. |
| `do_wysylki` → `zakończone` | `magazynier`, `admin` | Marks ticket as shipped (`data_wyslania = NOW()`). `magazynier` must provide `numer_listu`. |
| **Rollback (backward)** | **`admin` only** | Other roles get `403`. Rolling back before `zakończone` clears `data_wyslania` and `numer_listu` to `NULL`; rolling back before `do_wysylki` clears `opis_naprawy` and `opis_naprawy_data` to `NULL` and appends the previous repair description to `historia_zgloszen.szczegoly`; rolling back to `nowe` clears `przypisany_pracownik_id` to `NULL` and appends `. Poprzednio przypisany pracownik: <username>` to `historia_zgloszen.szczegoly`. |

### Role Permissions Matrix
| Role | Ticket Visibility (`canViewTicket`) | Assign Worker (`/przypisz`) | Status / Repair Actions | Other Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **`admin`** | All tickets | Yes (`pracownik`, `serwisant`; only in `nowe` and `w_realizacji`, otherwise `409`) | All forward transitions + **exclusive rollback rights** + edit `numer_listu` on `do_wysylki` and `zakończone` (`/numer-listu`) | `DELETE /api/zgloszenia/:id`, full user management (`/api/admin/users*`) |
| **`serwisant`** | All tickets | Yes (`pracownik`, `serwisant` in `nowe` and `w_realizacji`, otherwise `409`; auto `nowe` → `w_realizacji`). Can reassign another worker's ticket to a different worker (e.g. sick leave / blocked account), **but cannot reassign another worker's ticket to self or unassign it (`403`)** — this closes the `/przypisz` → `/naprawione` bypass. Later statuses return `409 Conflict`. | `w_realizacji` → `do_wysylki` via `/naprawione` **only for own or unassigned tickets** (`403` if assigned to someone else) | — |
| **`pracownik`** | **Only assigned to self** | No | `w_realizacji` → `do_wysylki` via `/naprawione` (own tickets only) | — |
| **`magazynier`** | **Only `do_wysylki` & `zakończone`** | No | `do_wysylki` → `zakończone` (requires `numer_listu`) + edit `numer_listu` on `zakończone` (`/numer-listu`; `403` on `do_wysylki`, where the number is given when shipping) | — |

---

## 4. REST API Specification

All errors return `{ error: string }`. Polish error messages are strictly tested in `app.test.js` — do not alter their wording.

| Method | Endpoint | Access / Role | Description & Validation |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/zgloszenia` | Public | Create ticket (transactional insert into `zgloszenia` + `historia_zgloszen`). Honeypot (`website` field -> returns fake `201` with `id: 0` without DB write). Requires `zgoda_rodo` (`zgoda_rodo_data = NOW()`). Rate limit: 5 accepted tickets/1h per IP (`skipFailedRequests: true` — rejected `4xx`/`5xx` submissions don't use the quota, honeypot `201` still counts; skipped in `NODE_ENV === 'test'`). Error messages use Polish field labels (`FIELD_LABELS`, e.g. `Pole „Opis usterki” jest wymagane.`), never raw column names. Validates: `imie`/`nazwisko` (`NAME_REGEX` — letters of any alphabet, spaces, hyphen, `'` and `’`), `nip` (10 digits), `kod_pocztowy` (`XX-XXX`), `numer_telefonu` (`+48` + 9 digits), optional `telefon_stacjonarny` (9 digits, saved with `+48`), `przedmiot_zgloszenia` (normalized to canonical value from `ALLOWED_PRZEDMIOTY`), `data_zakupu` (`YYYY-MM-DD`, real calendar date, not after today's date in `Europe/Warsaw` — `todayInPoland`, independent of the server time zone), `numer_seryjny` (required only for interactive monitors/boards, max 100 chars), `opis_usterki` (max 5,000 chars), `adres` (max 500 chars). |
| `POST` | `/api/login` | Public | Login (`username`, `password` verified as strings). Rate limit: 10/15m per IP. Constant-time bcrypt check (`DUMMY_PASSWORD_HASH` when user does not exist to prevent timing attacks). Blocked accounts (`!isUserActive`) get `403`. Returns `{ message, token, user }`; token valid 24h with claim `tv` (`token_version`). |
| `GET` | `/api/me` | JWT (any role) | Current `{ id, username, role }` read from the DB. The panel calls it on start and after every `403`, and takes the role from it instead of `localStorage`. |
| `POST` | `/api/wyloguj-wszedzie` | JWT (any role) | "Wyloguj wszędzie": bumps `token_version`, which revokes every token of this user (including the current one). |
| `GET` | `/api/pracownicy` | JWT (`admin`, `serwisant`) | Active repair staff (`role IN ('pracownik', 'serwisant') AND aktywny = 1`). Does not return admins or warehouse staff. |
| `GET` | `/api/zgloszenia` | JWT (any role) | Paginated ticket list. Query params: `?szukaj=` (parameterized `LIKE ?` across 14 columns), `?status=`, `?pracownik=` (ID or `nieprzypisane`), `?strona=` (default 1), `?limit=` (default 25, max 100), `?sort=` (`asc`/`desc` on `created_at`). Enforces RBAC visibility (`AND`). Each row includes `dozwolone_akcje` computed by `wyznaczDozwoloneAkcje(req.user, t)`. Returns `{ total, page, limit, totalPages, data }`. |
| `GET` | `/api/zgloszenia/:id` | JWT (any role) | Ticket details + `historia` + `dozwolone_akcje`. Protected by `canViewTicket(req.user, ticket)` (`404` if missing, `403` if unauthorized). |
| `GET` | `/api/zgloszenia/:id/historia` | JWT (any role) | Chronological audit history for ticket `:id`. Protected by `canViewTicket(req.user, ticket)` (`404` / `403`). |
| `PATCH` | `/api/zgloszenia/:id/przypisz` | JWT (`admin`, `serwisant`) | Assign/unassign worker (`{ pracownik_id }`). Checked by `canViewTicket` first. Allowed only in `nowe` and `w_realizacji` (`409` on `do_wysylki` / `zakończone`). Target must be active `pracownik` or `serwisant` (`400` otherwise). Unassigning (`pracownik_id: null`) on `nowe` or already unassigned tickets returns `400`. `serwisant` can reassign another worker's ticket to a different worker, **but is forbidden (`403`) from reassigning another worker's ticket to self or unassigning it** (preventing bypass of the `/naprawione` restriction). Updates `przypisany_pracownik_id` without overwriting `status`, guarded by CAS `WHERE id = ? AND status = ? AND przypisany_pracownik_id <=> ?` (`409` if the status or the previous assignee changed concurrently), then conditionally transitions `nowe` → `w_realizacji` (`WHERE id = ? AND status = 'nowe'`) inside a transaction. |
| `PATCH` | `/api/zgloszenia/:id/naprawione` | JWT (`pracownik`, `serwisant`, `admin`) | **Only forward path to `do_wysylki`**. Enforced by `requireRoles('admin', 'serwisant', 'pracownik')`, `canViewTicket` first, and hard condition `ticket.status === 'w_realizacji'` (`409` on `nowe`, `do_wysylki`, `zakończone`). Requires non-empty `opis_naprawy` (max 5,000 chars). Blocks `pracownik` on others' tickets (`403`) and `serwisant` on tickets assigned to another worker (`403`). Runs `UPDATE ... WHERE id = ? AND status = ?` + `dodajWpisHistorii` in a transaction (`409` if `affectedRows === 0`). |
| `PATCH/PUT` | `/api/zgloszenia/:id/status` | JWT (RBAC) | Checked by `canViewTicket` first (preventing status leaks on unauthorized tickets). Status change per `czyMoznaZmienic` (blocks forward `do_wysylki` with `400`). Handles admin rollbacks (clearing `data_wyslania`/`numer_listu` before `zakończone`, `opis_naprawy`/`opis_naprawy_data` before `do_wysylki`, and `przypisany_pracownik_id` on `nowe`). Accepts `numer_listu` (max 100 chars) **only when shipping (`→ zakończone`)**; any other request carrying `numer_listu` returns `400` (rollback, same status below `zakończone`), and re-shipping an already shipped ticket (`zakończone → zakończone` with `numer_listu`, i.e. another user shipped it first) returns `409` with the current tracking number; the frontend keeps the modal open with the error (ShipModal then hides the submit button and only offers "Zamknij") and refreshes the list and drawer in the background on any `409` — editing the number goes through `/numer-listu`, so a stale status in the UI can never turn a tracking-number fix into a status change. Runs `UPDATE ... WHERE id = ? AND status = ?` + `dodajWpisHistorii` in a transaction (`409` if `affectedRows === 0`). |
| `PATCH` | `/api/zgloszenia/:id/numer-listu` | JWT (`admin`, `magazynier`) | Edit tracking number (`{ numer_listu }`, required key, max 100 chars, trimmed; `null`/empty clears it for `admin` only). **Never changes `status`.** Checked by `canViewTicket` first. Allowed statuses from `NUMER_LISTU_EDYCJA`: `admin` → `do_wysylki`, `zakończone` (`409` otherwise); `magazynier` → `zakończone` only (`403` on `do_wysylki`). Runs `UPDATE zgloszenia SET numer_listu = ? WHERE id = ? AND status = ?` + `zmiana_numeru_listu` history entry in a transaction (`409` on CAS conflict). |
| `DELETE` | `/api/zgloszenia/:id` | JWT (`admin`) | Logs `usunięcie` to `historia_zgloszen` and executes `DELETE FROM zgloszenia WHERE id = ?` inside a single transaction (`409` if `affectedRows === 0`, rolling back the history entry on failure). |
| `GET` | `/api/admin/users` | JWT (`admin`) | Lists users (`id, username, role, aktywny, created_at`) **without `password_hash`**. |
| `POST` | `/api/admin/users` | JWT (`admin`) | Create user (`username` max 50, `password` min 8 chars / max 72 bytes, whitespace-only rejected, `role` in `ALLOWED_ROLES`). Bcrypt salt 10. `409` on duplicate username. |
| `PATCH` | `/api/admin/users/:id` | JWT (`admin`) | Change role (`{ role }`). Admin cannot demote self (`400`). A real role change revokes the user's tokens (`token_version + 1`). |
| `PATCH` | `/api/admin/users/:id/haslo` | JWT (`admin`) | Reset user password (`password`/`haslo` min 8 chars / max 72 bytes, whitespace-only rejected). Revokes the user's tokens; when the admin resets their own password, the response also contains a new `{ token, user }`. |
| `PATCH` | `/api/admin/users/:id/status` | JWT (`admin`) | Toggle/set `aktywny` via `isUserActive` (alias: `/aktywny`). Admin cannot block self (`400`). |
| `PATCH` | `/api/profil/haslo` | JWT (any role) | Self-service password change (`currentPassword`/`stare_haslo`, `newPassword`/`nowe_haslo` min 8 chars / max 72 bytes). Verifies old password via bcrypt. Rate limit: 5/15m per `req.user.id` (`hasloLimiter`, skipped in `NODE_ENV === 'test'`). Revokes all other sessions and returns a new `{ token, user }` for the current tab. |
| `GET` | `/api/health` | Public | DB health check: `200 { status: 'ok' }` or `500 { status: 'error' }` (never leaks `err.message`). |

---

## 5. Frontend SPA (`frontend/src/`)

- **Single Source of Truth for Actions:** Backend computes `ticket.dozwolone_akcje` via `wyznaczDozwoloneAkcje`. `StatusControl.jsx` (used both in `Dashboard.jsx` and `TicketDetailsDrawer.jsx`) and `constants.js` (`getTicketActionState`) derive `isAssignAction`, `isRepairAction`, `isShipAction`, `rollbackActions`, and `trackingAction` (`akcja: 'edytuj_numer_listu'`, drives the "✏ Edytuj" tracking-number button in `TicketDetailsDrawer.jsx`) directly from `dozwolone_akcje` (rendering `"Przypisz"` in `nowe` and `"Zmień przypisanie"` in `w_realizacji` alongside `"Oznacz jako naprawione"`).
- **Key Components (`frontend/src/components/`):**
  - `Modal.jsx`: Shared portal modal base (`createPortal`, `<dialog open aria-modal="true" aria-labelledby>` with the title, "✕" with `aria-label="Zamknij"`, `.modal-card` using `100dvh` for mobile Safari compatibility). Keyboard handling comes from `useDialog`.
  - `TicketDetailsDrawer.jsx` scroll area: the drawer body is a `<section aria-label tabIndex={0} data-autofocus>` with `overflow-y-auto`, so it gets focus on open and arrow keys / PageUp / PageDown scroll it (focus on the `<dialog>` itself scrolls nothing, because the dialog has `overflow: hidden`). `.oxlintrc.json` allows `tabIndex` on `<section>` only (`jsx-a11y/no-noninteractive-tabindex`, `tags: ["section"]`) for such scroll areas.
  - `useDialog.js` (`frontend/src/`): shared by `Modal` and `TicketDetailsDrawer`. Keeps a stack of open dialogs: only the top one reacts to `Escape` and `Tab` (a modal opened from the drawer closes alone). Traps focus (Tab / Shift+Tab cycle inside), focuses `[data-autofocus]` or the dialog itself on open, locks body scroll, and on close returns focus to the element that opened it (or to the dialog below if that element is gone). Use `data-autofocus` instead of `autoFocus` (jsx-a11y `no-autofocus`). Native `showModal()` is not used, so `.modal-card` / `.drawer-panel` reset the browser's default `<dialog>` styles in `index.css`.
  - `PasswordModal.jsx`: Unified modal for own password change (`userToEdit = null`) and admin password reset (`userToEdit = user`).
  - `ShipModal.jsx`: Unified modal for shipping (`mode="ship"`) and tracking number editing (`mode="edit"`).
  - `AssignWorkerModal.jsx`: Requires choosing an active `pracownik` or `serwisant` when the ticket is unassigned (`— Wybierz pracownika z listy —`); only offers `"— Brak (Cofnij przypisanie) —"` when the ticket is already assigned (`w_realizacji`).
  - `RepairModal.jsx`, `RollbackStatusModal.jsx`: Stage-specific workflow modals using Polish labels from `STATUS_LABELS`.
  - `StatusControl.jsx`, `StatusBadge.jsx`, `TicketDetailsDrawer.jsx` (displays `historyError` if history fetch fails, uses `HISTORY_ACTION_LABELS`, `STATUS_LABELS`, `formatDate`, and `formatDateTime`), `AdminUsersPanel.jsx`, `Header.jsx`, `Alert.jsx`.
- **Pages (`frontend/src/pages/`):**
  - `PublicTicketForm.jsx`: 3-step form, honeypot, RODO, `sessionStorage` confirmation view with `← Powrót na stronę główną` button, resets phone number to `'+48 '` via `EMPTY_TICKET_FORM`. Validation runs in the browser first via `validateTicketForm` (`constants.js`), which returns the first invalid field: the error is shown under that field, which gets scrolled into view and focused. `constants.js` mirrors the server rules (`FIELD_LABELS`, `FIELD_MAX_LENGTHS`, `NAME_REGEX`, `EMAIL_REGEX`, `validatePurchaseDate`/`todayInPoland`), and a test compares them with `app.ticketFormRules`, so change both sides together. Phone input goes through `normalizePhoneDigits` (strips the fixed `'+48 '` prefix, then `0048`/`48` only when a full 9-digit number follows), so pasted numbers in any format are saved correctly. Server errors are shown in a persistent `Alert` (scrolled into view and focused; only success alerts auto-hide, and the timer is cleared).
  - `tresci.js`: owner-supplied content — the art. 13 GDPR clause (`KLAUZULA_INFORMACYJNA`, built from `ADMINISTRATOR_DANYCH` and `OKRES_PRZECHOWYWANIA`) and `CZAS_KONTAKTU_DNI_ROBOCZYCH`. It still holds `[X]` placeholders. `npm run check:placeholders` (`scripts/check-placeholders.js`) fails while `[X]` or `Placeholder` appears in `frontend/src` or `frontend/dist`; in CI that step is `continue-on-error` until the content is filled in.
  - `LoginForm.jsx`: Staff login view. Shows `notice` from `App.jsx`: `SESSION_EXPIRED_MESSAGE` after a `401`, or "Wylogowano w innej karcie przeglądarki.".
  - Session handling (`api.js` + `App.jsx`):
    - `apiFetch` on `401` clears the session and calls `onUnauthorized(message)`, unless another tab has already replaced the token. On `403` it calls `refreshCurrentUser()` (`GET /api/me`); changed user data goes through `authApi.updateSession` → `onSessionUpdated`.
    - `App.jsx` calls `authApi.me()` whenever the token changes, listens to the `storage` event (`serwis_token`/`serwis_user` changed in another tab → take over that session or log out), and remounts `Dashboard` with `key={`${user?.id}:${user?.role}`}`.
    - `szkice.js` keeps drafts in `sessionStorage`: the repair description (`RepairModal`) and the shipping number in both `ShipModal` modes ("Oznacz jako wysłane" and "Edytuj numer listu", separate keys via `modalDraftKey(kind, userId, ticketId)` with `kind` = `repair` / `ship` / `tracking`), plus the open window (`rememberOpenModal` / `pendingModal`). Keys include the user ID. After logging in again, `Dashboard` reopens that window with the draft if the action is still allowed; otherwise the stale draft is removed. A draft is removed only after a successful save (`runTicketMutation` returns `true`, and `false` on a `401`); `ShipModal` also removes it on a `409`. `ShipModal` stores a draft only when the input differs from the saved `numer_listu`, and it no longer closes itself: `runTicketMutation` closes it on success.
  - `Dashboard.jsx`: The ticket number (`#id`) in the table row and the mobile card is a `<button>` ("Szczegóły zgłoszenia #id") that opens the drawer; clicking the row/card is a mouse shortcut (`handleTicketAreaClick` ignores clicks on buttons, links and form fields, so there are no `stopPropagation` wrappers). Search and filters have `aria-label`. URL query sync, race-condition guard (`fetchRequestIdRef` ignores stale out-of-order responses), automatic fallback to previous page when deleting the last ticket on a page, refreshes active workers (`fetchWorkers`) on tab switch and when opening `AssignWorkerModal`.
- **Strict Visual System & Accessibility (`frontend/src/index.css`):**
  - **Colors exclusively from `:root` CSS variables:** `--bg-page`, `--bg-card`, `--text-main`, `--text-muted`, `--text-white`, `--primary`, `--primary-dark`, `--danger`, `--border`, `--status-nowe|w-realizacji|do-wysylki|zakonczone`.
  - **Zero raw hex/RGB outside `:root`:** Use semantic classes (`text-ink`, `text-muted`, `text-primary-dark`, `bg-page`, `bg-card`, `border-line`, `text-danger`, `.btn-primary`, `.btn-secondary`, `.btn-danger`) — never default Tailwind palettes (`slate-*`, `red-*`) or inline `style={{}}`.
  - **WCAG AA & Responsiveness:** Contrast ratio $\ge 4.5:1$ for all text/badges. No horizontal scroll at `375px` (iPhone SE) or `1366px` desktop.
  - **Keyboard & screen readers:** Every clickable thing is a `<button>`/`<a>`/form field (a clickable `div`/`tr` is only a mouse shortcut next to a real button). Every field has `<label htmlFor>` + `id` or `aria-label`. Never `outline-none` without `focus-visible:ring-2 focus-visible:ring-primary` (or `focus:ring-*`). New dialogs go through `Modal` / `useDialog`. `npm run lint` (jsx-a11y, `--deny-warnings`) must stay at 0 warnings; the three `react/set-state-in-effect` disables in `Dashboard.jsx` / `AdminUsersPanel.jsx` mark data fetching where `setState` runs only after `await`.

---

## 6. Commands & Mandatory Security Rules

```bash
npm install                                # Install root + frontend workspace dependencies
npm run build                              # Build Vite SPA into frontend/dist/
npm run lint                               # oxlint (react, oxc, jsx-a11y) on frontend/src/, fails on any warning
npm test                                   # node --test: runs all *.test.js (mocked tests in app.test.js; integration.test.js is skipped when no DB is reachable)
npm run test:db                            # Run real MySQL/MariaDB tests (integration.test.js on serwis_db_test)
npm run migrate                            # Apply pending SQL migrations from migrations/
npm run seed && npm run config:testowy     # Initialize schema, 4 test accounts (pass: admin123) & 200 'nowe' tickets
node create-user.js admin Haslo123 admin   # Create admin account (password min 8 chars, max 72 bytes)
npm start                                  # Start production server on HOST:PORT (default 127.0.0.1:3000)
```

1. **Strong `JWT_SECRET` Validation (`validateJwtSecret`):** Never add a fallback `JWT_SECRET` in `app.js`. `validateJwtSecret` rejects missing secrets, template placeholders (`wygeneruj_wlasny`, `twoj_klucz_jtw`, `changeme`, `secret`, etc. — see `INSECURE_JWT_SECRETS` in `jwt-validation.js`), and secrets shorter than 32 characters.
2. **JWT & DB Auth (`authenticateToken`):** Explicitly enforce `algorithms: ['HS256']` in `jwt.sign` and `jwt.verify`. On every request, `authenticateToken` queries `SELECT id, username, role, aktywny, token_version FROM uzytkownicy WHERE id = ?` — rejecting inactive/missing users and tokens whose `tv` differs from `token_version` with `401`, and taking `req.user.role` strictly from the DB. Any new operation that should end existing sessions must call `revokeUserTokens`.
3. **401 vs 403 & `canViewTicket` First:** `401` = authentication failure (triggers auto-logout on frontend via `onUnauthorized`). `403` = insufficient RBAC permissions or blocked account on login. In `/przypisz`, `/naprawione`, and `/status`, always check `canViewTicket(req.user, ticket)` immediately after loading the ticket so unauthorized users never receive status information in `200`/`403`/`409` responses.
4. **Transactions & Optimistic Locking (CAS):** All ticket mutations + `dodajWpisHistorii` must run inside a single DB transaction (`getTransactionConnection()`) and verify `affectedRows > 0` on `WHERE id = ? AND status = ?` (returning `409 Conflict` on concurrent modification).
5. **Strict Validation & Type Safety:** Keep all regexes, field length checks, calendar date validation (`validatePurchaseDate`), strict integer ID parsing (`parsePositiveInt` requiring `/^\d+$/`), boolean coercion guard (`isUserActive`), and password length checks (min 8 chars, max 72 bytes — bcrypt limit; passwords are not trimmed, whitespace-only passwords are rejected) intact.
6. **Static Asset Caching (`express.static` in `app.js`):** `index.html` is served with `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` (+ `Pragma: no-cache`, `Expires: 0`) so every visit loads the current SPA entry point; Vite files with a content hash in the name (`isHashedFile`) get `public, max-age=31536000, immutable`; other static files (e.g. `logo_mentor4.svg`) get `public, max-age=86400`.
