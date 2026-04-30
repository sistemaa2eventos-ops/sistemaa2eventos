const DigestFetch = require('digest-fetch').default || require('digest-fetch');

try {
    const client = new DigestFetch('user', 'pass');
    console.log('DigestFetch instantiated successfully');
} catch (error) {
    console.error('Error instantiating DigestFetch:', error.message);
}
