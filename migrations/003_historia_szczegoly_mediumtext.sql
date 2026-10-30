-- 003_historia_szczegoly_mediumtext.sql
-- Zmiana typu kolumny szczegoly w tabeli historia_zgloszen z TEXT na MEDIUMTEXT,
-- aby pełny opis naprawy (do 65535 znaków) wraz z prefiksem ("Opis naprawy: " / "Poprzedni opis naprawy: ")
-- mieścił się w historii bez błędu ER_DATA_TOO_LONG i bez utraty danych przy cofaniu statusu.

ALTER TABLE historia_zgloszen MODIFY COLUMN szczegoly MEDIUMTEXT NULL;
