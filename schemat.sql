-- database/schema.sql
CREATE DATABASE IF NOT EXISTS serwis_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE serwis_db;

CREATE TABLE IF NOT EXISTS zgloszenia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    imie VARCHAR(50) NOT NULL,
    nazwisko VARCHAR(50) NOT NULL,
    adres TEXT NOT NULL,
    numer_telefonu VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    opis_usterki TEXT NOT NULL,
    numer_fv VARCHAR(50),
    status ENUM(
        'nowe',
        'w_realizacji',
        'zakończone'
    ) DEFAULT 'nowe',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uzytkownicy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);