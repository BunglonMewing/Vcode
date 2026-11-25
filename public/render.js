const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm';
const AUDIO_RATE = 48000;
const BITS_PER_PIXEL = { low: 0.05, medium: 0.09, high: 0.15, ultra: 0.22 };

// High profile levels first: they cover 1080p and 4K at higher frame rates.
const AVC_CODECS = ['avc1.640034', 'avc1.640033', 'avc1.640028', 'avc1.4d0034', 'avc1.4d0028', 'avc1.42e01f'];

export function engineInfo() {
  const hasWebCodecs = typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
  const hasRecorder = typeof window.MediaRecorder === 'function'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';

  if (hasWebCodecs) {
    return {
      mode: 'mp4',
      label: 'WebCodecs · MP4',
      detail: 'Video di-encode jadi MP4 (H.264) langsung di perangkat ini.',
    };
  }
  if (hasRecorder) {
    return {
      mode: 'webm',
      label: 'MediaRecorder · WebM',
      detail: 'Browser ini belum mendukung WebCodecs. Video direkam real-time sebagai WebM.',
    };
  }
  return {
    mode: 'none',
    label: 'Tidak didukung',
    detail: 'Browser ini tidak punya encoder video. Gunakan Chrome, Edge, atau Safari terbaru.',
  };
}

export function bitrateFor(width, height, fps, quality) {
  const factor = BITS_PER_PIXEL[quality] ?? BITS_PER_PIXEL.medium;
  return Math.round(Math.min(40e6, Math.max(600e3, width * height * fps * factor)));
}

export async function decodeAudio(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext tidak tersedia');
  const audioCtx = new Ctx();
  try {
    const buffer = await audioCtx.decodeAudioData(await file.arrayBuffer());
    return buffer;
  } finally {
    audioCtx.close().catch(() => {});
  }
}

function abortError() {
  const error = new Error('Render dihentikan');
  error.name = 'AbortError';
  return error;
}

function sleepFrame() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

let muxerModule;
async function loadMuxer() {
  if (!muxerModule) muxerModule = await import(MUXER_URL);
  return muxerModule;
}

async function pickVideoConfig({ width, height, fps, bitrate }) {
  for (const codec of AVC_CODECS) {
    const config = {
      codec,
      width,
      height,
      framerate: fps,
      bitrate,
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return config;
    } catch {
      // Level not understood by this build; try the next one.
    }
  }
  return null;
}

// Audio is resampled to 48 kHz and cut (or looped) to the video duration.
function buildAudioTrack(buffer, duration, loop) {
  const frames = Math.max(1, Math.round(duration * AUDIO_RATE));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const srcRate = buffer.sampleRate;
  const srcLength = buffer.length;
  const srcLeft = buffer.getChannelData(0);
  const srcRight = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : srcLeft;
  const step = srcRate / AUDIO_RATE;

  for (let i = 0; i < frames; i++) {
    let position = i * step;
    if (loop && srcLength) position %= srcLength;
    if (position >= srcLength) break;
    const i0 = Math.floor(position);
    const i1 = Math.min(srcLength - 1, i0 + 1);
    const frac = position - i0;
    left[i] = srcLeft[i0] + (srcLeft[i1] - srcLeft[i0]) * frac;
    right[i] = srcRight[i0] + (srcRight[i1] - srcRight[i0]) * frac;
  }

  // Short fades keep the track from clicking at the boundaries.
  const fadeIn = Math.min(frames, Math.round(AUDIO_RATE * 0.008));
  const fadeOut = Math.min(frames, Math.round(AUDIO_RATE * 0.03));
  for (let i = 0; i < fadeIn; i++) {
    const gain = i / fadeIn;
    left[i] *= gain;
    right[i] *= gain;
  }
  for (let i = 0; i < fadeOut; i++) {
    const gain = i / fadeOut;
    const index = frames - 1 - i;
    left[index] *= gain;
    right[index] *= gain;
  }

  return { left, right, frames, sampleRate: AUDIO_RATE };
}

async function renderMp4(options) {
  const { muxerLib, config, draw, props, width, height, fps, duration, canvas, audio, signal, onProgress } = options;
  const total = Math.max(1, Math.round(duration * fps));
  const ctx = canvas.getContext('2d', { alpha: false });

  let audioTrack = null;
  let audioConfig = null;
  if (audio?.buffer && typeof window.AudioEncoder === 'function' && typeof window.AudioData === 'function') {
    const track = buildAudioTrack(audio.buffer, duration, audio.loop);
    const candidate = { codec: 'mp4a.40.2', sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 128000 };
    const support = await AudioEncoder.isConfigSupported(candidate).catch(() => null);
    if (support?.supported) {
      audioTrack = track;
      audioConfig = candidate;
    }
  }

  const target = new muxerLib.ArrayBufferTarget();
  const muxer = new muxerLib.Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: audioConfig ? { codec: 'aac', numberOfChannels: 2, sampleRate: AUDIO_RATE } : undefined,
    fastStart: 'in-memory',
  });

  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: error => { encoderError = error; },
  });
  encoder.configure(config);

  const keyEvery = Math.max(1, Math.round(fps * 2));
  const frameDuration = Math.round(1e6 / fps);

  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      if (encoderError) throw encoderError;

      draw(ctx, i / fps, width, height, duration, props);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: frameDuration,
      });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();

      while (encoder.encodeQueueSize > 4) await sleepFrame();
      onProgress?.(i + 1, total, 'video');
    }

    await encoder.flush();
    if (encoderError) throw encoderError;

    if (audioTrack) {
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: error => { encoderError = error; },
      });
      audioEncoder.configure(audioConfig);

      const block = 1024;
      for (let offset = 0; offset < audioTrack.frames; offset += block) {
        if (signal?.aborted) throw abortError();
        const count = Math.min(block, audioTrack.frames - offset);
        const data = new Float32Array(count * 2);
        data.set(audioTrack.left.subarray(offset, offset + count), 0);
        data.set(audioTrack.right.subarray(offset, offset + count), count);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: AUDIO_RATE,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((offset * 1e6) / AUDIO_RATE),
          data,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        if (audioEncoder.encodeQueueSize > 16) await sleepFrame();
      }

      await audioEncoder.flush();
      audioEncoder.close();
      if (encoderError) throw encoderError;
      onProgress?.(total, total, 'audio');
    }
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }

  muxer.finalize();
  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    ext: 'mp4',
    mime: 'video/mp4',
    mode: 'mp4',
    hasAudio: Boolean(audioTrack),
  };
}

function pickRecorderMime(hasAudio) {
  const candidates = hasAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return candidates.find(type => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  }) || '';
}

async function renderWithRecorder(options) {
  const { draw, props, width, height, fps, duration, canvas, audio, signal, onProgress, bitrate } = options;
  const ctx = canvas.getContext('2d', { alpha: false });
  const total = Math.max(1, Math.round(duration * fps));
  const stream = canvas.captureStream(fps);

  let audioCtx = null;
  let source = null;
  if (audio?.buffer) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    await audioCtx.resume().catch(() => {});
    source = audioCtx.createBufferSource();
    source.buffer = audio.buffer;
    source.loop = Boolean(audio.loop);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    source.start();
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  }

  const mimeType = pickRecorderMime(Boolean(audio?.buffer));
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: bitrate,
    audioBitsPerSecond: 128000,
  });
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = event => reject(event.error || new Error('MediaRecorder gagal'));
  });

  recorder.start(250);
  const start = performance.now();

  try {
    await new Promise((resolve, reject) => {
      const tick = () => {
        if (signal?.aborted) return reject(abortError());
        const elapsed = (performance.now() - start) / 1000;
        const index = Math.min(total - 1, Math.floor(elapsed * fps));
        try {
          draw(ctx, index / fps, width, height, duration, props);
        } catch (error) {
          return reject(error);
        }
        onProgress?.(Math.min(total, index + 1), total, 'video');
        if (elapsed >= duration) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped.catch(() => {});
    source?.stop();
    audioCtx?.close().catch(() => {});
    stream.getTracks().forEach(track => track.stop());
  }

  const type = chunks[0]?.type || mimeType || 'video/webm';
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  return {
    blob: new Blob(chunks, { type }),
    ext,
    mime: type,
    mode: ext,
    hasAudio: Boolean(audio?.buffer),
  };
}

export async function renderComposition(options) {
  const { width, height, fps, quality } = options;
  const info = engineInfo();
  if (info.mode === 'none') throw new Error(info.detail);

  const bitrate = bitrateFor(width, height, fps, quality);

  if (info.mode === 'mp4') {
    let muxerLib = null;
    let config = null;
    try {
      muxerLib = await loadMuxer();
      config = await pickVideoConfig({ width, height, fps, bitrate });
    } catch {
      muxerLib = null;
    }
    if (muxerLib && config) {
      return renderMp4({ ...options, muxerLib, config, bitrate });
    }
  }

  if (typeof MediaRecorder === 'function') {
    return renderWithRecorder({ ...options, bitrate });
  }

  throw new Error('Tidak ada encoder video yang bisa dipakai di browser ini.');
}
