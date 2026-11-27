# Skill: Canvas 2D untuk video

## Latar

```js
const g = ctx.createLinearGradient(0, 0, 0, H);
g.addColorStop(0, '#111524');
g.addColorStop(1, '#0b0d14');
ctx.fillStyle = g;
ctx.fillRect(0, 0, W, H);
```

Gradien radial untuk cahaya:
`ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.min(W, H) * 0.7)`.

## Teks

```js
ctx.save();
ctx.font = `600 ${U * 0.05}px sans-serif`;
ctx.fillStyle = '#e6e0e9';
ctx.textAlign = 'left';
ctx.textBaseline = 'alphabetic';
ctx.letterSpacing = '0.02em';   // Chrome modern
ctx.fillText('baris satu', M, H * 0.5);
ctx.restore();
```

`fillText` tidak membungkus baris. Pecah string sendiri; ukur dengan `measureText` jika dinamis.

## Bentuk

`ctx.roundRect(x, y, w, h, r)` tersedia di Chrome modern. Fallback manual dengan `arcTo` bila perlu.
Untuk cincin: `ctx.arc` + `ctx.stroke` dengan `lineWidth` relatif `U * 0.005`.

## Efek

- Bayangan: `shadowColor`, `shadowBlur`, `shadowOffsetX/Y`, lalu reset.
- Glow: gambar dua kali, pertama dengan `shadowBlur` besar dan alfa rendah.
- Blend: `ctx.globalCompositeOperation = 'lighter'` untuk cahaya, `'screen'` untuk lapisan lembut, lalu reset ke `'source-over'`.
- Blur: `ctx.filter = 'blur(12px)'` mahal pada 1440p ke atas. Pakai sekali per frame, bukan per elemen.

## Partikel

```js
function rnd(i, k) {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
```

Batasi 100–300 partikel untuk 1080p ke atas. Urutkan berdasarkan `z` sebelum menggambar jika memakai kedalaman.

## Performa

- Per piksel (`ImageData`) hanya untuk efek khusus, dan turunkan resolusinya bila memungkinkan.
- Hindari `save()`/`restore()` di dalam loop ribuan elemen; atur state sekali di luar loop.
- Cache gradien di variabel tingkat atas composition, bukan dibuat ulang tiap frame.
- `ctx.clearRect` tidak perlu jika latar digambar penuh setiap frame.
