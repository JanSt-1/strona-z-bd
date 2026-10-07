-- database/schema.sql
CREATE DATABASE IF NOT EXISTS serwis_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE serwis_db;

-- Tabela użytkowników musi być tworzona PRZED tabelą zgłoszeń (FK dependency)
CREATE TABLE IF NOT EXISTS uzytkownicy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'pracownik',
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
    wojewodztwo VARCHAR(50) NOT NULL,
    numer_telefonu VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    opis_usterki TEXT NOT NULL,
    numer_fv VARCHAR(50) NOT NULL,
    nip VARCHAR(10) NOT NULL,
    przedmiot_zgloszenia VARCHAR(100) NOT NULL,
    numer_seryjny VARCHAR(100),
    data_zakupu DATE NOT NULL,
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