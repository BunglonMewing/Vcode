const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ROOT = path.join(__dirname, 'public');
const OUTPUT = path.join(__dirname, 'output');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_UPLOAD = 250 * 1024 * 1024;

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
