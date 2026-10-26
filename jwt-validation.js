/**
 * jwt-validation.js
 * Moduł walidacji bezpieczeństwa zmiennej środowiskowej JWT_SECRET.
 * Chroni przed uruchomieniem aplikacji z domyślnym kluczem z szablonu .env.example / README
 * lub kluczem o niewystarczającej entropii (< 32 znaki).
 */

const INSECURE_JWT_SECRETS = new Set([
    'wygeneruj_wlasny',
    'twoj_klucz_jtw',
    'twoj_klucz_jwt',
    'secret',
    'changeme',
    'jwt_secret',
    'default_secret',
    'twoj_sekret_jwt',
    'twoj_sekret',
    'supersecret',
    'secretkey'
]);

/**
 * Sprawdza, czy przekazany sekret JWT spełnia wymagania bezpieczeństwa.
 * @param {string} secret
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateJwtSecret(secret) {
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
        return {
            valid: false,
            reason: 'Brak zdefiniowanej zmiennej środowiskowej JWT_SECRET w .env.'
        };
    }

    const trimmed = secret.trim();
    const lower = trimmed.toLowerCase();

    if (
        INSECURE_JWT_SECRETS.has(lower) ||
        lower.includes('wygeneruj_wlasny') ||
        lower.includes('twoj_klucz_')
    ) {
        return {
            valid: false,
            reason: `Wykryto domyślną/przykładową wartość JWT_SECRET z szablonu lub dokumentacji ("${trimmed}").`
        };
    }

    if (trimmed.length < 32) {
        return {
            valid: false,
            reason: `Wartość JWT_SECRET jest zbyt krótka (${trimmed.length} znaków). Wymagane jest minimum 32 znaki.`
        };
    }

    return {
        valid: true
    };
}

module.exports = {
    validateJwtSecret,
    INSECURE_JWT_SECRETS
};
