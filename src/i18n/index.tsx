import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from './en.json';
import it from './it.json';
import es from './es.json';
import ru from './ru.json';
import de from './de.json';
import fr from './fr.json';
import ja from './ja.json';
import zh from './zh.json';
import pt from './pt.json';
import ko from './ko.json';

// Type-safe translation keys
type TranslationKeys = typeof en;

// Supported languages
type Language = 'en' | 'it' | 'es' | 'ru' | 'de' | 'fr' | 'ja' | 'zh' | 'pt' | 'ko';

const translations: Record<Language, TranslationKeys> = {
    en, it, es, ru, de, fr, ja, zh, pt, ko
};

interface I18nContextType {
    language: Language;
    t: (key: string) => string;
    setLanguage: (lang: Language) => void;
    availableLanguages: { code: Language; name: string }[];
}

// Language display names (in their native language for authenticity)
const languageNames: { code: Language; name: string }[] = [
    { code: 'en', name: 'English' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
    { code: 'ru', name: 'Русский' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
    { code: 'pt', name: 'Português' },
    { code: 'ko', name: '한국어' },
];

const I18nContext = createContext<I18nContextType | null>(null);

// Deep nested key access helper
const getNestedValue = (obj: any, path: string): string => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj) ?? path;
};

// Detect system language with comprehensive mapping
const detectSystemLanguage = (): Language => {
    // 1. Check navigator.languages (array) first for modern browsers
    const languages = navigator.languages || [navigator.language];

    const langMap: Record<string, Language> = {
        'en': 'en', 'it': 'it', 'es': 'es', 'ru': 'ru', 'de': 'de',
        'fr': 'fr', 'ja': 'ja', 'zh': 'zh', 'pt': 'pt', 'ko': 'ko',
    };

    // Iterate through user's preferred languages
    for (const lang of languages) {
        const code = lang.toLowerCase().split('-')[0];
        if (langMap[code]) {
            return langMap[code];
        }
    }

    return 'en'; // Default to English if no match found
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguage] = useState<Language>(() => {
        // STRICT AUTO-DETECTION: Always use system language.
        // Previously saved preferences (localStorage) caused users to be "stuck" 
        // in a language after the manual switcher was removed.
        return detectSystemLanguage();
    });

    // Optional: We can still save it if we ever re-introduce the switcher,
    // but for now, we don't want to load it.
    useEffect(() => {
        localStorage.setItem('instafollows_language', language);
    }, [language]);

    const t = (key: string): string => {
        return getNestedValue(translations[language], key);
    };

    return (
        <I18nContext.Provider value={{ language, t, setLanguage, availableLanguages: languageNames }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useTranslation = () => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within I18nProvider');
    }
    return context;
};
