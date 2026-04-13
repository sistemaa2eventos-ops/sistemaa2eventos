const df = require('digest-fetch');
console.log('Type of require("digest-fetch"):', typeof df);
console.log('Keys of require("digest-fetch"):', Object.keys(df));
if (df.default) {
    console.log('Type of require("digest-fetch").default:', typeof df.default);
}
