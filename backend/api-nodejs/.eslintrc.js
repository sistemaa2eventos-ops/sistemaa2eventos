module.exports = {
    env: {
        node: true,
        es2021: true,
        jest: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 12
    },
    rules: {
        'no-console': 'off',
        'no-unused-vars': ['warn', {
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_'
        }],
        'no-undef': 'error',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'indent': ['error', 4],
        'comma-dangle': ['error', 'never']
    }
};