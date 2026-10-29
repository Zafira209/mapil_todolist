import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

interface TokenPayload extends JwtPayload {
  userId: number;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ success: false, message: "Bearer token diperlukan." });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ success: false, message: "Konfigurasi autentikasi server belum tersedia." });
    return;
  }
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || !Number.isSafeInteger((payload as TokenPayload).userId) || (payload as TokenPayload).userId <= 0) {
      res.status(401).json({ success: false, message: "Token tidak valid." });
      return;
    }
    req.userId = (payload as TokenPayload).userId;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token tidak valid atau sudah kedaluwarsa." });
  }
}
