// Remotion-style timing helpers for canvas compositions: same vocabulary
// (interpolate, spring, Easing, Sequence), without React.

const bezierCache = new Map();

function solveBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const sampleDX = t => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return t;
      const slope = sampleDX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= dx / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return t;
  };

  return x => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
}

function cubicBezier(x1, y1, x2, y2) {
  const key = `${x1},${y1},${x2},${y2}`;
  if (!bezierCache.has(key)) bezierCache.set(key, solveBezier(x1, y1, x2, y2));
  return bezierCache.get(key);
}

export const Easing = {
  linear: t => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  quad: t => t * t,
  cubic: t => t * t * t,
  poly: (n = 3) => t => Math.pow(t, n),
  sin: t => 1 - Math.cos((t * Math.PI) / 2),
  circle: t => 1 - Math.sqrt(Math.max(0, 1 - t * t)),
  exp: t => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  back: (overshoot = 1.70158) => t => t * t * ((overshoot + 1) * t - overshoot),
  elastic: (bounciness = 1) => t => {
    if (t === 0 || t === 1) return t;
    const period = (1 / (2 * Math.PI)) * Math.asin(1 / Math.max(1, bounciness));
    return -(Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - period) * (2 * Math.PI)) / period));
  },
  bounce: t => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
      const u = t - 1.5 / d1;
      return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
      const u = t - 2.25 / d1;
      return n1 * u * u + 0.9375;
    }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  },
  bezier: cubicBezier,
  in: fn => t => fn(t),
  out: fn => t => 1 - fn(1 - t),
  inOut: fn => t => (t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2),
};

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function mapRange(value, inputRange, outputRange) {
  return interpolate(value, inputRange, outputRange);
}

// Remotion's interpolate: piecewise linear across inputRange, with easing
// applied inside each segment and configurable extrapolation.
export function interpolate(input, inputRange, outputRange, options = {}) {
  const { easing = t => t, extrapolateLeft = 'extend', extrapolateRight = 'extend' } = options;
  if (!Array.isArray(inputRange) || !Array.isArray(outputRange)) {
    throw new Error('interpolate: inputRange dan outputRange harus array');
  }
  if (inputRange.length !== outputRange.length) {
    throw new Error('interpolate: inputRange dan outputRange harus sama panjang');
  }
  if (inputRange.length < 2) return outputRange[0] ?? 0;

  const last = inputRange.length - 1;
  const first = 0;

  if (input <= inputRange[first]) {
    if (extrapolateLeft === 'clamp') return outputRange[first];
    if (extrapolateLeft === 'identity') return input;
    const span = inputRange[1] - inputRange[0] || 1;
    const slope = (outputRange[1] - outputRange[0]) / span;
    return outputRange[0] + (input - inputRange[0]) * slope;
  }

  if (input >= inputRange[last]) {
    if (extrapolateRight === 'clamp') return outputRange[last];
    if (extrapolateRight === 'identity') return input;
    const span = inputRange[last] - inputRange[last - 1] || 1;
    const slope = (outputRange[last] - outputRange[last - 1]) / span;
    return outputRange[last] + (input - inputRange[last]) * slope;
  }

  for (let i = 0; i < last; i++) {
    const start = inputRange[i];
    const end = inputRange[i + 1];
    if (input >= start && input <= end) {
      const progress = end === start ? 0 : (input - start) / (end - start);
      return outputRange[i] + (outputRange[i + 1] - outputRange[i]) * easing(progress);
    }
  }

  return outputRange[last];
}

export const SPRING_DEFAULT = { damping: 10, mass: 1, stiffness: 100, overshootClamping: false };

// Closed-form damped spring, the same parameters Remotion uses.
export function spring(options) {
  const { frame, fps = 30, from = 0, to = 1, delay = 0, durationInFrames = null } = options || {};
  const config = { ...SPRING_DEFAULT, ...(options?.config || {}) };
  if (!Number.isFinite(frame)) throw new Error('spring: frame wajib berupa angka');

  const { damping, mass, stiffness, overshootClamping } = config;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  const progressAt = time => {
    if (time <= 0) return 0;
    if (zeta < 1) {
      const damped = omega * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * omega * time) * (Math.cos(damped * time) + ((zeta * omega) / damped) * Math.sin(damped * time));
    }
    if (Math.abs(zeta - 1) < 1e-6) {
      return 1 - Math.exp(-omega * time) * (1 + omega * time);
    }
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega * (zeta - root);
    const r2 = -omega * (zeta + root);
    const a = r2 / (r1 - r2);
    return 1 + a * Math.exp(r1 * time) - (1 + a) * Math.exp(r2 * time);
  };

  let progress = progressAt(Math.max(0, frame - delay) / fps);

  if (durationInFrames) {
    const end = progressAt(Math.max(1, durationInFrames) / fps);
    progress = end === 0 ? 1 : clamp(progress / end, 0, 1);
  }
  if (overshootClamping) progress = clamp(progress, 0, 1);

  return from + (to - from) * progress;
}

// Remotion's <Sequence> has no component tree here: pass the current frame,
// get the local frame, or null when the sequence is not on screen.
export function Sequence(frame, from = 0, durationInFrames = Infinity) {
  const local = frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  return local;
}

export function sequenceProgress(frame, from, durationInFrames) {
  const local = Sequence(frame, from, durationInFrames);
  return local === null ? 0 : clamp(local / Math.max(1, durationInFrames));
}

// Deterministic pseudo-random in [0, 1); same seed always gives the same frame.
export function random(seed) {
  let n = typeof seed === 'number' ? Math.floor(seed * 1000003) + 0x9e3779b9 : hashString(String(seed));
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const runtimeHelpers = { interpolate, spring, Easing, Sequence, random, clamp, lerp };
