'use client';

import React, { ReactNode } from 'react';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBR from '../../public/locales/pt-BR/common.json';
import en from '../../public/locales/en/common.json';
import es from '../../public/locales/es/common.json';
import de from '../../public/locales/de/common.json';

i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            'pt-BR': { common: ptBR },
            'pt': { common: ptBR },
            'en': { common: en },
            'en-US': { common: en },
            'es': { common: es },
            'es-ES': { common: es },
            'de': { common: de },
            'de-DE': { common: de },
        },
        defaultNS: 'common',
        fallbackLng: 'pt-BR',
        interpolation: { escapeValue: false },
        detection: {
            order: ['querystring', 'cookie', 'localStorage', 'navigator'],
            caches: ['localStorage', 'cookie'],
        },
    });

export function I18nProvider({ children }: { children: ReactNode }) {
    return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
