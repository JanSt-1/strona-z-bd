-- 002_aktualizacja_kolumn_i_indeksow.sql
-- Kompletna weryfikacja i ujednolicenie wszystkich kolumn oraz tabel w bazie danych.
-- Sprawdza i bezpiecznie dodaje każdą kolumnę obecną w aplikacji bez względu na wersję bazy wyjściowej.

-- ========================================================
-- 1. TABELA uzytkownicy
-- ========================================================
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS username VARCHAR(50) NOT NULL UNIQUE;
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL;
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'pracownik';
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS aktywny BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ========================================================
-- 2. TABELA zgloszenia
-- ========================================================
-- Dane klienta i adresowe
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS imie VARCHAR(50) NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS nazwisko VARCHAR(50) NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS nazwa_firmy VARCHAR(100) NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS adres TEXT NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS kod_pocztowy VARCHAR(6) NOT NULL DEFAULT '';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS miasto VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS numer_telefonu VARCHAR(20) NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS telefon_stacjonarny VARCHAR(20) NULL AFTER numer_telefonu;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS email VARCHAR(100) NOT NULL;

-- Dane zgłoszenia, faktury i zgody
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS opis_usterki TEXT NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS numer_fv VARCHAR(50) NOT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS nip VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS przedmiot_zgloszenia VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS numer_seryjny VARCHAR(100) NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS data_zakupu DATE NOT NULL DEFAULT '1970-01-01';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS zgoda_rodo_data DATETIME NULL;

-- Obsługa zgłoszenia (przypisany pracownik, naprawa, wysyłka, statusy)
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS przypisany_pracownik_id INT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS opis_naprawy TEXT NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS opis_naprawy_data DATETIME NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS data_wyslania DATETIME NULL;
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS numer_listu VARCHAR(100) NULL;
ALTER TABLE zgloszenia MODIFY COLUMN status ENUM('nowe', 'w_realizacji', 'do_wysylki', 'zakończone') DEFAULT 'nowe';
ALTER TABLE zgloszenia ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ========================================================
-- 3. TABELA historia_zgloszen
-- ========================================================
CREATE TABLE IF NOT EXISTS historia_zgloszen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zgloszenie_id INT NOT NULL,
    uzytkownik_id INT NULL,
    akcja VARCHAR(100) NOT NULL,
    z_statusu VARCHAR(50) NULL,
    na_status VARCHAR(50) NULL,
    szczegoly TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uzytkownik_id) REFERENCES uzytkownicy (id) ON DELETE SET NULL
);

ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS zgloszenie_id INT NOT NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS uzytkownik_id INT NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS akcja VARCHAR(100) NOT NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS z_statusu VARCHAR(50) NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS na_status VARCHAR(50) NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS szczegoly TEXT NULL;
ALTER TABLE historia_zgloszen ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Indeks na zgloszenie_id (optymalizacja zapytań o historię)
CREATE INDEX IF NOT EXISTS idx_historia_zgloszen_zgloszenie_id ON historia_zgloszen (zgloszenie_id);
