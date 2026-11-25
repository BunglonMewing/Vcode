# Code → Video

Code → Video turns JavaScript canvas code into a video. You write a composition, preview the animation, and the page encodes the video **in the visitor's browser**. A small Node server serves the site and stores the rendered files in `output/`.

No npm dependencies, no build step, no FFmpeg. The rendering library (`mp4-muxer`) and the icons/fonts are fetched by the browser automatically on first use.

## Cara kerja

- Frame digambar ke canvas, lalu dikirim ke encoder video browser lewat **WebCodecs**.
- **mp4-muxer** (di-load otomatis dari CDN) membungkus hasilnya menjadi `.mp4` H.264.
- Browser tanpa WebCodecs memakai **MediaRecorder** dan menghasilkan `.webm`.
- Setelah selesai, file diunggah ke server dan disimpan di `output/`. Galeri membaca folder itu.
- Composition tersimpan di `localStorage` browser.

## Menjalankan

Butuh Node.js 16 atau lebih baru. Tidak ada yang perlu di-install.

```bash
node server.js
```

Buka `http://localhost:3000`. Port bisa diganti lewat `PORT=4000 node server.js`.

### Di Termux (Android)

```bash
pkg install -y nodejs git
git clone https://github.com/Frhanz79/code-video.git
cd code-video
node server.js
```

Buka `http://localhost:3000` di Chrome. Tidak perlu `ffmpeg`, tidak perlu `npm install`.

## Browser yang didukung

| Browser | Hasil render |
|---|---|
| Chrome, Edge 94+ | MP4 (H.264) lewat WebCodecs, audio AAC |
| Safari 16.4+ | MP4 (H.264) lewat WebCodecs |
| Firefox | MP4 bila WebCodecs tersedia, selain itu WebM lewat MediaRecorder |
| Browser lama | WebM (MediaRecorder) atau tidak bisa render sama sekali |

Audio ikut dirender bila browser mendukung `AudioEncoder` dengan AAC. Jika tidak, video tetap
dirender tanpa audio. Badge di kanan atas menunjukkan mesin yang dipakai browser saat ini.

## Fitur

- Editor composition dengan template 2D dan 3D
- Panel props otomatis dari blok `/* props [...] */`
- Preview deterministik berbasis waktu
- Render MP4 di browser dengan resolusi, rasio, kualitas, FPS, dan durasi yang bisa diatur
- Audio opsional dengan loop, di-decode dan di-encode di browser
- Galeri dari folder `output/` di server: putar, unduh, hapus
- Composition tersimpan di browser, plus impor dan ekspor JSON
- Dokumentasi composition di dalam aplikasi
- Antarmuka Material 3 (Material You) dengan mode terang dan gelap otomatis
- Service worker untuk memuat ulang aplikasi saat offline

## Format composition

Composition adalah body sebuah fungsi JavaScript. Variabel yang tersedia:

| Nama | Tipe | Arti |
|---|---|---|
| `ctx` | object | Context canvas 2D |
| `t` | number | Waktu frame dalam detik |
| `W`, `H` | number | Ukuran frame dalam piksel |
| `D` | number | Durasi total dalam detik |
| `P` | object | Nilai props |

Animasi harus hanya bergantung pada `t`, dan setiap frame harus menggambar ulang seluruh kanvas.
Referensi lengkap ada di [public/docs.md](public/docs.md) dan di tab **Docs** aplikasi.

## Struktur proyek

```
.
├── server.js       Server HTTP: file statis, API video, streaming range
├── output/         Video hasil render (dibuat otomatis, tidak di-commit)
└── public/
    ├── index.html     Layout Material 3
    ├── style.css      Token dan komponen Material 3
    ├── app.js         Editor, props, preview, galeri, penyimpanan
    ├── render.js      Encoder browser: WebCodecs + mp4-muxer, MediaRecorder
    ├── gallery.js     Klien API video server
    ├── templates.js   Template composition bawaan
    ├── docs.md        Referensi composition
    ├── SKILL.md       Skill untuk AI agent
    ├── sw.js          Service worker
    └── manifest.json  Manifest PWA
```

## API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/videos` | Daftar video di `output/` |
| POST | `/api/videos` | Simpan video hasil render (header `X-Filename`, body file) |
| DELETE | `/api/videos/:name` | Hapus satu video |
| GET | `/output/:name` | Streaming video, mendukung Range |
| GET | `/output/:name?download=1` | Unduh video |

Batas unggahan 250 MB per file. Nama file dibersihkan dan dibuat unik oleh server.

## Catatan render

- Satu render berjalan di tab yang sedang dipakai. Menutup tab menghentikan render.
- Pada jalur MediaRecorder, render berjalan real-time, jadi video 30 detik butuh 30 detik.
- Resolusi 4K dan durasi panjang membutuhkan memori besar. Turunkan resolusi atau kualitas bila
  encoder menolak.
- Jika server tidak bisa dijangkau saat menyimpan, video tetap bisa diunduh dari panel hasil.

## Lisensi

MIT. Lihat `LICENSE.txt`.
