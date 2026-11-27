# Skill: Layout video

Video dibaca dari jauh, sekilas, di layar kecil. Tata letak harus jauh lebih tegas daripada UI.

## Grid aman

- Margin aman 8% dari sisi pendek: `const M = Math.min(W, H) * 0.08;`
- Konten utama berada di dalam `M` dari setiap tepi.
- Untuk 9:16 (Reels/TikTok/Shorts), sisakan 14% atas dan 18% bawah agar tidak tertutup UI aplikasi.
- Jangan menaruh teks penting di pojok.

## Skala teks

Ukuran dalam piksel, dihitung dari `U = Math.min(W, H)`:

| Peran | Ukuran | Bobot |
|---|---|---|
| Judul besar / hero | `U * 0.13` – `U * 0.16` | bold |
| Subjudul | `U * 0.06` – `U * 0.075` | 600 |
| Body / caption | `U * 0.04` – `U * 0.05` | normal |
| Label kecil | `U * 0.028` | 500 |

Satu frame hanya boleh punya satu elemen terbesar. Jika dua elemen bersaing, salah satunya terlalu besar.

## Teks

- Maksimal dua famili: satu sans-serif tegas untuk judul, satu sans-serif netral untuk body.
- Panjang baris caption 32–42 karakter. Pecah manual dengan `fillText` per baris.
- `ctx.textBaseline = 'alphabetic'` untuk paragraf, `'middle'` untuk label di dalam bentuk.
- Selalu ukur: `ctx.measureText(str).width` dan kecilkan font jika melebihi lebar aman.
- Kontras teks terhadap latar minimal 4.5:1. Di atas video terang, tambahkan scrim
  `rgba(0,0,0,alpha)` di belakang teks.

## Warna

- Satu warna aksen. Sisanya netral gelap atau terang.
- Latar gelap: `#0b0d14` sampai `#171a24`. Hindari hitam murni `#000` untuk bidang besar.
- Gradien untuk memberi arah cahaya, bukan hiasan. Dua stop cukup.
- Bayangan lembut lebih terbaca daripada garis tepi tebal.

## Gerak

- Satu gerakan besar per adegan. Elemen pendukung bergerak lebih kecil dan lebih lambat.
- Jarak geser 4–8% dari tinggi frame; lebih dari itu terasa berlebihan.
- Durasi masuk 0.4–0.8 detik. Lebih dari 1 detik terasa lambat.
- Elemen yang sama bergerak dengan kurva yang sama.

## Komposisi

- Aturan sepertiga: titik fokus di `W/3` atau `2W/3`, bukan selalu tengah.
- Beri ruang kosong. Video yang penuh terasa murah.
- Angka besar dengan label kecil adalah pola yang kuat, bukan default yang harus dihindari.
