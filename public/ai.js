// AI transport for AI Chatku: talks to the Node proxy when one is configured,
// otherwise straight to an OpenAI-compatible endpoint with a key kept on device.

const SETTINGS_KEY = 'codevideo.ai.v1';
const HISTORY_KEY = 'codevideo.ai.chat.v1';
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';
const MAX_HISTORY = 40;

export function readSettings() {
  const fallback = { baseUrl: '', apiKey: '', model: DEFAULT_MODEL };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...fallback, ...raw };
  } catch {
    return fallback;
  }
}

export function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the caller still gets the merged values.
  }
  return next;
}

export function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function serverConfig() {
  try {
    const response = await fetch('api/ai/config', { cache: 'no-store', signal: timeoutSignal(4000) });
    if (!response.ok) return { configured: false };
    return await response.json();
  } catch {
    return { configured: false };
  }
}

// Device settings win when both fields are filled, so a wrong server default
// can never block the chat; otherwise the server proxy takes over.
export async function resolveTransport() {
  const settings = readSettings();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  if (settings.apiKey && baseUrl) {
    return { mode: 'direct', model: settings.model || DEFAULT_MODEL, baseUrl, apiKey: settings.apiKey, label: 'perangkat' };
  }
  const server = await serverConfig();
  if (server.configured) {
    return { mode: 'server', model: server.model || settings.model || DEFAULT_MODEL, label: 'server' };
  }
  return { mode: 'none', model: settings.model || DEFAULT_MODEL };
}

function describeStatus(transport) {
  if (transport.mode === 'server') return { ready: true, text: `AI siap · proxy server · ${transport.model}` };
  if (transport.mode === 'direct') return { ready: true, text: `AI siap · perangkat · ${transport.model}` };
  return { ready: false, text: 'AI belum dikonfigurasi' };
}

export async function aiStatus() {
  return describeStatus(await resolveTransport());
}

async function readError(response) {
  const text = await response.text().catch(() => '');
  try {
    const data = JSON.parse(text);
    const detail = data?.error?.message || data?.error || data?.message;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
  } catch {
    // Not JSON: fall through to the raw body.
  }
  return text.trim().slice(0, 400) || `HTTP ${response.status}`;
}

async function* sseLines(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) yield line;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

export async function streamChat({ messages, model, signal, onDelta }) {
  const transport = await resolveTransport();
  if (transport.mode === 'none') {
    throw new Error('Belum ada kunci AI. Buka Pengaturan AI dan isi base URL serta API key.');
  }

  let url;
  let headers = { 'Content-Type': 'application/json' };
  if (transport.mode === 'server') {
    url = 'api/ai/chat';
  } else {
    url = `${transport.baseUrl}/chat/completions`;
    headers.Authorization = `Bearer ${transport.apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || transport.model,
      messages,
      stream: true,
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) throw new Error(await readError(response));

  const type = response.headers.get('content-type') || '';

  if (type.includes('application/json')) {
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || data?.content || '';
    if (text) onDelta?.(text);
    return text;
  }

  let full = '';
  for await (const line of sseLines(response.body)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    const delta = parsed?.choices?.[0]?.delta?.content
      ?? parsed?.choices?.[0]?.message?.content
      ?? parsed?.delta
      ?? '';
    if (delta) {
      full += delta;
      onDelta?.(delta);
    }
  }

  return full;
}

export function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list.filter(item => item && typeof item.content === 'string') : [];
  } catch {
    return [];
  }
}

export function writeHistory(messages) {
  const trimmed = messages.slice(-MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors; the conversation still works in memory.
  }
  return trimmed;
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to clear.
  }
}

const CODE_FENCE = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;

export function extractCode(text) {
  if (typeof text !== 'string') return null;
  const blocks = [];
  let match;
  CODE_FENCE.lastIndex = 0;
  while ((match = CODE_FENCE.exec(text)) !== null) {
    const language = (match[1] || '').toLowerCase();
    const body = match[2].trim();
    if (!body) continue;
    blocks.push({ language, body });
  }
  if (!blocks.length) return null;

  const preferred = blocks.find(block => ['js', 'javascript', 'mjs', 'jsx'].includes(block.language))
    || blocks.find(block => !!block.language === false)
    || blocks[blocks.length - 1];
  return preferred.body;
}

const BASE_PROMPT = `Kamu adalah mesin composition untuk aplikasi "Code → Video". Aplikasi ini menggambar
setiap frame ke canvas 2D lalu meng-encode-nya jadi MP4 di browser.

Kontrak composition (body fungsi):
- Variabel tersedia: ctx (CanvasRenderingContext2D), t (detik), W, H (piksel), D (durasi detik), P (props).
- Helper tersedia langsung: interpolate(), spring(), Easing, Sequence(), random(), clamp(), lerp().
- FPS tersedia sebagai konstanta angka. frame = Math.round(t * FPS).
- Props dideklarasikan di baris pertama: /* props [ {"key","label","type","value"} ] */ dengan type
  text | color | range | number | checkbox.
- Metadata opsional: /* meta {"duration":6,"fps":30,"ratio":"16:9","width":1080} */.

Aturan keras:
1. Deterministik: hanya bergantung pada t/frame. Tanpa Math.random(), Date, performance.
2. Render harus mulai dari latar penuh, tidak bergantung frame sebelumnya.
3. Semua ukuran relatif terhadap W, H, atau U = Math.min(W, H).
4. Reset globalAlpha, shadow, filter, letterSpacing setelah dipakai.
5. Dilarang: import, require, fetch, document, window, Image dari URL luar.
6. Jangan mendeklarasikan ulang ctx, t, W, H, D, P, atau FPS.

Format jawaban:
- Satu blok kode JavaScript yang siap ditempel, lalu maksimal tiga kalimat penjelasan.
- Blok kode pertama harus lengkap dan bisa dirender tanpa edit.`;

export function buildMessages({ skills, history, currentCode, userText }) {
  const parts = [BASE_PROMPT];

  for (const skill of skills) {
    parts.push(`\n--- SKILL: ${skill.name} ---\n${skill.text.trim()}`);
  }

  if (currentCode && currentCode.trim()) {
    parts.push(`\n--- COMPOSITION SAAT INI DI EDITOR ---\n${currentCode.trim().slice(0, 6000)}`);
  }

  const system = { role: 'system', content: parts.join('\n') };
  const turns = history.slice(-16).map(item => ({ role: item.role, content: item.content }));
  return [system, ...turns, { role: 'user', content: userText }];
}
