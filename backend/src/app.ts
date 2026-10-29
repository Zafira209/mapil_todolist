import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import taskRoutes from "./routes/task.routes.js";
import { pool } from "./db/index.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const configuredOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin: configuredOrigins?.length ? configuredOrigins : true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "20kb" }));
app.get("/api/health", (_req, res) => res.json({ success: true, message: "Daylist API is running." }));
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use((_req, res) => res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." }));

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  console.error("API error:", error);
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ success: false, message: "JSON request tidak valid." });
    return;
  }
  res.status(500).json({ success: false, message: "Terjadi kesalahan server. Silakan coba lagi." });
};
app.use(errorHandler);

async function start(): Promise<void> {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET wajib diisi dengan minimal 32 karakter.");
  }
  await pool.query("SELECT 1");
  app.listen(port, () => console.log(`Daylist API listening on http://localhost:${port}`));
}

start().catch((error: unknown) => {
  console.error("Failed to start Daylist API:", error);
  process.exitCode = 1;
});

export default app;
