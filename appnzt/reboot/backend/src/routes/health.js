const express = require('express');
const router = express.Router();
const pkg = require('../../package.json');

router.get('/', (req, res) => {
  res.json({ service: 'a2-eventos-backend', version: pkg.version || '0.1.0', uptime: process.uptime() });
});

module.exports = router;
