import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files imported directly
import ptBR from '../locales/pt-BR.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import de from '../locales/de.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            'pt-BR': { translation: ptBR },
            'pt': { translation: ptBR },
            'en': { translation: en },
            'en-US': { translation: en },
            'es': { translation: es },
            'es-ES': { translation: es },
            'de': { translation: de },
            'de-DE': { translation: de }
        },
        fallbackLng: 'pt-BR',
        debug: false,
        interpolation: {
            escapeValue: false
        },
        react: {
            useSuspense: false
        },
        detection: {
            // Ordem de detecção: se já foi definido no navegador, respeita; caso contrário cai no fallback
            order: ['localStorage', 'queryString', 'cookie'],
            lookupLocalStorage: 'i18nextLng',
            caches: ['localStorage', 'cookie']
        }
    });

export default i18n;
