import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ResultSetHeader, type RowDataPacket } from "mysql2";
import { pool } from "../db/index.js";

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
}

function validEmail(email: string): boolean {
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function register(req: Request, res: Response): Promise<void> {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!name || name.length > 100) {
    res.status(400).json({ success: false, message: "Nama wajib diisi dan maksimal 100 karakter." });
    return;
  }
  if (!validEmail(email)) {
    res.status(400).json({ success: false, message: "Alamat email tidak valid." });
    return;
  }
  if (password.length < 8 || password.length > 72) {
    res.status(400).json({ success: false, message: "Password harus memiliki 8 sampai 72 karakter." });
    return;
  }
  const [existing] = await pool.execute<RowDataPacket[]>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (existing.length) {
    res.status(409).json({ success: false, message: "Email sudah terdaftar." });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute<ResultSetHeader>("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, passwordHash]);
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum dikonfigurasi.");
  const token = jwt.sign({ userId: result.insertId }, secret, { expiresIn: "1d" });
  res.status(201).json({ success: true, message: "Akun berhasil dibuat.", data: { token, user: { id: result.insertId, name, email } } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!validEmail(email) || !password) {
    res.status(400).json({ success: false, message: "Email dan password yang valid wajib diisi." });
    return;
  }
  const [rows] = await pool.execute<UserRow[]>("SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ success: false, message: "Email atau password salah." });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET belum dikonfigurasi.");
  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "1d" });
  res.json({ success: true, message: "Login berhasil.", data: { token, user: { id: user.id, name: user.name, email: user.email } } });
}
