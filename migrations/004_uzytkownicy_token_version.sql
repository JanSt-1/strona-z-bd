-- 004_uzytkownicy_token_version.sql
-- Wersja tokenów użytkownika. Trafia do JWT przy logowaniu (claim "tv"), a authenticateToken porównuje ją z bazą.
-- Reset hasła, zmiana własnego hasła, zmiana roli i "Wyloguj wszędzie" zwiększają ją o 1,
-- co natychmiast unieważnia wszystkie wcześniej wydane tokeny tego użytkownika.

ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
