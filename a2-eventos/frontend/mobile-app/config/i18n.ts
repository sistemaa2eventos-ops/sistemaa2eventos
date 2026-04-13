import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Interpolation translations directly
import ptBR from '../locales/pt-BR.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import de from '../locales/de.json';

const resources = {
    'pt-BR': { translation: ptBR },
    'en': { translation: en },
    'es': { translation: es },
    'de': { translation: de }
};

// Pegar Idioma do Aparelho do Usuário
const getLocales = () => {
    // expo-localization returns an array of locales
    const localeString = Localization.getLocales()[0]?.languageTag || 'pt-BR';
    if (localeString.startsWith('pt')) return 'pt-BR';
    if (localeString.startsWith('es')) return 'es';
    if (localeString.startsWith('de')) return 'de';
    return 'en';
}

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: getLocales(),
        fallbackLng: 'pt-BR',
        compatibilityJSON: 'v4',
        interpolation: {
            escapeValue: false
        }
    });

export default i18n;
