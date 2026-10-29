# Daylist

Daylist adalah aplikasi daftar tugas full-stack dengan frontend HTML/CSS/JavaScript vanilla, backend Express + TypeScript, dan penyimpanan MySQL. Setiap tugas terikat ke akun pemiliknya; API tugas selalu mengambil identitas dari JWT, bukan dari request body.

## Kebutuhan

- Node.js 20 atau lebih baru dan npm
- MySQL 8 atau kompatibel
- VS Code (opsional, disarankan)
- Live Server extension untuk menyajikan `frontend/`
- Thunder Client extension untuk menguji API (opsional)

## Instalasi dan menjalankan

1. Pastikan Node.js dan MySQL sudah terpasang dan layanan MySQL berjalan.
2. Dari folder root project, instal dependensi:

   ```sh
   npm install
   ```

3. Buat database dan tabel. Impor `database.sql` melalui MySQL Workbench/phpMyAdmin, atau jalankan:

   ```sh
   mysql -u root -p < database.sql
   ```

4. Salin `.env.example` menjadi `.env`, lalu isi kredensial MySQL setempat. Atur `JWT_SECRET` ke nilai acak minimal 32 karakter. Jangan commit `.env`.

   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=password_mysql_anda
   DB_NAME=daylist_db
   JWT_SECRET=secret_acak_minimal_32_karakter
   CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5500
   ```

5. Periksa tipe TypeScript:

   ```sh
   npm run typecheck
   ```

6. Jalankan backend dari root project:

   ```sh
   npm run dev
   ```

   API akan tersedia di `http://localhost:3000`. Cek `http://localhost:3000/api/health`.

7. Jalankan frontend dengan Live Server: buka `frontend/index.html`, lalu pilih **Open with Live Server**. URL Live Server harus sesuai salah satu origin di `CORS_ORIGIN`. Frontend memanggil `http://localhost:3000/api`.

## Endpoint API

Semua respons menggunakan JSON dengan bentuk umum `{ "success": boolean, "message"?: string, "data"?: ... }`.

| Method | Path | Auth | Fungsi |
|---|---|---:|---|
| POST | `/api/auth/register` | Tidak | Membuat akun (name, email, password) |
| POST | `/api/auth/login` | Tidak | Login; mengembalikan token dan profil |
| GET | `/api/tasks` | Bearer JWT | Daftar tugas pengguna aktif |
| GET | `/api/tasks/` | Bearer JWT | Sama dengan daftar tugas |
| POST | `/api/tasks` | Bearer JWT | Membuat tugas |
| PUT | `/api/tasks/:id` | Bearer JWT | Memperbarui tugas milik pengguna |
| DELETE | `/api/tasks/:id` | Bearer JWT | Menghapus tugas milik pengguna |

Contoh body tugas:

```json
{
  "title": "Review catatan biologi",
  "description": "Pelajari bab sistem pencernaan",
  "category": "School",
  "priority": "Medium",
  "due_date": "2026-10-30",
  "is_completed": false
}
```

## Menguji dengan Thunder Client

1. Kirim `POST http://localhost:3000/api/auth/register` dengan JSON:
   `{"name":"Zafira","email":"zafira@example.com","password":"password123"}`.
2. Kirim `POST http://localhost:3000/api/auth/login` dengan `{"email":"zafira@example.com","password":"password123"}`. Salin `data.token`.
3. Untuk CRUD, tambahkan header `Authorization: Bearer <token>` dan `Content-Type: application/json`.
4. Coba `POST /api/tasks`, `GET /api/tasks`, `PUT /api/tasks/<id>`, lalu `DELETE /api/tasks/<id>`.
5. Buat akun kedua dan pastikan akun itu tidak bisa membaca atau mengubah task pengguna pertama (akan menerima 404 untuk ID yang bukan miliknya).

## Catatan keamanan token

Frontend menyimpan JWT dan profil pengguna di `sessionStorage`, bukan sebagai basis data. Token dibersihkan ketika tab/sesi browser ditutup; token yang aktif masih dapat dibaca oleh JavaScript pada halaman yang sama, sehingga serangan XSS dapat mencurinya. Karena itu gunakan HTTPS saat deploy, batasi dan sanitasi konten, dan jangan menyimpan password di browser. Untuk aplikasi publik, pertimbangkan cookie `HttpOnly`, `Secure`, `SameSite` dengan proteksi CSRF.

## Struktur

```text
frontend/
  index.html
  style.css
  script.js
backend/src/
  app.ts
  db/index.ts
  routes/auth.routes.ts
  routes/task.routes.ts
  controllers/auth.controller.ts
  controllers/task.controller.ts
  middleware/auth.ts
database.sql
```
