# Code → Video

Tulis composition JavaScript, lihat preview, lalu encode video **di perangkat pengunjung**. Aplikasi web-nya tanpa dependency, tanpa build step, tanpa FFmpeg. Ada juga AI Chatku yang menulis composition dari deskripsi, dan aplikasi Android lewat Capacitor.

## Cara kerja

- Frame digambar ke canvas, lalu dikirim ke encoder browser lewat **WebCodecs**.
- **mp4-muxer** (di-load otomatis dari CDN) membungkus hasilnya jadi `.mp4` H.264.
- Browser tanpa WebCodecs memakai **MediaRecorder** dan menghasilkan `.webm`.
- Setelah selesai, file diunggah ke server dan disimpan di `output/`. Galeri membaca folder itu.
- Composition dan riwayat chat tersimpan di `localStorage`.

## Menjalankan

Butuh Node.js 16 atau lebih baru. Tidak ada dependency untuk aplikasi web.

```bash
node server.js
```

Buka `http://localhost:3000`. Port bisa diganti lewat `PORT=4000 node server.js`.

### Di Termux (Android)

```bash
pkg install -y nodejs git
git clone https://github.com/BunglonMewing/Vcode.git
cd Vcode
node server.js
```

## Fitur

- Editor composition dengan template 2D dan 3D
- **Composition dari JS murni**: body fungsi biasa, atau modul penuh (`export default`, `function draw(...)`, objek `{ draw, setup }`)
- **BLok `/* meta {...} */`** untuk menentukan durasi, FPS, rasio, dan resolusi langsung dari kode
- **Remotion-style runtime**: `interpolate`, `spring`, `Easing`, `Sequence`, `random` tersedia langsung di composition tanpa React
- **AI Chatku**: chat yang menulis composition, lalu satu tombol untuk memasang kodenya atau langsung merendernya
- **Skill library** untuk AI: Remotion inti, timing & easing, layout video, multi-scene, canvas 2D
- Panel props otomatis dari blok `/* props [...] */`
- Render MP4 di browser dengan resolusi, rasio, kualitas, FPS, dan durasi yang bisa diatur
- Audio opsional dengan loop, di-decode dan di-encode di browser
- Galeri dari folder `output/`: putar, unduh, hapus
- Impor dan ekspor composition sebagai JSON
- Antarmuka Material 3 dengan mode terang dan gelap otomatis
- Service worker untuk memuat ulang aplikasi saat offline
- Aplikasi Android (Capacitor) dan APK otomatis lewat GitHub Actions

## Composition

Dua bentuk yang diterima editor.

**1. Body fungsi** — variabel `ctx`, `t`, `W`, `H`, `D`, `P`, plus `FPS` dan helper Remotion:

```js
/* meta { "duration": 5, "fps": 30, "ratio": "9:16" } */
const frame = Math.round(t * FPS);
ctx.fillStyle = '#0b0d14';
ctx.fillRect(0, 0, W, H);
const masuk = spring({ frame, fps: FPS, config: { damping: 14 } });
```

**2. Modul JS penuh**:

```js
export default function draw(ctx, t, W, H, D, P) { /* ... */ }
```

atau `function draw(...)`, `function render(...)`, `function frame(...)`, atau objek `{ setup(ctx, env), draw(ctx, t, W, H, D, P) }`. `import` dibuang saat compile karena tidak ada modul dari jaringan.

Referensi lengkap ada di [public/docs.md](public/docs.md) dan di tab **Docs** aplikasi. Skill untuk AI agent ada di [public/SKILL.md](public/SKILL.md) dan [public/skills/](public/skills/).

## AI Chatku

Chat berjalan di tab **AI**. Kode dibuat oleh model, dikirim lewat proxy server sehingga kunci tidak pernah sampai ke browser.

Set kunci di berkas `.env` (diabaikan git) atau variabel lingkungan:

| Variabel | Arti |
|---|---|
| `AI_API_KEY` | Kunci penyedia AI |
| `AI_BASE_URL` | Endpoint OpenAI-compatible milik penerbit kunci, tanpa `/` di akhir |
| `AI_MODEL` | Default `deepseek-v4.1-flash-1017` |
| `AI_TIMEOUT_MS` | Batas waktu permintaan, default 120000 |

Contoh `.env` ada di [.env.example](.env.example).

Endpoint yang dipakai aplikasi:

- `GET /api/ai/config` → status konfigurasi dan nama model (tanpa kunci)
- `POST /api/ai/chat` → proxy streaming SSE ke `{AI_BASE_URL}/chat/completions`

Tanpa server (misalnya di aplikasi Android), isi **Pengaturan AI** di dalam aplikasi: base URL, kunci, dan model. Kunci disimpan di `localStorage` perangkat dan dikirim langsung ke penyedia.

## Aplikasi Android (Capacitor)

Aset web ada di `public/`, jadi Capacitor memakai folder itu langsung.

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```

Atau build APK debug dari terminal:

```bash
npm run android:apk
```

APK di `android/app/build/outputs/apk/debug/`. Folder `android/` tidak di-commit; dibuat ulang oleh `npx cap add android`.

Catatan: di perangkat, AI Chatku butuh kunci di Pengaturan AI karena tidak ada proxy server. Render video memakai encoder yang tersedia di Android System WebView.

## Build APK di GitHub Actions

Workflow [.github/workflows/android.yml](.github/workflows/android.yml) berjalan pada push ke `main`, pull request, dan manual:

1. Node 22 + JDK 21
2. `npm install`
3. `npx cap add android` (bila belum ada) lalu `npx cap sync android`
4. `./gradlew assembleDebug`
5. APK diunggah sebagai artifact `code-video-debug-apk`

Untuk build release bertanda tangan, tambahkan keystore dan secret sendiri; workflow ini sengaja hanya membuat APK debug agar tidak butuh kunci.

## Struktur proyek

```
.
├── server.js              Server HTTP: file statis, API video, proxy AI
├── capacitor.config.json  Konfigurasi aplikasi Android
├── output/                Video hasil render (dibuat otomatis, tidak di-commit)
└── public/
    ├── index.html       Layout Material 3
    ├── style.css        Token dan komponen Material 3
    ├── app.js           Editor, props, preview, galeri, penyimpanan
    ├── compiler.js      Compiler composition (body fungsi + modul JS)
    ├── remotion.js      interpolate, spring, Easing, Sequence, random
    ├── render.js        Encoder browser: WebCodecs + mp4-muxer, MediaRecorder
    ├── ai.js            Transport AI, riwayat, penyusunan prompt
    ├── ai-page.js       UI AI Chatku
    ├── gallery.js       Klien API video server
    ├── templates.js     Template composition bawaan
    ├── docs.md          Referensi composition
    ├── SKILL.md         Skill untuk AI agent
    ├── skills/          Library skill (Remotion, timing, layout, multi-scene, canvas)
    ├── sw.js            Service worker
    └── manifest.json    Manifest PWA
```

## API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/videos` | Daftar video di `output/` |
| POST | `/api/videos` | Simpan video hasil render (header `X-Filename`, body file) |
| DELETE | `/api/videos/:name` | Hapus satu video |
| GET | `/api/ai/config` | Status konfigurasi AI |
| POST | `/api/ai/chat` | Proxy streaming chat ke penyedia AI |
| GET | `/output/:name` | Streaming video, mendukung Range |
| GET | `/output/:name?download=1` | Unduh video |

Batas unggahan 250 MB per file. Nama file dibersihkan dan dibuat unik oleh server.

## Catatan render

- Satu render berjalan di tab yang sedang dipakai. Menutup tab menghentikan render.
- Pada jalur MediaRecorder, render berjalan real-time, jadi video 30 detik butuh 30 detik.
- Resolusi 4K dan durasi panjang butuh memori besar. Turunkan resolusi atau kualitas bila encoder menolak.
- Jika server tidak bisa dijangkau saat menyimpan, video tetap bisa diunduh dari panel hasil.

## Lisensi

MIT. Lihat `LICENSE.txt`.
