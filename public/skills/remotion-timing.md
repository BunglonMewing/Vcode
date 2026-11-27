# Skill: Timing, easing, dan kurva

## interpolate

```js
const x = interpolate(frame, [0, 30], [0, W], {
  easing: Easing.out(Easing.cubic),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

- `inputRange` dan `outputRange` harus sama panjang, minimal dua titik, urut naik.
- Titik antara boleh lebih dari dua: `[0, 20, 40, 60]` → `[0, 120, 80, 200]`.
- Default `extrapolate` adalah `'extend'`. Pakai `'clamp'` untuk nilai yang tidak boleh lewat batas.

## spring

```js
const naik = spring({ frame: frame - 10, fps: FPS, config: { damping: 12, stiffness: 120 }, from: 0, to: 1 });
const y = interpolate(naik, [0, 1], [H * 0.7, H * 0.5]);
```

Preset yang sering dipakai:

| Rasa | `config` |
|---|---|
| Lembut tanpa mantul | `{ damping: 200 }` |
| Mantul halus | `{ damping: 14, stiffness: 110 }` |
| Mantul jelas | `{ damping: 9, stiffness: 130 }` |
| Berat | `{ damping: 20, mass: 2, stiffness: 60 }` |

Tambahkan `overshootClamping: true` bila nilai tidak boleh melewati `to`.
`delay` dalam frame, bukan detik. `durationInFrames` meregangkan spring agar selesai tepat di frame itu.

## Sequence

```js
const lokal = Sequence(frame, 45, 60);   // mulai frame 45, panjang 60 frame
if (lokal !== null) {
  const p = lokal / 60;                  // 0..1 di dalam adegan
  ctx.fillStyle = `rgba(255,255,255,${1 - p})`;
}
```

`Sequence` mengembalikan `null` saat adegan belum mulai atau sudah lewat. Jangan lupa `return` lebih awal
setelah blok adegan selesai agar frame berikutnya tidak tertimpa.

## Kurva

`Easing.linear`, `.ease`, `.quad`, `.cubic`, `.poly(n)`, `.sin`, `.circle`, `.exp`, `.back(s)`,
`.bounce`, `.elastic(b)`, `.bezier(x1, y1, x2, y2)`, plus pembungkus `.in`, `.out`, `.inOut`.

Aturan praktis:
- Masuk: `Easing.out(Easing.cubic)` atau spring ringan.
- Keluar: `Easing.in(Easing.cubic)`.
- Perpindahan besar: `Easing.inOut(Easing.quad)`.
- Jangan mencampur spring dan easing linear pada properti yang sama.

## Detik versus frame

`t` dalam detik, `frame` bulat. Untuk gerak yang harus presisi, hitung dari frame:
`const frame = Math.round(t * FPS)` lalu semua `interpolate` memakai `frame`.
Untuk loop halus yang tidak perduli frame, `t` boleh langsung dipakai.
