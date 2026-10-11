import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translation files imported directly (or use HTTP backend if preferred)
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
            en: { translation: en },
            es: { translation: es },
            de: { translation: de }
        },
        fallbackLng: 'pt-BR',
        debug: false,
        interpolation: {
            escapeValue: false // not needed for react as it escapes by default
        },
        detection: {
            // Sem 'navigator': o painel é em português; outro idioma só se escolhido em Configurações > Idiomas
            order: ['queryString', 'cookie', 'localStorage'],
            caches: ['localStorage', 'cookie']
        }
    });

export default i18n;
