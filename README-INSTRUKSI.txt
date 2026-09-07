KAS RAJAWALI 3 — NETLIFY FRONTEND + GOOGLE APPS SCRIPT BACKEND

Tujuan:
- Anggota membuka URL Netlify sehingga banner Google Apps Script tidak muncul.
- Google Apps Script tetap menjadi backend/database.
- UI Kas Rajawali 3 tetap memakai versi V2.

FILE:
- index.html                 = frontend V2, sudah memakai fetch ke Netlify Function.
- netlify/functions/api.js  = proxy server-side ke GAS.
- netlify.toml              = konfigurasi Netlify Functions.

SEBELUM DEPLOY NETLIFY:
1. Buka project Google Apps Script Kas Rajawali 3.
2. Ganti Code.gs dengan file "Kas_Rajawali_3_Netlify_Code.gs" dari paket ini.
3. Save.
4. Deploy > Manage deployments > Edit deployment.
5. Buat/Update Web app dengan akses "Anyone".
6. Pastikan URL /exec tetap: https://script.google.com/macros/s/AKfycbzXbzsRly-0bvzyMeAbEuGQUNO6Zba8TCVenTsAXT36FQPHGl4fBVpFENTyJqWzSYOURQ/exec

DEPLOY NETLIFY (PILIH SALAH SATU):
A. GITHUB — paling mudah tanpa install software tambahan:
   1. Buat repository GitHub baru, misalnya kas-rajawali-3.
   2. Upload struktur file ini persis:
      index.html
      netlify.toml
      netlify/functions/api.js
   3. Di Netlify pilih Add new project > Import an existing project > GitHub.
   4. Pilih repository tersebut.
   5. Publish directory: .
   6. Functions directory: netlify/functions (biasanya terdeteksi otomatis).
   7. Deploy.

B. NETLIFY CLI — cocok kalau Node.js sudah terpasang:
   Buka Terminal/CMD di folder paket lalu jalankan:
   npm install -g netlify-cli
   netlify login
   netlify deploy --build --prod
   Ikuti pilihan site yang diminta.

PENTING:
- Jangan memakai Netlify Drop/drag-and-drop untuk paket ini karena Netlify Functions perlu deployment melalui Git atau Netlify CLI.
- Netlify Functions memiliki batas request/response buffered 6 MB. Karena upload gambar memakai base64, versi Netlify membatasi upload media menjadi 4 MB agar aman.
- Password admin tetap hanya di Google Apps Script Script Properties pada ADMIN_PASSWORD.
- Jangan menaruh password admin di index.html atau api.js.

OPSIONAL:
Di Netlify Environment variables, buat:
GAS_URL = URL /exec Google Apps Script kamu
Jika tidak dibuat, api.js memakai URL GAS yang sudah terpasang di file.

HASIL:
Anggota membuka URL seperti:
https://kasrajawali3.netlify.app

Halaman tidak lagi dibungkus UI Google Apps Script, sehingga banner:
"This application was created by a Google Apps Script user"
tidak muncul.
