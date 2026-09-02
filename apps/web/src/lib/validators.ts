// ── Brazilian Validators & Normalizers ────────────────────────────────
//
// Pure utility functions for CNPJ, phone, email, URL, and CEP
// validation/normalization. Used by both client components and API routes.
// ──────────────────────────────────────────────────────────────────────

// ── CNPJ ─────────────────────────────────────────────────────────────

/**
 * Validates a Brazilian CNPJ using the official check-digit algorithm.
 * Accepts formatted (12.345.678/0001-90) or digits-only (12345678000190).
 */
export function validateCNPJ(cnpj: string): boolean {
    const digits = cnpj.replace(/\D/g, '');

    if (digits.length !== 14) return false;

    // Reject known invalid patterns (all same digit)
    if (/^(\d)\1{13}$/.test(digits)) return false;

    // First check digit
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(digits[i]) * weights1[i];
    }
    let remainder = sum % 11;
    const check1 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[12]) !== check1) return false;

    // Second check digit
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 13; i++) {
        sum += parseInt(digits[i]) * weights2[i];
    }
    remainder = sum % 11;
    const check2 = remainder < 2 ? 0 : 11 - remainder;
    if (parseInt(digits[13]) !== check2) return false;

    return true;
}

/**
 * Formats a CNPJ digits-only string to display format.
 * 12345678000190 → 12.345.678/0001-90
 */
export function formatCNPJ(digits: string): string {
    const d = digits.replace(/\D/g, '');
    if (d.length !== 14) return digits;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Strips CNPJ to digits only.
 * 12.345.678/0001-90 → 12345678000190
 */
export function parseCNPJ(formatted: string): string {
    return formatted.replace(/\D/g, '');
}

/**
 * Applies CNPJ mask as the user types.
 * Returns the masked value for the current input length.
 */
export function maskCNPJ(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ── Phone ────────────────────────────────────────────────────────────

/**
 * Formats a phone number for display.
 * Handles both 10-digit (landline) and 11-digit (mobile) Brazilian numbers.
 * +5541999999999 or 41999999999 → (41) 99999-9999
 */
export function formatPhone(phone: string): string {
    const d = phone.replace(/\D/g, '');
    // Strip country code if present
    const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;

    if (local.length === 11) {
        // Mobile: (XX) XXXXX-XXXX
        return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
        // Landline: (XX) XXXX-XXXX
        return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
    return phone; // Return as-is if unrecognized format
}

/**
 * Normalizes a phone number to E.164 international format.
 * (41) 99999-9999 → +5541999999999
 */
export function parsePhoneToE164(phone: string, countryCode: string = '55'): string {
    const d = phone.replace(/\D/g, '');
    if (d.startsWith(countryCode) && d.length >= 12) {
        return `+${d}`;
    }
    if (d.length === 10 || d.length === 11) {
        return `+${countryCode}${d}`;
    }
    return `+${countryCode}${d}`;
}

/**
 * Applies phone mask as the user types.
 * Returns the masked value for the current input length.
 */
export function maskPhone(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Validates that a phone string has enough digits for a Brazilian number.
 */
export function validatePhone(phone: string): boolean {
    const d = phone.replace(/\D/g, '');
    // Accept 10 (landline) or 11 (mobile) local digits
    // or 12/13 with country code
    return d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13;
}

// ── Email ────────────────────────────────────────────────────────────

/**
 * Validates email syntax (basic but solid check).
 */
export function validateEmail(email: string): boolean {
    if (!email) return true; // Optional field — empty is valid
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalizes email: trim + lowercase.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// ── Website ──────────────────────────────────────────────────────────

/**
 * Normalizes a URL to an absolute HTTPS URL.
 * Handles: imobiliaria.com.br, www.imobiliaria.com.br, http://..., https://...
 */
export function normalizeWebsite(url: string): string {
    if (!url) return '';
    let normalized = url.trim();
    if (!normalized) return '';

    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '');

    // If no protocol, add https://
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    // Upgrade http to https
    normalized = normalized.replace(/^http:\/\//i, 'https://');

    return normalized;
}

/**
 * Validates that a URL looks reasonable (basic check).
 */
export function validateWebsite(url: string): boolean {
    if (!url) return true; // Optional field
    try {
        const normalized = normalizeWebsite(url);
        new URL(normalized);
        return true;
    } catch {
        return false;
    }
}

// ── CEP ──────────────────────────────────────────────────────────────

/**
 * Validates a Brazilian CEP (8 digits).
 */
export function validateCEP(cep: string): boolean {
    const d = cep.replace(/\D/g, '');
    return d.length === 8;
}

/**
 * Formats CEP for display: 80000000 → 80000-000
 */
export function formatCEP(cep: string): string {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return cep;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Strips CEP to digits only.
 */
export function parseCEP(formatted: string): string {
    return formatted.replace(/\D/g, '');
}

/**
 * Applies CEP mask as the user types.
 */
export function maskCEP(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── CPF ──────────────────────────────────────────────────────────────

/**
 * Validates a Brazilian CPF using the official check-digit algorithm (mod 11).
 * Accepts formatted (123.456.789-01) or digits-only (12345678901).
 */
export function validateCPF(cpf: string): boolean {
    const digits = cpf.replace(/\D/g, '');

    if (digits.length !== 11) return false;

    // Reject known invalid patterns (all same digit)
    if (/^(\d)\1{10}$/.test(digits)) return false;

    // First check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(digits[i]) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (parseInt(digits[9]) !== remainder) return false;

    // Second check digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(digits[i]) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (parseInt(digits[10]) !== remainder) return false;

    return true;
}

/**
 * Formats a CPF digits-only string to display format.
 * 12345678901 → 123.456.789-01
 */
export function formatCPF(digits: string): string {
    const d = digits.replace(/\D/g, '');
    if (d.length !== 11) return digits;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/**
 * Strips CPF to digits only.
 * 123.456.789-01 → 12345678901
 */
export function parseCPF(formatted: string): string {
    return formatted.replace(/\D/g, '');
}

/**
 * Applies CPF mask as the user types.
 * Returns the masked value for the current input length.
 */
export function maskCPF(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ── CRECI Display ───────────────────────────────────────────────────

/**
 * Formats CRECI number + state for display.
 * ("12345", "MG") → "CRECI-MG 12345"
 */
export function formatCRECI(number: string, state: string): string {
    if (!number || !state) return number || '';
    return `CRECI-${state} ${number}`;
}

// ── Brazilian States ─────────────────────────────────────────────────

export const BRAZILIAN_STATES = [
    { code: 'AC', name: 'Acre' },
    { code: 'AL', name: 'Alagoas' },
    { code: 'AP', name: 'Amapá' },
    { code: 'AM', name: 'Amazonas' },
    { code: 'BA', name: 'Bahia' },
    { code: 'CE', name: 'Ceará' },
    { code: 'DF', name: 'Distrito Federal' },
    { code: 'ES', name: 'Espírito Santo' },
    { code: 'GO', name: 'Goiás' },
    { code: 'MA', name: 'Maranhão' },
    { code: 'MT', name: 'Mato Grosso' },
    { code: 'MS', name: 'Mato Grosso do Sul' },
    { code: 'MG', name: 'Minas Gerais' },
    { code: 'PA', name: 'Pará' },
    { code: 'PB', name: 'Paraíba' },
    { code: 'PR', name: 'Paraná' },
    { code: 'PE', name: 'Pernambuco' },
    { code: 'PI', name: 'Piauí' },
    { code: 'RJ', name: 'Rio de Janeiro' },
    { code: 'RN', name: 'Rio Grande do Norte' },
    { code: 'RS', name: 'Rio Grande do Sul' },
    { code: 'RO', name: 'Rondônia' },
    { code: 'RR', name: 'Roraima' },
    { code: 'SC', name: 'Santa Catarina' },
    { code: 'SP', name: 'São Paulo' },
    { code: 'SE', name: 'Sergipe' },
    { code: 'TO', name: 'Tocantins' },
] as const;
