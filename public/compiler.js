// Compiles a composition. Two shapes are accepted:
//   1. a plain function body that uses ctx, t, W, H, D, P (the classic format)
//   2. a full JS module that exports draw(), render(), frame() or default
import { Easing, interpolate, spring, Sequence, random, clamp, lerp } from './remotion.js';

const META_RE = /\/\*\s*meta\s*([\s\S]*?)\*\//;
const PROPS_RE = /\/\*\s*props\s*([\s\S]*?)\*\//;

const PARAM_NAMES = ['ctx', 't', 'W', 'H', 'D', 'P', 'FPS', 'interpolate', 'spring', 'Easing', 'Sequence', 'random', 'clamp', 'lerp'];
const HELPERS = [interpolate, spring, Easing, Sequence, random, clamp, lerp];

// Only these shapes count as a module. A plain helper such as `function rnd() {}`
// inside a body composition must stay a body.
const FUNCTION_DECL = /(^|\n)[ \t]*(export[ \t]+(default[ \t]+)?)?(async[ \t]+)?function[ \t]+(draw|render|frame)[ \t]*\(/;
const FUNCTION_EXPR = /(^|\n)[ \t]*(export[ \t]+)?(const|let|var)[ \t]+(draw|render|frame)[ \t]*=[ \t]*(async[ \t]+)?(function[ \t]*\(|\([^)]*\)[ \t]*=>|[\w$]+[ \t]*=>)/;
const ARROW_COMPOSITION = /^(async[ \t]*)?(\([^)]*\)|[\w$]+)[ \t]*=>/;

export function parseProps(code) {
  const match = code.match(PROPS_RE);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseMeta(code) {
  const meta = { duration: null, fps: null, ratio: null, size: null, name: null };
  const match = code.match(META_RE);
  if (!match) return meta;
  let raw;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return meta;
  }
  if (!raw || typeof raw !== 'object') return meta;

  const seconds = Number(raw.duration ?? raw.durationInFrames);
  if (Number.isFinite(seconds) && seconds > 0) {
    meta.duration = raw.durationInFrames && raw.fps
      ? Math.round(((raw.durationInFrames / raw.fps) * 10)) / 10
      : Math.round(seconds * 10) / 10;
  }

  const fps = Number(raw.fps);
  if (Number.isFinite(fps) && fps >= 1 && fps <= 120) meta.fps = Math.round(fps);

  if (typeof raw.ratio === 'string' && /^\d{1,2}:\d{1,2}$/.test(raw.ratio)) meta.ratio = raw.ratio;

  const size = Number(raw.width ?? raw.size);
  if (Number.isFinite(size) && size >= 240 && size <= 3840) meta.size = Math.round(size);

  if (typeof raw.name === 'string' && raw.name.trim()) meta.name = raw.name.trim().slice(0, 60);
  if (!meta.name && typeof raw.title === 'string' && raw.title.trim()) meta.name = raw.title.trim().slice(0, 60);

  return meta;
}

export function compositionKind(code) {
  const source = stripDirectives(code).trim();
  if (FUNCTION_DECL.test(source) || FUNCTION_EXPR.test(source)) return 'draw';
  if (/^export[ \t]/m.test(source)) return 'export';
  if (ARROW_COMPOSITION.test(source)) return 'arrow';
  return 'body';
}

function stripDirectives(code) {
  return code.replace(META_RE, '').replace(PROPS_RE, '');
}

function normalizeModule(code) {
  let hasDefault = false;
  let source = stripDirectives(code);

  source = source.replace(
    /export[ \t]+default[ \t]+(async[ \t]+)?function[ \t]*([\w$]*)[ \t]*\(/g,
    (_match, asyncKw, name) => {
      hasDefault = true;
      return `__default = ${asyncKw || ''}function ${name || '__defaultComposition'}(`;
    },
  );
  source = source.replace(/export[ \t]+default[ \t]+/g, () => {
    hasDefault = true;
    return '__default = ';
  });
  source = source.replace(/^[ \t]*export[ \t]+(?=(const|let|var|function|class|async))/gm, '');
  source = source.replace(/^[ \t]*import[ \t]+[^\n]*$/gm, '');

  return { code: source, hasDefault };
}

export function compileComposition(code) {
  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('Composition masih kosong');
  }
  const meta = parseMeta(code);
  const kind = compositionKind(code);

  if (kind === 'arrow') {
    const expression = stripDirectives(code).trim();
    return compileModule(`var __default;\n__default = ${expression};`, kind, meta);
  }
  if (kind === 'draw' || kind === 'export') {
    return compileModule(normalizeModule(code).code, kind, meta);
  }

  const source = stripDirectives(code);

  if (kind === 'body') {
    const body = new Function(...PARAM_NAMES, `"use strict";\n${source}`);
    const draw = (ctx, t, W, H, D, P, env = {}) => {
      const fps = env.fps || 30;
      body(ctx, t, W, H, D, P || {}, fps, ...HELPERS);
    };
    return { kind, meta, draw };
  }

  return compileModule(source, kind, meta);
}

function compileModule(source, kind, meta) {
  const factory = new Function(
    ...PARAM_NAMES,
    `"use strict";\nvar __default;\n${source}\n;return __default || (typeof draw === 'function' ? draw : typeof render === 'function' ? render : typeof frame === 'function' ? frame : null);`,
  );

  let target = null;
  let prepared = false;

  const draw = (ctx, t, W, H, D, P, env = {}) => {
    const fps = env.fps || 30;
    if (!prepared) {
      target = factory(ctx, t, W, H, D, P, fps, ...HELPERS);
      if (!target) {
        throw new Error('Modul tidak mengekspor draw(), render(), frame(), atau export default');
      }
      prepared = true;
      if (typeof target.setup === 'function') {
        target.setup(ctx, { t, W, H, D, P: P || {}, fps });
      }
    }

    if (typeof target === 'function') target(ctx, t, W, H, D, P || {}, { fps, frame: env.frame, durationInFrames: env.durationInFrames });
    else if (typeof target.draw === 'function') target.draw(ctx, t, W, H, D, P || {}, { fps, frame: env.frame, durationInFrames: env.durationInFrames });
    else throw new Error('Modul harus mengekspor fungsi draw()');
  };

  return { kind, meta, draw };
}
