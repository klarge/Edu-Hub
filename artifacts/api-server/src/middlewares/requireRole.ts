import type { Request, Response, NextFunction } from "express";

type Role = "admin" | "training_lead" | "manager" | "user";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  training_lead: 3,
  manager: 2,
  user: 1,
};

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userRole = req.user.role as Role;
    if (!roles.includes(userRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function requireMinRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userRole = req.user.role as Role;
    if ((ROLE_HIERARCHY[userRole] ?? 0) < (ROLE_HIERARCHY[minRole] ?? 0)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
