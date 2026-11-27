import {
  DEFAULT_MODEL,
  aiStatus,
  buildMessages,
  clearHistory,
  extractCode,
  readHistory,
  readSettings,
  streamChat,
  writeHistory,
  writeSettings,
} from './ai.js';

const QUICK_PROMPTS = [
  { label: 'Logo reveal', text: 'Buat logo reveal 5 detik: lingkaran aksen tumbuh dengan spring, nama brand muncul dari bawah. Latar gelap.' },
  { label: 'Caption bergerak', text: 'Buat caption bergerak 9:16 durasi 8 detik dengan empat baris teks yang masuk bergantian, teks besar dan mudah dibaca di ponsel.' },
  { label: 'Data viz', text: 'Buat video bar chart 5 detik yang batangnya tumbuh satu per satu dengan angka di atas tiap batang.' },
  { label: 'Intro produk', text: 'Buat intro produk 10 detik dengan tiga adegan: nama, tiga keunggulan, lalu penutup. Gaya bersih, satu warna aksen.' },
];

export function initAiPage(api) {
  const $ = id => document.getElementById(id);
  const log = $('chatLog');
  const form = $('chatForm');
  const input = $('chatInput');
  const sendBtn = $('chatSend');
  const stopBtn = $('chatStop');
  const statusEl = $('aiStatus');
  const hintEl = $('aiSetupHint');
  const skillRow = $('skillChips');
  const dialog = $('aiDialog');

  let messages = readHistory();
  let skills = [];
  let activeSkills = new Set();
  let sending = false;
  let controller = null;
  let status = { ready: false, text: 'Memeriksa AI…' };

  function setStatus(next) {
    status = next;
    statusEl.textContent = next.text;
    statusEl.classList.toggle('is-off', !next.ready);
    hintEl.hidden = next.ready;
  }

  async function refreshStatus() {
    try {
      setStatus(await aiStatus());
    } catch {
      setStatus({ ready: false, text: 'AI tidak bisa diperiksa' });
    }
  }

  function scrollToEnd() {
    log.scrollTop = log.scrollHeight;
  }

  function formatContent(text) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    const fence = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;
    let match;

    while ((match = fence.exec(text)) !== null) {
      const prose = text.slice(cursor, match.index).trim();
      if (prose) {
        const p = document.createElement('p');
        p.textContent = prose;
        fragment.appendChild(p);
      }
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = match[2].trim();
      pre.appendChild(code);
      fragment.appendChild(pre);
      cursor = match.index + match[0].length;
    }

    const rest = text.slice(cursor).trim();
    if (rest) {
      const p = document.createElement('p');
      p.textContent = rest;
      fragment.appendChild(p);
    }
    return fragment;
  }

  function messageActions(message) {
    const code = message.code || extractCode(message.content);
    if (!code) return null;

    const row = document.createElement('div');
    row.className = 'msg__actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn--tonal';
    applyBtn.innerHTML = '<span class="ms" aria-hidden="true">code</span> Pakai kode';
    applyBtn.addEventListener('click', () => {
      api.applyCode(code);
      api.toast('Kode AI dipasang di editor', 'success', 'smart_toy');
    });

    const renderBtn = document.createElement('button');
    renderBtn.type = 'button';
    renderBtn.className = 'btn btn--filled';
    renderBtn.innerHTML = '<span class="ms" aria-hidden="true">movie</span> Render';
    renderBtn.addEventListener('click', () => {
      api.applyCode(code);
      api.renderNow();
    });

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'icon-btn';
    copyBtn.title = 'Salin kode';
    copyBtn.setAttribute('aria-label', 'Salin kode');
    copyBtn.innerHTML = '<span class="ms" aria-hidden="true">content_copy</span>';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        api.toast('Kode disalin', 'success', 'content_copy');
      } catch {
        api.toast('Browser menolak akses clipboard', 'warn', 'content_copy');
      }
    });

    row.append(applyBtn, renderBtn, copyBtn);
    return row;
  }

  function messageNode(message, index) {
    const article = document.createElement('article');
    article.className = `msg msg--${message.role}`;

    const role = document.createElement('div');
    role.className = 'msg__role';
    role.textContent = message.role === 'user' ? 'Kamu' : 'AI Chatku';

    const body = document.createElement('div');
    body.className = 'msg__body';
    if (message.pending && !message.content) {
      body.appendChild(typingDots());
    } else {
      body.appendChild(formatContent(message.content || ''));
    }

    article.append(role, body);

    const actions = messageActions(message);
    if (actions) article.appendChild(actions);

    if (message.error) article.classList.add('msg--error');
    article.dataset.index = String(index);
    return article;
  }

  function typingDots() {
    const box = document.createElement('span');
    box.className = 'typing';
    box.setAttribute('aria-label', 'AI sedang menulis');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      box.appendChild(dot);
    }
    return box;
  }

  function renderMessages() {
    log.innerHTML = '';
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<span class="ms" aria-hidden="true">smart_toy</span>'
        + '<div class="empty__title">Mulai dari sebuah kalimat</div>'
        + '<p class="body">Contoh: "buat logo reveal 5 detik dengan warna ungu".</p>';
      log.appendChild(empty);
      return;
    }
    messages.forEach((message, index) => log.appendChild(messageNode(message, index)));
    scrollToEnd();
  }

  function appendPending() {
    const article = document.createElement('article');
    article.className = 'msg msg--assistant';
    article.id = 'msgPending';

    const role = document.createElement('div');
    role.className = 'msg__role';
    role.textContent = 'AI Chatku';

    const body = document.createElement('div');
    body.className = 'msg__body';
    body.appendChild(typingDots());

    article.append(role, body);
    log.appendChild(article);
    if (log.querySelector('.empty')) log.querySelector('.empty').remove();
    scrollToEnd();
    return article;
  }

  function setBusy(value) {
    sending = value;
    sendBtn.disabled = value;
    stopBtn.hidden = !value;
    input.disabled = value;
    form.classList.toggle('is-busy', value);
  }

  async function loadSkillText(ids) {
    const chosen = skills.filter(skill => ids.has(skill.id));
    const loaded = await Promise.all(chosen.map(async skill => {
      try {
        const response = await fetch(`skills/${skill.file}`, { cache: 'no-store' });
        if (!response.ok) return null;
        return { ...skill, text: await response.text() };
      } catch {
        return null;
      }
    }));
    return loaded.filter(Boolean);
  }

  async function send(text) {
    if (sending) return;
    const prompt = text.trim();
    if (!prompt) return;

    messages.push({ role: 'user', content: prompt });
    messages = writeHistory(messages);
    renderMessages();

    const pending = appendPending();
    const historyForPrompt = messages.slice(0, -1);
    setBusy(true);
    controller = new AbortController();

    let answer = '';
    let frame = null;

    const paint = () => {
      frame = null;
      const body = pending.querySelector('.msg__body');
      if (!body) return;
      body.innerHTML = '';
      body.appendChild(formatContent(answer || ''));
      scrollToEnd();
    };

    try {
      const skillDocs = await loadSkillText(activeSkills);
      const payload = buildMessages({
        skills: skillDocs,
        history: historyForPrompt,
        currentCode: api.getCode(),
        userText: prompt,
      });

      await streamChat({
        messages: payload,
        model: readSettings().model || DEFAULT_MODEL,
        signal: controller.signal,
        onDelta: delta => {
          answer += delta;
          if (!frame) frame = requestAnimationFrame(paint);
        },
      });

      if (!answer.trim()) throw new Error('AI mengirim jawaban kosong');
      messages.push({ role: 'assistant', content: answer, code: extractCode(answer) || undefined });
      messages = writeHistory(messages);
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      const message = aborted
        ? 'Dihentikan. Jawaban sebagian disimpan.'
        : `Gagal: ${error.message}`;
      if (answer.trim()) {
        messages.push({ role: 'assistant', content: answer, code: extractCode(answer) || undefined });
      }
      messages.push({ role: 'assistant', content: message, error: true });
      messages = writeHistory(messages);
      if (!aborted) api.toast(message, 'error', 'error');
    } finally {
      if (frame) cancelAnimationFrame(frame);
      controller = null;
      setBusy(false);
      renderMessages();
      input.focus();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    autoGrow();
    send(text);
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(160, input.scrollHeight)}px`;
  }
  input.addEventListener('input', autoGrow);

  stopBtn.addEventListener('click', () => {
    controller?.abort();
  });

  $('chatClear').addEventListener('click', () => {
    if (!messages.length) return;
    clearHistory();
    messages = [];
    renderMessages();
    api.toast('Riwayat chat dihapus', 'warn', 'delete');
  });

  function renderQuickPrompts() {
    const row = $('aiQuick');
    row.innerHTML = '';
    QUICK_PROMPTS.forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--prompt';
      chip.textContent = item.label;
      chip.addEventListener('click', () => {
        input.value = item.text;
        autoGrow();
        input.focus();
      });
      row.appendChild(chip);
    });
  }

  async function loadSkills() {
    try {
      const response = await fetch('skills/index.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      skills = await response.json();
    } catch {
      skills = [];
    }

    activeSkills = new Set(skills.map(skill => skill.id));
    skillRow.innerHTML = '';

    if (!skills.length) {
      skillRow.appendChild(document.createTextNode('Daftar skill tidak bisa dimuat.'));
      return;
    }

    skills.forEach(skill => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = skill.name;
      chip.title = skill.description || '';
      chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', () => {
        const pressed = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', String(!pressed));
        if (pressed) activeSkills.delete(skill.id);
        else activeSkills.add(skill.id);
      });
      skillRow.appendChild(chip);
    });
  }

  function fillDialog() {
    const settings = readSettings();
    $('aiBase').value = settings.baseUrl || '';
    $('aiKey').value = settings.apiKey || '';
    $('aiModel').value = settings.model || DEFAULT_MODEL;
  }

  $('aiConfigure').addEventListener('click', () => {
    fillDialog();
    dialog.showModal();
  });

  $('aiSave').addEventListener('click', async event => {
    event.preventDefault();
    writeSettings({
      baseUrl: $('aiBase').value.trim(),
      apiKey: $('aiKey').value.trim(),
      model: $('aiModel').value.trim() || DEFAULT_MODEL,
    });
    dialog.close();
    await refreshStatus();
    api.toast(status.ready ? 'Pengaturan AI disimpan' : 'Pengaturan disimpan, tapi kunci belum lengkap', status.ready ? 'success' : 'warn', 'settings');
  });

  $('aiCancel').addEventListener('click', () => dialog.close());

  renderQuickPrompts();
  renderMessages();
  loadSkills();
  refreshStatus();
  autoGrow();

  return { refreshStatus };
}
