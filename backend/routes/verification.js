// @ts-nocheck
const express = require('express');
const { prisma } = require('../lib/prisma');
const {
  VERIFICATION_FIELDS,
  MAX_IMAGE_BYTES,
  verificationUpload,
  toStoredPath,
  resolveStoredPath,
  removeFiles,
  isValidFileSignature,
} = require('../services/verification-storage.service');

const router = express.Router();

// Statuses from which a studio may (re)submit its verification files
const SUBMITTABLE_STATUSES = ['UNSUBMITTED', 'REJECTED'];

/**
 * Resolve the signed-in studio's PartnerStore, or send the error response and return null
 */
async function resolveStudioStore(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }
  if (req.user.role !== 'STUDIO' || !req.user.studioId) {
    res.status(403).json({ error: 'Only onboarded studio partners can submit verification.' });
    return null;
  }
  const store = await prisma.partnerStore.findUnique({
    where: { id: req.user.studioId },
    select: { id: true, name: true, verificationStatus: true, verifiedAt: true },
  });
  if (!store) {
    res.status(404).json({ error: 'Studio profile not found. Please complete onboarding first.' });
    return null;
  }
  return store;
}

async function getLatestSubmission(storeId) {
  return prisma.studioVerification.findFirst({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, rejectionReason: true, createdAt: true, reviewedAt: true },
  });
}

// GET /api/studio/verification - Current verification status of the signed-in studio
router.get('/studio/verification', async (req, res) => {
  try {
    const store = await resolveStudioStore(req, res);
    if (!store) return;

    const latest = await getLatestSubmission(store.id);
    return res.json({
      success: true,
      verificationStatus: store.verificationStatus,
      verifiedAt: store.verifiedAt,
      rejectionReason: store.verificationStatus === 'REJECTED' ? latest?.rejectionReason || null : null,
      submittedAt: latest?.createdAt || null,
    });
  } catch (err) {
    console.error('Fetch studio verification error:', err);
    return res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

// POST /api/studio/verification - Multipart upload: shopFrontImage, interiorImage, machinesVideo
router.post('/studio/verification', async (req, res) => {
  let store;
  try {
    store = await resolveStudioStore(req, res);
    if (!store) return;
  } catch (err) {
    console.error('Studio verification lookup error:', err);
    return res.status(500).json({ error: 'Failed to submit verification' });
  }

  if (!SUBMITTABLE_STATUSES.includes(store.verificationStatus)) {
    return res.status(409).json({
      error:
        store.verificationStatus === 'APPROVED'
          ? 'Your studio is already verified.'
          : 'Your verification is already under review.',
      verificationStatus: store.verificationStatus,
    });
  }

  req.verificationStoreId = store.id;
  verificationUpload(req, res, async (uploadErr) => {
    const uploaded = Object.values(req.files || {}).flat();
    const uploadedPaths = uploaded.map((f) => f.path);

    if (uploadErr) {
      removeFiles(uploadedPaths);
      const message =
        uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'The machines video must be 100 MB or smaller.'
          : uploadErr.message || 'File upload failed';
      return res.status(400).json({ error: message });
    }

    // All three files are required, and photos have a tighter size limit than the video
    for (const [field, cfg] of Object.entries(VERIFICATION_FIELDS)) {
      const file = req.files?.[field]?.[0];
      if (!file) {
        removeFiles(uploadedPaths);
        return res.status(400).json({ error: `${cfg.label} is required.` });
      }
      if (cfg.maxBytes === MAX_IMAGE_BYTES && file.size > MAX_IMAGE_BYTES) {
        removeFiles(uploadedPaths);
        return res.status(400).json({ error: `${cfg.label} must be 10 MB or smaller.` });
      }
    }

    try {
      const submission = await prisma.$transaction(async (tx) => {
        // Only move to PENDING if nobody else submitted in the meantime
        const claimed = await tx.partnerStore.updateMany({
          where: { id: store.id, verificationStatus: { in: SUBMITTABLE_STATUSES } },
          data: { verificationStatus: 'PENDING' },
        });
        if (claimed.count === 0) return null;

        return tx.studioVerification.create({
          data: {
            storeId: store.id,
            shopFrontImage: toStoredPath(req.files.shopFrontImage[0].path),
            interiorImage: toStoredPath(req.files.interiorImage[0].path),
            machinesVideo: toStoredPath(req.files.machinesVideo[0].path),
            status: 'PENDING',
          },
        });
      });

      if (!submission) {
        removeFiles(uploadedPaths);
        return res.status(409).json({ error: 'Your verification is already under review.' });
      }

      return res.status(201).json({
        success: true,
        verificationStatus: 'PENDING',
        submittedAt: submission.createdAt,
      });
    } catch (err) {
      removeFiles(uploadedPaths);
      console.error('Studio verification submit error:', err);
      return res.status(500).json({ error: 'Failed to submit verification' });
    }
  });
});

// GET /api/files/verification/:id/:field - Serve a verification file via a signed, expiring link
router.get('/files/verification/:id/:field', async (req, res) => {
  try {
    const { id, field } = req.params;
    if (!VERIFICATION_FIELDS[field]) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!isValidFileSignature(id, field, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: 'This file link is invalid or has expired.' });
    }

    const submission = await prisma.studioVerification.findUnique({
      where: { id },
      select: { [field]: true },
    });
    const absolutePath = resolveStoredPath(submission?.[field]);
    if (!absolutePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Cache-Control', 'private, max-age=600');
    // sendFile handles Range requests, so the admin video player can seek
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'File not found' });
      }
    });
  } catch (err) {
    console.error('Serve verification file error:', err);
    return res.status(500).json({ error: 'Failed to load file' });
  }
});

module.exports = router;
