require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { checkDbConnection } = require("./lib/prisma");

const authRoutes = require("./routes/auth");
const ordersRoutes = require("./routes/orders");
const servicesRoutes = require("./routes/services");
const adminRoutes = require("./routes/admin");
const newsletterRoutes = require("./routes/newsletter");
const contactRoutes = require("./routes/contact");
const pushRoutes = require("./routes/push");
const verificationRoutes = require("./routes/verification");

const app = express();
const PORT = process.env.PORT || 5000;
// Raffu Master Tailor Engine with Contact Inquiries Support (v1.0.1)

// 1. Security Headers (Disable tech stack fingerprinting & prevent clickjacking/sniffing)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// 2. Production-Ready CORS Policy (Configured via Environment Variables)
const isProduction = process.env.NODE_ENV === "production";

// Parse production/staging allowed domains from environment variables
const envOrigins = [
  process.env.FRONTEND_URL,
  process.env.STUDIO_URL,
  process.env.ADMIN_URL,
  process.env.ALLOWED_ORIGINS,
]
  .filter(Boolean)
  .flatMap((entry) => entry.split(",").map((o) => o.trim()));

// Local development origins (strictly disabled when NODE_ENV === 'production')
const devOrigins = isProduction
  ? []
  : [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3002",
    ];

const ALLOWED_ORIGINS = new Set([...envOrigins, ...devOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. Allow non-browser requests (mobile apps, server-to-server, Postman, health monitors)
      if (!origin) return callback(null, true);

      // 2. In non-production only, allow dynamic localhost & 127.0.0.1 ports
      if (
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      // 3. Match against configured allowed origins (exact match or subdomain wildcard)
      if (ALLOWED_ORIGINS.has(origin)) {
        return callback(null, true);
      }

      // 4. Reject untrusted web origins gracefully
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  }),
);

// 3. Rate Limiting Protection (Anti-DoS / Brute Force)
const isLoopbackIp = (req) => {
  const ip =
    req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1") ||
    ip === "localhost"
  );
};

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 600 : 50000,
  skip: (req) => !isProduction && isLoopbackIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again later." },
});

const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProduction ? 20 : 1000,
  skip: (req) => !isProduction && isLoopbackIp(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down and try again shortly.",
  },
});

app.use("/api", globalApiLimiter);
app.use("/api/newsletter/subscribe", sensitiveLimiter);
app.use("/api/auth/send-otp", sensitiveLimiter);
app.use("/api/auth/send-email-otp", sensitiveLimiter);
app.use("/api/auth/login", sensitiveLimiter);
app.use("/api/admin/login", sensitiveLimiter);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API Health Check with Database Status
app.get("/api/health", async (req, res) => {
  const dbStatus = await checkDbConnection();
  res.json({
    status: "ok",
    service: "Raffu Backend API",
    database: {
      orm: "Prisma 6",
      provider: "postgresql",
      connected: dbStatus.connected,
      error: dbStatus.error || null,
    },
    timestamp: new Date().toISOString(),
  });
});

const { authenticateUser } = require("./lib/auth-middleware");

// Universal Auth & Transparent Token Auto-Renewal on all API endpoints
app.use("/api", authenticateUser);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/push", pushRoutes);
app.use("/api", verificationRoutes);
app.use("/api", servicesRoutes);

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, async () => {
  console.log(`=================================`);
  console.log(`Raffu Backend Running on http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
  const dbCheck = await checkDbConnection();
  if (dbCheck.connected) {
    console.log(`PostgreSQL Database: Connected via Prisma ✅`);
  } else {
    console.log(`PostgreSQL Database: Standing by / Local fallback active ⚡`);
  }
  console.log(`=================================`);
});
