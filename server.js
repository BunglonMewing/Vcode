const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

loadEnvFile(path.join(__dirname, '.env'));

const ROOT = path.join(__dirname, 'public');
const OUTPUT = path.join(__dirname, 'output');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_UPLOAD = 250 * 1024 * 1024;

const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.runcrate.ai/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 120000;
const MAX_AI_BODY = 512 * 1024;

// Minimal .env reader so the server needs no dependencies.
function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

fs.mkdirSync(OUTPUT, { recursive: true });

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

async function sendFile(req, res, filePath, { type, downloadName = null } = {}) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw Object.assign(new Error('Bukan file'), { code: 'ENOENT' });

  const headers = {
    'Content-Type': type || MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': downloadName ? 'no-store' : 'no-cache',
  };
  if (downloadName) {
    const ascii = downloadName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    headers['Content-Disposition'] = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }

  // Range support keeps seeking inside <video> working.
  const range = req.headers.range;
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match) {
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!match[1] && match[2]) {
      start = Math.max(0, stat.size - Number(match[2]));
      end = stat.size - 1;
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return res.end();
    return createReadStreamSafe(filePath, res, { start, end });
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  return createReadStreamSafe(filePath, res, {});
}

function createReadStreamSafe(filePath, res, options) {
  const stream = fs.createReadStream(filePath, options);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function serveStatic(req, res, pathname) {
  let relative = pathname;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return sendText(res, 400, 'Path tidak valid');
  }
  if (relative.endsWith('/')) relative += 'index.html';

  const filePath = path.resolve(ROOT, `.${relative}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, 'Akses ditolak');
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) return serveStatic(req, res, `${relative}/`);
  } catch {
    return sendText(res, 404, 'Tidak ditemukan');
  }

  return sendFile(req, res, filePath);
}

async function listVideos() {
  const entries = await fsp.readdir(OUTPUT, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(mp4|webm)$/i.test(entry.name)) continue;
    const stat = await fsp.stat(path.join(OUTPUT, entry.name)).catch(() => null);
    if (stat) files.push({ name: entry.name, size: stat.size, mtime: stat.mtimeMs });
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function safeVideoName(raw) {
  const base = String(raw || 'video').split(/[\\/]/).pop();
  const cleaned = base.replace(/[^\w.-]+/g, '-').replace(/^[-.]+/, '').slice(0, 64) || 'video';
  const ext = /\.webm$/i.test(cleaned) ? '.webm' : '.mp4';
  const stem = cleaned.replace(/\.(mp4|webm)$/i, '') || 'video';
  return `${stem}${ext}`;
}

async function uniqueName(name) {
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  let candidate = name;
  for (let i = 1; i < 200; i++) {
    try {
      await fsp.access(path.join(OUTPUT, candidate));
      candidate = `${stem}-${i}${ext}`;
    } catch {
      return candidate;
    }
  }
  throw new Error('Tidak bisa membuat nama file unik');
}

async function handleUpload(req, res) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD) return sendJson(res, 413, { error: 'File melebihi 250 MB' });

  const name = await uniqueName(safeVideoName(req.headers['x-filename']));
  const finalPath = path.join(OUTPUT, name);
  const tempPath = `${finalPath}.part`;

  let received = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_UPLOAD) return callback(new Error('File melebihi 250 MB'));
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, counter, fs.createWriteStream(tempPath));
    if (!received) throw new Error('Body kosong');
    await fsp.rename(tempPath, finalPath);
  } catch (error) {
    await fsp.unlink(tempPath).catch(() => {});
    return sendJson(res, error.message.includes('250 MB') ? 413 : 400, { error: error.message });
  }

  const stat = await fsp.stat(finalPath);
  return sendJson(res, 201, { name, size: stat.size, mtime: stat.mtimeMs });
}

function safeHost(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return '';
  }
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Permintaan terlalu besar'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function providerMessage(raw, status) {
  const text = String(raw || '').trim();
  try {
    const data = JSON.parse(text);
    const detail = data?.error?.message || data?.error || data?.message;
    if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 600);
  } catch {
    // Not JSON: the raw body is more useful than nothing.
  }
  return text.slice(0, 600) || `Penyedia AI menolak permintaan (HTTP ${status})`;
}

// Streams the provider's SSE straight through so the browser can type out tokens.
async function handleAiChat(req, res) {
  if (!AI_API_KEY || !AI_BASE_URL) {
    return sendJson(res, 503, {
      error: 'Proxy AI server belum lengkap: isi AI_API_KEY dan AI_BASE_URL di berkas .env, atau pakai Pengaturan AI di aplikasi.',
    });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_AI_BODY));
  } catch (error) {
    return sendJson(res, error.status || 400, { error: 'Body JSON tidak valid' });
  }

  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter(item => item && typeof item.content === 'string' && ['system', 'user', 'assistant'].includes(item.role))
        .slice(-40)
    : [];
  if (!messages.length) return sendJson(res, 400, { error: 'messages kosong' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  res.on('close', () => {
    clearTimeout(timer);
    controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : AI_MODEL,
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
      : `Tidak bisa menghubungi ${safeHost(AI_BASE_URL)}`;
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
    // Client disconnected or the provider cut the stream mid-answer.
  } finally {
    clearTimeout(timer);
    if (!res.writableEnded) res.end();
  }
}

async function handleDelete(req, res, name) {
  const base = path.basename(name);
  if (base !== name || !/\.(mp4|webm)$/i.test(base)) {
    return sendJson(res, 400, { error: 'Nama file tidak valid' });
  }
  try {
    await fsp.unlink(path.join(OUTPUT, base));
  } catch (error) {
    if (error.code === 'ENOENT') return sendJson(res, 404, { error: 'Video tidak ada' });
    throw error;
  }
  return sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendText(res, 400, 'Permintaan tidak valid');
  }
  const { pathname } = url;

  try {
    if (pathname === '/api/ai/config') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Metode tidak didukung' });
      return sendJson(res, 200, {
        configured: Boolean(AI_API_KEY && AI_BASE_URL),
        model: AI_MODEL,
        baseUrl: safeHost(AI_BASE_URL),
      });
    }

    if (pathname === '/api/ai/chat') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metode tidak didukung' });
      return await handleAiChat(req, res);
    }

    if (pathname === '/api/videos') {
      if (req.method === 'GET') return sendJson(res, 200, await listVideos());
      if (req.method === 'POST') return await handleUpload(req, res);
      return sendJson(res, 405, { error: 'Metode tidak didukung' });
    }

    if (pathname.startsWith('/api/videos/') && req.method === 'DELETE') {
      return await handleDelete(req, res, decodeURIComponent(pathname.slice('/api/videos/'.length)));
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname.startsWith('/output/')) {
        const name = path.basename(decodeURIComponent(pathname.slice('/output/'.length)));
        if (!/\.(mp4|webm)$/i.test(name)) return sendText(res, 404, 'Tidak ditemukan');
        const download = url.searchParams.get('download') ? name : null;
        try {
          return await sendFile(req, res, path.join(OUTPUT, name), { downloadName: download });
        } catch (error) {
          if (error.code === 'ENOENT') return sendText(res, 404, 'Tidak ditemukan');
          throw error;
        }
      }
      return await serveStatic(req, res, pathname);
    }

    return sendJson(res, 405, { error: 'Metode tidak didukung' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: error.message || 'Kesalahan server' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Code → Video: http://localhost:${PORT}`);
  console.log(`Video disimpan di ${OUTPUT}`);
});
