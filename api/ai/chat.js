// POST /api/ai/chat di Vercel: proxy streaming SSE ke penyedia AI.
const proxy = require('../../lib/ai-proxy');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return proxy.sendJson(res, 405, { error: 'Metode tidak didukung' });
  return proxy.handleChat(req, res);
};
