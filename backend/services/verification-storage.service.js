const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

/**
 * Local-disk storage for studio verification files.
 * Files are written to backend/uploads/verifications/<storeId>/ with server-generated names;
 * the database stores the path relative to UPLOADS_ROOT, never a client-supplied name.
 * Admin pages load the files through short-lived HMAC-signed links (so <img>/<video> tags
 * work without an Authorization header).
 */
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));
const VERIFICATION_DIR = path.join(UPLOADS_ROOT, 'verifications');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const SIGNED_URL_TTL_MS = 30 * 60 * 1000; // 30 minutes

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};
const VIDEO_TYPES = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
};

// Form field name -> accepted media
const VERIFICATION_FIELDS = {
  shopFrontImage: { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES, label: 'Shop front photo' },
  interiorImage: { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES, label: 'Shop interior photo' },
  machinesVideo: { types: VIDEO_TYPES, maxBytes: MAX_VIDEO_BYTES, label: 'Machines video' },
};

function getSigningSecret() {
  return process.env.FILE_SIGNING_SECRET || process.env.JWT_SECRET || 'raffu-file-signing';
}

const verificationUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const storeId = String(req.verificationStoreId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!storeId) return cb(new Error('STORE_REQUIRED'));
      const dir = path.join(VERIFICATION_DIR, storeId);
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => {
      const ext = VERIFICATION_FIELDS[file.fieldname].types[file.mimetype];
      cb(null, `${file.fieldname}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 3 },
  fileFilter: (req, file, cb) => {
    const field = VERIFICATION_FIELDS[file.fieldname];
    if (!field) return cb(new Error(`Unexpected file field: ${file.fieldname}`));
    if (!field.types[file.mimetype]) {
      return cb(new Error(`${field.label} has an unsupported file type (${file.mimetype}).`));
    }
    cb(null, true);
  },
}).fields(Object.keys(VERIFICATION_FIELDS).map((name) => ({ name, maxCount: 1 })));

/**
 * Path relative to UPLOADS_ROOT, with forward slashes, for storing in the database
 */
function toStoredPath(absolutePath) {
  return path.relative(UPLOADS_ROOT, absolutePath).split(path.sep).join('/');
}

/**
 * Resolve a stored relative path back to disk, refusing anything that escapes UPLOADS_ROOT
 */
function resolveStoredPath(storedPath) {
  if (!storedPath) return null;
  const absolute = path.resolve(UPLOADS_ROOT, storedPath);
  if (!absolute.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return absolute;
}

function removeFiles(paths = []) {
  for (const p of paths) {
    if (!p) continue;
    fs.unlink(p, () => {});
  }
}

function signFileToken(verificationId, field, expiresAt) {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${verificationId}:${field}:${expiresAt}`)
    .digest('hex');
}

/**
 * API-relative signed path for one verification file, e.g.
 * /files/verification/<id>/shopFrontImage?exp=...&sig=...
 */
function getSignedFilePath(verificationId, field) {
  const exp = Date.now() + SIGNED_URL_TTL_MS;
  const sig = signFileToken(verificationId, field, exp);
  return `/files/verification/${encodeURIComponent(verificationId)}/${field}?exp=${exp}&sig=${sig}`;
}

function isValidFileSignature(verificationId, field, exp, sig) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() || typeof sig !== 'string') return false;
  const expected = signFileToken(verificationId, field, expNum);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

module.exports = {
  UPLOADS_ROOT,
  VERIFICATION_FIELDS,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  verificationUpload,
  toStoredPath,
  resolveStoredPath,
  removeFiles,
  getSignedFilePath,
  isValidFileSignature,
};
