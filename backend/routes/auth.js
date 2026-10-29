const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { prisma } = require("../lib/prisma");
const {
  validateAndFormatPhone,
  sendVerificationSms,
  saveOtp,
  verifyOtp,
} = require("../lib/sms");
const { sendAuthOtpEmail, sendWelcomeEmail } = require("../lib/email");
const { hashPassword } = require("../lib/password");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

// In-memory OTP storage: phone -> { code, expiresAt }
const otpStore = new Map();

// One-time authorization code registry for cross-app handover (Option A)
// Map: authCode -> { token, user, role, expiresAt }
const authCodeStore = new Map();

function createAuthCode(user, token, roleOverride) {
  if (!user || !token) return null;
  const code = `ac_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  authCodeStore.set(code, {
    token,
    user,
    role: roleOverride || user.role || "CUSTOMER",
    expiresAt: Date.now() + 60 * 1000, // 60 seconds TTL (single-use)
  });
  return code;
}

// Periodic cleanup of expired authorization codes
setInterval(() => {
  const now = Date.now();
  for (const [code, item] of authCodeStore.entries()) {
    if (item.expiresAt < now) {
      authCodeStore.delete(code);
    }
  }
}, 30 * 1000);

// 24-Hour Expiration Cleanup for TEMP_STUDIO accounts
async function cleanupExpiredTempStudioUsers() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expiredUsers = await prisma.user.findMany({
      where: {
        role: "TEMP_STUDIO",
        createdAt: { lt: cutoff },
      },
      select: { id: true, studioId: true },
    });

    if (expiredUsers && expiredUsers.length > 0) {
      const userIds = expiredUsers.map((u) => u.id);
      const studioIds = expiredUsers.map((u) => u.studioId).filter(Boolean);

      if (studioIds.length > 0) {
        await prisma.partnerStore
          .deleteMany({
            where: { id: { in: studioIds } },
          })
          .catch(() => {});
      }

      const deleted = await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });

      console.log(
        `[TEMP-STUDIO-CLEANUP] Cleared ${deleted.count} expired TEMP_STUDIO accounts (>24h old).`,
      );
    }
  } catch (err) {
    console.warn("[TEMP-STUDIO-CLEANUP] Notice:", err.message);
  }
}

// Run cleanup on launch and every 15 minutes
cleanupExpiredTempStudioUsers();
setInterval(cleanupExpiredTempStudioUsers, 15 * 60 * 1000);

// Helper to check if a TEMP_STUDIO user has exceeded 24 hours
async function isUserExpiredTempStudio(user) {
  if (!user || user.role !== "TEMP_STUDIO") return false;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (new Date(user.createdAt) < cutoff) {
    try {
      if (user.studioId) {
        await prisma.partnerStore
          .delete({ where: { id: user.studioId } })
          .catch(() => {});
      }
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      console.log(
        `[TEMP-STUDIO] Expired user ${user.id} (${user.email || user.phone}) cleared after 24h.`,
      );
    } catch (_) {}
    return true;
  }
  return false;
}

const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRY = "15d"; // 15 days

// Encrypted HMAC hash of refresh token for secure database storage
function hashRefreshToken(token) {
  if (!token) return null;
  return crypto
    .createHmac("sha256", JWT_REFRESH_SECRET)
    .update(token)
    .digest("hex");
}

// Helper to generate access token (15 minutes)
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      name: user.name,
      role: user.role || "CUSTOMER",
      status: user.status || "ACTIVE",
      studioId: user.studioId || null,
      tokenType: "access",
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );
}

// Helper to generate refresh token (15 days)
function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role || "CUSTOMER",
      status: user.status || "ACTIVE",
      studioId: user.studioId || null,
      studioName: user.studioName || null,
      tokenType: "refresh",
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );
}

// Dual Token generator returning Access Token (15m) & Refresh Token (15d) with encrypted DB persistence
async function generateTokens(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const hashedRt = hashRefreshToken(refreshToken);

  if (user?.id && !String(user.id).startsWith("temp_g_")) {
    try {
      let previousHash = null;
      try {
        const existingUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { refreshToken: true },
        });
        if (existingUser?.refreshToken) {
          if (existingUser.refreshToken.startsWith("{")) {
            const parsed = JSON.parse(existingUser.refreshToken);
            previousHash = parsed.current || null;
          } else {
            previousHash = existingUser.refreshToken;
          }
        }
      } catch (_) {}

      const tokenPayload = JSON.stringify({
        current: hashedRt,
        previous: previousHash,
        rotatedAt: Date.now(),
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokenPayload },
      });
    } catch (err) {
      console.warn(
        "[AUTH] Notice saving hashed refresh token in database:",
        err.message,
      );
    }
  }

  return {
    accessToken,
    refreshToken,
    token: accessToken, // backwards-compatible alias
  };
}

// Backwards-compatible generateToken helper
function generateToken(user) {
  return generateAccessToken(user);
}

// Helper to set both access and refresh cookies scoped to shared parent domain (.luxenart.in)
function setAuthCookies(res, tokens, req) {
  const isProd = process.env.NODE_ENV === "production";
  const atMaxAge = 15 * 60; // 15 minutes
  const rtMaxAge = 15 * 24 * 60 * 60; // 15 days

  // Use wildcard parent domain (.luxenart.in) in production so user and studio share one session
  const cookieDomain =
    process.env.COOKIE_DOMAIN || (isProd ? ".luxenart.in" : undefined);

  const cookieOptions = {
    path: "/",
    maxAge: atMaxAge * 1000,
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
    ...(cookieDomain && { domain: cookieDomain }), // Scopes across .luxenart.in (both luxenart.in and studio.luxenart.in)
  };

  res.cookie("tg_token", tokens.accessToken, cookieOptions);

  // Set tg_refresh_token strictly as HttpOnly so JavaScript/XSS/Extensions CANNOT read or steal it
  res.cookie("tg_refresh_token", tokens.refreshToken, {
    ...cookieOptions,
    httpOnly: true,
    maxAge: rtMaxAge * 1000,
  });

  // Non-sensitive session indicator so client knows an active HttpOnly refresh token exists
  res.cookie("tg_logged_in", "1", {
    ...cookieOptions,
    httpOnly: false,
    maxAge: rtMaxAge * 1000,
  });
}

/**
 * Find an existing partner store that a studio account without a studioId may adopt.
 * Only stores matching the account's own email or phone, and not already owned by another
 * account, qualify. Studio and tailor names are not unique, so they are never used: matching
 * on them let new sign-ups take over (and overwrite) another studio's store.
 */
async function findClaimableStore({ email, phone, userId }) {
  const identity = [
    ...(email ? [{ email }] : []),
    ...(phone ? [{ phone }] : []),
  ];
  if (identity.length === 0) return null;

  const candidates = await prisma.partnerStore.findMany({
    where: { OR: identity },
    orderBy: { createdAt: "asc" },
  });
  for (const store of candidates) {
    const otherOwner = await prisma.user.findFirst({
      where: {
        studioId: store.id,
        ...(userId ? { NOT: { id: userId } } : {}),
      },
      select: { id: true },
    });
    if (!otherOwner) return store;
  }
  return null;
}

// Unified user resolution & creation helper directly in PostgreSQL
async function findOrLinkUser({
  email,
  phone,
  name,
  password,
  avatar,
  address,
  postcode,
  method = "email",
  role = "CUSTOMER",
  status,
  studioId,
  studioName,
  storeArea,
  machines,
  lat,
  lng,
  specialties,
}) {
  const normEmail = email ? email.trim().toLowerCase() : null;
  const normPhone = phone ? phone.trim() : null;
  const contactStr = normEmail || normPhone || "member@raffu.com";

  let user = null;

  // 1. Try lookup by email first if provided
  if (normEmail) {
    user = await prisma.user.findFirst({
      where: {
        OR: [{ email: normEmail }, { contact: normEmail }],
      },
    });
  }

  // 2. If not found by email, try lookup by phone if provided
  if (!user && normPhone) {
    user = await prisma.user.findFirst({
      where: {
        OR: [{ phone: normPhone }, { contact: normPhone }],
      },
    });
  }

  // Check if existing user is an expired TEMP_STUDIO account (>24h)
  if (user && (await isUserExpiredTempStudio(user))) {
    user = null;
  }

  // STRICT ROLE GATE: Reject any cross-role switching or reuse
  // Allow TEMP_STUDIO -> STUDIO progression
  const isStudioProgression =
    (user?.role === "TEMP_STUDIO" &&
      (role === "STUDIO" || role === "TEMP_STUDIO")) ||
    (user?.role === "STUDIO" && (role === "STUDIO" || role === "TEMP_STUDIO"));

  if (user && user.role && user.role !== role && !isStudioProgression) {
    const currentRoleName =
      user.role === "CUSTOMER" ? "Customer" : "Studio partner";
    const requestedRoleName =
      role === "CUSTOMER" ? "Customer" : "Studio partner";
    const roleErr = new Error(
      `This account is registered as a ${currentRoleName}. It cannot be switched or used as a ${requestedRoleName} account. Please use a different phone or email.`,
    );
    roleErr.statusCode = 403;
    throw roleErr;
  }

  // 3. If Studio role and creating a store
  let actualStudioId = studioId || user?.studioId;
  let resolvedStore = null;
  const isStudioRole = role === "STUDIO" || role === "TEMP_STUDIO";
  if (isStudioRole && (studioName || studioId || user?.studioId)) {
    const actualStoreName =
      studioName || user?.studioName || `${name || "Master"}'s Studio`;

    try {
      let existingStore = null;
      if (actualStudioId) {
        existingStore = await prisma.partnerStore.findUnique({
          where: { id: actualStudioId },
        });
      }
      if (!existingStore) {
        existingStore = await findClaimableStore({
          email: normEmail,
          phone: normPhone,
          userId: user?.id,
        });
        if (existingStore) {
          actualStudioId = existingStore.id;
        }
      }

      if (!actualStudioId) {
        const storeSlug = actualStoreName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 30);
        actualStudioId = `store-${storeSlug}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const parsedLat =
        typeof lat === "number" && !isNaN(lat)
          ? lat
          : lat
            ? parseFloat(lat)
            : 40.7259;
      const parsedLng =
        typeof lng === "number" && !isNaN(lng)
          ? lng
          : lng
            ? parseFloat(lng)
            : -74.0003;

      const resolvedSpecialties =
        specialties && Array.isArray(specialties) && specialties.length > 0
          ? specialties
          : ["Custom Alterations", "Precision Hemming", "Express Tailoring"];

      const resolvedAddress = address
        ? address.trim()
        : storeArea
          ? storeArea.trim()
          : "Neighborhood Atelier";
      const resolvedPostcode = postcode ? postcode.trim().toUpperCase() : "";
      const resolvedArea =
        storeArea ||
        (resolvedPostcode
          ? `Area ${resolvedPostcode}`
          : "Neighborhood Atelier");

      if (!existingStore) {
        resolvedStore = await prisma.partnerStore.create({
          data: {
            id: actualStudioId,
            name: actualStoreName,
            email: normEmail || null,
            phone: normPhone || null,
            area: resolvedArea,
            address: resolvedAddress,
            postcode: resolvedPostcode,
            rating: 5.0,
            reviewCount: 1,
            openingHours: "Mon–Sat: 09:00 – 19:00",
            dailyCapacity: 25,
            machines: machines ? parseInt(machines) || 6 : 6,
            workers: 4,
            leadTailor: name || "Master Tailor",
            specialties: resolvedSpecialties,
            retailSold: true,
            lat: parsedLat,
            lng: parsedLng,
          },
        });
      } else {
        resolvedStore = await prisma.partnerStore.update({
          where: { id: existingStore.id },
          data: {
            name: actualStoreName,
            ...(normEmail ? { email: normEmail } : {}),
            ...(normPhone ? { phone: normPhone } : {}),
            leadTailor: name || existingStore.leadTailor,
            ...(address ? { address: address.trim() } : {}),
            ...(postcode ? { postcode: postcode.trim().toUpperCase() } : {}),
            ...(storeArea ? { area: storeArea.trim() } : {}),
            ...(machines
              ? { machines: parseInt(machines) || existingStore.machines }
              : {}),
            ...(specialties &&
            Array.isArray(specialties) &&
            specialties.length > 0
              ? { specialties }
              : {}),
            ...(typeof lat === "number" && !isNaN(lat)
              ? { lat: parsedLat }
              : {}),
            ...(typeof lng === "number" && !isNaN(lng)
              ? { lng: parsedLng }
              : {}),
          },
        });
      }
    } catch (storeErr) {
      console.warn("Store creation notice:", storeErr.message);
    }
  }

  // 4. Update existing user or create new user
  const resolvedRole = role || user?.role || "CUSTOMER";

  if (user) {
    let updatedPhone = user.phone;
    if (normPhone) {
      const phoneConflict = await prisma.user.findFirst({
        where: { phone: normPhone, NOT: { id: user.id } },
      });
      if (!phoneConflict) {
        updatedPhone = normPhone;
      }
    }

    const isStudioComplete = Boolean(
      (studioName || resolvedStore?.name || user.studioName) &&
      (normPhone || updatedPhone || user.phone),
    );
    let resolvedStatus = status;
    if (!resolvedStatus) {
      if (resolvedRole === "STUDIO") {
        resolvedStatus = isStudioComplete
          ? "ACTIVE"
          : user.status || "INACTIVE";
      } else {
        resolvedStatus = user.status || "ACTIVE";
      }
    }

    const updatedFields = {
      email: normEmail || user.email,
      ...(password ? { password } : {}),
      role: user.role || role,
      status: resolvedStatus,
      phone: updatedPhone,
      name:
        name &&
        name !== "Master Tailor" &&
        name !== "Google User" &&
        name !== "Raffu Member" &&
        name !== "Mobile Member"
          ? name
          : user.name || name || "Raffu Member",
      avatar:
        user.avatar && !user.avatar.includes("dicebear")
          ? user.avatar
          : avatar && !avatar.includes("dicebear")
            ? avatar
            : null,
      address: address || resolvedStore?.address || user.address || null,
      postcode: postcode || resolvedStore?.postcode || user.postcode || null,
      contact:
        normEmail || normPhone || user.email || user.phone || user.contact,
      role: role || user.role || "CUSTOMER",
      studioId:
        role === "CUSTOMER" ? null : actualStudioId || user.studioId || null,
      studioName:
        role === "CUSTOMER"
          ? null
          : studioName || resolvedStore?.name || user.studioName || null,
    };

    user = await prisma.user.update({
      where: { id: user.id },
      data: updatedFields,
    });
  } else {
    // Check if phone or email is already taken
    if (normPhone) {
      const phoneTaken = await prisma.user.findFirst({
        where: { OR: [{ phone: normPhone }, { contact: normPhone }] },
      });
      if (phoneTaken) {
        if (phoneTaken.role && phoneTaken.role !== role) {
          const roleName =
            phoneTaken.role === "CUSTOMER" ? "Customer" : "Studio partner";
          const roleErr = new Error(
            `This mobile number is already registered as a ${roleName} account. Role switching is not allowed. Please use a different mobile number.`,
          );
          roleErr.statusCode = 403;
          throw roleErr;
        }
        if (!phoneTaken.role) {
          return await prisma.user.update({
            where: { id: phoneTaken.id },
            data: {
              role,
              status: status || (role === "STUDIO" ? "INACTIVE" : "ACTIVE"),
            },
          });
        }
        return phoneTaken;
      }
    }
    if (normEmail) {
      const emailTaken = await prisma.user.findFirst({
        where: { OR: [{ email: normEmail }, { contact: normEmail }] },
      });
      if (emailTaken) {
        if (emailTaken.role && emailTaken.role !== role) {
          const roleName =
            emailTaken.role === "CUSTOMER" ? "Customer" : "Studio partner";
          const roleErr = new Error(
            `This email is already registered as a ${roleName} account. Role switching is not allowed. Please use a different email address.`,
          );
          roleErr.statusCode = 403;
          throw roleErr;
        }
        if (!emailTaken.role) {
          return await prisma.user.update({
            where: { id: emailTaken.id },
            data: {
              role,
              status: status || (role === "STUDIO" ? "INACTIVE" : "ACTIVE"),
            },
          });
        }
        return emailTaken;
      }
    }

    const isStudioComplete = Boolean(
      (studioName || resolvedStore?.name) && normPhone,
    );
    const resolvedStatus =
      status ||
      (resolvedRole === "STUDIO"
        ? isStudioComplete
          ? "ACTIVE"
          : "INACTIVE"
        : "ACTIVE");

    const newUserData = {
      id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name:
        name ||
        (normEmail
          ? "Raffu User"
          : normPhone
            ? "Mobile Member"
            : "Raffu Member"),
      email: normEmail,
      phone: normPhone,
      password: password || null,
      contact: contactStr,
      avatar:
        avatar && !avatar.includes("dicebear") ? avatar : null,
      address:
        address ||
        (resolvedRole === "STUDIO" ? resolvedStore?.address || null : null),
      postcode:
        postcode ||
        (resolvedRole === "STUDIO" ? resolvedStore?.postcode || null : null),
      method:
        method ||
        (normEmail
          ? normEmail.includes("google")
            ? "google"
            : "email"
          : "mobile"),
      role: resolvedRole,
      status: resolvedStatus,
      studioId: actualStudioId || null,
      studioName: studioName || resolvedStore?.name || null,
    };

    user = await prisma.user.create({
      data: newUserData,
    });

    // Automatically send welcome email to newly created customer
    if (
      user?.email &&
      user.email.includes("@") &&
      !user.email.includes("example.com")
    ) {
      if (user.role === "CUSTOMER") {
        sendWelcomeEmail({
          toEmail: user.email,
          name: user.name,
          role: "CUSTOMER",
          phone: user.phone || "",
        }).catch((wErr) =>
          console.warn(
            "[WELCOME EMAIL] findOrLinkUser dispatch notice:",
            wErr.message,
          ),
        );
      }
    }
  }

  return user;
}

// In-flight OTP dispatch tracker and cooldown registry to prevent duplicate sends
const inFlightOtpRequests = new Map();
const otpCooldownStore = new Map();

// POST /api/auth/send-otp
router.post("/send-otp", async (req, res) => {
  try {
    const { phone, forceResend = false } = req.body;
    const phoneValidation = validateAndFormatPhone(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanPhone = phoneValidation.formatted;

    // 1. If another request for this phone is currently processing, wait for it instead of duplicating
    if (inFlightOtpRequests.has(cleanPhone)) {
      console.log(
        `[AUTH-OTP] Deduplicating concurrent request for ${cleanPhone}`,
      );
      const inFlightResult = await inFlightOtpRequests.get(cleanPhone);
      return res.json(inFlightResult);
    }

    // 2. Cooldown check: if an OTP was sent within the last 30 seconds, reuse existing without spamming SMS
    const lastSentAt = otpCooldownStore.get(cleanPhone);
    const now = Date.now();
    if (lastSentAt && now - lastSentAt < 30000 && !forceResend) {
      console.log(
        `[AUTH-OTP] Cooldown active for ${cleanPhone} (${Math.round((30000 - (now - lastSentAt)) / 1000)}s remaining)`,
      );
      return res.json({
        success: true,
        phone: cleanPhone,
        message: `Verification code was already sent via SMS to ${cleanPhone}. Valid for 10 minutes.`,
        cooldown: true,
      });
    }

    // 3. Register lock and timestamp immediately (synchronously) before entering async dispatch
    otpCooldownStore.set(cleanPhone, Date.now());

    let resolveDispatch;
    let rejectDispatch;
    const dispatchPromise = new Promise((resolve, reject) => {
      resolveDispatch = resolve;
      rejectDispatch = reject;
    });
    inFlightOtpRequests.set(cleanPhone, dispatchPromise);

    (async () => {
      try {
        const code = Math.floor(1000 + Math.random() * 9000).toString();

        // Persist OTP in PostgreSQL DB (and memory cache)
        await saveOtp(cleanPhone, code);
        console.log(
          `[AUTH-OTP] Generated & saved OTP code for ${cleanPhone}: ${code}`,
        );

        // Send real SMS via AWS SNS
        const smsResult = await sendVerificationSms(cleanPhone, code);

        const responsePayload = {
          success: true,
          phone: cleanPhone,
          message:
            smsResult.message ||
            `Verification code sent via SMS to ${cleanPhone}`,
        };
        resolveDispatch(responsePayload);
      } catch (dispatchErr) {
        // Clear cooldown so user can retry on true failure
        otpCooldownStore.delete(cleanPhone);
        rejectDispatch(dispatchErr);
      } finally {
        inFlightOtpRequests.delete(cleanPhone);
      }
    })();

    const result = await dispatchPromise;
    return res.json(result);
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to send verification code." });
  }
});

// POST /api/auth/send-email-otp
router.post("/send-email-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim().includes("@")) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // Persist OTP code for 10 minutes
    await saveOtp(cleanEmail, code, 10);
    console.log(`[AUTH-EMAIL-OTP] Generated & saved OTP for ${cleanEmail}: ${code}`);

    // Dispatch via Resend
    try {
      const emailRes = await sendAuthOtpEmail({
        toEmail: cleanEmail,
        otp: code,
        customerName: "Raffu Member",
      });
      if (emailRes.success) {
        console.log(`[AUTH-EMAIL-OTP] Sent email to ${cleanEmail}`);
      } else {
        console.warn("[AUTH-EMAIL-OTP] Resend notice:", emailRes.error || emailRes.reason);
      }
    } catch (eErr) {
      console.warn("[AUTH-EMAIL-OTP] Email dispatch error:", eErr.message);
    }

    return res.json({
      success: true,
      message: "Verification code sent to your email! Valid for 10 minutes.",
    });
  } catch (err) {
    console.error("Send Email OTP Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to send email verification code." });
  }
});

// POST /api/auth/verify-email-otp
router.post("/verify-email-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res
        .status(400)
        .json({ error: "Email address and verification code are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    const isValid = await verifyOtp(cleanEmail, cleanOtp);
    if (!isValid) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code." });
    }

    console.log(`[AUTH-EMAIL-OTP] Verified OTP successfully for ${cleanEmail}`);
    return res.json({
      success: true,
      verified: true,
      message: "Email verified successfully!",
    });
  } catch (err) {
    console.error("Verify Email OTP Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to verify email code." });
  }
});

// POST /api/auth/verify-phone-otp
router.post("/verify-phone-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res
        .status(400)
        .json({ error: "Mobile number and verification code are required." });
    }

    const phoneValidation = validateAndFormatPhone(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanPhone = phoneValidation.formatted;
    const cleanOtp = String(otp).trim();

    const isValid = await verifyOtp(cleanPhone, cleanOtp);
    if (!isValid) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code." });
    }

    console.log(`[AUTH-PHONE-OTP] Verified phone OTP successfully for ${cleanPhone}`);
    return res.json({
      success: true,
      verified: true,
      message: "Mobile number verified successfully!",
    });
  } catch (err) {
    console.error("Verify Phone OTP Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to verify mobile code." });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp, name, email, role = "CUSTOMER", userId } = req.body;
    console.log(
      `[AUTH-VERIFY] Request received: phone="${phone}", otp="${otp}", role="${role}", userId="${userId || ""}"`,
    );

    if (!phone || !otp) {
      console.warn(
        `[AUTH-VERIFY] Rejected: Missing phone or otp (phone="${phone}", otp="${otp}")`,
      );
      return res
        .status(400)
        .json({ error: "Mobile number and verification code are required." });
    }

    const phoneValidation = validateAndFormatPhone(phone);
    if (!phoneValidation.isValid) {
      console.warn(
        `[AUTH-VERIFY] Rejected: Invalid phone format: ${phoneValidation.error}`,
      );
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanPhone = phoneValidation.formatted;
    const cleanOtp = otp.trim();

    const isValidOtp = await verifyOtp(cleanPhone, cleanOtp);

    if (!isValidOtp) {
      console.warn(
        `[AUTH-VERIFY] Verification failed: Code "${cleanOtp}" invalid or expired for ${cleanPhone}`,
      );
      return res
        .status(400)
        .json({
          error:
            "Invalid or expired verification code. Please check your SMS and try again or click Resend.",
        });
    }

    console.log(
      `[AUTH-VERIFY] Code "${cleanOtp}" verified successfully for ${cleanPhone}!`,
    );

    let targetUserId = userId;
    const authHeader = req.headers.authorization;
    if (!targetUserId && authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        if (decoded.id && !String(decoded.id).startsWith("temp_g_")) {
          targetUserId = decoded.id;
        } else if (decoded.email) {
          const u = await prisma.user.findFirst({
            where: {
              OR: [
                { email: decoded.email.toLowerCase() },
                { contact: decoded.email.toLowerCase() },
              ],
            },
          });
          if (u) targetUserId = u.id;
        }
      } catch (_) {}
    }

    if (!targetUserId && email) {
      const cleanEmail = email.trim().toLowerCase();
      const userByEmail = await prisma.user.findFirst({
        where: { OR: [{ email: cleanEmail }, { contact: cleanEmail }] },
      });
      if (userByEmail) targetUserId = userByEmail.id;
    }

    let user;
    if (targetUserId) {
      // Linking phone to existing user account
      const phoneConflict = await prisma.user.findFirst({
        where: { phone: cleanPhone, NOT: { id: targetUserId } },
      });
      if (phoneConflict) {
        return res.status(409).json({
          error: "This mobile number is already registered to another account.",
        });
      }

      user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (user) {
        user = await prisma.user.update({
          where: { id: targetUserId },
          data: {
            phone: cleanPhone,
            ...(email && !user.email
              ? { email: email.toLowerCase().trim() }
              : {}),
            ...(role === "STUDIO" || role === "TEMP_STUDIO"
              ? { role: user.role === "CUSTOMER" ? "TEMP_STUDIO" : user.role }
              : {}),
          },
        });
      }
    } else {
      // Check existing user by phone
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ phone: cleanPhone }, { contact: cleanPhone }],
        },
      });

      if (existingUser) {
        if (await isUserExpiredTempStudio(existingUser)) {
          user = null;
        } else {
          user = existingUser;
          if (
            existingUser.role === "TEMP_STUDIO" ||
            (existingUser.role === "STUDIO" &&
              (existingUser.status === "INACTIVE" || !existingUser.studioName))
          ) {
            const tempTokens = await generateTokens(existingUser);
            const tempAuthCode = createAuthCode(
              existingUser,
              tempTokens.accessToken,
            );
            setAuthCookies(res, tempTokens);
            return res.json({
              success: true,
              isNewUser: true,
              phone: cleanPhone,
              user: existingUser,
              role: "TEMP_STUDIO",
              token: tempTokens.accessToken,
              accessToken: tempTokens.accessToken,
              refreshToken: tempTokens.refreshToken,
              authCode: tempAuthCode,
              message:
                "Mobile number verified. Please complete your studio registration.",
            });
          }
        }
      }

      if (!user) {
        if (role === "STUDIO" || role === "TEMP_STUDIO") {
          user = await findOrLinkUser({
            phone: cleanPhone,
            email,
            name,
            method: "mobile",
            role: "TEMP_STUDIO",
            status: "INACTIVE",
          });

          const tempTokens = await generateTokens(user);
          const tempAuthCode = createAuthCode(user, tempTokens.accessToken);
          setAuthCookies(res, tempTokens);
          return res.json({
            success: true,
            isNewUser: true,
            phone: cleanPhone,
            user,
            role: "TEMP_STUDIO",
            token: tempTokens.accessToken,
            accessToken: tempTokens.accessToken,
            refreshToken: tempTokens.refreshToken,
            authCode: tempAuthCode,
            message:
              "Mobile number verified. Please complete your studio registration.",
          });
        }
        user = await findOrLinkUser({
          phone: cleanPhone,
          email,
          name,
          method: "mobile",
          role: "CUSTOMER",
        });
      }
    }

    let returnUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      returnUser = await enrichStudioUser(user);
    }

    const tokens = await generateTokens(returnUser);
    const authCode = createAuthCode(returnUser, tokens.accessToken);
    setAuthCookies(res, tokens);

    return res.json({
      success: true,
      message: "Mobile number verified and authenticated successfully",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      authCode,
      user: returnUser,
      role: returnUser.role,
      hasPhone: true,
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to verify code." });
  }
});

// POST /api/auth/link-phone
router.post("/link-phone", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        userId = decoded.id;
      } catch (e) {}
    }

    const { phone, otp, id } = req.body;
    const targetUserId = userId || id;
    if (!targetUserId) {
      return res.status(401).json({ error: "Unauthorized: User ID required." });
    }
    if (!phone) {
      return res.status(400).json({ error: "Mobile number is required." });
    }

    const phoneValidation = validateAndFormatPhone(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanPhone = phoneValidation.formatted;

    // Check unique constraint: Is this phone already linked to ANOTHER user?
    const existingWithPhone = await prisma.user.findFirst({
      where: {
        phone: cleanPhone,
        NOT: { id: targetUserId },
      },
    });

    if (existingWithPhone) {
      return res.status(409).json({
        error:
          "This mobile number is already linked to another account. Please use a different number.",
      });
    }

    if (otp) {
      const cleanOtp = otp.trim();
      const isValid = await verifyOtp(cleanPhone, cleanOtp);
      if (!isValid) {
        return res
          .status(400)
          .json({
            error:
              "Invalid or expired verification code. Please check your SMS and try again or click Resend.",
          });
      }
    }

    if (targetUserId && String(targetUserId).startsWith("temp_g_")) {
      const cached = getPendingGoogleSignup(targetUserId);
      if (cached) {
        const createdUser = await findOrLinkUser({
          name: cached.name,
          email: cached.email,
          avatar: cached.avatar,
          phone: cleanPhone,
          method: "google",
          role: cached.role || "CUSTOMER",
        });

        removePendingGoogleSignup(targetUserId);

        const tokens = await generateTokens(createdUser);
        const authCode = createAuthCode(createdUser, tokens.accessToken);
        setAuthCookies(res, tokens);
        return res.json({
          success: true,
          message: "Mobile number linked and account created successfully",
          user: createdUser,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          token: tokens.accessToken,
          authCode,
          hasPhone: true,
        });
      }
    }

    let user = null;
    if (targetUserId) {
      user = await prisma.user
        .findUnique({ where: { id: targetUserId } })
        .catch(() => null);
    }

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [{ phone: cleanPhone }, { contact: cleanPhone }],
        },
      });
    }

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phone: cleanPhone },
      });
    } else {
      user = await findOrLinkUser({
        phone: cleanPhone,
        role: "CUSTOMER",
      });
    }

    const tokens = await generateTokens(user);
    const authCode = createAuthCode(user, tokens.accessToken);
    setAuthCookies(res, tokens);

    return res.json({
      success: true,
      message: "Mobile number linked successfully",
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      authCode,
      hasPhone: true,
    });
  } catch (err) {
    console.error("Link Phone Error:", err);
    return res.status(500).json({ error: "Failed to link mobile number." });
  }
});

// GET /api/auth/check-email
router.get("/check-email", async (req, res) => {
  try {
    const { email, role = "STUDIO" } = req.query;
    if (!email) return res.json({ exists: false });

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      if (existingUser.role && existingUser.role !== role) {
        const roleName =
          existingUser.role === "CUSTOMER" ? "Customer" : "Studio partner";
        return res.json({
          exists: true,
          user: existingUser,
          error: `This email is already registered as a ${roleName} account. Please use a different email.`,
        });
      }
      return res.json({
        exists: true,
        user: existingUser,
        error:
          "An account with this email address is already registered. Please sign in instead.",
      });
    }

    return res.json({ exists: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/check-phone
router.get("/check-phone", async (req, res) => {
  try {
    const { phone, role = "CUSTOMER" } = req.query;
    if (!phone) return res.json({ exists: false });

    const phoneValidation = validateAndFormatPhone(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanPhone = phoneValidation.formatted;
    const rawDigits = phone.replace(/\D/g, "");

    // Search user by formatted phone, raw contact, or digits
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          { contact: cleanPhone },
          { phone: phone.trim() },
          { contact: phone.trim() },
          ...(rawDigits.length >= 10
            ? [
                { phone: { contains: rawDigits.slice(-10) } },
                { contact: { contains: rawDigits.slice(-10) } },
              ]
            : []),
        ],
      },
    });

    if (existingUser) {
      return res.json({
        exists: true,
        user: existingUser,
        phone: cleanPhone,
        role: existingUser.role || "CUSTOMER",
      });
    }

    return res.json({ exists: false, phone: cleanPhone });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// In-memory cache for pending Google signups (as optional fallback)
const pendingGoogleSignups = new Map();

setInterval(
  () => {
    const now = Date.now();
    for (const [key, item] of pendingGoogleSignups.entries()) {
      if (item.expiresAt < now) {
        pendingGoogleSignups.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

function storePendingGoogleSignup(tempId, data, ttlMs = 60 * 60 * 1000) {
  pendingGoogleSignups.set(tempId, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function getPendingGoogleSignup(tempId) {
  if (!tempId) return null;

  // 1. Check in-memory map first
  const item = pendingGoogleSignups.get(tempId);
  if (item) {
    if (item.expiresAt >= Date.now()) {
      return item.data;
    }
    pendingGoogleSignups.delete(tempId);
  }

  // 2. Stateless JWT verification: allows surviving server restarts & multi-day onboarding
  const rawToken = String(tempId).startsWith("temp_g_")
    ? String(tempId).slice(7)
    : String(tempId);
  try {
    const decoded = jwt.verify(rawToken, JWT_SECRET);
    if (
      decoded &&
      (decoded.email || decoded.type === "pending_google_signup")
    ) {
      return {
        tempSignupId: tempId,
        email: decoded.email,
        name: decoded.name || "Google User",
        avatar: decoded.avatar,
        role: decoded.role || "CUSTOMER",
        method: decoded.method || "google",
      };
    }
  } catch (jwtErr) {
    // Not a valid or signed JWT
  }

  return null;
}

function removePendingGoogleSignup(tempId) {
  pendingGoogleSignups.delete(tempId);
}

// POST /api/auth/google
router.post("/google", async (req, res) => {
  try {
    const {
      idToken,
      accessToken,
      profile,
      role = "CUSTOMER",
      isSignup = false,
      flow,
      isLogin,
    } = req.body;

    let email = req.body.email || "";
    let name = req.body.name || "";
    let avatar = req.body.avatar || "";

    if (idToken) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        email = email || payload.email;
        name = name || payload.name || payload.given_name || "Google User";
        avatar = avatar || payload.picture;
      } catch (verifyErr) {
        console.warn("ID Token verification warning:", verifyErr.message);
      }
    }

    if (!email && accessToken) {
      try {
        const userInfoRes = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (userInfoRes.ok) {
          const uInfo = await userInfoRes.json();
          email = uInfo.email;
          name = name || uInfo.name || uInfo.given_name || "Google User";
          avatar = avatar || uInfo.picture;
        }
      } catch (apiErr) {
        console.warn("Google userinfo fetch error:", apiErr.message);
      }
    }

    if (!email && profile) {
      email = profile.email || profile.contact;
      name = name || profile.name || "Google User";
      avatar = avatar || profile.avatar || profile.picture;
    }

    if (!email) {
      return res
        .status(400)
        .json({
          error:
            "Failed to retrieve email or identity from Google authentication.",
        });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists in DB
    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { contact: cleanEmail }],
      },
    });

    if (existingUser) {
      if (await isUserExpiredTempStudio(existingUser)) {
        existingUser = null;
      } else {
        if (existingUser.method !== "google") {
          await prisma.user
            .update({
              where: { id: existingUser.id },
              data: { method: "google" },
            })
            .catch(() => {});
          existingUser.method = "google";
        }

        if (role === "STUDIO" || role === "TEMP_STUDIO") {
          if (existingUser.role === "CUSTOMER" || !existingUser.role) {
            existingUser = await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                role: "TEMP_STUDIO",
                status:
                  existingUser.status === "ACTIVE"
                    ? existingUser.status
                    : "INACTIVE",
              },
            });
          }
        }

        let returnUser = existingUser;
        if (
          existingUser.role === "STUDIO" ||
          existingUser.role === "TEMP_STUDIO"
        ) {
          returnUser = await enrichStudioUser(existingUser);
        }

        const isRegisteredStudio = Boolean(
          existingUser.role === "STUDIO" &&
          existingUser.status === "ACTIVE" &&
          existingUser.studioName &&
          existingUser.phone,
        );
        const isNewUser =
          existingUser.role === "STUDIO" || existingUser.role === "TEMP_STUDIO"
            ? !isRegisteredStudio
            : false;

        const tokens = await generateTokens(returnUser);
        const authCode = createAuthCode(returnUser, tokens.accessToken);
        setAuthCookies(res, tokens);

        return res.json({
          success: true,
          message: "Authenticated with Google successfully",
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          token: tokens.accessToken,
          authCode,
          user: returnUser,
          role: returnUser.role,
          isNewUser,
          needsPhone: !returnUser.phone,
          hasPhone: Boolean(returnUser.phone),
        });
      }
    }

    // If login flow (not signup) and account is not found in DB
    if (flow === "login" || isLogin) {
      return res.status(404).json({
        error: "No account with Google Id , please sign up",
        noAccount: true,
      });
    }

    // When signing up for STUDIO, create a temporary DB record with role TEMP_STUDIO
    if (role === "STUDIO" || role === "TEMP_STUDIO") {
      const createdTempUser = await findOrLinkUser({
        name: name || "Google User",
        email: cleanEmail,
        avatar: avatar && !avatar.includes("dicebear") ? avatar : null,
        method: "google",
        role: "TEMP_STUDIO",
        status: "INACTIVE",
      });

      const tokens = await generateTokens(createdTempUser);
      const authCode = createAuthCode(createdTempUser, tokens.accessToken);
      setAuthCookies(res, tokens);

      return res.json({
        success: true,
        isNewUser: true,
        message:
          "Google identity verified successfully. Please complete studio onboarding.",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.accessToken,
        authCode,
        user: createdTempUser,
        role: "TEMP_STUDIO",
        needsPhone: true,
        hasPhone: false,
      });
    }

    // Customer fallback token / cache
    const tempPayloadToken = jwt.sign(
      {
        email: cleanEmail,
        name: name || "Google User",
        avatar: avatar && !avatar.includes("dicebear") ? avatar : null,
        role,
        method: "google",
        type: "pending_google_signup",
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    const tempSignupId = `temp_g_${tempPayloadToken}`;
    storePendingGoogleSignup(tempSignupId, {
      tempSignupId,
      email: cleanEmail,
      name: name || "Google User",
      avatar: avatar && !avatar.includes("dicebear") ? avatar : null,
      role,
      method: "google",
    });

    const pendingUserObject = {
      id: tempSignupId,
      name: name || "Google User",
      email: cleanEmail,
      avatar: avatar && !avatar.includes("dicebear") ? avatar : null,
      role,
      status: "ACTIVE",
      contact: cleanEmail,
      method: "google",
    };

    return res.json({
      success: true,
      isNewUser: true,
      message:
        "Google identity verified successfully. Complete registration to save account.",
      tempSignupId,
      token: tempPayloadToken,
      user: pendingUserObject,
      needsPhone: true,
      hasPhone: false,
    });
  } catch (err) {
    console.error("Google Auth Route Error:", err);
    return res
      .status(err.statusCode || 500)
      .json({
        error: err.message || "Server error during Google authentication.",
      });
  }
});

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        currentUserId = decoded.id;
      } catch (e) {}
    }

    const {
      tempSignupId,
      name,
      email,
      phone,
      password,
      address,
      postcode,
      role = "CUSTOMER",
      storeName,
      storeArea,
      machines,
      specialties,
      lat,
      lng,
    } = req.body;

    // Check if there is a pending Google cache entry
    let cachedGoogleData = null;
    if (tempSignupId) {
      cachedGoogleData = getPendingGoogleSignup(tempSignupId);
      if (!cachedGoogleData && !email && !phone) {
        return res.status(400).json({
          error:
            "Your sign-up session has expired. Please sign up with Google again.",
        });
      }
    }

    const finalEmail = (email || cachedGoogleData?.email || "")
      .trim()
      .toLowerCase();
    let finalPhone = null;
    if (phone) {
      const phoneValidation = validateAndFormatPhone(phone);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ error: phoneValidation.error });
      }
      finalPhone = phoneValidation.formatted;
    }
    const finalName = name || cachedGoogleData?.name || "Raffu Member";
    const finalAvatar = cachedGoogleData?.avatar;
    const finalMethod = tempSignupId || cachedGoogleData ? "google" : "email";

    const contactStr = finalEmail || finalPhone;
    if (!contactStr) {
      return res
        .status(400)
        .json({ error: "Email or mobile number is required." });
    }

    // Check existing email conflict
    if (finalEmail) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          OR: [{ email: finalEmail }, { contact: finalEmail }],
        },
      });
      if (existingEmail) {
        if (await isUserExpiredTempStudio(existingEmail)) {
          // expired, continue fresh
        } else if (
          existingEmail.role !== role &&
          !(existingEmail.role === "TEMP_STUDIO" && role === "STUDIO")
        ) {
          const roleName =
            existingEmail.role === "CUSTOMER" ? "Customer" : "Studio partner";
          return res.status(403).json({
            error: `This email is already registered as a ${roleName} account. Role switching is not allowed. Please use a different email.`,
          });
        } else if (role === "CUSTOMER") {
          return res.status(409).json({
            error:
              "An account with this email address is already registered. Please sign in instead.",
          });
        }
      }
    }

    // Check existing phone conflict
    if (finalPhone) {
      const existingPhone = await prisma.user.findFirst({
        where: {
          OR: [{ phone: finalPhone }, { contact: finalPhone }],
        },
      });
      if (existingPhone) {
        if (await isUserExpiredTempStudio(existingPhone)) {
          // expired, continue fresh
        } else if (
          existingPhone.role !== role &&
          !(existingPhone.role === "TEMP_STUDIO" && role === "STUDIO")
        ) {
          const roleName =
            existingPhone.role === "CUSTOMER" ? "Customer" : "Studio partner";
          return res.status(403).json({
            error: `This mobile number is already registered as a ${roleName} account. Role switching is not allowed. Please use a different mobile number.`,
          });
        } else if (
          existingPhone.email &&
          finalEmail &&
          existingPhone.email !== finalEmail
        ) {
          return res.status(409).json({
            error:
              "An account with this mobile number is already registered to another email.",
          });
        }
      }
    }

    // Determine target role: If studio registration has completed storeName/shop details, role becomes STUDIO
    const isStudioSignup = role === "STUDIO" || role === "TEMP_STUDIO";
    const isCompletedStudio = Boolean(isStudioSignup && storeName);
    const targetRole = isStudioSignup
      ? isCompletedStudio
        ? "STUDIO"
        : "TEMP_STUDIO"
      : role || "CUSTOMER";
    const targetStatus = targetRole === "TEMP_STUDIO" ? "INACTIVE" : "ACTIVE";

    // Now write to database
    const user = await findOrLinkUser({
      name: finalName,
      email: finalEmail || undefined,
      phone: finalPhone || undefined,
      password: password ? hashPassword(password.trim()) : undefined,
      avatar: finalAvatar,
      method: finalMethod,
      address,
      postcode,
      role: targetRole,
      status: targetStatus,
      studioName: storeName,
      storeArea,
      machines,
      specialties,
      lat,
      lng,
    });

    if (tempSignupId) {
      removePendingGoogleSignup(tempSignupId);
    }

    let returnUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      returnUser = await enrichStudioUser(user);
    }

    // Dispatch Welcome Email asynchronously if user has a valid email address
    if (
      returnUser?.email &&
      returnUser.email.includes("@") &&
      !returnUser.email.includes("example.com")
    ) {
      const isCompleteStudio = returnUser.role === "STUDIO";
      const isCustomer = returnUser.role === "CUSTOMER";
      if (isCompleteStudio || isCustomer) {
        sendWelcomeEmail({
          toEmail: returnUser.email,
          name: returnUser.name,
          role: returnUser.role,
          studioName: returnUser.studioName || storeName || "",
          phone: returnUser.phone || "",
        }).catch((wErr) => {
          console.warn("[WELCOME EMAIL] Async dispatch notice:", wErr.message);
        });
      }
    }

    const tokens = await generateTokens(returnUser);
    const authCode = createAuthCode(returnUser, tokens.accessToken);
    setAuthCookies(res, tokens);
    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      authCode,
      user: returnUser,
      role: returnUser.role,
      needsPhone: !returnUser.phone,
      hasPhone: Boolean(returnUser.phone),
    });
  } catch (err) {
    console.error("Signup Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error during registration." });
  }
});

// POST /api/auth/send-welcome-email - Dedicated endpoint to send or test welcome email
router.post("/send-welcome-email", async (req, res) => {
  try {
    const {
      email,
      name,
      role = "CUSTOMER",
      studioName,
      phone,
      portalUrl,
      loginUrl,
      force = true,
    } = req.body;
    if (!email || !email.includes("@")) {
      return res
        .status(400)
        .json({ error: "Valid email address is required." });
    }

    const result = await sendWelcomeEmail({
      toEmail: email,
      name,
      role,
      studioName,
      phone,
      portalUrl,
      loginUrl,
      force: Boolean(force),
    });

    if (!result.success) {
      return res
        .status(500)
        .json({
          error:
            result.reason || result.error || "Failed to dispatch welcome email",
        });
    }

    return res.json({
      success: true,
      message: `Welcome email dispatched successfully to ${email} as ${role}`,
      resendId: result.id,
    });
  } catch (err) {
    console.error("Send Welcome Email Error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to send welcome email." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, phone, identifier, role = "CUSTOMER" } = req.body;
    const searchVal = identifier || email || phone;
    if (!searchVal || !searchVal.trim()) {
      return res
        .status(400)
        .json({ error: "Please enter your email address or mobile number." });
    }

    const cleanVal = searchVal.trim();
    let user = null;

    if (cleanVal.includes("@")) {
      // Validate Email Format
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(cleanVal)) {
        return res
          .status(400)
          .json({
            error: "Please enter a valid email address (e.g. name@domain.com).",
          });
      }

      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: cleanVal.toLowerCase() },
            { contact: cleanVal.toLowerCase() },
          ],
        },
      });
    } else {
      // Validate Mobile Number Format
      const phoneValidation = validateAndFormatPhone(cleanVal);
      if (!phoneValidation.isValid) {
        return res
          .status(400)
          .json({
            error:
              phoneValidation.error ||
              "Please enter a valid email address or 10-digit mobile number.",
          });
      }

      const searchFormatted = phoneValidation.formatted;
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: searchFormatted },
            { phone: cleanVal },
            { contact: searchFormatted },
            { contact: cleanVal },
          ],
        },
      });
    }

    if (!user) {
      return res.status(404).json({
        error:
          "No account found with this email or mobile number. Please register first.",
      });
    }

    // Check if user is expired TEMP_STUDIO (>24h)
    if (await isUserExpiredTempStudio(user)) {
      return res.status(404).json({
        error:
          "Your temporary studio registration expired after 24 hours. Please sign up again.",
        expired: true,
      });
    }

    // Account Status Validation
    if (user.status === "BANNED" || user.status === "SUSPENDED" || user.status === "DELETED") {
      return res.status(403).json({
        error: "Your account has been suspended or deactivated. Please contact support.",
      });
    }

    let returnUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      returnUser = await enrichStudioUser(user);
    }

    const tokens = await generateTokens(returnUser);
    const authCode = createAuthCode(returnUser, tokens.accessToken);
    setAuthCookies(res, tokens);
    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      authCode,
      user: returnUser,
      role: returnUser.role,
      needsPhone: !returnUser.phone,
      hasPhone: Boolean(returnUser.phone),
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Server error during login." });
  }
});

async function enrichStudioUser(user) {
  if (!user || (user.role !== "STUDIO" && user.role !== "TEMP_STUDIO"))
    return user;
  try {
    let store = null;
    if (user.studioId) {
      store = await prisma.partnerStore.findUnique({
        where: { id: user.studioId },
      });
    }
    if (!store && !user.studioId) {
      store = await findClaimableStore({
        email: user.email,
        phone: user.phone,
        userId: user.id,
      });
      if (store) {
        await prisma.user.update({
          where: { id: user.id },
          data: { studioId: store.id },
        });
      }
    }

    if (store) {
      let verificationRejectionReason = null;
      if (store.verificationStatus === "REJECTED") {
        const latest = await prisma.studioVerification.findFirst({
          where: { storeId: store.id },
          orderBy: { createdAt: "desc" },
          select: { rejectionReason: true },
        });
        verificationRejectionReason = latest?.rejectionReason || null;
      }
      return {
        ...user,
        verificationStatus: store.verificationStatus || "UNSUBMITTED",
        verificationRejectionReason,
        // Live on/off switch; an unverified store is always reported as off
        storeStatus:
          store.verificationStatus === "APPROVED" && store.status !== "INACTIVE"
            ? "ACTIVE"
            : "INACTIVE",
        email: user.email || store.email || null,
        phone: user.phone || store.phone || null,
        address: user.address || store.address || null,
        postcode: user.postcode || store.postcode || null,
        storeEmail: store.email || null,
        storePhone: store.phone || null,
        area: user.area || store.area || null,
        lat: user.lat ?? store.lat ?? null,
        lng: user.lng ?? store.lng ?? null,
        openingHours: store.openingHours || "Mon–Sat: 09:00 – 19:00",
        dailyCapacity: store.dailyCapacity ?? 25,
        machines: store.machines ?? 4,
        workers: store.workers ?? 4,
        specialties: store.specialties || [
          "Custom Alterations",
          "Precision Hemming",
          "Express Tailoring",
        ],
        currency: (store.currency && store.currency !== "GBP" ? store.currency : null) || (user.currency && user.currency !== "GBP" ? user.currency : null) || "USD",
        currencySymbol: (store.currency && store.currency !== "GBP" ? store.currencySymbol : null) || (user.currency && user.currency !== "GBP" ? user.currencySymbol : null) || "$",
        status: user.status || store.status || "ACTIVE",
        storeStatus: store.status || user.status || "ACTIVE",
      };
    }
  } catch (err) {
    console.warn("enrichStudioUser error:", err.message);
  }
  return user;
}

// POST /api/auth/status - Update or toggle studio partner live active/inactive status
router.post("/status", async (req, res) => {
  try {
    // Identity comes only from the authenticated session, never from the request body
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Unauthorized: please sign in again." });
    }

    const { status } = req.body || {};
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }
    if (currentUser.role !== "STUDIO" || !currentUser.studioId) {
      return res.status(403).json({ error: "Only onboarded studio partners can change store status." });
    }

    const store = await prisma.partnerStore.findUnique({
      where: { id: currentUser.studioId },
      select: { id: true, status: true, verificationStatus: true },
    });
    if (!store) {
      return res.status(404).json({ error: "Studio profile not found." });
    }

    const currentlyActive = store.status !== "INACTIVE";
    let nextStatus = status
      ? String(status).toUpperCase().trim()
      : currentlyActive ? "INACTIVE" : "ACTIVE";
    if (nextStatus !== "ACTIVE" && nextStatus !== "INACTIVE") {
      return res.status(400).json({ error: "Status must be ACTIVE or INACTIVE." });
    }

    // A studio can only go live once an admin has verified it
    if (nextStatus === "ACTIVE" && store.verificationStatus !== "APPROVED") {
      return res.status(403).json({
        error:
          store.verificationStatus === "PENDING"
            ? "Your verification is under review. You can turn your store on once it is approved."
            : "Please verify your studio before turning your store on.",
        code: "STUDIO_NOT_VERIFIED",
        verificationStatus: store.verificationStatus,
      });
    }

    // The store's status is the on/off switch. The account itself is only ever moved back to
    // ACTIVE here: an INACTIVE studio account is treated as unfinished onboarding at login.
    const [, updatedUser] = await prisma.$transaction([
      prisma.partnerStore.update({
        where: { id: store.id },
        data: { status: nextStatus },
      }),
      nextStatus === "ACTIVE"
        ? prisma.user.update({ where: { id: currentUser.id }, data: { status: "ACTIVE" } })
        : prisma.user.findUnique({ where: { id: currentUser.id } }),
    ]);

    const enrichedUser = await enrichStudioUser(updatedUser);

    return res.json({
      success: true,
      status: nextStatus,
      user: enrichedUser,
      message: nextStatus === "ACTIVE"
        ? "Studio is now Active and visible to customers on Raffu."
        : "Studio is now Inactive and hidden from customer discovery.",
    });
  } catch (err) {
    console.error("Update Studio Status Error:", err);
    return res.status(500).json({ error: "Failed to update studio status." });
  }
});

// POST /api/auth/update-profile
router.post("/update-profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        userId = decoded.id;
      } catch (e) {}
    }

    const {
      id,
      name,
      email,
      phone,
      otp,
      address,
      postcode,
      avatar,
      studioName,
      area,
      lat,
      lng,
      openingHours,
      dailyCapacity,
      machines,
      workers,
      specialties,
      leadTailor,
      measurements,
      status,
    } = req.body;
    let targetId = userId || id;

    if (!targetId && email) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (userByEmail) targetId = userByEmail.id;
    }

    if (!targetId) {
      return res
        .status(401)
        .json({ error: "Unauthorized: missing user identity." });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

    let cleanEmail = null;
    let cleanPhone = null;

    const updateData = {};
    if (name !== undefined)
      updateData.name = typeof name === "string" ? name.trim() : name;
    if (studioName !== undefined)
      updateData.studioName =
        typeof studioName === "string" ? studioName.trim() : studioName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (email) {
      cleanEmail = email.toLowerCase().trim();
      const emailConflict = await prisma.user.findFirst({
        where: { email: cleanEmail, NOT: { id: targetId } },
      });
      if (emailConflict) {
        return res
          .status(409)
          .json({ error: "This email is already in use by another account." });
      }
      updateData.email = cleanEmail;
    }
    if (phone) {
      const phoneValidation = validateAndFormatPhone(phone);
      if (!phoneValidation.isValid) {
        return res.status(400).json({ error: phoneValidation.error });
      }
      cleanPhone = phoneValidation.formatted;

      // If phone number is being changed from an existing registered phone, require OTP verification!
      const currentDigits = (currentUser.phone || "").replace(/\D/g, "");
      const newDigits = cleanPhone.replace(/\D/g, "");
      const isPhoneChanged = Boolean(
        currentUser.phone && currentDigits !== newDigits,
      );

      if (isPhoneChanged) {
        if (!otp) {
          return res.status(400).json({
            error:
              "Verification code (OTP) is required to update your mobile number.",
            requireOtp: true,
            phone: cleanPhone,
          });
        }
        const cleanOtp = String(otp).trim();
        const isValidOtp = await verifyOtp(cleanPhone, cleanOtp);
        if (!isValidOtp) {
          return res.status(400).json({
            error:
              "Invalid or expired verification code for the new mobile number. Please check your SMS and try again.",
            requireOtp: true,
          });
        }
      }

      const phoneConflict = await prisma.user.findFirst({
        where: { phone: cleanPhone, NOT: { id: targetId } },
      });
      if (phoneConflict) {
        return res
          .status(409)
          .json({
            error: "This mobile number is already in use by another account.",
          });
      }
      updateData.phone = cleanPhone;
    }
    if (address !== undefined)
      updateData.address =
        typeof address === "string" ? address.trim() : address;
    if (postcode !== undefined)
      updateData.postcode =
        typeof postcode === "string" ? postcode.trim().toUpperCase() : postcode;
    if (measurements !== undefined) {
      updateData.measurements =
        typeof measurements === "object"
          ? JSON.stringify(measurements)
          : String(measurements);
    }
    if (status !== undefined) {
      const cleanStatus = String(status).toUpperCase().trim();
      if (cleanStatus === "ACTIVE" || cleanStatus === "INACTIVE") {
        updateData.status = cleanStatus;
      }
    }

    let user = await prisma.user.update({
      where: { id: targetId },
      data: updateData,
    });

    // If user is a Studio partner, sync details to partnerStore
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      try {
        let store = null;
        if (user.studioId) {
          store = await prisma.partnerStore.findUnique({
            where: { id: user.studioId },
          });
        }
        if (!store && !user.studioId) {
          store = await findClaimableStore({
            email: user.email,
            phone: user.phone,
            userId: user.id,
          });
        }

        // If no partner store exists yet for this studio partner, create one
        if (!store) {
          const generatedId = `store-${Math.random().toString(36).substring(2, 6)}-${Math.floor(100 + Math.random() * 900)}`;
          const storeName = (
            studioName ||
            user.studioName ||
            user.name ||
            "Raffu Partner Studio"
          ).trim();
          const storeArea = (area || user.postcode || "Mumbai").trim();
          const storeAddress = (
            address !== undefined
              ? String(address).trim()
              : user.address || "Partner Workshop Address"
          ).trim();
          const storePostcode = (
            postcode !== undefined
              ? String(postcode).trim().toUpperCase()
              : user.postcode || "400001"
          ).trim();
          const storeLat =
            lat !== undefined && lat !== null && !isNaN(parseFloat(lat))
              ? parseFloat(lat)
              : 19.076;
          const storeLng =
            lng !== undefined && lng !== null && !isNaN(parseFloat(lng))
              ? parseFloat(lng)
              : 72.8777;

          store = await prisma.partnerStore.create({
            data: {
              id: user.studioId || generatedId,
              name: storeName,
              email: cleanEmail || updateData.email || user.email || null,
              phone: cleanPhone || updateData.phone || user.phone || null,
              area: storeArea,
              address: storeAddress,
              postcode: storePostcode,
              rating: 5.0,
              reviewCount: 1,
              openingHours:
                openingHours && typeof openingHours === "string"
                  ? openingHours.trim()
                  : "Mon–Sat: 09:00 – 19:00",
              dailyCapacity:
                dailyCapacity !== undefined &&
                !isNaN(parseInt(dailyCapacity, 10))
                  ? parseInt(dailyCapacity, 10)
                  : 25,
              machines:
                machines !== undefined && !isNaN(parseInt(machines, 10))
                  ? parseInt(machines, 10)
                  : 4,
              workers:
                workers !== undefined && !isNaN(parseInt(workers, 10))
                  ? parseInt(workers, 10)
                  : 4,
              leadTailor: (
                leadTailor ||
                name ||
                user.name ||
                "Master Tailor"
              ).trim(),
              specialties:
                Array.isArray(specialties) && specialties.length > 0
                  ? specialties
                  : [
                      "Custom Alterations",
                      "Precision Hemming",
                      "Express Tailoring",
                    ],
              retailSold: true,
              lat: storeLat,
              lng: storeLng,
            },
          });

          user = await prisma.user.update({
            where: { id: user.id },
            data: { studioId: store.id },
          });
        } else {
          // Store already exists, update all changed fields safely
          const storeUpdateData = {};
          if (studioName !== undefined)
            storeUpdateData.name = String(studioName).trim();
          if (cleanEmail || updateData.email || email) {
            storeUpdateData.email =
              cleanEmail ||
              updateData.email ||
              String(email).trim().toLowerCase();
          }
          if (cleanPhone || updateData.phone || phone) {
            storeUpdateData.phone =
              cleanPhone || updateData.phone || String(phone).trim();
          }
          if (leadTailor !== undefined || name !== undefined) {
            storeUpdateData.leadTailor = (
              leadTailor ||
              name ||
              user.name ||
              ""
            ).trim();
          }
          if (address !== undefined) {
            storeUpdateData.address = String(address).trim();
          }
          if (postcode !== undefined) {
            storeUpdateData.postcode = String(postcode).trim().toUpperCase();
          }
          if (area !== undefined) {
            storeUpdateData.area = String(area).trim();
          }
          if (lat !== undefined && lat !== null && !isNaN(parseFloat(lat))) {
            storeUpdateData.lat = parseFloat(lat);
          }
          if (lng !== undefined && lng !== null && !isNaN(parseFloat(lng))) {
            storeUpdateData.lng = parseFloat(lng);
          }
          if (openingHours !== undefined) {
            storeUpdateData.openingHours = String(openingHours).trim();
          }
          if (
            dailyCapacity !== undefined &&
            dailyCapacity !== null &&
            !isNaN(parseInt(dailyCapacity, 10))
          ) {
            storeUpdateData.dailyCapacity = parseInt(dailyCapacity, 10);
          }
          if (
            machines !== undefined &&
            machines !== null &&
            !isNaN(parseInt(machines, 10))
          ) {
            storeUpdateData.machines = parseInt(machines, 10);
          }
          if (
            workers !== undefined &&
            workers !== null &&
            !isNaN(parseInt(workers, 10))
          ) {
            storeUpdateData.workers = parseInt(workers, 10);
          }
          if (specialties !== undefined && Array.isArray(specialties)) {
            storeUpdateData.specialties = specialties;
          }
          if (status !== undefined) {
            const cleanStatus = String(status).toUpperCase().trim();
            // Unverified studios can't switch their store on (same rule as POST /status)
            if (
              cleanStatus === "INACTIVE" ||
              (cleanStatus === "ACTIVE" && store.verificationStatus === "APPROVED")
            ) {
              storeUpdateData.status = cleanStatus;
            }
          }

          if (Object.keys(storeUpdateData).length > 0) {
            await prisma.partnerStore.update({
              where: { id: store.id },
              data: storeUpdateData,
            });
          }

          if (!user.studioId || user.studioId !== store.id) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { studioId: store.id },
            });
          }
        }
      } catch (storeSyncErr) {
        console.error("Sync partner store error:", storeSyncErr);
      }
    }

    let enrichedUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      enrichedUser = await enrichStudioUser(user);
    }

    const tokens = await generateTokens(user);
    setAuthCookies(res, tokens);
    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: enrichedUser,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      hasPhone: Boolean(user.phone),
    });
  } catch (err) {
    console.error("Update Profile Error:", err);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  let decoded = req.user;

  // Fallback: check Authorization header if req.user was not populated
  if (!decoded) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
      } catch (_) {}
    }
  }

  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized: missing or expired session" });
  }

  try {

    let user = null;
    if (decoded.id) {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });
    } else if (decoded.email) {
      user = await prisma.user.findUnique({
        where: { email: decoded.email.toLowerCase() },
      });
    }

    if (!user) {
      if (decoded.type === "pending_google_signup" && decoded.email) {
        return res.json({
          user: {
            id: `temp_g_${decoded.email}`,
            email: decoded.email,
            name: decoded.name || "Google User",
            avatar: decoded.avatar || null,
            role: decoded.role || "TEMP_STUDIO",
            status: "INACTIVE",
            isNewUser: true,
          },
        });
      }
      return res.status(401).json({ error: "User account does not exist or has been removed.", deleted: true });
    }

    if (user.status === "BANNED" || user.status === "SUSPENDED" || user.status === "DELETED") {
      return res.status(401).json({ error: "User account has been deactivated.", deactivated: true });
    }

    if (await isUserExpiredTempStudio(user)) {
      return res.status(401).json({
        error:
          "Your temporary studio registration expired after 24 hours. Please sign up again.",
        expired: true,
      });
    }

    if (
      (decoded.role === "STUDIO" || decoded.role === "TEMP_STUDIO") &&
      user &&
      user.role === "CUSTOMER"
    ) {
      user = await prisma.user
        .update({
          where: { id: user.id },
          data: { role: "TEMP_STUDIO" },
        })
        .catch(() => ({ ...user, role: "TEMP_STUDIO" }));
    }

    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      try {
        let store = null;
        if (user.studioId) {
          store = await prisma.partnerStore.findUnique({
            where: { id: user.studioId },
          });
        }
        if (!store && !user.studioId) {
          store = await findClaimableStore({
            email: user.email,
            phone: user.phone,
            userId: user.id,
          });
        }
        if (store) {
          const userUpdates = {};
          if (!user.studioId) userUpdates.studioId = store.id;
          if (!user.address && store.address)
            userUpdates.address = store.address;
          if (!user.postcode && store.postcode)
            userUpdates.postcode = store.postcode;
          if (!user.studioName && store.name)
            userUpdates.studioName = store.name;

          if (Object.keys(userUpdates).length > 0) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: userUpdates,
            });
          }

          // Ensure store also matches user's latest address, postcode, studioName, and leadTailor
          const storeUpdates = {};
          if (user.address && store.address !== user.address)
            storeUpdates.address = user.address;
          if (user.postcode && store.postcode !== user.postcode)
            storeUpdates.postcode = user.postcode;
          if (user.studioName && store.name !== user.studioName)
            storeUpdates.name = user.studioName;
          if (user.name && store.leadTailor !== user.name)
            storeUpdates.leadTailor = user.name;

          if (Object.keys(storeUpdates).length > 0) {
            await prisma.partnerStore.update({
              where: { id: store.id },
              data: storeUpdates,
            });
          }
        }
      } catch (syncErr) {
        console.warn("Sync partner store in /me notice:", syncErr.message);
      }
    }

    if (!user.role) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: "CUSTOMER" },
      });
    }

    if (!user.status) {
      const defaultStatus =
        (user.role === "STUDIO" || user.role === "TEMP_STUDIO") &&
        (!user.studioName || !user.phone)
          ? "INACTIVE"
          : "ACTIVE";
      user = await prisma.user.update({
        where: { id: user.id },
        data: { status: defaultStatus },
      });
    }

    let enrichedUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      enrichedUser = await enrichStudioUser(user);
    }

    return res.json({
      user: enrichedUser,
      role: user.role,
      hasPhone: Boolean(user.phone),
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// POST /api/auth/refresh - Refresh Access Token (15m) using valid Refresh Token (15d) and DB validation
router.post("/refresh", async (req, res) => {
  try {
    let refreshToken = req.body?.refreshToken;

    // Check cookie if not in body
    if (!refreshToken && req.headers.cookie) {
      const match = req.headers.cookie
        .split(";")
        .map((c) => c.trim())
        .find(
          (c) =>
            c.startsWith("tg_refresh_token=") || c.startsWith("refreshToken="),
        );
      if (match) refreshToken = match.split("=")[1];
    }

    if (
      !refreshToken &&
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      refreshToken = req.headers.authorization.split(" ")[1];
    }

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token is required." });
    }

    let decoded = null;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      try {
        decoded = jwt.verify(refreshToken, JWT_SECRET);
      } catch (fallbackErr) {
        return res
          .status(401)
          .json({
            error: "Invalid or expired refresh token. Please sign in again.",
          });
      }
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: "Invalid refresh token payload." });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res
        .status(404)
        .json({ error: "User account not found or has been deleted." });
    }

    // Encrypted token validation: verify hashed token matches PostgreSQL record
    const incomingHashed = hashRefreshToken(refreshToken);
    let storedHash = user.refreshToken;
    let isMatch = false;

    if (storedHash) {
      if (storedHash === incomingHashed) {
        isMatch = true;
      } else if (storedHash.startsWith("{")) {
        try {
          const parsed = JSON.parse(storedHash);
          if (parsed?.current === incomingHashed) {
            isMatch = true;
          } else if (
            parsed?.previous === incomingHashed &&
            Date.now() - (parsed?.rotatedAt || 0) < 60 * 1000 // 60s grace period for concurrent tabs/requests
          ) {
            isMatch = true;
          }
        } catch {}
      }
    }

    if (!isMatch) {
      return res.status(401).json({
        error:
          "Refresh token has been revoked, rotated, or invalidated. Please sign in again.",
      });
    }

    if (user.status === "BANNED" || user.status === "SUSPENDED") {
      return res
        .status(403)
        .json({ error: "Your account has been suspended." });
    }

    if (await isUserExpiredTempStudio(user)) {
      return res
        .status(401)
        .json({ error: "Temporary studio account expired." });
    }

    let returnUser = user;
    if (user.role === "STUDIO" || user.role === "TEMP_STUDIO") {
      returnUser = await enrichStudioUser(user);
    }

    // Issue new pair and update database stored hash
    const tokens = await generateTokens(returnUser);
    setAuthCookies(res, tokens);

    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      user: returnUser,
    });
  } catch (err) {
    console.error("Refresh Token Route Error:", err);
    return res.status(500).json({ error: "Failed to refresh token." });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        userId = decoded.id;
      } catch (_) {}
    }

    let refreshToken = req.body?.refreshToken;
    if (!refreshToken && req.headers.cookie) {
      const match = req.headers.cookie
        .split(";")
        .map((c) => c.trim())
        .find(
          (c) =>
            c.startsWith("tg_refresh_token=") || c.startsWith("refreshToken="),
        );
      if (match) refreshToken = match.split("=")[1];
    }

    if (!userId && req.headers.cookie) {
      const matchToken = req.headers.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("tg_token=") || c.startsWith("token="));
      if (matchToken) {
        try {
          const decoded = jwt.verify(matchToken.split("=")[1], JWT_SECRET);
          userId = decoded.id;
        } catch (_) {}
      }
    }

    if (!userId && refreshToken) {
      try {
        const decodedRt = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        userId = decodedRt.id;
      } catch (_) {
        try {
          const decodedRt = jwt.verify(refreshToken, JWT_SECRET);
          userId = decodedRt.id;
        } catch (_) {}
      }
    }

    // Invalidate refresh token in database on logout
    if (userId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { refreshToken: null },
        })
        .catch(() => {});
    }

    const expiredDate = "Thu, 01 Jan 1970 00:00:00 GMT";
    const isProd = process.env.NODE_ENV === "production";

    // Clear cookies across all possible domain scopes
    const configuredDomain = process.env.COOKIE_DOMAIN || undefined;
    const domainsToClear = isProd
      ? [".luxenart.in", "studio.luxenart.in", "luxenart.in", configuredDomain, undefined].filter(
          (v, i, a) => a.indexOf(v) === i,
        )
      : [configuredDomain, undefined].filter((v, i, a) => a.indexOf(v) === i);

    const cookieNames = [
      "tg_token",
      "tg_refresh_token",
      "tg_logged_in",
      "tg_user_role",
      "tg_user",
      "token",
      "refreshToken",
      "session",
      "auth_token",
    ];

    cookieNames.forEach((name) => {
      domainsToClear.forEach((dom) => {
        try {
          res.clearCookie(name, { path: "/", domain: dom });
          res.clearCookie(name, {
            path: "/",
            domain: dom,
            httpOnly: true,
            sameSite: "lax",
            secure: isProd,
          });
          res.clearCookie(name, {
            path: "/",
            domain: dom,
            httpOnly: false,
            sameSite: "lax",
            secure: isProd,
          });
        } catch (_) {}
      });
    });

    // Explicit Set-Cookie response headers targeting specific domain
    // MUST include HttpOnly variant so browsers erase HttpOnly cookies like tg_refresh_token!
    const setCookieHeaders = [];
    domainsToClear.forEach((dom) => {
      const domainAttr = dom ? `; Domain=${dom}` : "";
      const secureAttr = isProd ? "; Secure" : "";
      cookieNames.forEach((name) => {
        // 1. Clear with HttpOnly (REQUIRED for browsers to delete HttpOnly cookies like tg_refresh_token)
        setCookieHeaders.push(
          `${name}=; Path=/; Expires=${expiredDate}; Max-Age=0; SameSite=Lax; HttpOnly${domainAttr}${secureAttr}`,
        );
        // 2. Clear without HttpOnly (clears non-HttpOnly client cookies)
        setCookieHeaders.push(
          `${name}=; Path=/; Expires=${expiredDate}; Max-Age=0; SameSite=Lax${domainAttr}${secureAttr}`,
        );
      });
    });

    res.setHeader("Set-Cookie", setCookieHeaders);

    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Failed to log out" });
  }
});

// POST /api/auth/oauth/code - Generate single-use auth code for current authenticated user
router.post("/oauth/code", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token." });
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { targetRole } = req.body || {};
    const effectiveRole =
      targetRole ||
      (decoded.role === "CUSTOMER" ? "TEMP_STUDIO" : decoded.role);
    const code = createAuthCode(
      { ...decoded, role: effectiveRole },
      token,
      effectiveRole,
    );
    return res.json({ success: true, code, expiresIn: 60 });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
});

// POST /api/auth/oauth/exchange - One-time auth code exchange (Option A)
router.post("/oauth/exchange", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is required." });
    }

    const item = authCodeStore.get(code);
    if (!item) {
      return res
        .status(400)
        .json({ error: "Invalid or already consumed authorization code." });
    }

    // Immediately consume & delete the code to guarantee single-use!
    authCodeStore.delete(code);

    if (Date.now() > item.expiresAt) {
      return res
        .status(400)
        .json({
          error: "Authorization code has expired. Please sign in again.",
        });
    }

    let returnUser = item.user;
    if (returnUser?.id) {
      const freshUser = await prisma.user
        .findUnique({ where: { id: returnUser.id } })
        .catch(() => null);
      if (freshUser) returnUser = freshUser;
    }

    // If exchange is for studio and returnUser was customer, upgrade to TEMP_STUDIO
    if (
      (item.role === "STUDIO" || item.role === "TEMP_STUDIO" || !item.role) &&
      returnUser &&
      returnUser.role === "CUSTOMER"
    ) {
      returnUser = await prisma.user
        .update({
          where: { id: returnUser.id },
          data: { role: "TEMP_STUDIO" },
        })
        .catch(() => ({ ...returnUser, role: "TEMP_STUDIO" }));
    }

    if (
      returnUser &&
      (returnUser.role === "STUDIO" || returnUser.role === "TEMP_STUDIO")
    ) {
      returnUser = await enrichStudioUser(returnUser);
    }

    const tokens = await generateTokens(returnUser);
    setAuthCookies(res, tokens);

    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      user: returnUser,
      role: returnUser.role || item.role,
    });
  } catch (err) {
    console.error("OAuth exchange error:", err);
    return res
      .status(500)
      .json({ error: "Failed to exchange authorization code." });
  }
});

module.exports = router;
