# Skill: Multi-scene dan cut

Video panjang dipecah menjadi adegan. Setiap adegan punya frame awal, durasi, dan satu tugas visual.

## Struktur

```js
/* meta { "duration": 12, "fps": 30, "ratio": "16:9" } */
const frame = Math.round(t * FPS);
const U = Math.min(W, H);
const M = U * 0.08;

function latar(warna) {
  ctx.fillStyle = warna;
  ctx.fillRect(0, 0, W, H);
}

function teks(isi, y, ukuran, warna) {
  ctx.fillStyle = warna;
  ctx.font = `bold ${ukuran}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isi, W / 2, y);
}

// Adegan 1: frame 0-90 (0-3 dtk)
const a1 = Sequence(frame, 0, 90);
if (a1 !== null) {
  latar('#0b0d14');
  const p = spring({ frame: a1, fps: FPS, config: { damping: 14 } });
  ctx.globalAlpha = p;
  teks('Judul', H * 0.45, U * 0.14, '#fff');
  ctx.globalAlpha = 1;
}

// Adegan 2: frame 90-180, mulai setelah cut
const a2 = Sequence(frame, 90, 90);
if (a2 !== null) {
  latar('#141218');
  const p = a2 / 90;
  ctx.fillStyle = '#d0bcff';
  ctx.fillRect(M, H * 0.6, (W - M * 2) * p, U * 0.02);
}
```

## Aturan cut

- Cut bersih lebih baik daripada transisi rumit. Ganti latar penuh di batas adegan.
- Transisi silang hanya 8–12 frame, dan hanya jika dua adegan punya latar serupa.
- Jangan memotong di tengah gerakan elemen yang sama. Selesaikan gerak, lalu cut.
- Setiap adegan minimal 1.5 detik. Di bawah itu penonton tidak sempat membaca.
- Frame terakhir tiap adegan harus tetap enak dilihat sendiri (jika video di-pause).

## Ritme

| Durasi total | Jumlah adegan |
|---|---|
| 5–8 dtk | 1–2 |
| 10–15 dtk | 2–4 |
| 20–30 dtk | 4–6 |

Batas adegan dihitung dari `durationInFrames = Math.round(durasiDetik * fps)`.
Tulis batas itu sebagai komentar di atas kode agar mudah diubah.
