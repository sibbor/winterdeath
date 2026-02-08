
import { en } from '../locales/en';
import { sv } from '../locales/sv';

export type Locale = 'en' | 'sv';

const LOCALES = { en, sv };

let currentLocale: Locale = 'sv';

// Try to load saved locale
try {
    const saved = localStorage.getItem('vinterdod_locale');
    if (saved && (saved === 'en' || saved === 'sv')) {
        currentLocale = saved;
    }
} catch (e) { }

export const setLocale = (locale: Locale) => {
    currentLocale = locale;
    localStorage.setItem('vinterdod_locale', locale);
    // Dispatch event to trigger re-renders if necessary (simple forceUpdate pattern in React components recommended instead)
    window.dispatchEvent(new Event('locale-changed'));
};

export const getLocale = () => currentLocale;

export const t = (key: string, params?: Record<string, string | number>): any => {
    const keys = key.split('.');
    let value: any = LOCALES[currentLocale];

    for (const k of keys) {
        if (value && typeof value === 'object') {
            value = value[k];
        } else {
            return key; // Fallback to key if not found
        }
    }

    if (typeof value === 'string' && params) {
        return value.replace(/{(\w+)}/g, (_, k) => params[k] !== undefined ? String(params[k]) : `{${k}}`);
    }

    return value !== undefined ? value : key;
};
