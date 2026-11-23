# Code → Video: Dokumentasi Composition

---

## 1. Gambaran umum

Sebuah composition adalah **body fungsi JavaScript** yang menggambar satu frame
pada canvas 2D berdasarkan waktu `t`. Aplikasi memanggil fungsi ini berulang kali:

- Di **Preview**, `t` berjalan mengikuti waktu nyata dan berulang setiap `D` detik.
- Di **Render**, `t` dihitung per frame: `t = frame / fps`. Setiap frame dikirim ke FFmpeg
  untuk dijadikan MP4.

Karena render harus **deterministik**, hasil untuk `t` yang sama harus selalu sama.

---

## 2. Variabel yang tersedia

| Nama | Tipe    | Arti                                                        |
|------|---------|-------------------------------------------------------------|
| `ctx`| object  | Context canvas 2D (`CanvasRenderingContext2D`)              |
| `t`  | number  | Waktu saat ini dalam detik, dari `0` sampai mendekati `D`   |
| `W`  | number  | Lebar frame dalam piksel (selalu genap)                     |
| `H`  | number  | Tinggi frame dalam piksel (selalu genap)                    |
| `D`  | number  | Durasi total video dalam detik                              |
| `P`  | object  | Nilai props yang dibaca dari panel GUI (lihat bagian 4)     |

Composition **tidak** perlu mendeklarasikan `ctx`, `W`, `H`, `D`, `t`, atau `P`.
Semua sudah tersedia sebagai parameter.

---

## 3. Aturan wajib

1. **Gunakan hanya `t` untuk animasi.** Jangan pakai `Date.now()`, `performance.now()`,
   atau `Math.random()`. Jika butuh angka acak, buat fungsi hash berbasis seed:
   ```js
   function rnd(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
   ```
2. **Gambar seluruh frame setiap kali.** Mulai dengan `ctx.fillRect(0, 0, W, H)` sebagai latar.
   Jangan mengandalkan frame sebelumnya.
3. **Jangan pakai `import`, `require`, `fetch`, atau akses DOM.** Hanya `ctx` dan variabel di atas.
4. **Gambar eksternal dilarang** (`drawImage` dengan URL luar membuat canvas tidak bisa dirender).
   Gunakan bentuk dasar, teks, atau gambar dari folder `public` yang sudah dimuat sebelumnya.
5. **Ukuran relatif.** Selalu hitung posisi dan ukuran dari `W` dan `H`, misalnya
   `W * 0.5` atau `Math.min(W, H) * 0.1`, agar composition cocok di semua resolusi dan rasio.
6. **Kode harus berupa body fungsi.** Jangan bungkus dengan `function render() { ... }`
   dan jangan tulis tanda kutip backtick atau blok ``` di dalam file kode.
7. **Gunakan backslash saat membuat template string di `templates.js`:** `\`` dan `\${...}`.
   Dalam composition yang dipaste langsung ke editor, template string biasa tidak perlu di-escape.

---

## 4. Props (panel kontrol otomatis)

Props membuat panel GUI tanpa perlu menulis HTML. Deklarasikan di **baris pertama**
composition sebagai blok komentar `/* props [...] */` yang isinya **JSON array**.

```js
/* props [
  {"key":"judul","label":"Judul","type":"text","value":"Halo Dunia"},
  {"key":"warna","label":"Warna","type":"color","value":"#f472b6"},
  {"key":"ukuran","label":"Ukuran","type":"range","min":10,"max":200,"step":1,"value":80},
  {"key":"jumlah","label":"Jumlah","type":"number","min":1,"max":50,"step":1,"value":10},
  {"key":"aktif","label":"Tampilkan bayangan","type":"checkbox","value":true}
] */
```

Tipe yang didukung:

| type       | Field tambahan              | Nilai di `P`          |
|------------|-----------------------------|-----------------------|
| `text`     | —                           | string                |
| `color`    | —                           | string `#rrggbb`      |
| `range`    | `min`, `max`, `step`        | number                |
| `number`   | `step` (opsional)           | number                |
| `checkbox` | —                           | boolean               |

Setiap item wajib punya `key` (nama variabel di `P`), `type`, dan `value` (default).
`label` opsional. Akses nilainya dengan `P.key`, misalnya `P.warna`.

Jika blok props tidak ada, `P` tetap ada sebagai objek kosong.

---

## 5. Contoh lengkap

Composition: bola memantul dengan props.

```js
/* props [
  {"key":"warna","label":"Warna bola","type":"color","value":"#f472b6"},
  {"key":"kecepatan","label":"Kecepatan","type":"range","min":0.2,"max":3,"step":0.1,"value":1},
  {"key":"judul","label":"Judul","type":"text","value":"Bola Memantul"}
] */
ctx.fillStyle = '#0b0d14';
ctx.fillRect(0, 0, W, H);

const R = Math.min(W, H) * 0.05;
const phase = (t * P.kecepatan) / (D / 2);
const bounce = Math.abs(((phase % 2) + 2) % 2 - 1);  // segitiga 0..1..0
const x = R + (W - 2 * R) * bounce;
const y = H * 0.6;

ctx.fillStyle = P.warna;
ctx.beginPath();
ctx.arc(x, y, R, 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = '#fff';
ctx.font = `bold ${Math.min(W, H) / 16}px sans-serif`;
ctx.textAlign = 'center';
ctx.fillText(P.judul, W / 2, H * 0.2);
```

---

## 6. Pola animasi yang umum

Progres 0 sampai 1 selama durasi:
```js
const p = t / D;
```

Easing (mulai lambat, lalu cepat, lalu lambat):
```js
const ease = p => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
```

Berulang setiap 1 detik (berguna untuk kedipan atau denyut):
```js
const loop = (t % 1);  // 0..1 berulang
```

Muncul bertahap (fade in dari detik 0 sampai 1):
```js
ctx.globalAlpha = Math.min(1, t / 1);
// ... gambar ...
ctx.globalAlpha = 1;
```

Putaran 3D sederhana (proyeksi perspektif):
```js
function project(x, y, z) {
  const f = (Math.min(W, H) * 1.2) / (z + 4);
  return [W / 2 + x * f, H / 2 + y * f];
}
```

---

## 7. Template dasar yang bisa dijadikan acuan

- **Partikel**: titik-titik yang bergerak dengan seed `rnd(i, k)`.
- **Bar chart**: batang yang tumbuh dengan `Math.min(1, t / (D * 0.6))`.
- **Ketik**: teks dipotong dengan `full.slice(0, n)`, `n` dihitung dari `t / D`.
- **Gelombang**: `Math.sin(x * k + t * speed)` per kolom piksel.
- **Denyut**: lingkaran dengan `phase = (t / periode + i / N) % 1`.
- **Kubus / bola titik / torus 3D**: rotasi matriks lalu proyeksi perspektif manual.

---

## 8. Format output yang diminta dari AI agent

Saat meminta AI membuat composition, minta output seperti ini:

1. **Kode saja** dalam satu blok, tanpa penjelasan panjang.
2. Baris pertama berisi blok `/* props [...] */` (boleh `/* props [] */` jika tidak ada props).
3. Tidak memakai `import`, `require`, `Math.random()`, `Date`, atau `fetch`.
4. Semua ukuran relatif terhadap `W`, `H`, atau `D`.
5. Animasi hanya bergantung pada `t`.

Contoh prompt yang bisa dipakai:

> Buatkan composition untuk aplikasi Code → Video mengikuti dokumentasi terlampir.
> Tema: logo perusahaan berbentuk lingkaran yang membesar lalu muncul teks nama perusahaan.
> Buat props untuk warna latar, warna lingkaran, dan teks. Kode saja, tanpa penjelasan.

---

## 9. Cara memakai hasil dari AI

1. Buka tab **Editor**, hapus isi kode, lalu paste composition baru.
2. Panel **Props** akan muncul otomatis. Atur nilainya.
3. Buka tab **Render**, tekan **Preview** untuk mengecek hasil.
4. Pilih resolusi, rasio, kualitas, FPS, dan durasi, lalu tekan **Render MP4**.
5. Buka tab **Galeri** untuk memutar, memindahkan ke penyimpanan internal, atau menghapus video.
6. Simpan composition di tab **Simpan** agar bisa dipakai lagi.

---

## 10. Penyimpanan video

- Hasil render disimpan di `~/code-video/output/` dan muncul di tab **Galeri**.
- Pindahkan video ke penyimpanan internal lewat tombol **Pindah**. Default tujuannya
  `~/storage/shared/Movies/CodeVideo`, yaitu folder **Movies/CodeVideo** di penyimpanan HP,
  sehingga langsung terlihat di aplikasi galeri.
- Untuk fitur ini, jalankan sekali di Termux: `termux-setup-storage`.
- Video yang sudah dipindahkan tidak lagi muncul di Galeri aplikasi.
