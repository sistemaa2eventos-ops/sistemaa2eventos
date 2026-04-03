require('dotenv').config();
const { getConnection } = require('./src/config/database');

getConnection().then(async conn => {
    try {
        const result = await conn.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'system_settings'");
        console.log("COLUMNS IN system_settings:");
        console.log(result.recordset.map(r => r.COLUMN_NAME));

        // Tentando adicionar a coluna que possivelmente falhou manualmente para capturar o erro
        await conn.request().query("ALTER TABLE system_settings ADD syslog_retention_edge_days INT DEFAULT 30;");
        console.log("syslog_retention_edge_days added successfully on retry.");
    } catch (err) {
        console.error("ERROR:", err.message);
    }
    process.exit(0);
});
