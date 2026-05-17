import jwt from "jsonwebtoken";
import type { SafeUser } from "@workspace/db";

function getSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required for JWT signing");
  }
  return secret;
}

const EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function signToken(user: Pick<SafeUser, "id" | "email" | "role">): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role } satisfies Omit<JwtPayload, "iat" | "exp">,
    getSecret(),
    { expiresIn: EXPIRES_IN },
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}

export const COOKIE_NAME = "auth_token";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};
