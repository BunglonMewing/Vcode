// GET /api/ai/config di Vercel: status konfigurasi tanpa membocorkan kunci.
const proxy = require('../../lib/ai-proxy');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return proxy.sendJson(res, 405, { error: 'Metode tidak didukung' });
  return proxy.sendConfig(res);
};
