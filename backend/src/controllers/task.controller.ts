import type { Response } from "express";
import { ResultSetHeader, type RowDataPacket } from "mysql2";
import { pool } from "../db/index.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const categories = ["School", "Personal", "Others"] as const;
const priorities = ["Low", "Medium", "High"] as const;
type Category = (typeof categories)[number];
type Priority = (typeof priorities)[number];

interface TaskRow extends RowDataPacket {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  category: Category;
  priority: Priority;
  due_date: string | null;
  is_completed: number | boolean;
  created_at: string;
  updated_at: string;
}

function getUserId(req: AuthenticatedRequest, res: Response): number | null {
  if (req.userId === undefined) {
    res.status(401).json({ success: false, message: "Autentikasi diperlukan." });
    return null;
  }
  return req.userId;
}

function parseTaskInput(body: unknown): { title: string; description: string | null; category: Category; priority: Priority; dueDate: string | null; isCompleted?: boolean } | string {
  if (!body || typeof body !== "object") return "Data tugas tidak valid.";
  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = input.description === undefined || input.description === null ? "" : typeof input.description === "string" ? input.description.trim() : null;
  const category = input.category;
  const priority = input.priority;
  const dueDate = input.due_date;
  if (!title || title.length > 150) return "Judul wajib diisi dan maksimal 150 karakter.";
  if (description === null || description.length > 5000) return "Deskripsi harus berupa teks maksimal 5000 karakter.";
  if (typeof category !== "string" || !categories.includes(category as Category)) return "Kategori harus School, Personal, atau Others.";
  if (typeof priority !== "string" || !priorities.includes(priority as Priority)) return "Prioritas harus Low, Medium, atau High.";
  if (dueDate !== undefined && dueDate !== null && (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isRealDate(dueDate))) return "Deadline harus berupa tanggal valid dengan format YYYY-MM-DD.";
  let isCompleted: boolean | undefined;
  if (input.is_completed !== undefined) {
    if (typeof input.is_completed !== "boolean" && input.is_completed !== 0 && input.is_completed !== 1) return "Status selesai tidak valid.";
    isCompleted = input.is_completed === true || input.is_completed === 1;
  }
  return { title, description: description || null, category: category as Category, priority: priority as Priority, dueDate: (dueDate as string | null | undefined) ?? null, isCompleted };
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function serializeTask(task: TaskRow) {
  return { ...task, is_completed: Boolean(task.is_completed), due_date: task.due_date ? task.due_date.slice(0, 10) : null };
}

export async function getTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const [rows] = await pool.execute<TaskRow[]>(
    "SELECT id, user_id, title, description, category, priority, due_date, is_completed, created_at, updated_at FROM tasks WHERE user_id = ? ORDER BY is_completed ASC, due_date IS NULL, due_date ASC, created_at DESC",
    [userId]
  );
  res.json({ success: true, data: rows.map(serializeTask) });
}

export async function createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const parsed = parseTaskInput(req.body);
  if (typeof parsed === "string") {
    res.status(400).json({ success: false, message: parsed });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO tasks (user_id, title, description, category, priority, due_date, is_completed) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [userId, parsed.title, parsed.description, parsed.category, parsed.priority, parsed.dueDate, parsed.isCompleted ?? false]
  );
  const [rows] = await pool.execute<TaskRow[]>(
    "SELECT id, user_id, title, description, category, priority, due_date, is_completed, created_at, updated_at FROM tasks WHERE id = ? AND user_id = ?",
    [result.insertId, userId]
  );
  res.status(201).json({ success: true, message: "Tugas berhasil ditambahkan.", data: serializeTask(rows[0]) });
}

export async function updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: "ID tugas tidak valid." });
    return;
  }
  const parsed = parseTaskInput(req.body);
  if (typeof parsed === "string") {
    res.status(400).json({ success: false, message: parsed });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE tasks SET title = ?, description = ?, category = ?, priority = ?, due_date = ?, is_completed = COALESCE(?, is_completed) WHERE id = ? AND user_id = ?",
    [parsed.title, parsed.description, parsed.category, parsed.priority, parsed.dueDate, parsed.isCompleted === undefined ? null : parsed.isCompleted, id, userId]
  );
  if (result.affectedRows === 0) {
    const [existing] = await pool.execute<RowDataPacket[]>("SELECT id FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
    if (!existing.length) {
      res.status(404).json({ success: false, message: "Tugas tidak ditemukan." });
      return;
    }
  }
  const [rows] = await pool.execute<TaskRow[]>(
    "SELECT id, user_id, title, description, category, priority, due_date, is_completed, created_at, updated_at FROM tasks WHERE id = ? AND user_id = ?",
    [id, userId]
  );
  res.json({ success: true, message: "Tugas berhasil diperbarui.", data: serializeTask(rows[0]) });
}

export async function deleteTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: "ID tugas tidak valid." });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>("DELETE FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
  if (result.affectedRows === 0) {
    res.status(404).json({ success: false, message: "Tugas tidak ditemukan." });
    return;
  }
  res.json({ success: true, message: "Tugas berhasil dihapus." });
}
