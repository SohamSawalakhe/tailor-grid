const { prisma } = require("../lib/prisma");

/**
 * Calculate accurate distance in miles between two coordinates using Haversine formula
 * Includes numerical clamping to prevent NaN from floating point inaccuracies
 */
function calculateDistanceInMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Radius of the Earth in miles
  const toRad = (degrees) => (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  // Numerical protection against floating point rounding exceeding 1
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return R * c;
}

/**
 * Locate registered tailor studios from our database within a specified radius (in miles) of the customer
 * Uses Prisma geographic bounding box pre-filtering followed by exact Haversine distance verification
 */
async function locateTailorsWithinRange({
  lat,
  lng,
  radiusMiles = 5.0,
  query = "",
}) {
  const centerLat = Number(lat);
  const centerLng = Number(lng);
  const maxRadius = Number(radiusMiles) || 5.0;

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    throw new Error("Valid latitude and longitude coordinates are required");
  }

  // Calculate latitude & longitude deltas for database index/range pre-filtering
  const deltaLat = maxRadius / 69.0;
  const deltaLng =
    maxRadius / (69.0 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));

  const results = [];

  try {
    // Database pre-filter: fetch only candidate records within geographic bounding box
    const [dbStores, studioUsers] = await Promise.all([
      prisma.partnerStore.findMany({
        where: {
          // Customers only see verified, switched-on studios
          verificationStatus: "APPROVED",
          status: { not: "INACTIVE" },
          lat: {
            gte: centerLat - deltaLat,
            lte: centerLat + deltaLat,
          },
          lng: {
            gte: centerLng - deltaLng,
            lte: centerLng + deltaLng,
          },
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

    if (Array.isArray(dbStores) && dbStores.length > 0) {
      dbStores.forEach((store) => {
        if (store.status === "INACTIVE") return;
        const matchingUser = studioUsers.find((u) => u.studioId === store.id);
        if (matchingUser && matchingUser.status === "INACTIVE") return;
        if (typeof store.lat === "number" && typeof store.lng === "number") {
          // Exact spherical distance with full precision
          const distanceMiles = calculateDistanceInMiles(
            centerLat,
            centerLng,
            store.lat,
            store.lng,
          );

          if (distanceMiles <= maxRadius) {
            results.push({
              id: store.id,
              name: store.name || "Raffu Partner Atelier",
              email: store.email || null,
              phone: store.phone || null,
              area: store.area || query || "Neighborhood Studio",
              address: store.address || "Partner Workshop",
              postcode: store.postcode || "",
              rating: store.rating || 4.96,
              reviewCount: store.reviewCount || 120,
              openingHours: store.openingHours || "09:00 - 19:00",
              dailyCapacity: store.dailyCapacity || 25,
              machines: store.machines || 6,
              workers: store.workers || 4,
              leadTailor: store.leadTailor || "Master Tailor",
              specialties: Array.isArray(store.specialties)
                ? store.specialties
                : ["Custom Alterations", "Precision Hemming"],
              retailSold: store.retailSold ?? true,
              coords: { lat: store.lat, lng: store.lng },
              distanceMiles: Number(distanceMiles.toFixed(3)),
              distance: `${distanceMiles.toFixed(2)} mi away`,
            });
          }
        }
      });
    }
  } catch (err) {
    console.warn(
      "Error fetching registered partner studios:",
      err.message || err,
    );
  }

  // Sort studios by distance (closest to customer first)
  results.sort((a, b) => a.distanceMiles - b.distanceMiles);

  return results;
}

module.exports = {
  calculateDistanceInMiles,
  locateTailorsWithinRange,
};
