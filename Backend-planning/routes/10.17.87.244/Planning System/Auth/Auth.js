const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const { pool_smart } = require("../../config");
const query = (text, params) => pool_smart.query(text, params);

// อายุ Session 1 ชั่วโมง (3,600 วินาที) ตามที่กำหนด
const TOKEN_TTL_SECONDS = 60 * 60;
const JWT_SECRET =
  process.env.PLANNING_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "fujikura_smart_planning_jwt_secret_2026";

const setNoCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
};

// ── Password Hashing Helpers (Node Built-in crypto.scrypt) ──────────
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || typeof storedHash !== "string") return false;
  const pwd = String(password ?? "");

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$");
    if (parts.length !== 3) return false;
    const [, salt, keyHex] = parts;
    try {
      const keyBuf = Buffer.from(keyHex, "hex");
      const derivedKey = crypto.scryptSync(pwd, salt, 64);
      if (keyBuf.length !== derivedKey.length) return false;
      return crypto.timingSafeEqual(keyBuf, derivedKey);
    } catch {
      return false;
    }
  }

  // Fallback กรณีมีการเพิ่มรหัสผ่านแบบ Plain text ลงใน DB โดยตรงผ่าน DBeaver/pgAdmin
  const a = Buffer.from(pwd, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// ── JWT Helpers (HS256) ──────────────────────────────────────────────
const signToken = (payload) => {
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;
  const fullPayload = { ...payload, iat: now, exp };

  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString(
    "base64url"
  );
  const data = `${headerB64}.${payloadB64}`;
  const signatureB64 = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64url");

  return {
    token: `${data}.${signatureB64}`,
    expiresAt: exp * 1000,
    expiresIn: TOKEN_TTL_SECONDS,
  };
};

const verifyToken = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  try {
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(data)
      .digest();
    const actualSig = Buffer.from(signatureB64, "base64url");

    if (
      expectedSig.length !== actualSig.length ||
      !crypto.timingSafeEqual(expectedSig, actualSig)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

// ── Database Initialization (Auto-create table & seed default admin) ─
let dbInitPromise = null;

const initAuthDb = () => {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS planning.planning_users (
          user_id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name VARCHAR(100) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'admin')),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // เพิ่มคอลัมน์เก็บประวัติผู้ทำรายการ (Audit Trail) ในตารางเดิมหากยังไม่มี
      await query(`
        ALTER TABLE planning.exchange_rate_monthly
        ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
      `);

      await query(`
        ALTER TABLE planning.planning_lot_skip
        ADD COLUMN IF NOT EXISTS skipped_by VARCHAR(100);
      `);

      // สร้าง User เริ่มต้น: username = admin, password = admin
      const defaultAdminHash = hashPassword("admin");
      await query(
        `
          INSERT INTO planning.planning_users (username, password_hash, full_name, role, is_active)
          VALUES ($1, $2, $3, 'admin', TRUE)
          ON CONFLICT (username) DO NOTHING;
        `,
        ["admin", defaultAdminHash, "Administrator"]
      );
    } catch (err) {
      console.error("Failed to initialize planning_users table:", err.message);
      dbInitPromise = null;
    }
  })();

  return dbInitPromise;
};

// เรียกเตรียมตารางทันทีเมื่อโหลดโมดูล
initAuthDb();

// ── Middleware: ตรวจสอบสิทธิ์ Admin สำหรับ API แก้ไขข้อมูล ─────────────
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      status: "ERROR",
      code: "UNAUTHORIZED",
      message: "Session expired or not logged in. Please login as Admin.",
    });
  }

  if (String(payload.role).toLowerCase() !== "admin") {
    return res.status(403).json({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "Admin permission is required for this action.",
    });
  }

  req.user = payload;
  next();
};

// ── POST /api_p1/planning/auth/login ─────────────────────────────────
router.post("/login", async (req, res) => {
  setNoCache(res);
  await initAuthDb();

  const username =
    typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!username || !password) {
    return res.status(400).json({
      status: "ERROR",
      message: "Please enter both username and password.",
    });
  }

  try {
    const { rows } = await query(
      `
        SELECT user_id, username, password_hash, full_name, role, is_active
        FROM planning.planning_users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username]
    );

    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        status: "ERROR",
        message: "Invalid username or password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: "ERROR",
        message: "This account has been deactivated.",
      });
    }

    if (String(user.role).toLowerCase() !== "admin") {
      return res.status(403).json({
        status: "ERROR",
        message: "This account does not have Admin privileges.",
      });
    }

    const userPayload = {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };

    const { token, expiresAt, expiresIn } = signToken(userPayload);

    return res.json({
      status: "OK",
      data: {
        token,
        expiresAt,
        expiresIn,
        user: userPayload,
      },
      message: "Login successful.",
    });
  } catch (err) {
    console.error("Error in POST /auth/login:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal server error during login.",
    });
  }
});

// ── GET /api_p1/planning/auth/me ─────────────────────────────────────
router.get("/me", (req, res) => {
  setNoCache(res);
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      status: "ERROR",
      code: "UNAUTHORIZED",
      data: {
        authenticated: false,
        role: "viewer",
        user: null,
      },
      message: "Not authenticated or session expired.",
    });
  }

  return res.json({
    status: "OK",
    data: {
      authenticated: true,
      role: payload.role,
      expiresAt: payload.exp * 1000,
      user: {
        user_id: payload.user_id,
        username: payload.username,
        full_name: payload.full_name,
        role: payload.role,
      },
    },
    message: "Session valid.",
  });
});

module.exports = {
  router,
  verifyAdmin,
  initAuthDb,
  hashPassword,
  verifyPassword,
};

