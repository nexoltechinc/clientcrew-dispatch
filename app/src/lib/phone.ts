const COUNTRY_CODE = '1';
const LOCAL_PHONE_LENGTH = 10;

const digitsOnly = (value: string): string => value.replace(/\D/g, '');

const formatLocalNumber = (localDigits: string): string =>
    `+1(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6, 10)}`;

export const phoneExampleFormat = '+1(586) 556-0113';

export const toUsPhoneFormat = (value: string): string | null => {
    const digits = digitsOnly(value);

    if (digits.length === LOCAL_PHONE_LENGTH) {
        return formatLocalNumber(digits);
    }

    if (digits.length === LOCAL_PHONE_LENGTH + 1 && digits.startsWith(COUNTRY_CODE)) {
        return formatLocalNumber(digits.slice(1));
    }

    return null;
};

export const formatUsPhoneInput = (value: string): string => {
    if (!value.trim()) return '';

    let digits = digitsOnly(value);
    if (digits.startsWith(COUNTRY_CODE)) {
        digits = digits.slice(1);
    }
    digits = digits.slice(0, LOCAL_PHONE_LENGTH);

    if (digits.length === 0) return '';
    if (digits.length <= 3) return `+1(${digits}`;
    if (digits.length <= 6) return `+1(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `+1(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export const formatPhoneForDisplay = (value: string): string => {
    if (!value) return value;
    return toUsPhoneFormat(value) ?? value;
};

export const getPhoneSearchToken = (value: string): string => digitsOnly(value);
