const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateUser } = require('../lib/auth-middleware');

const router = express.Router();

// GET /api/services - Garment categories & alteration service pricing
router.get('/services', async (req, res) => {
  try {
    const categories = await prisma.garmentCategory.findMany({
      include: {
        services: true,
      },
      orderBy: {
        startingPrice: 'asc',
      },
    });

    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      tagline: cat.tagline,
      startingPrice: cat.startingPrice,
      avgTurnaround: cat.avgTurnaround,
      popularServices: cat.services,
    }));

    return res.json({ services: formatted });
  } catch (err) {
    console.error('Error fetching services from Prisma:', err);
    return res.status(500).json({ error: 'Failed to fetch services from database' });
  }
});

// Helper for GPS distance calculation purely by lat/lng
function calculateDistanceInMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// GET /api/stores - Partner studio locations & live capacity (filtered purely by lat/lng or search)
router.get('/stores', async (req, res) => {
  try {
    const { search, area } = req.query;
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radiusMiles = parseFloat(req.query.radiusMiles || '8.0') || 8.0;

    // Customers only see admin-verified studios
    const where = { verificationStatus: 'APPROVED' };

    // Only apply text filtering if explicit search or area is provided without lat/lng
    if (isNaN(lat) || isNaN(lng)) {
      if (area) {
        const cityKeyword = area.split(',')[0].trim();
        where.OR = [
          { area: { contains: area, mode: 'insensitive' } },
          { area: { contains: cityKeyword, mode: 'insensitive' } },
          { address: { contains: cityKeyword, mode: 'insensitive' } },
          { name: { contains: cityKeyword, mode: 'insensitive' } },
        ];
      }

      if (search) {
        const cleanSearch = search.trim();
        where.OR = [
          { name: { contains: cleanSearch, mode: 'insensitive' } },
          { area: { contains: cleanSearch, mode: 'insensitive' } },
          { address: { contains: cleanSearch, mode: 'insensitive' } },
          { postcode: { contains: cleanSearch, mode: 'insensitive' } },
          { leadTailor: { contains: cleanSearch, mode: 'insensitive' } },
        ];
      }
    }

    where.status = { not: 'INACTIVE' };

    const prismaStores = await prisma.partnerStore.findMany({
      where,
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Only display studios that have configured their alteration prices
    const filledCatalogItems = await prisma.studioCatalogItem.findMany({
      where: {
        enabled: true,
        price: { gt: 0 },
      },
      select: {
        studioId: true,
        userId: true,
      },
    });

    const activeStudioIds = new Set(
      filledCatalogItems.flatMap((item) => [item.studioId, item.userId]).filter(Boolean)
    );

    const studioUsers = await prisma.user.findMany({
      where: { role: 'STUDIO' },
      select: {
        id: true,
        name: true,
        studioName: true,
        studioId: true,
        status: true,
        avatar: true,
        address: true,
        postcode: true,
      },
    });

    // Deduplicate stores by slug/name/leadTailor
    const seenKeys = new Set();
    let stores = [];

    for (const s of prismaStores) {
      // Find matching studio user
      const matchingUser = studioUsers.find(
        (u) =>
          (u.studioId && u.studioId === s.id) ||
          (u.studioName && u.studioName.toLowerCase() === s.name.toLowerCase()) ||
          (u.name && u.name.toLowerCase() === s.leadTailor.toLowerCase())
      );

      // Exclude stores that are inactive or whose owning studio account is inactive.
      // The owner is matched by store id only: name matches can belong to another studio.
      const owner = studioUsers.find((u) => u.studioId === s.id);
      if (s.status === 'INACTIVE' || (owner && owner.status === 'INACTIVE')) {
        continue;
      }

      // Studio must have configured prices to be visible to customers
      const isConfigured = activeStudioIds.has(s.id) || (matchingUser && activeStudioIds.has(matchingUser.id));
      if (!isConfigured) {
        continue;
      }

      const storeName = (matchingUser && matchingUser.studioName) ? matchingUser.studioName : s.name;
      const key = (storeName || s.leadTailor || s.id).toLowerCase().trim();

      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);

      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') {
        continue;
      }
      const storeLat = s.lat;
      const storeLng = s.lng;

      let calculatedDist = 0;
      let hasDynamicDistance = false;
      if (!isNaN(lat) && !isNaN(lng)) {
        calculatedDist = Number(calculateDistanceInMiles(lat, lng, storeLat, storeLng).toFixed(2));
        // Purely lat/lng filtering: ignore stores beyond radiusMiles
        if (calculatedDist > radiusMiles) {
          continue;
        }
        hasDynamicDistance = true;
      }

      stores.push({
        id: s.id,
        name: storeName,
        area: s.area,
        address: (matchingUser && matchingUser.address) ? matchingUser.address : s.address,
        postcode: (matchingUser && matchingUser.postcode) ? matchingUser.postcode : s.postcode,
        distance: hasDynamicDistance ? `${calculatedDist} mi away` : null,
        distanceMiles: hasDynamicDistance ? calculatedDist : null,
        rating: s.rating || 5.0,
        reviewCount: s.reviewCount || 1,
        openingHours: s.openingHours || 'Mon–Sat: 09:00 – 19:00',
        dailyCapacity: s.dailyCapacity || 25,
        machines: s.machines || 6,
        workers: s.workers || 4,
        leadTailor: (matchingUser && matchingUser.name) ? matchingUser.name : s.leadTailor,
        specialties: Array.isArray(s.specialties) && s.specialties.length > 0
          ? s.specialties
          : ['Custom Alterations', 'Precision Hemming', 'Express Tailoring'],
        retailSold: s.retailSold ?? true,
        coords: { lat: storeLat, lng: storeLng },
        image: matchingUser?.avatar || null,
      });
    }

    if (!isNaN(lat) && !isNaN(lng)) {
      stores.sort((a, b) => (a.distanceMiles || 0) - (b.distanceMiles || 0));
    }

    return res.json({ stores, total: stores.length });
  } catch (err) {
    console.error('Error fetching partner stores from Prisma:', err);
    return res.status(500).json({ error: 'Failed to fetch stores from database' });
  }
});

// POST /api/stores - Register a new partner studio directly in PostgreSQL
router.post('/stores', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      area,
      address,
      postcode,
      leadTailor,
      machines,
      workers,
      dailyCapacity,
      specialties,
      openingHours,
      lat,
      lng,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Store name is required' });
    }

    const storeSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const storeId = `store-${storeSlug}-${Math.floor(100 + Math.random() * 900)}`;

    const newStore = await prisma.partnerStore.create({
      data: {
        id: storeId,
        name,
        email: email ? email.trim().toLowerCase() : null,
        phone: phone ? phone.trim() : null,
        area: area || 'Neighborhood Atelier',
        address: address || '18 Kensington Church St',
        postcode: postcode || 'W8 4EP',
        rating: 5.0,
        reviewCount: 1,
        openingHours: openingHours || 'Mon–Sat: 09:00 – 19:00',
        dailyCapacity: dailyCapacity || 25,
        machines: machines ? parseInt(machines) || 6 : 6,
        workers: workers ? parseInt(workers) || 4 : 4,
        leadTailor: leadTailor || 'Master Tailor',
        specialties: specialties || ['Custom Alterations', 'Precision Hemming', 'Express Tailoring'],
        retailSold: true,
        lat: lat ? parseFloat(lat) : 40.7259,
        lng: lng ? parseFloat(lng) : -74.0003,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Studio registered successfully',
      store: {
        ...newStore,
        coords: { lat: newStore.lat, lng: newStore.lng },
      },
    });
  } catch (err) {
    console.error('Create store Prisma error:', err);
    return res.status(500).json({ error: 'Failed to create store in database' });
  }
});

const { locateTailorsWithinRange } = require('../services/locate.service');

// GET /api/tailors/nearby or /api/locate/tailors - Locate all tailors within range
const handleLocateTailors = async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusMiles = Number(req.query.radiusMiles ?? 5.0);
    const query = req.query.query || '';

    // Validate coordinates and search radius boundaries
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(radiusMiles) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      radiusMiles <= 0 ||
      radiusMiles > 50
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates or search radius. Latitude must be between -90 and 90, longitude between -180 and 180, and radius between 0 and 50 miles.',
      });
    }

    const tailors = await locateTailorsWithinRange({ lat, lng, radiusMiles, query });

    return res.json({
      success: true,
      tailors,
      count: tailors.length,
      radiusMiles,
      center: { lat, lng },
    });
  } catch (err) {
    console.error('Error in locateTailors service route:', err);
    return res.status(500).json({ error: 'Failed to locate tailors within range' });
  }
};

router.get('/tailors/nearby', handleLocateTailors);
router.get('/locate/tailors', handleLocateTailors);

// ─────────────────────────────────────────────────────────────────────────────
// STUDIO PRICE CATALOG MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio/catalog - Fetch studio specific price catalog & base categories
router.get('/studio/catalog', authenticateUser, async (req, res) => {
  try {
    const rawStudioId = req.query.studioId;
    const requestedStudioId = (rawStudioId && rawStudioId !== 'undefined' && rawStudioId !== 'null') ? String(rawStudioId).trim() : null;
    const effectiveStudioId = requestedStudioId || req.user?.studioId || req.user?.id;

    // Fetch base categories and alteration services
    const baseCategories = await prisma.garmentCategory.findMany({
      include: {
        services: true,
      },
      orderBy: {
        startingPrice: 'asc',
      },
    });

    const formattedBaseCategories = baseCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      tagline: cat.tagline,
      startingPrice: cat.startingPrice,
      avgTurnaround: cat.avgTurnaround,
      services: cat.services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        customerPrice: s.customerPrice,
        partnerPayout: s.partnerPayout,
        platformFee: s.platformFee,
        turnaroundDays: s.turnaroundDays,
        popular: s.popular,
      })),
    }));

    if (!effectiveStudioId) {
      return res.json({
        success: true,
        studioId: null,
        hasFilledCatalog: false,
        items: [],
        baseCategories: formattedBaseCategories,
      });
    }

    // Find custom studio catalog items
    const customItems = await prisma.studioCatalogItem.findMany({
      where: {
        OR: [
          { studioId: effectiveStudioId },
          ...(req.user?.id ? [{ userId: req.user.id }] : []),
          ...(req.user?.studioId ? [{ studioId: req.user.studioId }] : []),
        ],
      },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    });

    const hasFilledCatalog =
      customItems.length > 0 &&
      customItems.some((i) => i.enabled !== false && Number(i.price) > 0);

    let studioCurrency = 'USD';
    let studioCurrencySymbol = '$';

    if (customItems.length > 0 && customItems[0].currency) {
      studioCurrency = customItems[0].currency;
      studioCurrencySymbol = customItems[0].currencySymbol || '$';
    } else {
      const store = await prisma.partnerStore.findFirst({
        where: { id: effectiveStudioId },
      });
      if (store?.currency && store.currency !== 'GBP') {
        studioCurrency = store.currency;
        studioCurrencySymbol = store.currencySymbol || '$';
      }
    }

    return res.json({
      success: true,
      studioId: effectiveStudioId,
      hasFilledCatalog,
      currency: studioCurrency,
      currencySymbol: studioCurrencySymbol,
      items: customItems,
      baseCategories: formattedBaseCategories,
    });
  } catch (err) {
    console.error('Error fetching studio catalog:', err);
    return res.status(500).json({ error: 'Failed to fetch price catalog' });
  }
});

// POST /api/studio/catalog - Bulk save / update studio price catalog
router.post('/studio/catalog', authenticateUser, async (req, res) => {
  try {
    const { studioId, items, currency, currencySymbol } = req.body;
    const effectiveStudioId = studioId || req.user?.studioId || req.user?.id;

    if (!effectiveStudioId) {
      return res.status(400).json({ error: 'Studio ID or active authenticated session is required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Catalog items array is required.' });
    }

    const effectiveCurrency = currency || 'USD';
    const effectiveSymbol = currencySymbol || (effectiveCurrency === 'USD' ? '$' : effectiveCurrency === 'EUR' ? '€' : effectiveCurrency === 'INR' ? '₹' : effectiveCurrency === 'GBP' ? '£' : '$');

    // Validate that at least 1 valid service has a proper positive price
    const validItems = items.filter(
      (item) => item && item.name && item.categoryId && item.enabled !== false && Number(item.price) > 0
    );

    if (validItems.length === 0) {
      return res.status(400).json({
        error: 'Please configure at least one alteration service with a proper price greater than 0.',
      });
    }

    const userId = req.user?.id || null;

    // Atomically replace existing studio catalog items
    await prisma.$transaction(async (tx) => {
      await tx.studioCatalogItem.deleteMany({
        where: {
          OR: [
            { studioId: effectiveStudioId },
            ...(userId ? [{ userId }] : []),
          ],
        },
      });

      const itemsToCreate = items.map((item) => ({
        studioId: effectiveStudioId,
        userId: userId,
        categoryId: String(item.categoryId || 'general').trim(),
        categoryName: String(item.categoryName || item.categoryId || 'Alterations').trim(),
        serviceId: item.serviceId ? String(item.serviceId).trim() : null,
        name: String(item.name).trim(),
        description: item.description ? String(item.description).trim() : null,
        price: parseFloat(item.price) || 0,
        currency: effectiveCurrency,
        currencySymbol: effectiveSymbol,
        partnerPayout: item.partnerPayout ? parseFloat(item.partnerPayout) : null,
        turnaroundDays: parseInt(item.turnaroundDays) || 2,
        avgTurnaround: item.avgTurnaround ? String(item.avgTurnaround).trim() : `${parseInt(item.turnaroundDays) || 2} days`,
        enabled: item.enabled !== false,
        isCustom: Boolean(item.isCustom),
      }));

      await tx.studioCatalogItem.createMany({
        data: itemsToCreate,
      });

      await tx.partnerStore.updateMany({
        where: { id: effectiveStudioId },
        data: { currency: effectiveCurrency, currencySymbol: effectiveSymbol },
      });

      if (userId) {
        await tx.user.updateMany({
          where: { OR: [{ id: userId }, { studioId: effectiveStudioId }] },
          data: { currency: effectiveCurrency, currencySymbol: effectiveSymbol },
        });
      }

      await tx.order.updateMany({
        where: { storeId: effectiveStudioId },
        data: { currency: effectiveCurrency, currencySymbol: effectiveSymbol },
      });
    });

    const updatedItems = await prisma.studioCatalogItem.findMany({
      where: {
        OR: [
          { studioId: effectiveStudioId },
          ...(userId ? [{ userId }] : []),
        ],
      },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    });

    return res.status(200).json({
      success: true,
      message: 'Studio price catalog saved successfully!',
      count: updatedItems.length,
      hasFilledCatalog: true,
      currency: effectiveCurrency,
      currencySymbol: effectiveSymbol,
      items: updatedItems,
    });
  } catch (err) {
    console.error('Error saving studio catalog:', err);
    return res.status(500).json({ error: 'Failed to save price catalog.' });
  }
});

// POST /api/studio/catalog/item - Add or update a single item in studio catalog
router.post('/studio/catalog/item', authenticateUser, async (req, res) => {
  try {
    const { studioId, item } = req.body;
    const effectiveStudioId = studioId || req.user?.studioId || req.user?.id;

    if (!effectiveStudioId) {
      return res.status(400).json({ error: 'Studio ID or authenticated session is required.' });
    }

    if (!item || !item.name || !item.categoryId || Number(item.price) <= 0) {
      return res.status(400).json({ error: 'Valid service name, category, and price > 0 are required.' });
    }

    const userId = req.user?.id || null;

    let savedItem;
    if (item.id && !item.id.startsWith('temp_')) {
      savedItem = await prisma.studioCatalogItem.update({
        where: { id: item.id },
        data: {
          categoryId: String(item.categoryId).trim(),
          categoryName: String(item.categoryName || item.categoryId).trim(),
          name: String(item.name).trim(),
          description: item.description ? String(item.description).trim() : null,
          price: parseFloat(item.price) || 0,
          turnaroundDays: parseInt(item.turnaroundDays) || 2,
          avgTurnaround: item.avgTurnaround ? String(item.avgTurnaround).trim() : `${parseInt(item.turnaroundDays) || 2} days`,
          enabled: item.enabled !== false,
          isCustom: Boolean(item.isCustom),
        },
      });
    } else {
      savedItem = await prisma.studioCatalogItem.create({
        data: {
          studioId: effectiveStudioId,
          userId: userId,
          categoryId: String(item.categoryId).trim(),
          categoryName: String(item.categoryName || item.categoryId).trim(),
          serviceId: item.serviceId ? String(item.serviceId).trim() : null,
          name: String(item.name).trim(),
          description: item.description ? String(item.description).trim() : null,
          price: parseFloat(item.price) || 0,
          turnaroundDays: parseInt(item.turnaroundDays) || 2,
          avgTurnaround: item.avgTurnaround ? String(item.avgTurnaround).trim() : `${parseInt(item.turnaroundDays) || 2} days`,
          enabled: item.enabled !== false,
          isCustom: Boolean(item.isCustom),
        },
      });
    }

    return res.json({
      success: true,
      message: 'Catalog item updated successfully',
      item: savedItem,
    });
  } catch (err) {
    console.error('Error updating catalog item:', err);
    return res.status(500).json({ error: 'Failed to update catalog item' });
  }
});

// DELETE /api/studio/catalog/item/:id - Delete an item from studio catalog
router.delete('/studio/catalog/item/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const effectiveStudioId = req.query.studioId || req.user?.studioId || req.user?.id;

    const existing = await prisma.studioCatalogItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Catalog item not found' });
    }

    if (
      req.user &&
      req.user.role === 'STUDIO' &&
      existing.studioId !== effectiveStudioId &&
      existing.userId !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden: Cannot delete item from another studio.' });
    }

    await prisma.studioCatalogItem.delete({
      where: { id },
    });

    return res.json({ success: true, message: 'Catalog item deleted successfully' });
  } catch (err) {
    console.error('Error deleting catalog item:', err);
    return res.status(500).json({ error: 'Failed to delete catalog item' });
  }
});

module.exports = router;
