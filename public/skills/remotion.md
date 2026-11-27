# Skill: Remotion inti di Code → Video

Aplikasi ini memakai istilah Remotion tanpa React. Semua yang biasanya berupa komponen
di Remotion di sini berupa fungsi yang menerima **frame**.

## Pemetaan konsep

| Remotion | Di sini |
|---|---|
| `useCurrentFrame()` | `frame` dari `Math.round(t * FPS)`, atau `Sequence(frame, ...)` |
| `<Composition durationInFrames fps />` | blok `/* meta {"duration":6,"fps":30} */` |
| `interpolate(frame, ...)` | `interpolate(frame, ...)` tersedia langsung |
| `spring({frame, fps, config})` | `spring({frame, fps: FPS, config})` tersedia langsung |
| `<Sequence from durationInFrames>` | `Sequence(frame, from, durationInFrames)` → frame lokal atau `null` |
| `Easing.out(Easing.cubic)` | `Easing.out(Easing.cubic)` tersedia langsung |
| `<AbsoluteFill>` | `ctx.fillRect(0, 0, W, H)` sebagai latar penuh |
| `random(seed)` | `random(seed)` deterministik |

## Dua bentuk composition

**1. Body fungsi (paling umum).** Langsung menulis perintah canvas:

```js
/* meta { "duration": 5, "fps": 30, "ratio": "9:16" } */
/* props [ { "key": "judul", "label": "Judul", "type": "text", "value": "HALO" } ] */
const frame = Math.round(t * FPS);
ctx.fillStyle = '#0b0d14';
ctx.fillRect(0, 0, W, H);
const masuk = spring({ frame, fps: FPS, config: { damping: 14 } });
ctx.globalAlpha = masuk;
ctx.fillStyle = '#fff';
ctx.font = `bold ${Math.min(W, H) * 0.09}px sans-serif`;
ctx.textAlign = 'center';
ctx.fillText(P.judul, W / 2, H / 2);
ctx.globalAlpha = 1;
```

**2. Modul JS penuh.** Boleh memakai `export default`, `function draw(...)`, atau objek
dengan `draw` dan `setup`:

```js
export default function draw(ctx, t, W, H, D, P) {
  const frame = Math.round(t * FPS);
  /* ... */
}
```

`import` dibuang saat compile: tidak ada pemuatan modul dari jaringan.

## Aturan yang tidak boleh dilanggar

1. Animasi hanya bergantung pada `t`/`frame`. Tanpa `Date.now()`, `performance.now()`, atau `Math.random()`.
2. Gambar ulang seluruh frame; mulai dengan latar penuh.
3. Ukuran selalu relatif: `W`, `H`, `U = Math.min(W, H)`.
4. Reset `globalAlpha`, `shadow*`, `filter`, dan `letterSpacing` setelah dipakai, atau bungkus `ctx.save()` / `ctx.restore()`.
5. Tidak ada `document`, `window`, `fetch`, atau `Image` dari URL luar.
6. Jangan mendeklarasikan ulang `ctx`, `t`, `W`, `H`, `D`, `P`, atau `FPS` dengan `const`/`let`/`var`.

## Kebiasaan produksi

- Satu komentar timeline di atas kode: `// 0-0.6 dtk: judul masuk`.
- Awali dari frame 0 yang sudah punya komposisi utuh, bukan layar kosong.
- Akhiri dengan hold minimal 0.5 detik agar frame terakhir terbaca.
- Props untuk hal yang wajar diubah: teks, warna, kecepatan.
