const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { calculateDistanceInMiles } = require("./locate.service");
const { getRoadDistances } = require("./routing.service");
const { sendOrderOtpEmail } = require("../lib/email");
const pushService = require("./push.service");

const STAGE_CONFIG = [
  { stage: 1, minRadius: 0.0, maxRadius: 1.0, durationSec: 15 },
  { stage: 2, minRadius: 1.0, maxRadius: 3.0, durationSec: 15 },
  { stage: 3, minRadius: 3.0, maxRadius: 5.0, durationSec: 15 },
];

// Outermost dispatch stage, in road miles; also the straight-line shortlist radius
const MAX_DISPATCH_MILES = STAGE_CONFIG[STAGE_CONFIG.length - 1].maxRadius;

const HARD_TIMEOUT_SEC = 45; // 45 seconds hard dispatch cap (3 stages × 15s)

/*
 * Dispatch sessions live in the `dispatch_sessions` table (see DispatchSession in schema.prisma),
 * so a search survives restarts and works with several backend instances:
 *   - Stage changes are derived from stored timestamps; a 1s sweeper on every instance (and every
 *     read, lazily) applies transitions that are due. No in-process timers.
 *   - Every write is conditional on `version` (optimistic concurrency), so when two instances race
 *     only one transition / push notification wins.
 *   - Accept is claimed atomically (SEARCHING -> ACCEPTING) before the order is written, so exactly
 *     one studio can win even when accepts arrive on different instances at the same moment.
 */
const SESSION_RETENTION_MS = 10 * 60 * 1000; // finished sessions stay readable for status polling
const SWEEP_INTERVAL_MS = 1000;
const CLEANUP_EVERY_N_SWEEPS = 30;
const ACCEPT_CLAIM_TIMEOUT_MS = 30 * 1000; // release a claim if its instance died mid-accept
const MAX_WRITE_RETRIES = 5;

const normId = (id) => String(id).trim().toLowerCase();

function getStageConfig(stageNum) {
  return (
    STAGE_CONFIG.find((c) => c.stage === stageNum) ||
    STAGE_CONFIG[STAGE_CONFIG.length - 1]
  );
}

/**
 * Studios that see the request in a stage: within the stage's road radius and not declined
 */
function candidatesForStage(pool, declinedIds, stageNum) {
  const config = getStageConfig(stageNum);
  const declined = new Set(declinedIds);
  return pool.filter(
    (t) =>
      !declined.has(normId(t.tailorId)) && t.distanceMiles <= config.maxRadius,
  );
}

function stageActivationData(pool, declinedIds, stageNum, now) {
  const config = getStageConfig(stageNum);
  const candidates = candidatesForStage(pool, declinedIds, stageNum);
  return {
    candidates,
    data: {
      stage: stageNum,
      currentRadius: config.maxRadius,
      stageStartedAt: new Date(now),
      stageEndsAt: new Date(now + config.durationSec * 1000),
      activeCandidateTailorIds: candidates.map((t) => normId(t.tailorId)),
    },
  };
}

/**
 * Plain JSON copy for Json columns (Dates become ISO strings, undefined is dropped)
 */
function toJson(value) {
  return value === undefined || value === null
    ? Prisma.DbNull
    : JSON.parse(JSON.stringify(value));
}

/**
 * Write `data` only if nobody else changed the session since `row` was read
 */
async function casUpdate(row, data) {
  const { count } = await prisma.dispatchSession.updateMany({
    where: { orderId: row.orderId, version: row.version },
    data: { ...data, version: { increment: 1 } },
  });
  return count === 1;
}

/**
 * Read-modify-write with retries. `fn(row)` returns { data?, result, after? }; `after` runs once the write won.
 */
async function mutateSession(orderId, fn) {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const row = await prisma.dispatchSession.findUnique({ where: { orderId } });
    const { data, result, after } = fn(row);
    if (!data) return result;
    if (await casUpdate(row, data)) {
      if (after) after();
      return result;
    }
  }
  throw new Error(
    `Dispatch session ${orderId} is under heavy contention; please retry`,
  );
}

/**
 * Web Push the incoming request to every candidate studio of a newly activated stage
 */
function notifyStageCandidates(orderId, orderData, candidates) {
  candidates.forEach((candidate) => {
    pushService
      .sendNotificationToStore(candidate.tailorId, {
        title: `⚡ Incoming Dispatch: ${orderData.garmentName || "Garment"}`,
        body: `${orderData.serviceName || "Alteration"} · ${candidate.distanceMiles ? candidate.distanceMiles.toFixed(1) : "0.2"} mi away · 15s to accept`,
        url: `/?orderId=${orderId}&dispatch=true`,
        tag: `dispatch-${orderId}`,
        renotify: true,
        data: {
          orderId,
          type: "INCOMING_DISPATCH",
          garment: orderData.garmentName,
          service: orderData.serviceName,
          payout: orderData.partnerPayout,
        },
      })
      .catch((err) => console.warn("Dispatch push notice:", err.message));
  });
}

/**
 * The time-based transition that is due for a session right now, if any
 */
function computeDueTransition(row, now) {
  if (row.status === "SEARCHING") {
    if (now >= row.hardTimeoutAt.getTime()) {
      return {
        data: { status: "EXHAUSTED", activeCandidateTailorIds: [] },
        log: `Reached hard ${HARD_TIMEOUT_SEC}s cap. Marked EXHAUSTED.`,
      };
    }
    if (now >= row.stageEndsAt.getTime()) {
      if (row.stage < STAGE_CONFIG.length) {
        const nextStage = row.stage + 1;
        const { data, candidates } = stageActivationData(
          row.tailorPool,
          row.declinedTailorIds,
          nextStage,
          now,
        );
        return {
          data,
          notify: candidates,
          log: `Stage ${nextStage} (${data.currentRadius} mi) activated. Contacting ${candidates.length} tailors. Permanently excluded: ${row.declinedTailorIds.length}`,
        };
      }
      return {
        data: { status: "EXHAUSTED", activeCandidateTailorIds: [] },
        log: `All ${STAGE_CONFIG.length} stages exhausted. No tailor accepted.`,
      };
    }
  }
  if (
    row.status === "ACCEPTING" &&
    now - row.updatedAt.getTime() >= ACCEPT_CLAIM_TIMEOUT_MS
  ) {
    return {
      data: {
        status: now >= row.hardTimeoutAt.getTime() ? "EXHAUSTED" : "SEARCHING",
        acceptedTailorId: null,
      },
      log: "Stale accept claim released.",
    };
  }
  return null;
}

/**
 * Apply a due transition; returns true if this call won the write
 */
async function applyDueTransition(row, now = Date.now()) {
  const transition = computeDueTransition(row, now);
  if (!transition) return false;
  const won = await casUpdate(row, transition.data);
  if (won) {
    console.log(`[Dispatch Engine] Order ${row.orderId} -> ${transition.log}`);
    if (transition.notify)
      notifyStageCandidates(row.orderId, row.orderData, transition.notify);
  }
  return won;
}

/**
 * Current session state with any due transition applied
 */
async function loadSession(orderId) {
  const row = await prisma.dispatchSession.findUnique({ where: { orderId } });
  if (!row) return null;
  if (computeDueTransition(row, Date.now())) {
    await applyDueTransition(row);
    return prisma.dispatchSession.findUnique({ where: { orderId } });
  }
  return row;
}

let isSweeping = false;
let sweepCount = 0;

/**
 * Runs on every instance: advance due stages, expire searches, release stale claims, purge old rows
 */
async function runDispatchSweep() {
  if (isSweeping) return;
  isSweeping = true;
  try {
    const now = Date.now();
    const due = await prisma.dispatchSession.findMany({
      where: {
        OR: [
          {
            status: "SEARCHING",
            OR: [
              { stageEndsAt: { lte: new Date(now) } },
              { hardTimeoutAt: { lte: new Date(now) } },
            ],
          },
          {
            status: "ACCEPTING",
            updatedAt: { lte: new Date(now - ACCEPT_CLAIM_TIMEOUT_MS) },
          },
        ],
      },
      take: 200,
    });
    for (const row of due) {
      await applyDueTransition(row, now).catch((err) =>
        console.warn("[Dispatch Engine] Sweep transition error:", err.message),
      );
    }

    sweepCount = (sweepCount + 1) % CLEANUP_EVERY_N_SWEEPS;
    if (sweepCount === 0) {
      await prisma.dispatchSession.deleteMany({
        where: {
          expiresAt: { lt: new Date(now) },
          status: { notIn: ["SEARCHING", "ACCEPTING"] },
        },
      });
    }
  } catch (err) {
    console.warn("[Dispatch Engine] Sweep error:", err.message || err);
  } finally {
    isSweeping = false;
  }
}

// unref: the sweeper never keeps the process alive on its own (scripts / tests exit normally)
setInterval(runDispatchSweep, SWEEP_INTERVAL_MS).unref();

/**
 * Helper to check if a studio catalog item matches the requested service
 */
function matchesServiceItem(item, requestedService = {}) {
  const reqServiceId = requestedService.serviceId
    ? String(requestedService.serviceId).toLowerCase().trim()
    : "";
  const reqServiceName = requestedService.serviceName
    ? String(requestedService.serviceName).toLowerCase().trim()
    : "";
  const reqGarmentId = requestedService.garmentId
    ? String(requestedService.garmentId).toLowerCase().trim()
    : "";
  const reqCategoryId = requestedService.categoryId
    ? String(requestedService.categoryId).toLowerCase().trim()
    : "";

  const itemServiceId = item.serviceId
    ? String(item.serviceId).toLowerCase().trim()
    : "";
  const itemName = item.name ? String(item.name).toLowerCase().trim() : "";
  const itemCatId = item.categoryId
    ? String(item.categoryId).toLowerCase().trim()
    : "";

  // 1. Direct serviceId match
  if (reqServiceId && itemServiceId && reqServiceId === itemServiceId) {
    return true;
  }
  // 2. Direct service name match
  if (reqServiceName && itemName && reqServiceName === itemName) {
    return true;
  }
  // 3. Category match fallback if serviceId/serviceName not specific or matching category
  if (
    (reqGarmentId || reqCategoryId) &&
    itemCatId &&
    (reqGarmentId === itemCatId || reqCategoryId === itemCatId)
  ) {
    return true;
  }
  return false;
}

/**
 * Build the dispatch pool ONCE per order:
 *   1. Geospatial shortlist: bounding-box DB query + straight-line check within MAX_DISPATCH_MILES.
 *      A road route is never shorter than the straight line, so this circle already contains
 *      every studio that can be within MAX_DISPATCH_MILES by road.
 *   2. Eligibility: drop studios without the requested service before any routing call.
 *   3. Road distance for the remaining shortlist only (batched, cached, straight-line fallback).
 * Stages then use the road distance (1 → 3 → 5 miles).
 */
async function fetchEligible5MilePool(lat, lng, requestedService = {}) {
  const centerLat = parseFloat(lat);
  const centerLng = parseFloat(lng);
  if (isNaN(centerLat) || isNaN(centerLng)) {
    throw new Error("Valid latitude and longitude required");
  }

  const deltaLat = MAX_DISPATCH_MILES / 69.0;
  const deltaLng =
    MAX_DISPATCH_MILES /
    (69.0 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));

  const [boxStores, studioUsers] = await Promise.all([
    prisma.partnerStore.findMany({
      where: {
        // Only admin-verified, switched-on studios receive tailoring requests
        verificationStatus: "APPROVED",
        status: { not: "INACTIVE" },
        lat: { gte: centerLat - deltaLat, lte: centerLat + deltaLat },
        lng: { gte: centerLng - deltaLng, lte: centerLng + deltaLng },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "STUDIO" },
      select: {
        id: true,
        studioId: true,
        studioName: true,
        name: true,
        status: true,
      },
    }),
  ]);

  const inactiveStudioKeys = new Set(
    studioUsers
      .filter((u) => u.status === "INACTIVE")
      // Match by store id only: studio and tailor names are not unique
      .flatMap((u) => [u.studioId])
      .filter(Boolean)
      .map((k) => String(k).toLowerCase().trim()),
  );

  const stores = boxStores.filter((store) => {
    if (store.status === "INACTIVE") return false;
    const sId = (store.id || "").toLowerCase().trim();
    if (inactiveStudioKeys.has(sId)) return false;
    return (
      typeof store.lat === "number" &&
      typeof store.lng === "number" &&
      calculateDistanceInMiles(centerLat, centerLng, store.lat, store.lng) <=
        MAX_DISPATCH_MILES
    );
  });

  if (stores.length === 0) return [];

  // Catalog items for the shortlisted studios only (by studio id or owning user id)
  const shortlistIds = stores.map((s) => s.id);
  const shortlistUserIds = stores.map((s) => s.userId).filter(Boolean);
  // Same matching as the in-memory grouping below: item.studioId / item.userId against store.id / store.userId
  const linkIds = [...shortlistIds, ...shortlistUserIds];
  const allCatalogItems = await prisma.studioCatalogItem.findMany({
    where: {
      OR: [
        { studioId: { in: linkIds, mode: "insensitive" } },
        { userId: { in: linkIds, mode: "insensitive" } },
      ],
    },
    select: {
      studioId: true,
      userId: true,
      serviceId: true,
      name: true,
      categoryId: true,
      enabled: true,
      price: true,
    },
  });

  // Group catalog items by studio identifiers (studioId and userId)
  const studioItemsMap = new Map();
  allCatalogItems.forEach((item) => {
    const keys = [item.studioId, item.userId].filter(Boolean);
    keys.forEach((k) => {
      const lowerKey = String(k).toLowerCase();
      if (!studioItemsMap.has(lowerKey)) {
        studioItemsMap.set(lowerKey, []);
      }
      studioItemsMap.get(lowerKey).push(item);
    });
  });

  const eligibleStores = [];
  if (Array.isArray(stores)) {
    stores.forEach((store) => {
      const storeKey = String(store.id).toLowerCase();
      const userKey = store.userId ? String(store.userId).toLowerCase() : null;
      const storeCatalog = [
        ...(studioItemsMap.get(storeKey) || []),
        ...(userKey ? studioItemsMap.get(userKey) || [] : []),
      ];

      // 1. Studio must have at least one active configured service
      const hasAnyConfigured = storeCatalog.some(
        (i) => i.enabled && Number(i.price) > 0,
      );
      if (!hasAnyConfigured) {
        return;
      }

      // 2. Check if the specific requested service is explicitly disabled by this studio
      if (
        requestedService &&
        (requestedService.serviceId ||
          requestedService.serviceName ||
          requestedService.garmentId)
      ) {
        const matchingItems = storeCatalog.filter((item) =>
          matchesServiceItem(item, requestedService),
        );
        if (matchingItems.length > 0) {
          // If there are matching items, check if ANY are enabled with price > 0
          const hasEnabledMatch = matchingItems.some(
            (item) => item.enabled && Number(item.price) > 0,
          );
          if (!hasEnabledMatch) {
            // All matches for this service are disabled (toggled off) -> EXCLUDE this studio!
            return;
          }
        }
      }

      eligibleStores.push(store);
    });
  }

  if (eligibleStores.length === 0) return [];

  // 3. Road distance for the eligible shortlist only
  const roadDistances = await getRoadDistances(
    { lat: centerLat, lng: centerLng },
    eligibleStores.map((store) => ({
      id: store.id,
      lat: store.lat,
      lng: store.lng,
    })),
  );

  const pool = [];
  eligibleStores.forEach((store) => {
    const road = roadDistances.get(store.id);
    const straightLineMiles = calculateDistanceInMiles(
      centerLat,
      centerLng,
      store.lat,
      store.lng,
    );
    const roadMiles = road ? road.roadMiles : straightLineMiles;
    // Stage filtering and studio-facing distance use the road distance
    if (!Number.isFinite(roadMiles) || roadMiles > MAX_DISPATCH_MILES) return;

    const durationMin =
      road && typeof road.durationSec === "number"
        ? Math.round(road.durationSec / 60)
        : null;
    const milesLabel = `${roadMiles.toFixed(1)} mi`;
    pool.push({
      tailorId: store.id,
      name: store.name || "Raffu Partner Atelier",
      area: store.area || "Neighborhood Studio",
      address: store.address || "",
      postcode: store.postcode || "",
      rating: store.rating || 4.96,
      reviewCount: store.reviewCount || 100,
      specialties: store.specialties || ["Custom Alterations"],
      phone: store.phone || "",
      coords: { lat: store.lat, lng: store.lng },
      distanceMiles: roadMiles,
      straightLineMiles,
      travelMinutes: durationMin,
      distanceSource: road ? road.source : "straight-line",
      distance:
        durationMin !== null
          ? `${milesLabel} · ${durationMin} min away`
          : `${milesLabel} away`,
    });
  });

  // Sort closest by road first
  pool.sort((a, b) => a.distanceMiles - b.distanceMiles);

  return pool;
}

/**
 * Start (or restart on retry) a dispatch session (WITHOUT creating an unconfirmed DB order)
 */
async function startOrderDispatch(order) {
  const uniqueTs = Date.now().toString().slice(-6);
  const uniqueRand = Math.floor(100 + Math.random() * 900);
  const orderId = order.id || `TG-${uniqueTs}${uniqueRand}`;
  const lat = parseFloat(order.customerLat) || 51.5074;
  const lng = parseFloat(order.customerLng) || -0.1278;

  // Fetch 5-mile pool ONCE from DB, filtering out studios that have disabled this service
  const tailorPool = await fetchEligible5MilePool(lat, lng, {
    serviceId: order.serviceId,
    serviceName: order.serviceName,
    garmentId: order.garmentId,
  });

  const now = Date.now();
  const parsedPrice = order.price ? parseFloat(order.price) : 20;
  const partnerPayout = order.partnerPayout || parsedPrice;
  const otp = order.otp || String(Math.floor(1000 + Math.random() * 9000));

  let measurementsStr = "";
  if (order.measurements) {
    measurementsStr =
      typeof order.measurements === "object"
        ? JSON.stringify(order.measurements)
        : String(order.measurements);
  }

  const orderData = {
    id: orderId,
    userId: order.userId || null,
    customerName: order.customerName || "Customer",
    customerPhone: order.customerPhone || null,
    customerEmail: order.customerEmail || "",
    postcode: order.postcode || "W8 4EP",
    garmentId: order.garmentId || "trousers",
    garmentName: order.garmentName || "Trousers & Jeans",
    quantity: order.quantity ? Math.max(1, parseInt(order.quantity, 10)) : 1,
    serviceId: order.serviceId || "trouser-hem",
    serviceName: order.serviceName || "Standard Hemming",
    date: order.date || new Date().toISOString().split("T")[0],
    timeSlot: order.timeSlot || "14:00 - 15:00",
    garmentBrand: order.garmentBrand || "",
    measurements: order.measurements || null,
    fitNotes:
      order.fitNotes ||
      order.notes ||
      order.bookingNotes ||
      measurementsStr ||
      "",
    pinnedAdjustment:
      measurementsStr ||
      (typeof order.measurements === "string" ? order.measurements : ""),
    price: parsedPrice,
    partnerPayout,
    otp,
    imageUrl: order.imageUrl || order.intakePhotoUrl || null,
  };

  const status = tailorPool.length === 0 ? "ZERO_TAILORS" : "SEARCHING"; // SEARCHING, ACCEPTING, ASSIGNED, EXHAUSTED, ZERO_TAILORS, CANCELLED, SCHEDULED
  const { data: stage1, candidates } =
    status === "SEARCHING"
      ? stageActivationData(tailorPool, [], 1, now)
      : {
          data: {
            ...stageActivationData([], [], 1, now).data,
            activeCandidateTailorIds: [],
          },
          candidates: [],
        };

  const sessionData = {
    status,
    ...stage1,
    startedAt: new Date(now),
    hardTimeoutAt: new Date(now + HARD_TIMEOUT_SEC * 1000),
    expiresAt: new Date(now + SESSION_RETENTION_MS),
    orderData: toJson(orderData),
    customerLat: lat,
    customerLng: lng,
    tailorPool: toJson(tailorPool),
    totalEligibleCount: tailorPool.length,
    declinedTailorIds: [],
    acceptedTailorId: null,
    acceptedTailor: Prisma.DbNull,
    confirmedOrder: Prisma.DbNull,
  };

  // Upsert: a retry for the same order replaces the previous session (version bump invalidates stale writers)
  const row = await prisma.dispatchSession.upsert({
    where: { orderId },
    create: { orderId, ...sessionData },
    update: { ...sessionData, version: { increment: 1 } },
  });

  if (status === "SEARCHING") {
    console.log(
      `[Dispatch Engine] Order ${orderId} -> Stage 1 (${stage1.currentRadius} mi) activated. ` +
        `Contacting ${candidates.length} tailors. Permanently excluded: 0`,
    );
    notifyStageCandidates(orderId, orderData, candidates);
  }

  return formatSessionOutput(row);
}

/**
 * Tailor responds: SKIP / DECLINE (Permanent exclusion + instant exhaust check)
 */
async function recordTailorSkip(orderId, tailorId) {
  const cleanId = normId(tailorId);

  return mutateSession(orderId, (session) => {
    if (!session) {
      return {
        result: {
          success: false,
          message: "Dispatch session expired or not found",
        },
      };
    }

    const pool = session.tailorPool || [];
    const poolTailor = pool.find((t) => normId(t.tailorId) === cleanId);
    if (!poolTailor) {
      // Non-pooled tailor skipped, safely ignore so we don't skew the pool count
      console.warn(
        `[Dispatch Engine] Non-pooled tailor ${cleanId} skipped Order ${orderId}. Ignored.`,
      );
      return {
        result: {
          success: true,
          message: "Not an active candidate for this order.",
          status: formatStatus(session.status),
        },
      };
    }

    const declined = Array.from(
      new Set([...session.declinedTailorIds, cleanId]),
    );
    const active = session.activeCandidateTailorIds.filter(
      (id) => id !== cleanId,
    );
    const data = {
      declinedTailorIds: declined,
      activeCandidateTailorIds: active,
    };
    const logs = [
      `Tailor ${poolTailor.tailorId} SKIPPED Order ${orderId}. Excluded (${declined.length}/${pool.length}).`,
    ];
    let notify = null;
    let nextStatus = session.status;

    if (session.status === "SEARCHING") {
      const allPoolDeclined = pool.every((t) =>
        declined.includes(normId(t.tailorId)),
      );
      if (allPoolDeclined) {
        // Instant Check 1: every tailor in the 5-mile pool declined -> end search immediately
        data.status = "EXHAUSTED";
        data.activeCandidateTailorIds = [];
        nextStatus = "EXHAUSTED";
        logs.push(
          `Order ${orderId} -> All ${pool.length} available tailors declined. Immediately ending search (EXHAUSTED).`,
        );
      } else if (active.length === 0 && session.stage < STAGE_CONFIG.length) {
        // Everyone in this stage declined: fast-forward to the next stage if it has anyone new
        const next = stageActivationData(
          pool,
          declined,
          session.stage + 1,
          Date.now(),
        );
        if (next.candidates.length > 0) {
          Object.assign(data, next.data);
          notify = next.candidates;
          logs.push(
            `Order ${orderId} -> Current stage candidates all declined. Advancing immediately to Stage ${session.stage + 1}`,
          );
        }
      }
    }

    return {
      data,
      result: {
        success: true,
        message: "Request skipped. Excluded from this order.",
        remainingCandidates: data.activeCandidateTailorIds.length,
        status: formatStatus(nextStatus),
      },
      after: () => {
        logs.forEach((line) => console.log(`[Dispatch Engine] ${line}`));
        if (notify) notifyStageCandidates(orderId, session.orderData, notify);
      },
    };
  });
}

/**
 * Release an accept claim that did not result in an order
 */
async function releaseAcceptClaim(orderId, tailorId) {
  const now = new Date();
  await prisma.dispatchSession.updateMany({
    where: {
      orderId,
      status: "ACCEPTING",
      acceptedTailorId: tailorId,
      hardTimeoutAt: { gt: now },
    },
    data: {
      status: "SEARCHING",
      acceptedTailorId: null,
      version: { increment: 1 },
    },
  });
  await prisma.dispatchSession.updateMany({
    where: {
      orderId,
      status: "ACCEPTING",
      acceptedTailorId: tailorId,
      hardTimeoutAt: { lte: now },
    },
    data: {
      status: "EXHAUSTED",
      acceptedTailorId: null,
      activeCandidateTailorIds: [],
      version: { increment: 1 },
    },
  });
}

function alreadyAssignedResult(session) {
  return {
    success: false,
    code: "ORDER_ALREADY_ASSIGNED",
    message: "This order has already been accepted by another atelier.",
    assignedStoreName: session?.acceptedTailor?.name || "Another Atelier",
  };
}

/**
 * Tailor responds: ACCEPT. The session is claimed atomically first (first accept wins across
 * instances), then the confirmed order is created in PostgreSQL.
 */
async function recordTailorAccept(orderId, tailorId) {
  // A studio whose verification was revoked mid-search must not claim the order
  const acceptingStore = await prisma.partnerStore.findUnique({
    where: { id: tailorId },
    select: { verificationStatus: true },
  });
  if (acceptingStore && acceptingStore.verificationStatus !== "APPROVED") {
    return {
      success: false,
      code: "STUDIO_NOT_VERIFIED",
      message:
        "Your studio must be verified before you can accept tailoring requests.",
    };
  }

  let session = await loadSession(orderId);

  if (session) {
    if (session.status === "ASSIGNED" || session.status === "ACCEPTING") {
      return alreadyAssignedResult(session);
    }
    if (session.status !== "SEARCHING") {
      return {
        success: false,
        code: "REQUEST_EXPIRED",
        message: "This request is no longer available.",
      };
    }
    const claimed = await casUpdate(session, {
      status: "ACCEPTING",
      acceptedTailorId: tailorId,
    });
    if (!claimed) {
      const latest = await prisma.dispatchSession.findUnique({
        where: { orderId },
      });
      if (
        latest &&
        (latest.status === "ASSIGNED" || latest.status === "ACCEPTING")
      ) {
        return alreadyAssignedResult(latest);
      }
      return {
        success: false,
        code: "REQUEST_EXPIRED",
        message: "This request is no longer available.",
      };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if order already exists in DB
      const existingDbOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { store: true },
      });

      if (
        existingDbOrder &&
        existingDbOrder.storeId &&
        existingDbOrder.storeId !== tailorId
      ) {
        return {
          success: false,
          code: "ORDER_ALREADY_ASSIGNED",
          message: "This order has already been accepted by another atelier.",
          assignedStoreName:
            existingDbOrder.store?.name ||
            existingDbOrder.storeName ||
            "Another Atelier",
        };
      }

      // 2. Fetch tailor store
      const store = await tx.partnerStore.findUnique({
        where: { id: tailorId },
      });

      if (!store) {
        throw new Error("STORE_NOT_FOUND");
      }

      const oData = session?.orderData || {};
      const customerCoords = session
        ? { lat: session.customerLat, lng: session.customerLng }
        : { lat: 51.5074, lng: -0.1278 };

      // Look up all catalog items (both enabled and disabled) from the accepting studio
      const allStudioCatalogItems = await tx.studioCatalogItem.findMany({
        where: {
          OR: [
            { studioId: store.id },
            ...(store.userId ? [{ userId: store.userId }] : []),
          ],
        },
      });

      // Verify studio has not disabled this requested service
      if (allStudioCatalogItems.length > 0) {
        const orderSvc = {
          serviceId: oData.serviceId,
          serviceName: oData.serviceName,
          garmentId: oData.garmentId,
        };
        const matchingItems = allStudioCatalogItems.filter((item) =>
          matchesServiceItem(item, orderSvc),
        );
        if (matchingItems.length > 0) {
          const hasEnabledMatch = matchingItems.some(
            (item) => item.enabled && Number(item.price) > 0,
          );
          if (!hasEnabledMatch) {
            return {
              success: false,
              code: "SERVICE_DISABLED",
              message:
                "You have disabled this alteration service in your Workshop Price Catalog.",
            };
          }
        }
      }

      const studioCatalogItems = allStudioCatalogItems.filter(
        (item) => item.enabled && Number(item.price) > 0,
      );

      let calculatedPrice = oData.price ? parseFloat(oData.price) : 20;
      let calculatedPayout =
        Number(oData.partnerPayout) || calculatedPrice * 0.75;
      let studioCurrency =
        store.currency && store.currency !== "GBP" ? store.currency : "USD";
      let studioCurrencySymbol =
        (store.currency && store.currency !== "GBP"
          ? store.currencySymbol
          : "$") || "$";

      if (studioCatalogItems.length > 0) {
        if (studioCatalogItems[0].currency)
          studioCurrency = studioCatalogItems[0].currency;
        if (studioCatalogItems[0].currencySymbol)
          studioCurrencySymbol = studioCatalogItems[0].currencySymbol;

        // Find match: by serviceId, or service name case-insensitive, or category
        const matchedItem = studioCatalogItems.find((item) =>
          matchesServiceItem(item, {
            serviceId: oData.serviceId,
            serviceName: oData.serviceName,
            garmentId: oData.garmentId,
          }),
        );

        if (matchedItem && Number(matchedItem.price) > 0) {
          calculatedPrice = Number(matchedItem.price);
          calculatedPayout =
            Number(matchedItem.partnerPayout) || calculatedPrice * 0.75;
          if (matchedItem.currency) studioCurrency = matchedItem.currency;
          if (matchedItem.currencySymbol)
            studioCurrencySymbol = matchedItem.currencySymbol;
        }
      }

      // 3. Insert or update confirmed order in PostgreSQL
      let savedOrder;
      if (existingDbOrder) {
        savedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            storeId: store.id,
            storeName: store.name,
            storePhone: store.phone,
            tailorLat: store.lat,
            tailorLng: store.lng,
            price: calculatedPrice,
            partnerPayout: calculatedPayout,
            currency: studioCurrency,
            currencySymbol: studioCurrencySymbol,
            status: "Accepted",
          },
          include: { store: true },
        });
      } else {
        savedOrder = await tx.order.create({
          data: {
            id: orderId,
            userId: oData.userId || null,
            customerName: oData.customerName || "Valued Customer",
            customerEmail: oData.customerEmail || "customer@example.com",
            customerPhone: oData.customerPhone || null,
            postcode: oData.postcode || "W8 4EP",
            customerLat: customerCoords.lat,
            customerLng: customerCoords.lng,
            tailorLat: store.lat,
            tailorLng: store.lng,
            garmentId: oData.garmentId || "trousers",
            garmentName: oData.garmentName || "Trousers & Jeans",
            quantity: oData.quantity
              ? Math.max(1, parseInt(oData.quantity, 10))
              : 1,
            serviceId: oData.serviceId || "trouser-hem",
            serviceName: oData.serviceName || "Standard Hemming",
            storeId: store.id,
            storeName: store.name,
            storePhone: store.phone,
            date: oData.date || new Date().toISOString().split("T")[0],
            timeSlot: oData.timeSlot || "14:00 - 15:00",
            garmentBrand: oData.garmentBrand || "",
            fitNotes: oData.fitNotes || oData.notes || oData.bookingNotes || "",
            pinnedAdjustment:
              oData.pinnedAdjustment ||
              (typeof oData.measurements === "object"
                ? JSON.stringify(oData.measurements)
                : oData.measurements || ""),
            sewingNotes: "",
            slaHours: 48,
            partnerPayout: calculatedPayout,
            retailSold: false,
            intakePhotoUrl: oData.imageUrl || null,
            status: "Accepted",
            price: calculatedPrice,
            currency: studioCurrency,
            currencySymbol: studioCurrencySymbol,
            otp: oData.otp || "1234",
          },
          include: { store: true },
        });
      }

      return {
        success: true,
        order: savedOrder,
        store,
      };
    });

    if (result.success && session) {
      await prisma.dispatchSession.updateMany({
        where: { orderId, status: "ACCEPTING", acceptedTailorId: tailorId },
        data: {
          status: "ASSIGNED",
          acceptedTailor: toJson(result.store),
          confirmedOrder: toJson(result.order),
          orderData: toJson({
            ...session.orderData,
            price: result.order.price,
            partnerPayout: result.order.partnerPayout,
            currency: result.order.currency,
            currencySymbol: result.order.currencySymbol,
          }),
          activeCandidateTailorIds: [],
          version: { increment: 1 },
        },
      });
      console.log(
        `[Dispatch Engine] Order ${orderId} successfully ACCEPTED & created in PostgreSQL for ${result.store.name} (${tailorId})`,
      );
    } else if (session) {
      await releaseAcceptClaim(orderId, tailorId);
    }

    if (result.success && result.order) {
      // 1. Asynchronously dispatch Web Push Notification to customer
      (async () => {
        try {
          const storeName =
            result.store?.name || result.order.storeName || "Partner Atelier";
          const garmentName = result.order.garmentName || "Garment";
          const orderPin = result.order.otp ? ` PIN: ${result.order.otp}` : "";

          await pushService.sendNotificationToCustomer(result.order, {
            title: "🎉 Atelier Accepted Your Order!",
            body: `${storeName} has accepted order #${result.order.id}. Drop-off your ${garmentName.toLowerCase()} whenever ready.${orderPin}`,
            icon: "/android-chrome-192x192.png",
            badge: "/favicon-32x32.png",
            tag: `order-${result.order.id}-accepted`,
            url: `/order/${result.order.id}`,
            data: {
              orderId: result.order.id,
              type: "ORDER_ACCEPTED",
              status: "Accepted",
              url: `/order/${result.order.id}`,
            },
          });
          console.log(
            `[Push Notification] Dispatched order accepted alert to customer for #${result.order.id}`,
          );
        } catch (pushErr) {
          console.warn(
            "[Dispatch Engine] Error dispatching order accepted push:",
            pushErr.message || pushErr,
          );
        }
      })();

      // 2. Asynchronously dispatch Order OTP confirmation email to customer via Resend
      (async () => {
        try {
          let customerEmail = result.order.customerEmail;
          let customerName = result.order.customerName;
          if (
            (!customerEmail || customerEmail.includes("example.com")) &&
            result.order.userId
          ) {
            const user = await prisma.user.findUnique({
              where: { id: result.order.userId },
            });
            if (user?.email) {
              customerEmail = user.email;
              if (user.name) customerName = user.name;
            }
          }
          if (
            customerEmail &&
            customerEmail.includes("@") &&
            !customerEmail.includes("example.com")
          ) {
            await sendOrderOtpEmail({
              toEmail: customerEmail,
              otp: result.order.otp,
              orderId: result.order.id,
              customerName: customerName || "Valued Customer",
              garmentName: result.order.garmentName,
              serviceName: result.order.serviceName,
              storeName: result.store?.name || result.order.storeName,
              storeAddress: result.store?.address,
              storePhone: result.store?.phone,
            });
          }
        } catch (emailErr) {
          console.error(
            "[Dispatch Engine] Error dispatching order OTP email:",
            emailErr.message || emailErr,
          );
        }
      })();
    }

    return result;
  } catch (err) {
    console.error(`[Dispatch Engine] Error accepting order ${orderId}:`, err);
    if (session) {
      await releaseAcceptClaim(orderId, tailorId).catch(() => {});
    }
    return {
      success: false,
      code: "SERVER_ERROR",
      message: err.message || "Failed to accept order",
    };
  }
}

/**
 * Customer cancels search before acceptance - removes the session and any unaccepted DB record
 */
async function cancelDispatch(orderId) {
  const { count } = await prisma.dispatchSession.deleteMany({
    where: { orderId, status: { notIn: ["ACCEPTING", "ASSIGNED"] } },
  });
  if (count > 0) {
    console.log(
      `[Dispatch Engine] Order ${orderId} CANCELLED by customer and removed from dispatch sessions.`,
    );
  }

  // Also clean up any unaccepted allocated record from DB
  try {
    await prisma.order.deleteMany({
      where: { id: orderId, status: "Allocated" },
    });
  } catch (err) {
    // Ignore if not in DB
  }

  return {
    success: true,
    message: "Dispatch search cancelled and cleared from server cache",
  };
}

/**
 * Fetch active pending orders waiting for a specific tailor studio
 */
async function getPendingRequestsForTailor(tailorId) {
  if (!tailorId) return [];
  const now = Date.now();
  const pending = [];
  const cleanTailorId = normId(tailorId);

  const store = await prisma.partnerStore.findUnique({
    where: { id: tailorId },
    select: { verificationStatus: true },
  });
  if (store && store.verificationStatus !== "APPROVED") return [];

  // Fetch this studio's catalog items to ensure disabled services are never served in pending requests
  let disabledItems = [];
  try {
    const catalogItems = await prisma.studioCatalogItem.findMany({
      where: {
        OR: [
          { studioId: tailorId },
          { studioId: cleanTailorId },
          { userId: tailorId },
          { userId: cleanTailorId },
        ],
      },
      select: {
        serviceId: true,
        name: true,
        categoryId: true,
        enabled: true,
        price: true,
      },
    });
    disabledItems = catalogItems.filter(
      (i) => i.enabled === false || Number(i.price) <= 0,
    );
  } catch (err) {
    console.warn(
      "[Dispatch Engine] Warning querying studio catalog in getPendingRequestsForTailor:",
      err.message,
    );
  }

  const sessions = await prisma.dispatchSession.findMany({
    where: {
      status: "SEARCHING",
      activeCandidateTailorIds: { has: cleanTailorId },
    },
  });

  for (const session of sessions) {
    // 1. Skip searches past their hard cap (the sweeper is about to close them)
    if (now >= session.hardTimeoutAt.getTime()) continue;

    // 2. Check if tailor has declined this order
    if (session.declinedTailorIds.includes(cleanTailorId)) continue;

    // 3. Find tailor info in session's 5-mile pool
    const tailorInfo = (session.tailorPool || []).find(
      (t) => normId(t.tailorId) === cleanTailorId,
    );
    if (!tailorInfo) continue;

    // 4. Double check that tailor is strictly within currentRadius
    if (
      typeof tailorInfo.distanceMiles === "number" &&
      tailorInfo.distanceMiles > session.currentRadius
    ) {
      continue;
    }

    // 5. Fail-safe: Double check that tailor has NOT disabled this order's service
    const orderData = session.orderData || {};
    if (disabledItems.length > 0) {
      const orderSvc = {
        serviceId: orderData.serviceId,
        serviceName: orderData.serviceName,
        garmentId: orderData.garmentId,
      };
      const isServiceDisabled = disabledItems.some((item) =>
        matchesServiceItem(item, orderSvc),
      );
      if (isServiceDisabled) {
        continue;
      }
    }

    const stageSecondsRemaining = Math.max(
      0,
      Math.ceil((session.stageEndsAt.getTime() - now) / 1000),
    );

    pending.push({
      orderId: session.orderId,
      order: {
        ...orderData,
        measurements: orderData.measurements || orderData.pinnedAdjustment,
        pinnedAdjustment: orderData.pinnedAdjustment,
      },
      measurements: orderData.measurements || orderData.pinnedAdjustment,
      pinnedAdjustment: orderData.pinnedAdjustment,
      distanceMiles: tailorInfo.distanceMiles,
      distance: tailorInfo.distance,
      stage: session.stage,
      currentRadius: session.currentRadius,
      secondsRemaining: stageSecondsRemaining,
      payout: orderData.partnerPayout,
      customerName: orderData.customerName,
      garmentName: orderData.garmentName,
      quantity: orderData.quantity || 1,
      serviceName: orderData.serviceName,
      timeSlot: orderData.timeSlot,
      date: orderData.date,
    });
  }

  return pending;
}

/**
 * Get current dispatch session status for Customer Book page
 */
async function getDispatchSessionStatus(orderId) {
  const session = await loadSession(orderId);
  if (!session) {
    return {
      orderId,
      status: "NOT_FOUND",
      message: "No active dispatch session",
    };
  }
  return formatSessionOutput(session);
}

/**
 * ACCEPTING is internal: clients keep seeing SEARCHING until the order is confirmed
 */
function formatStatus(status) {
  return status === "ACCEPTING" ? "SEARCHING" : status;
}

/**
 * Format session for customer / client view
 */
function formatSessionOutput(session) {
  const now = Date.now();
  const stageSecondsRemaining = Math.max(
    0,
    Math.ceil((session.stageEndsAt.getTime() - now) / 1000),
  );
  const totalSecondsElapsed = Math.max(
    0,
    Math.floor((now - session.startedAt.getTime()) / 1000),
  );

  return {
    orderId: session.orderId,
    status: formatStatus(session.status), // SEARCHING, ASSIGNED, EXHAUSTED, ZERO_TAILORS, CANCELLED, SCHEDULED
    stage: session.stage,
    currentRadius: session.currentRadius,
    stageSecondsRemaining,
    totalSecondsElapsed,
    hardTimeoutSec: HARD_TIMEOUT_SEC,
    totalEligibleCount: session.totalEligibleCount,
    contactedCount: session.activeCandidateTailorIds.length,
    declinedCount: session.declinedTailorIds.length,
    acceptedTailorId: session.acceptedTailorId,
    acceptedTailor: session.acceptedTailor,
    order: session.confirmedOrder || session.orderData,
  };
}

/**
 * Schedule fallback when customer schedules for later (Creates DB record)
 */
async function scheduleOrderForLater(
  orderId,
  scheduledDate,
  scheduledTimeSlot,
) {
  const session = await prisma.dispatchSession.findUnique({
    where: { orderId },
  });
  if (session) {
    await prisma.dispatchSession.updateMany({
      where: { orderId, status: { notIn: ["ACCEPTING", "ASSIGNED"] } },
      data: {
        status: "SCHEDULED",
        activeCandidateTailorIds: [],
        version: { increment: 1 },
      },
    });
  }

  const oData = session?.orderData || {};
  const customerCoords = session
    ? { lat: session.customerLat, lng: session.customerLng }
    : { lat: 51.5074, lng: -0.1278 };

  // Resolve tailor coordinates from the store record if a store is already known
  let tailorLatVal = null;
  let tailorLngVal = null;
  if (oData.storeId) {
    try {
      const store = await prisma.partnerStore.findUnique({
        where: { id: oData.storeId },
      });
      if (
        store &&
        typeof store.lat === "number" &&
        typeof store.lng === "number"
      ) {
        tailorLatVal = store.lat;
        tailorLngVal = store.lng;
      }
    } catch (e) {
      console.warn(
        "[Dispatch] Could not resolve store coords for scheduled order:",
        e.message,
      );
    }
  }

  const scheduledOrder = await prisma.order.upsert({
    where: { id: orderId },
    update: {
      date: scheduledDate || new Date().toISOString().split("T")[0],
      timeSlot: scheduledTimeSlot || "10:00 - 11:00",
      status: "Allocated",
      // ✅ Refresh customer coords on reschedule in case GPS updated
      customerLat: customerCoords.lat,
      customerLng: customerCoords.lng,
      ...(tailorLatVal !== null ? { tailorLat: tailorLatVal } : {}),
      ...(tailorLngVal !== null ? { tailorLng: tailorLngVal } : {}),
    },
    create: {
      id: orderId,
      userId: oData.userId || null,
      customerName: oData.customerName || "Valued Customer",
      customerEmail: oData.customerEmail || "customer@example.com",
      customerPhone: oData.customerPhone || null,
      postcode: oData.postcode || "W8 4EP",
      customerLat: customerCoords.lat,
      customerLng: customerCoords.lng,
      tailorLat: tailorLatVal,
      tailorLng: tailorLngVal,
      garmentId: oData.garmentId || "trousers",
      garmentName: oData.garmentName || "Trousers & Jeans",
      serviceId: oData.serviceId || "trouser-hem",
      serviceName: oData.serviceName || "Standard Hemming",
      date: scheduledDate || new Date().toISOString().split("T")[0],
      timeSlot: scheduledTimeSlot || "10:00 - 11:00",
      garmentBrand: oData.garmentBrand || "",
      fitNotes: oData.fitNotes || oData.notes || oData.bookingNotes || "",
      pinnedAdjustment:
        oData.pinnedAdjustment ||
        (typeof oData.measurements === "object"
          ? JSON.stringify(oData.measurements)
          : oData.measurements || ""),
      sewingNotes: "",
      slaHours: 48,
      partnerPayout: oData.partnerPayout || oData.price || 20,
      retailSold: false,
      intakePhotoUrl: oData.imageUrl || null,
      status: "Allocated",
      price: oData.price || 20,
      otp: oData.otp || "1234",
    },
    include: { store: true },
  });

  return {
    success: true,
    message: "Order scheduled for later slot successfully",
    order: scheduledOrder,
  };
}

module.exports = {
  startOrderDispatch,
  recordTailorSkip,
  recordTailorAccept,
  cancelDispatch,
  getPendingRequestsForTailor,
  getDispatchSessionStatus,
  scheduleOrderForLater,
  matchesServiceItem,
  runDispatchSweep,
};
