module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2021: true
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    extends: ['eslint:recommended'],
    ignorePatterns: ['dist/', 'node_modules/'],
    rules: {
        'no-unused-vars': 'off',
        'no-undef': 'off'
    }
};
