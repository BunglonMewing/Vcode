# Code → Video

Code → Video is a static website that turns JavaScript canvas code into a video. You write a composition, preview the animation, and the page encodes the video **in the browser**. There is no backend, no upload, and no FFmpeg: the whole app is HTML, CSS, and JavaScript.

## Apa yang berubah

Versi sebelumnya memakai Node.js dan FFmpeg di server. Sekarang semua render terjadi di
perangkat pengguna:

- Frame digambar ke canvas, lalu dikirim ke encoder video browser lewat **WebCodecs**.
- **mp4-muxer** (dimuat dari CDN saat pertama kali render) membungkus hasilnya menjadi `.mp4` H.264.
- Browser tanpa WebCodecs memakai **MediaRecorder** dan menghasilkan `.webm`.
- Video hasil render disimpan di **IndexedDB**; composition tersimpan di `localStorage`.
- Tidak ada dependency npm, tidak ada proses build, tidak ada `server.js`.

## Menjalankan

File disajikan sebagai situs statis. Karena memakai ES module dan `fetch`, halaman harus dibuka
lewat HTTP, bukan `file://`.

```bash
python3 -m http.server 3000 --directory public
# atau
npx serve public
```

Buka `http://localhost:3000`. Untuk hosting, unggah isi folder `public/` ke GitHub Pages,
Cloudflare Pages, Netlify, atau server statis mana pun. Semua path bersifat relatif, jadi subfolder
juga berfungsi.

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
- Galeri video lokal (IndexedDB) dengan putar, unduh, dan hapus
- Composition tersimpan di browser, plus impor dan ekspor JSON
- Dokumentasi composition di dalam aplikasi
- Antarmuka Material 3 (Material You) dengan mode terang dan gelap otomatis

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
public/
├── index.html     Layout Material 3
├── style.css      Token dan komponen Material 3
├── app.js         Editor, props, preview, galeri, penyimpanan
├── render.js      Encoder browser: WebCodecs + mp4-muxer, MediaRecorder
├── gallery.js     Penyimpanan video di IndexedDB
├── templates.js   Template composition bawaan
├── docs.md        Referensi composition
├── SKILL.md       Skill untuk AI agent
├── sw.js          Service worker untuk mode offline
└── manifest.json  Manifest PWA
```

## Catatan render

- Satu render berjalan di tab yang sedang dipakai. Menutup tab menghentikan render.
- Pada jalur MediaRecorder, render berjalan real-time, jadi video 30 detik butuh 30 detik.
- Resolusi 4K dan durasi panjang membutuhkan memori besar. Turunkan resolusi atau kualitas bila
  encoder menolak.
- Kuota IndexedDB berbeda per browser. Unduh video penting, lalu hapus dari Galeri bila penuh.

## Lisensi

MIT. Lihat `LICENSE.txt`.
