import { TEMPLATES } from './templates.js';
import { engineInfo, renderComposition, decodeAudio } from './render.js';
import { listVideos, saveVideo, removeVideo, videoUrl } from './gallery.js';
import { compileComposition, parseProps, parseMeta } from './compiler.js';
import { initAiPage } from './ai-page.js';

const $ = id => document.getElementById(id);
const canvas = $('cv');
const ctx = canvas.getContext('2d');

const TABS = ['editor', 'ai', 'render', 'gallery', 'saved', 'docs'];
const TITLES = { editor: 'Editor', ai: 'AI Chatku', render: 'Render', gallery: 'Galeri', saved: 'Tersimpan', docs: 'Dokumentasi' };
const TEMPLATE_NAMES = {
  particles: ['Partikel', '2D'],
  bars: ['Bar chart', '2D'],
  typewriter: ['Ketik', '2D'],
  wave: ['Gelombang', '2D'],
  pulse: ['Denyut', '2D'],
  reveal: ['Reveal (Remotion)', '2D'],
  cube: ['Kubus', '3D'],
  globe: ['Bola titik', '3D'],
  torus: ['Torus', '3D'],
};
const DEFAULT_TEMPLATE = 'particles';
const DEFAULT_CODE = TEMPLATES[DEFAULT_TEMPLATE];
const SAVED_KEY = 'codevideo.saved.v1';
const RATIOS = { '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:5': [4, 5] };
const QUALITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
const DURATION_WARN = 120;

const state = { size: 720, ratio: '1:1', fps: 30, dur: 5, quality: 'medium' };
let propValues = {};
let schemaSignature = null;
let busy = false;
let previewFrame = null;
let renderController = null;
let audio = null;
let resultUrl = null;
let aiPage = null;

function dims() {
  const [rw, rh] = RATIOS[state.ratio];
  let width, height;
  if (rw >= rh) {
    width = state.size;
    height = state.size * rh / rw;
  } else {
    height = state.size;
    width = state.size * rw / rh;
  }
  return {
    width: Math.round(width / 2) * 2,
    height: Math.round(height / 2) * 2,
    fps: state.fps,
    duration: state.dur,
  };
}

function refreshInfo() {
  const d = dims();
  $('dims').textContent = `${d.width}×${d.height}`;
  $('frames').textContent = String(Math.round(d.duration * d.fps));
  $('qLabel').textContent = QUALITY_LABEL[state.quality];

  const hint = $('hint');
  hint.hidden = state.size < 1440;
  hint.querySelector('span:last-child').textContent = state.size >= 2160
    ? '4K butuh memori besar. Turunkan resolusi atau kualitas jika render gagal.'
    : 'Resolusi 1440p ke atas lebih berat untuk browser.';

  refreshDurationWarn(state.dur);
  refreshAudioNote();
}

function refreshDurationWarn(value) {
  const warn = $('durWarn');
  const over = Number.isFinite(value) && value > DURATION_WARN;
  warn.hidden = !over;
  if (over) {
    warn.querySelector('span:last-child').textContent =
      `Durasi ${value} detik melewati ${DURATION_WARN} detik. Render akan lama dan memori browser bisa penuh.`;
  }
}

function activeTab() {
  const name = location.hash.replace('#', '');
  return TABS.includes(name) ? name : 'editor';
}

function showTab() {
  const tab = activeTab();
  TABS.forEach(name => {
    $(`page-${name}`).hidden = name !== tab;
    const link = document.querySelector(`.nav-item[data-tab="${name}"]`);
    if (name === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = TITLES[tab];
  if (tab !== 'render') stopPreview();
  if (tab === 'gallery') loadGallery();
  if (tab === 'saved') renderSaved();
  if (tab === 'docs') loadDocs();
  if (tab === 'ai') aiPage?.refreshStatus();
  window.scrollTo(0, 0);
}

const SNACK_ICON = { success: 'check_circle', error: 'error', warn: 'warning', info: 'info' };

function toast(message, type = 'info', icon = null) {
  const host = $('snackbars');
  host.querySelectorAll('.snack').forEach(node => node.remove());

  const snack = document.createElement('div');
  snack.className = 'snack';
  const mark = document.createElement('span');
  mark.className = 'ms';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = icon || SNACK_ICON[type] || 'info';
  const text = document.createElement('span');
  text.textContent = message;
  snack.append(mark, text);
  host.appendChild(snack);

  setTimeout(() => {
    snack.classList.add('is-out');
    setTimeout(() => snack.remove(), 200);
  }, 3600);
}

function ask({ title, text, icon = 'info', okText = 'OK', danger = false, input = null }) {
  const dialog = $('dialog');
  const iconBox = $('mIcon');
  iconBox.className = `dialog__icon${danger ? ' is-error' : ''}`;
  iconBox.innerHTML = `<span class="ms" aria-hidden="true">${icon}</span>`;
  $('mTitle').textContent = title;
  $('mText').textContent = text;
  $('mOk').textContent = okText;

  const field = $('mField');
  const inputEl = $('mInput');
  field.hidden = !input;
  if (input) {
    inputEl.value = input.value || '';
    inputEl.placeholder = ' ';
    $('mLabel').textContent = input.label || 'Nilai';
  }

  dialog.returnValue = '';
  dialog.showModal();
  if (input) {
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 30);
  }

  return new Promise(resolve => {
    const onKey = event => {
      if (event.key === 'Enter' && input) {
        event.preventDefault();
        dialog.close('ok');
      }
    };
    if (input) inputEl.addEventListener('keydown', onKey);

    dialog.addEventListener('close', () => {
      if (input) inputEl.removeEventListener('keydown', onKey);
      if (dialog.returnValue !== 'ok') return resolve(input ? null : false);
      resolve(input ? inputEl.value.trim() : true);
    }, { once: true });
  });
}

function selectChip(group, value) {
  document.querySelectorAll(`[data-group="${group}"] .chip`).forEach(chip => {
    chip.setAttribute('aria-pressed', String(chip.dataset.value === value));
  });

  if (group === 'size') state.size = Number(value);
  else if (group === 'ratio') state.ratio = value;
  else if (group === 'fps') state.fps = Number(value);
  else if (group === 'quality') state.quality = value;
  else if (group === 'dur') {
    $('customRow').hidden = value !== 'custom';
    if (value !== 'custom') state.dur = Number(value);
  }

  refreshInfo();
}

document.querySelectorAll('[data-group]').forEach(group => {
  const key = group.dataset.group;
  group.addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip || busy) return;
    if (key === 'dur' && chip.dataset.value === 'custom') {
      selectChip('dur', 'custom');
      $('durInput').focus();
      $('durInput').select();
      return;
    }
    selectChip(key, chip.dataset.value);
  });
});

function readCustomDuration(commit) {
  const input = $('durInput');
  const value = Number.parseFloat(input.value);

  if (Number.isFinite(value) && value > 0) {
    state.dur = commit ? Math.round(value * 10) / 10 : value;
    if (commit) input.value = String(state.dur);
  } else if (commit) {
    state.dur = 5;
    input.value = '5';
  }

  refreshDurationWarn(Number.isFinite(value) && value > 0 ? value : state.dur);
  refreshInfo();
}

$('durInput').addEventListener('input', () => readCustomDuration(false));
$('durInput').addEventListener('change', () => readCustomDuration(true));
$('durInput').addEventListener('blur', () => readCustomDuration(true));
$('durInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    $('durInput').blur();
  }
});

function formatDuration(seconds) {
  const rounded = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  const rest = (rounded - minutes * 60).toFixed(1);
  return minutes ? `${minutes}:${rest.padStart(4, '0')}` : `${rest} dtk`;
}

function refreshAudioNote() {
  if (!audio) return;
  const videoDuration = dims().duration;
  let message;
  if (audio.duration > videoDuration + 0.05) {
    message = `Audio ${formatDuration(audio.duration)} lebih panjang dari video ${formatDuration(videoDuration)}. Audio dipotong.`;
  } else if (audio.duration < videoDuration - 0.05) {
    message = `Audio ${formatDuration(audio.duration)} lebih pendek dari video ${formatDuration(videoDuration)}. Aktifkan loop agar berulang.`;
  } else {
    message = `Durasi audio dan video sama (${formatDuration(videoDuration)}).`;
  }
  $('loopNote').textContent = message;
}

function renderAudio() {
  $('audioEmpty').hidden = Boolean(audio);
  $('audioSet').hidden = !audio;
  if (audio) {
    $('audioName').textContent = audio.name;
    $('audioMeta').textContent = `${formatDuration(audio.duration)} · ${formatSize(audio.size)}`;
    $('loopAudio').checked = audio.loop;
  }
  refreshAudioNote();
}

$('pickAudio').onclick = () => $('audioFile').click();

$('audioFile').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) {
    toast('Ukuran audio maksimal 60 MB', 'error');
    return;
  }

  toast('Membaca audio…', 'info', 'hourglass_top');
  try {
    const buffer = await decodeAudio(file);
    audio = { name: file.name, size: file.size, duration: buffer.duration, buffer, loop: false };
    renderAudio();
    toast('Audio siap dipakai', 'success', 'music_note');
  } catch (error) {
    toast('Audio tidak bisa dibaca: ' + error.message, 'error');
  }
};

$('clearAudio').onclick = () => {
  audio = null;
  renderAudio();
};

$('loopAudio').onchange = () => {
  if (audio) audio.loop = $('loopAudio').checked;
  refreshAudioNote();
};

function buildTemplateSelect() {
  const select = $('tplSelect');
  select.innerHTML = '';

  const placeholder = new Option('Pilih template…', '');
  placeholder.disabled = true;
  select.appendChild(placeholder);

  [['2D', '2D — dua dimensi'], ['3D', '3D — tiga dimensi']].forEach(([group, label]) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    Object.keys(TEMPLATES).forEach(key => {
      const meta = TEMPLATE_NAMES[key];
      if (meta && meta[1] === group) optgroup.appendChild(new Option(meta[0], key));
    });
    select.appendChild(optgroup);
  });

  select.value = DEFAULT_TEMPLATE;
}

$('tplSelect').addEventListener('change', () => {
  const key = $('tplSelect').value;
  if (!key || busy) return;
  $('code').value = TEMPLATES[key];
  propValues = {};
  syncProps(true);
  toast(`Template "${TEMPLATE_NAMES[key][0]}" dimuat`, 'success', 'dashboard_customize');
});

function emptyState(icon, title, text) {
  const box = document.createElement('div');
  box.className = 'empty';

  const mark = document.createElement('span');
  mark.className = 'ms';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = icon;

  const heading = document.createElement('div');
  heading.className = 'empty__title';
  heading.textContent = title;

  box.append(mark, heading);

  if (text) {
    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = text;
    box.appendChild(body);
  }
  return box;
}

function renderProps(schema) {
  const grid = $('propsGrid');
  grid.innerHTML = '';

  if (schema === null) {
    grid.appendChild(emptyState(
      'error',
      'Blok props bukan JSON valid',
      'Periksa tanda kutip dan koma di dalam blok /* props [...] */.',
    ));
    return;
  }

  if (!schema.length) {
    grid.appendChild(emptyState(
      'tune',
      'Composition ini belum punya props',
      'Tambahkan blok /* props [...] */ di baris pertama untuk memunculkan kontrol di sini.',
    ));
    return;
  }

  schema.forEach((item, index) => {
    const value = propValues[item.key];
    const id = `prop-${index}`;
    const type = item.type || 'text';
    const row = document.createElement('div');
    row.className = 'prop';

    if (type === 'range') {
      row.classList.add('prop--range');
      const top = document.createElement('div');
      top.className = 'prop__top';

      const label = document.createElement('label');
      label.className = 'prop__label';
      label.htmlFor = id;
      label.textContent = item.label || item.key;

      const output = document.createElement('span');
      output.className = 'prop__value';
      output.textContent = String(value);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = item.min ?? 0;
      input.max = item.max ?? 1;
      input.step = item.step ?? 'any';
      input.value = value;
      input.addEventListener('input', () => {
        const next = Number.parseFloat(input.value);
        propValues[item.key] = next;
        output.textContent = String(next);
      });

      top.append(label, output);
      row.append(top, input);
    } else if (type === 'checkbox') {
      const label = document.createElement('label');
      label.className = 'prop__label';
      label.htmlFor = id;
      label.textContent = item.label || item.key;

      const wrap = document.createElement('label');
      wrap.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = Boolean(value);
      input.addEventListener('change', () => {
        propValues[item.key] = input.checked;
      });
      const track = document.createElement('span');
      track.className = 'switch__track';
      track.setAttribute('aria-hidden', 'true');
      wrap.append(input, track);

      row.append(label, wrap);
    } else if (type === 'color') {
      const label = document.createElement('label');
      label.className = 'prop__label';
      label.htmlFor = id;
      label.textContent = item.label || item.key;

      const input = document.createElement('input');
      input.type = 'color';
      input.id = id;
      input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
      input.addEventListener('input', () => {
        propValues[item.key] = input.value;
      });

      row.append(label, input);
    } else {
      const label = document.createElement('label');
      label.className = 'prop__label';
      label.htmlFor = id;
      label.textContent = item.label || item.key;

      const input = document.createElement('input');
      input.id = id;
      input.className = 'prop__input';
      input.type = type === 'number' ? 'number' : 'text';
      if (type === 'number') input.step = item.step ?? 'any';
      else input.maxLength = 200;
      input.value = value ?? '';
      input.addEventListener('input', () => {
        propValues[item.key] = type === 'number' ? Number.parseFloat(input.value) : input.value;
      });

      row.append(label, input);
    }

    grid.appendChild(row);
  });
}

function syncProps(force = false) {
  const schema = parseProps($('code').value);
  const signature = JSON.stringify(schema);
  if (!force && signature === schemaSignature) return;
  schemaSignature = signature;

  if (schema === null) {
    renderProps(null);
    return;
  }

  const next = {};
  schema.forEach(item => {
    next[item.key] = item.key in propValues ? propValues[item.key] : item.value;
  });
  propValues = next;
  renderProps(schema);
}

let codeTimer = null;
$('code').addEventListener('input', () => {
  clearTimeout(codeTimer);
  codeTimer = setTimeout(() => syncProps(), 350);
});

$('resetProps').onclick = async () => {
  const confirmed = await ask({
    title: 'Kembalikan props?',
    text: 'Semua nilai props kembali ke default dari kode.',
    icon: 'settings_backup_restore',
    okText: 'Kembalikan',
  });
  if (!confirmed) return;
  propValues = {};
  syncProps(true);
  toast('Props dikembalikan ke default', 'warn', 'settings_backup_restore');
};

function compile(code) {
  return compileComposition(code).draw;
}

function applyDuration(value) {
  const seconds = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  if (['3', '5', '10'].includes(String(seconds))) {
    selectChip('dur', String(seconds));
    return;
  }
  selectChip('dur', 'custom');
  $('durInput').value = String(seconds);
  readCustomDuration(true);
}

// Applies code coming from the AI chat, including the optional /* meta */ block.
function applyCode(code) {
  const value = String(code || '').trim();
  if (!value) return;

  $('code').value = value;
  $('tplSelect').value = '';
  propValues = {};

  const meta = parseMeta(value);
  if (meta.duration) applyDuration(meta.duration);
  if (meta.fps) selectChip('fps', String(meta.fps));
  if (meta.ratio && RATIOS[meta.ratio]) selectChip('ratio', meta.ratio);
  if (meta.size) selectChip('size', String(meta.size));
  if (meta.name) $('saveName').value = meta.name;

  syncProps(true);
}

function renderNow() {
  if (busy) {
    toast('Render sedang berjalan', 'warn', 'hourglass_top');
    return;
  }
  location.hash = '#render';
  setTimeout(() => {
    if (!busy) startRender();
  }, 120);
}

function syncCanvas(d) {
  if (canvas.width !== d.width) canvas.width = d.width;
  if (canvas.height !== d.height) canvas.height = d.height;
}

function stopPreview() {
  if (previewFrame) cancelAnimationFrame(previewFrame);
  previewFrame = null;
  const button = $('play');
  button.innerHTML = '<span class="ms" aria-hidden="true">play_arrow</span> Preview';
  button.setAttribute('aria-pressed', 'false');
}

function startPreview() {
  stopPreview();

  let draw;
  try {
    draw = compile($('code').value);
  } catch (error) {
    toast('Kode tidak bisa dijalankan: ' + error.message, 'error');
    return;
  }

  const startedAt = performance.now();
  const button = $('play');
  button.innerHTML = '<span class="ms" aria-hidden="true">stop</span> Hentikan preview';
  button.setAttribute('aria-pressed', 'true');

  const loop = now => {
    const d = dims();
    syncCanvas(d);
    const time = ((now - startedAt) / 1000) % d.duration;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      draw(ctx, time, d.width, d.height, d.duration, { ...propValues }, {
        fps: d.fps,
        frame: Math.round(time * d.fps),
        durationInFrames: Math.round(d.duration * d.fps),
      });
    } catch (error) {
      stopPreview();
      toast('Runtime error: ' + error.message, 'error');
      return;
    }
    previewFrame = requestAnimationFrame(loop);
  };

  previewFrame = requestAnimationFrame(loop);
}

$('play').onclick = () => {
  if (busy) return;
  if (previewFrame) stopPreview();
  else startPreview();
};

function setRenderUI(on) {
  $('stop').hidden = !on;
  $('renderWarn').hidden = !on;
  $('progress').hidden = !on;
  $('render').disabled = on;
  $('play').disabled = on;
  $('saveBtn').disabled = on;
  $('pickAudio').disabled = on;
  $('clearAudio').disabled = on;
  $('loopAudio').disabled = on;
  document.querySelectorAll('.chip').forEach(chip => { chip.disabled = on; });
  $('render').innerHTML = on
    ? '<span class="ms" aria-hidden="true">hourglass_top</span> Merender'
    : '<span class="ms" aria-hidden="true">movie</span> Render';
}

function updateProgress(done, total, phase) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  $('bar').style.width = pct + '%';
  $('ppct').textContent = pct + '%';
  $('ptext').textContent = phase === 'audio' ? 'Menulis audio…' : `Frame ${done} / ${total}`;
  $('progress').setAttribute('aria-valuenow', String(pct));
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function showResult(record) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(record.blob);
  $('vid').src = resultUrl;
  $('dl').href = resultUrl;
  $('dl').download = record.name;
  $('result').hidden = false;
}

async function startRender() {
  if (busy) return;
  stopPreview();

  let draw;
  try {
    draw = compile($('code').value);
  } catch (error) {
    toast('Kode tidak bisa dijalankan: ' + error.message, 'error');
    return;
  }

  const info = engineInfo();
  if (info.mode === 'none') {
    toast(info.detail, 'error');
    return;
  }

  const d = dims();
  const total = Math.max(1, Math.round(d.duration * d.fps));
  syncCanvas(d);

  busy = true;
  renderController = new AbortController();
  setRenderUI(true);
  updateProgress(0, total, 'video');
  $('ptext').textContent = 'Menyiapkan encoder…';
  $('result').hidden = true;

  try {
    const result = await renderComposition({
      draw,
      props: { ...propValues },
      width: d.width,
      height: d.height,
      fps: d.fps,
      duration: d.duration,
      quality: state.quality,
      canvas,
      audio: audio?.buffer ? { buffer: audio.buffer, loop: audio.loop } : null,
      signal: renderController.signal,
      onProgress: updateProgress,
    });

    const record = {
      name: `codevideo-${timestamp()}.${result.ext}`,
      blob: result.blob,
      mime: result.mime,
      size: result.blob.size,
    };

    showResult(record);

    try {
      await saveVideo({ name: record.name, blob: record.blob });
      toast(`${result.mode === 'mp4' ? 'MP4' : 'WebM'} selesai dan tersimpan di server`, 'success');
    } catch (error) {
      toast(`Video selesai, tapi gagal disimpan ke server: ${error.message}. Pakai tombol Unduh di bawah.`, 'warn', 'cloud_off');
    }
  } catch (error) {
    if (error.name === 'AbortError') toast('Render dihentikan', 'warn', 'stop_circle');
    else toast('Render gagal: ' + error.message, 'error');
  } finally {
    busy = false;
    renderController = null;
    setRenderUI(false);
  }
}

$('render').onclick = startRender;
$('stop').onclick = () => renderController?.abort();

window.addEventListener('beforeunload', event => {
  if (!busy) return;
  event.preventDefault();
  event.returnValue = '';
});

function formatSize(bytes) {
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(ms) {
  return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function galleryCard(record) {
  const src = videoUrl(record.name);

  const card = document.createElement('article');
  card.className = 'vid';

  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';

  const info = document.createElement('div');
  info.className = 'vid__info';

  const name = document.createElement('div');
  name.className = 'vid__name';
  name.textContent = record.name;

  const meta = document.createElement('p');
  meta.className = 'support';
  const baseMeta = [formatSize(record.size), formatDate(record.mtime)];
  meta.textContent = baseMeta.join(' · ');

  video.addEventListener('loadedmetadata', () => {
    const parts = [];
    if (video.videoWidth && video.videoHeight) parts.push(`${video.videoWidth}×${video.videoHeight}`);
    if (Number.isFinite(video.duration) && video.duration > 0) parts.push(formatDuration(video.duration));
    meta.textContent = [...parts, ...baseMeta].join(' · ');
  }, { once: true });

  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'vid__actions';

  const download = document.createElement('a');
  download.className = 'btn btn--text';
  download.href = `${src}?download=1`;
  download.download = record.name;
  download.innerHTML = '<span class="ms" aria-hidden="true">download</span> Unduh';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--text is-danger';
  remove.innerHTML = '<span class="ms" aria-hidden="true">delete</span> Hapus';
  remove.addEventListener('click', async () => {
    const confirmed = await ask({
      title: 'Hapus video?',
      text: `"${record.name}" dihapus dari folder output server.`,
      icon: 'delete',
      okText: 'Hapus',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeVideo(record.name);
      toast('Video dihapus', 'warn', 'delete');
      loadGallery();
    } catch (error) {
      toast('Gagal menghapus: ' + error.message, 'error');
    }
  });

  actions.append(download, remove);
  card.append(video, info, actions);
  return card;
}

async function loadGallery() {
  const box = $('galleryList');
  box.innerHTML = '';
  box.appendChild(emptyState('hourglass_top', 'Memuat video…'));

  try {
    const videos = await listVideos();
    box.innerHTML = '';
    $('galleryCount').textContent = videos.length
      ? `${videos.length} video di folder output server.`
      : 'Belum ada video. Hasil render muncul di sini.';

    if (!videos.length) {
      box.appendChild(emptyState(
        'movie',
        'Belum ada video',
        'Buka tab Render, lalu tekan Render untuk membuat video pertama.',
      ));
      return;
    }

    videos.forEach(record => box.appendChild(galleryCard(record)));
  } catch {
    box.innerHTML = '';
    const state = emptyState(
      'cloud_off',
      'Server tidak menjawab',
      'Jalankan node server.js, lalu coba lagi. Galeri dibaca dari folder output server.',
    );
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--tonal';
    retry.innerHTML = '<span class="ms" aria-hidden="true">refresh</span> Coba lagi';
    retry.addEventListener('click', loadGallery);
    state.appendChild(retry);
    box.appendChild(state);
  }
}

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
}

function writeSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function currentSettings() {
  return {
    size: state.size,
    ratio: state.ratio,
    fps: state.fps,
    dur: state.dur,
    quality: state.quality,
    props: { ...propValues },
  };
}

function loadComposition(entry) {
  $('code').value = entry.code;
  const settings = entry.settings || {};
  propValues = settings.props && typeof settings.props === 'object' ? { ...settings.props } : {};

  if (settings.size) selectChip('size', String(settings.size));
  if (settings.ratio) selectChip('ratio', settings.ratio);
  if (settings.fps) selectChip('fps', String(settings.fps));
  if (settings.quality) selectChip('quality', settings.quality);
  if (settings.dur) applyDuration(settings.dur);

  $('tplSelect').value = '';
  syncProps(true);
}

function renderSaved() {
  const list = readSaved();
  const box = $('savedList');
  box.innerHTML = '';

  if (!list.length) {
    box.appendChild(emptyState(
      'bookmark',
      'Belum ada composition tersimpan',
      'Simpan dari tab ini agar bisa dibuka lagi tanpa menempel ulang kode.',
    ));
    return;
  }

  list.forEach((entry, index) => {
    const settings = entry.settings || {};
    const row = document.createElement('div');
    row.className = 'saved-row';

    const text = document.createElement('div');
    text.className = 'saved-row__text';
    const name = document.createElement('div');
    name.className = 'saved-row__name';
    name.textContent = entry.name;
    const meta = document.createElement('p');
    meta.className = 'support';
    meta.textContent = [
      `${settings.size}p`,
      settings.ratio,
      `${settings.fps} fps`,
      formatDuration(settings.dur || 0),
      QUALITY_LABEL[settings.quality] || 'Medium',
    ].filter(Boolean).join(' · ');
    text.append(name, meta);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'icon-btn';
    open.title = 'Muat';
    open.setAttribute('aria-label', `Muat ${entry.name}`);
    open.innerHTML = '<span class="ms" aria-hidden="true">folder_open</span>';
    open.addEventListener('click', () => {
      loadComposition(entry);
      location.hash = '#editor';
      toast(`"${entry.name}" dimuat`, 'success', 'folder_open');
    });

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'icon-btn';
    rename.title = 'Ubah nama';
    rename.setAttribute('aria-label', `Ubah nama ${entry.name}`);
    rename.innerHTML = '<span class="ms" aria-hidden="true">edit</span>';
    rename.addEventListener('click', async () => {
      const next = await ask({
        title: 'Ubah nama',
        text: 'Nama baru untuk composition ini.',
        icon: 'edit',
        okText: 'Simpan',
        input: { value: entry.name, label: 'Nama composition' },
      });
      if (!next) return;
      const updated = readSaved();
      updated[index].name = next.slice(0, 60);
      writeSaved(updated);
      renderSaved();
      toast('Nama diubah', 'success');
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn icon-btn--error';
    remove.title = 'Hapus';
    remove.setAttribute('aria-label', `Hapus ${entry.name}`);
    remove.innerHTML = '<span class="ms" aria-hidden="true">delete</span>';
    remove.addEventListener('click', async () => {
      const confirmed = await ask({
        title: 'Hapus composition?',
        text: `"${entry.name}" dihapus dari browser ini.`,
        icon: 'delete',
        okText: 'Hapus',
        danger: true,
      });
      if (!confirmed) return;
      const updated = readSaved();
      updated.splice(index, 1);
      writeSaved(updated);
      renderSaved();
      toast('Composition dihapus', 'warn', 'delete');
    });

    row.append(text, open, rename, remove);
    box.appendChild(row);
  });
}

$('saveBtn').onclick = () => {
  const name = $('saveName').value.trim().slice(0, 60);
  if (!name) {
    toast('Isi nama composition dulu', 'warn', 'edit');
    return;
  }

  const entry = { name, code: $('code').value, settings: currentSettings(), savedAt: Date.now() };
  const list = readSaved();
  const existing = list.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  if (existing >= 0) list[existing] = entry;
  else list.unshift(entry);

  if (!writeSaved(list)) {
    toast('Penyimpanan browser penuh atau diblokir', 'error');
    return;
  }

  $('saveName').value = '';
  renderSaved();
  toast(existing >= 0 ? 'Composition diperbarui' : 'Composition disimpan', 'success', 'save');
};

$('reset').onclick = async () => {
  const confirmed = await ask({
    title: 'Reset kode?',
    text: 'Kode saat ini diganti dengan template awal. Perubahanmu hilang.',
    icon: 'restart_alt',
    okText: 'Reset',
    danger: true,
  });
  if (!confirmed) return;
  $('code').value = DEFAULT_CODE;
  buildTemplateSelect();
  propValues = {};
  syncProps(true);
  toast('Kode dikembalikan ke template awal', 'warn', 'restart_alt');
};

function downloadJson(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('exportBtn').onclick = () => {
  const payload = { app: 'code-video', version: 2, code: $('code').value, settings: currentSettings() };
  const base = ($('saveName').value || 'komposisi').trim().replace(/[^\w\- ]+/g, '') || 'komposisi';
  downloadJson(`${base}.json`, JSON.stringify(payload, null, 2));
  toast('File .json diunduh', 'success', 'file_download');
};

$('importBtn').onclick = () => $('importFile').click();

$('importFile').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (typeof parsed.code !== 'string') throw new Error('tidak ada field code');
    loadComposition(parsed);
    location.hash = '#editor';
    toast('Composition diimpor', 'success', 'file_upload');
  } catch (error) {
    toast('Impor gagal: ' + error.message, 'error');
  }
};

let docsText = '';

async function loadDocs() {
  if (docsText) {
    renderDocs(docsText);
    return;
  }
  try {
    const response = await fetch('docs.md');
    if (!response.ok) throw new Error(String(response.status));
    docsText = await response.text();
    renderDocs(docsText);
  } catch {
    $('docView').textContent = 'Dokumentasi tidak bisa dimuat. Pastikan docs.md ada di folder yang sama.';
  }
}

function renderDocs(markdown) {
  const view = $('docView');
  if (window.marked && typeof window.marked.parse === 'function') {
    view.innerHTML = window.marked.parse(markdown, { gfm: true });
  } else {
    view.textContent = markdown;
  }
}

$('copyDocs').onclick = async () => {
  if (!docsText) await loadDocs();
  if (!docsText) return;
  try {
    await navigator.clipboard.writeText(docsText);
  } catch {
    const area = document.createElement('textarea');
    area.value = docsText;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Markdown dokumentasi disalin', 'success', 'content_copy');
};

const engine = engineInfo();
$('engine').textContent = engine.label;
$('engine').title = engine.detail;
$('engineNote').textContent = engine.detail;
if (engine.mode === 'none') {
  $('engine').style.color = 'var(--error)';
}

buildTemplateSelect();
$('code').value = DEFAULT_CODE;
syncProps(true);
selectChip('size', String(state.size));
selectChip('ratio', state.ratio);
selectChip('fps', String(state.fps));
selectChip('quality', state.quality);
selectChip('dur', String(state.dur));
renderAudio();
renderSaved();

aiPage = initAiPage({
  toast,
  getCode: () => $('code').value,
  applyCode,
  renderNow,
});

$('play').setAttribute('aria-pressed', 'false');
showTab();

window.addEventListener('hashchange', showTab);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
