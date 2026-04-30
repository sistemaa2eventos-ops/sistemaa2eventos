const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path = require('path');

i18next
    .use(Backend)
    .use(middleware.LanguageDetector)
    .init({
        fallbackLng: 'pt-BR',
        supportedLngs: ['pt-BR', 'en', 'es', 'de'],
        preload: ['pt-BR', 'en', 'es', 'de'],
        backend: {
            loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json')
        },
        detection: {
            order: ['header', 'querystring', 'cookie'],
            caches: false, // Dont cache on backend
            lookupHeader: 'accept-language'
        }
    });

module.exports = { i18next, middleware };
