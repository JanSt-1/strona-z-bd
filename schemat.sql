-- database/schema.sql
-- Pełny referencyjny schemat bazy danych. Baza danych wybierana jest z DB_NAME w .env.

-- Tabela użytkowników musi być tworzona PRZED tabelą zgłoszeń (FK dependency)
CREATE TABLE IF NOT EXISTS uzytkownicy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'pracownik',
    aktywny BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zgloszenia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    imie VARCHAR(50) NOT NULL,
    nazwisko VARCHAR(50) NOT NULL,
    nazwa_firmy VARCHAR(100),
    adres TEXT NOT NULL,
    kod_pocztowy VARCHAR(6) NOT NULL,
    miasto VARCHAR(100) NOT NULL,
    numer_telefonu VARCHAR(20) NOT NULL,
    telefon_stacjonarny VARCHAR(20) NULL,
    email VARCHAR(100) NOT NULL,
    opis_usterki TEXT NOT NULL,
    numer_fv VARCHAR(50) NOT NULL,
    nip VARCHAR(10) NOT NULL,
    przedmiot_zgloszenia VARCHAR(100) NOT NULL,
    numer_seryjny VARCHAR(100),
    data_zakupu DATE NOT NULL,
    zgoda_rodo_data DATETIME NULL,
    przypisany_pracownik_id INT NULL,
    opis_naprawy TEXT NULL,
    opis_naprawy_data DATETIME NULL,
    data_wyslania DATETIME NULL,
    numer_listu VARCHAR(100) NULL,
    status ENUM(
        'nowe',
        'w_realizacji',
        'do_wysylki',
        'zakończone'
    ) DEFAULT 'nowe',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (przypisany_pracownik_id) REFERENCES uzytkownicy (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS historia_zgloszen (
    id INT AUTO_INCREMENT PRIMARY KEY,
    zgloszenie_id INT NOT NULL,
    uzytkownik_id INT NULL,
    akcja VARCHAR(100) NOT NULL,
    z_statusu VARCHAR(50) NULL,
    na_status VARCHAR(50) NULL,
    szczegoly TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_historia_zgloszen_zgloszenie_id (zgloszenie_id),
    FOREIGN KEY (uzytkownik_id) REFERENCES uzytkownicy (id) ON DELETE SET NULL
);