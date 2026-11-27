// Proxy AI Chatku yang dipakai dua tempat: server.js dan fungsi Vercel di api/.
// Cocok untuk Node http biasa maupun runtime Node Vercel (yang sudah mem-parse body JSON).

const DEFAULT_BASE_URL = 'https://api.runcrate.ai/v1';
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const MAX_AI_BODY = 512 * 1024;

// Vercel Hobby mematikan fungsi setelah 60 detik, jadi kita berhenti lebih dulu
// supaya klien menerima jawaban yang jelas, bukan sambungan yang putus mendadak.
const VERCEL_TIMEOUT_MS = 55000;

// Dibaca per permintaan, bukan saat modul dimuat, agar variabel lingkungan
// (termasuk Environment Variables Vercel) langsung terpakai.
function config() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || (process.env.VERCEL ? VERCEL_TIMEOUT_MS : 120000),
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function safeHost(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return '';
  }
}

function sendConfig(res) {
  const { apiKey, baseUrl, model } = config();
  return sendJson(res, 200, {
    configured: Boolean(apiKey && baseUrl),
    model,
    baseUrl: safeHost(baseUrl),
  });
}

async function readBody(req, limit) {
  // Vercel sudah mengisi req.body untuk content-type JSON.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body) > limit) throw Object.assign(new Error('Permintaan terlalu besar'), { status: 413 });
      return JSON.parse(req.body);
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Permintaan terlalu besar'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function providerMessage(raw, status) {
  const text = String(raw || '').trim();
  try {
    const data = JSON.parse(text);
    const detail = data?.error?.message || data?.error || data?.message;
    if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 600);
  } catch {
    // Bukan JSON: body mentah lebih berguna daripada tidak ada apa-apa.
  }
  return text.slice(0, 600) || `Penyedia AI menolak permintaan (HTTP ${status})`;
}

// Meneruskan SSE penyedia apa adanya supaya browser bisa mengetik token per token.
async function handleChat(req, res) {
  const { apiKey, baseUrl, model, timeoutMs } = config();
  if (!apiKey || !baseUrl) {
    return sendJson(res, 503, {
      error: 'Proxy AI server belum lengkap: isi AI_API_KEY dan AI_BASE_URL di berkas .env atau di variabel lingkungan (termasuk Environment Variables Vercel), atau pakai Pengaturan AI di aplikasi.',
    });
  }

  let body;
  try {
    body = await readBody(req, MAX_AI_BODY);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.status === 413 ? 'Permintaan terlalu besar' : 'Body JSON tidak valid' });
  }

  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter(item => item && typeof item.content === 'string' && ['system', 'user', 'assistant'].includes(item.role))
        .slice(-40)
    : [];
  if (!messages.length) return sendJson(res, 400, { error: 'messages kosong' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  res.on('close', () => {
    clearTimeout(timer);
    controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const reason = error.name === 'AbortError'
      ? 'Penyedia AI tidak menjawab dalam batas waktu'
      : `Tidak bisa menghubungi ${safeHost(baseUrl)}`;
    return sendJson(res, 502, { error: `${reason}. Periksa AI_BASE_URL dan koneksi server.` });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const detail = await upstream.text().catch(() => '');
    return sendJson(res, upstream.status || 502, { error: providerMessage(detail, upstream.status) });
  }

  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of upstream.body) {
      if (res.writableEnded) break;
      res.write(chunk);
    }
  } catch {
    // Klien memutus sambungan atau penyedia menghentikan aliran di tengah jawaban.
  } finally {
    clearTimeout(timer);
    if (!res.writableEnded) res.end();
  }
}

module.exports = { config, sendJson, sendConfig, handleChat, DEFAULT_MODEL };
