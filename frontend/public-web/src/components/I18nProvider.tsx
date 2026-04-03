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
            en: { common: en },
            es: { common: es },
            de: { common: de },
        },
        defaultNS: 'common',
        lng: 'pt-BR', // Default language. Can be dynamic based on detection
        fallbackLng: 'pt-BR',
        interpolation: { escapeValue: false },
    });

export function I18nProvider({ children }: { children: ReactNode }) {
    return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
}
