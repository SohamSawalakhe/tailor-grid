// @ts-nocheck
const express = require('express');
const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');
const { verifyPassword, hashPassword } = require('../lib/password');
const { sendWelcomeEmail, sendStudioVerificationEmail } = require('../lib/email');
const { sendNotificationToStore } = require('../services/push.service');
const { getSignedFilePath } = require('../services/verification-storage.service');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Format helper for order outputs
 */
function formatAdminOrder(order) {
  let measurementsObj = null;
  if (order.fitNotes) {
    try {
      measurementsObj = JSON.parse(order.fitNotes);
    } catch {
      // plain text fit notes
    }
  }

  return {
    id: order.id,
    userId: order.userId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    postcode: order.postcode,
    garmentId: order.garmentId,
    garmentName: order.garmentName,
    serviceId: order.serviceId,
    serviceName: order.serviceName,
    storeId: order.storeId,
    storeName: order.store?.name || order.storeName || 'Unassigned',
    storePhone: order.store?.phone || order.storePhone || '',
    storeArea: order.store?.area || '',
    date: order.date,
    timeSlot: order.timeSlot,
    garmentBrand: order.garmentBrand,
    fitNotes: order.fitNotes,
    pinnedAdjustment: order.pinnedAdjustment,
    sewingNotes: order.sewingNotes,
    slaHours: order.slaHours,
    partnerPayout: order.partnerPayout ?? order.price,
    retailSold: Boolean(order.retailSold),
    retailValue: order.retailValue || 0,
    retailCategory: order.retailCategory || null,
    assignedWorker: order.assignedWorker,
    machineNo: order.machineNo,
    hangTagNo: order.hangTagNo,
    intakePhotoUrl: order.intakePhotoUrl,
    fabricConditionNotes: order.fabricConditionNotes,
    priceAdjustment: order.priceAdjustment,
    priceAdjustmentReason: order.priceAdjustmentReason,
    priceAdjustmentStatus: order.priceAdjustmentStatus,
    status: order.status,
    price: order.price,
    otp: order.otp,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    user: order.user ? {
      id: order.user.id,
      name: order.user.name,
      email: order.user.email,
      phone: order.user.phone,
      status: order.user.status,
      role: order.user.role,
    } : null,
    store: order.store,
    measurements: measurementsObj,
  };
}

// -------------------------------------------------------------
// 0. AUTHENTICATION: SUPER ADMIN ID & PASSWORD
// -------------------------------------------------------------

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { id, email, password } = req.body;
    const identifier = (id || email || '').trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Admin ID / Email and password are required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { id: identifier },
          { contact: { equals: identifier, mode: 'insensitive' } },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid Super Admin credentials' });
    }

    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Account does not have Super Admin privileges' });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'Password not set. Please run scripts/create-super-admin.js' });
    }

    const isValid = verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid Super Admin password' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'ADMIN',
        isAdmin: true,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      message: 'Super Admin authenticated successfully',
    });
  } catch (err) {
    console.error('Super Admin login error:', err);
    return res.status(500).json({ error: 'Failed to process Super Admin login' });
  }
});

/**
 * Security Middleware: Enforce Super Admin Authentication & RBAC
 */
async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.headers.cookie) {
      const match = req.headers.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('admin_token=') || c.startsWith('token=') || c.startsWith('tg_token='));
      if (match) token = match.split('=')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Super Admin privileges required' });
    }

    // Verify admin still exists in DB and is an active ADMIN
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true, status: true },
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({ error: 'Admin account no longer exists in database or role revoked' });
    }

    req.admin = { ...decoded, ...user };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired Super Admin token' });
  }
}

// Enforce authentication on all administrative endpoints below
router.use(requireAdminAuth);

// GET /api/admin/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing admin token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin account not found or deactivated' });
    }

    return res.json({ success: true, user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired Super Admin token' });
  }
});

// -------------------------------------------------------------
// 1. GET /api/admin/overview - Real-time Platform KPIs & Metrics
// -------------------------------------------------------------
router.get('/overview', async (req, res) => {
  try {
    const [
      totalCustomers,
      totalStudios,
      totalOrders,
      orders,
      stores,
      activeUsers,
      totalInquiries,
      newInquiries,
      recentInquiries,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.partnerStore.count(),
      prisma.order.count(),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { store: true, user: true },
      }),
      prisma.partnerStore.findMany({
        include: {
          orders: {
            where: {
              status: { notIn: ['Collected', 'Closed', 'Cancelled'] },
            },
            select: { id: true, price: true, partnerPayout: true },
          },
        },
      }),
      prisma.user.count({ where: { role: 'CUSTOMER', status: 'ACTIVE' } }),
      prisma.contactInquiry.count(),
      prisma.contactInquiry.count({ where: { status: 'NEW' } }),
      prisma.contactInquiry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Financial GMV & Studio Earnings calculation
    // Orders qualify for Studio Earnings only from 'Work in Progress' onwards (cancellation locked)
    const EARNINGS_ELIGIBLE_STATUSES = ['Work in Progress', 'Ready', 'Collected', 'Closed'];

    const [earnedOrdersAggregate, pendingIntakeAggregate] = await Promise.all([
      prisma.order.aggregate({
        where: {
          status: { in: EARNINGS_ELIGIBLE_STATUSES },
        },
        _sum: {
          price: true,
          partnerPayout: true,
        },
      }),
      prisma.order.aggregate({
        where: {
          status: { in: ['Allocated', 'Accepted', 'Customer Arrived', 'Fitting Completed'] },
        },
        _sum: {
          price: true,
        },
      }),
    ]);

    const totalPayouts = earnedOrdersAggregate._sum.price || 0;
    const totalGMV = totalPayouts;
    const pendingIntakeAmount = pendingIntakeAggregate._sum.price || 0;
    const platformMargin = 0;

    // Status breakdown
    const statusCounts = {
      'Allocated': 0,
      'Accepted': 0,
      'Customer Arrived': 0,
      'Fitting Completed': 0,
      'Work in Progress': 0,
      'Ready': 0,
      'Collected': 0,
      'Closed': 0,
      'Cancelled': 0,
    };

    const statusAgg = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    statusAgg.forEach((item) => {
      if (item.status && statusCounts[item.status] !== undefined) {
        statusCounts[item.status] = item._count.id;
      } else if (item.status) {
        statusCounts[item.status] = item._count.id;
      }
    });

    const activeOrdersCount = Object.entries(statusCounts).reduce((acc, [st, count]) => {
      if (!['Collected', 'Closed', 'Cancelled'].includes(st)) {
        return acc + count;
      }
      return acc;
    }, 0);

    // Fleet capacity calculations
    let totalCapacity = 0;
    let totalActiveLoad = 0;
    stores.forEach((s) => {
      totalCapacity += s.dailyCapacity || 25;
      totalActiveLoad += s.orders.length;
    });

    const fleetUtilization = totalCapacity > 0
      ? Math.min(100, Math.round((totalActiveLoad / totalCapacity) * 100))
      : 0;

    return res.json({
      success: true,
      kpis: {
        totalCustomers,
        activeCustomers: activeUsers,
        totalStudios,
        totalOrders,
        activeOrders: activeOrdersCount,
        totalGMV: Math.round(totalGMV * 100) / 100,
        totalEarnings: Math.round(totalPayouts * 100) / 100,
        totalPayouts: Math.round(totalPayouts * 100) / 100,
        pendingIntakeAmount: Math.round(pendingIntakeAmount * 100) / 100,
        platformMargin: 0,
        totalCapacity,
        totalActiveLoad,
        fleetUtilization,
        totalInquiries,
        newInquiries,
      },
      statusCounts,
      recentOrders: orders.slice(0, 10).map(formatAdminOrder),
      recentInquiries: recentInquiries || [],
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin overview metrics' });
  }
});

// -------------------------------------------------------------
// 2. CUSTOMERS MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/customers - List customers with search & order counts
router.get('/customers', async (req, res) => {
  try {
    const { search, status } = req.query;

    // In Customer Master, strictly show ONLY actual CUSTOMERS (never Admin or Studio accounts)
    const where = {
      role: 'CUSTOMER',
    };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { contact: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { postcode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        orders: {
          select: {
            id: true,
            price: true,
            status: true,
            serviceName: true,
            garmentName: true,
            retailSold: true,
            retailValue: true,
            retailCategory: true,
            storeName: true,
            customerPhone: true,
            customerEmail: true,
            postcode: true,
            date: true,
            createdAt: true,
          },
        },
      },
    });

    const formatted = customers.map((c) => {
      const totalSpend = c.orders
        .filter((o) => o.status !== 'Cancelled')
        .reduce((sum, o) => sum + (o.price || 0), 0);
      const activeOrders = c.orders.filter(
        (o) => !['Collected', 'Closed', 'Cancelled'].includes(o.status)
      ).length;

      let measurements = null;
      if (c.measurements) {
        try {
          measurements = JSON.parse(c.measurements);
        } catch {
          measurements = c.measurements;
        }
      }

      const resolvedPhone = c.phone || (c.contact && !c.contact.includes('@') ? c.contact : null) || c.orders.find((o) => o.customerPhone)?.customerPhone || null;
      const resolvedEmail = c.email || (c.contact && c.contact.includes('@') ? c.contact : null) || c.orders.find((o) => o.customerEmail)?.customerEmail || null;
      const resolvedPostcode = c.postcode || c.orders.find((o) => o.postcode)?.postcode || null;

      return {
        id: c.id,
        name: c.name,
        email: resolvedEmail,
        phone: resolvedPhone,
        contact: c.contact,
        avatar: c.avatar,
        address: c.address,
        postcode: resolvedPostcode,
        method: c.method,
        role: c.role,
        status: c.status,
        studioName: c.studioName,
        measurements,
        orders: c.orders,
        ordersCount: c.orders.length,
        activeOrdersCount: activeOrders,
        totalSpend: Math.round(totalSpend * 100) / 100,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      customers: formatted,
    });
  } catch (err) {
    console.error('Admin fetch customers error:', err);
    return res.status(500).json({ error: 'Failed to fetch customer list' });
  }
});

// GET /api/admin/customers/:id - Single customer with full order history
router.get('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await prisma.user.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { store: true },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json({
      success: true,
      customer: {
        ...customer,
        orders: customer.orders.map(formatAdminOrder),
      },
    });
  } catch (err) {
    console.error('Admin get customer error:', err);
    return res.status(500).json({ error: 'Failed to retrieve customer' });
  }
});

// POST /api/admin/customers - Create customer manually
router.post('/customers', async (req, res) => {
  try {
    const { name, email, phone, address, postcode, role, status, measurements } = req.body;
    if (!name || (!email && !phone)) {
      return res.status(400).json({ error: 'Name and at least one contact (email or phone) are required.' });
    }

    const uniqueId = `usr_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    const newUser = await prisma.user.create({
      data: {
        id: uniqueId,
        name: name.trim(),
        email: email ? email.trim().toLowerCase() : null,
        phone: phone ? phone.trim() : null,
        contact: email ? email.trim().toLowerCase() : phone ? phone.trim() : '',
        address: address ? address.trim() : null,
        postcode: postcode ? postcode.trim().toUpperCase() : null,
        role: role || 'CUSTOMER',
        status: status || 'ACTIVE',
        measurements: measurements ? (typeof measurements === 'string' ? measurements : JSON.stringify(measurements)) : null,
      },
    });

    return res.status(201).json({ success: true, customer: newUser });
  } catch (err) {
    console.error('Admin create customer error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email or phone number already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/admin/customers/:id - Update customer profile / status / measurements
router.put('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, status, role, address, postcode, measurements } = req.body;

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (email !== undefined) data.email = email ? email.trim().toLowerCase() : null;
    if (phone !== undefined) data.phone = phone ? phone.trim() : null;
    if (status !== undefined) data.status = status;
    if (role !== undefined) data.role = role;
    if (address !== undefined) data.address = address;
    if (postcode !== undefined) data.postcode = postcode ? postcode.trim().toUpperCase() : null;
    if (measurements !== undefined) {
      data.measurements = typeof measurements === 'string' ? measurements : JSON.stringify(measurements);
    }

    // Sync contact field
    if (data.email) data.contact = data.email;
    else if (data.phone) data.contact = data.phone;

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    return res.json({ success: true, customer: updated });
  } catch (err) {
    console.error('Admin update customer error:', err);
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Email or phone already taken by another account.' });
    }
    return res.status(500).json({ error: 'Failed to update customer' });
  }
});

// -------------------------------------------------------------
// 3. STUDIOS / PARTNER STORES MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/studios - List studios with live load & capacity metrics
router.get('/studios', async (req, res) => {
  try {
    const { search, area } = req.query;

    const where = {};
    if (area && area !== 'ALL') {
      where.area = area;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { area: { contains: q, mode: 'insensitive' } },
        { postcode: { contains: q, mode: 'insensitive' } },
        { leadTailor: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [stores, studioUsers] = await Promise.all([
      prisma.partnerStore.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          orders: {
            select: {
              id: true,
              status: true,
              price: true,
              partnerPayout: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.user.findMany({
        where: { role: 'STUDIO' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          contact: true,
          studioId: true,
          studioName: true,
        },
      }),
    ]);

    const formatted = stores.map((s) => {
      // Find matching user for studio to resolve actual phone and email if missing or defaulted
      const matchedUser = studioUsers.find(
        (u) => (u.studioId && u.studioId === s.id) ||
          (u.studioName && u.studioName.toLowerCase() === s.name.toLowerCase()) ||
          (u.name && s.leadTailor && u.name.toLowerCase() === s.leadTailor.toLowerCase())
      );

      let actualPhone = s.phone;
      if (!actualPhone || actualPhone.includes('7946 0912')) {
        actualPhone = matchedUser?.phone || matchedUser?.contact || (s.phone && !s.phone.includes('7946 0912') ? s.phone : null);
      }
      const actualEmail = s.email || matchedUser?.email || (matchedUser?.contact && matchedUser.contact.includes('@') ? matchedUser.contact : null) || null;

      // If store in DB has the dummy number or missing email, heal it in the background
      if ((s.phone && s.phone.includes('7946 0912') && actualPhone && !actualPhone.includes('7946 0912')) || (!s.email && actualEmail)) {
        prisma.partnerStore.update({
          where: { id: s.id },
          data: {
            phone: actualPhone,
            email: actualEmail,
          },
        }).catch(() => { });
      }

      const activeOrders = s.orders.filter(
        (o) => !['Collected', 'Closed', 'Cancelled'].includes(o.status)
      );
      const completedOrders = s.orders.filter((o) =>
        ['Collected', 'Closed'].includes(o.status)
      );
      const totalPayoutEarned = s.orders
        .filter((o) => ['Work in Progress', 'Ready', 'Collected', 'Closed'].includes(o.status))
        .reduce((sum, o) => sum + (o.partnerPayout || o.price || 0), 0);
      const capacity = s.dailyCapacity || 25;
      const utilization = Math.min(100, Math.round((activeOrders.length / capacity) * 100));

      return {
        id: s.id,
        name: s.name,
        area: s.area,
        address: s.address,
        postcode: s.postcode,
        phone: actualPhone,
        email: actualEmail,
        leadTailor: s.leadTailor,
        dailyCapacity: capacity,
        machines: s.machines,
        workers: s.workers,
        rating: s.rating,
        reviewCount: s.reviewCount,
        openingHours: s.openingHours,
        specialties: s.specialties,
        retailSold: s.retailSold,
        lat: s.lat,
        lng: s.lng,
        activeOrdersCount: activeOrders.length,
        completedOrdersCount: completedOrders.length,
        totalOrdersCount: s.orders.length,
        totalPayoutEarned: Math.round(totalPayoutEarned * 100) / 100,
        utilization,
        verificationStatus: s.verificationStatus,
        verifiedAt: s.verifiedAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

    return res.json({
      success: true,
      count: formatted.length,
      studios: formatted,
    });
  } catch (err) {
    console.error('Admin fetch studios error:', err);
    return res.status(500).json({ error: 'Failed to fetch partner studios' });
  }
});

// POST /api/admin/studios - Onboard / create new studio
router.post('/studios', async (req, res) => {
  try {
    const {
      name,
      area,
      address,
      postcode,
      phone,
      email,
      leadTailor,
      dailyCapacity,
      machines,
      workers,
      specialties,
      openingHours,
      lat,
      lng,
      rating,
    } = req.body;

    if (!name || !address || !postcode) {
      return res.status(400).json({ error: 'Studio Name, Address, and Postcode are required.' });
    }

    const uniqueId = `store_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;

    const newStore = await prisma.partnerStore.create({
      data: {
        id: uniqueId,
        name: name.trim(),
        email: email ? email.trim().toLowerCase() : null,
        phone: phone ? phone.trim() : null,
        area: area ? area.trim() : (postcode.split(' ')[0] || 'Central'),
        address: address.trim(),
        postcode: postcode.trim().toUpperCase(),
        leadTailor: leadTailor ? leadTailor.trim() : 'Master Tailor',
        dailyCapacity: !isNaN(parseInt(dailyCapacity, 10)) ? parseInt(dailyCapacity, 10) : 25,
        machines: !isNaN(parseInt(machines, 10)) ? parseInt(machines, 10) : 6,
        workers: !isNaN(parseInt(workers, 10)) ? parseInt(workers, 10) : 4,
        specialties: Array.isArray(specialties)
          ? specialties
          : specialties ? specialties.split(',').map((s) => s.trim()) : ['Suits', 'Dresses', 'Trousers'],
        openingHours: openingHours || '09:00 - 19:00',
        rating: !isNaN(parseFloat(rating)) ? parseFloat(rating) : 4.9,
        lat: !isNaN(parseFloat(lat)) ? parseFloat(lat) : 51.5074,
        lng: !isNaN(parseFloat(lng)) ? parseFloat(lng) : -0.1278,
      },
    });

    if (newStore.email && newStore.email.includes('@') && !newStore.email.includes('example.com')) {
      sendWelcomeEmail({
        toEmail: newStore.email,
        name: newStore.leadTailor || newStore.name,
        role: 'STUDIO',
        studioName: newStore.name,
        phone: newStore.phone || '',
      }).catch((wErr) => {
        console.warn('[WELCOME EMAIL] Admin dispatch notice:', wErr.message);
      });
    }

    return res.status(201).json({ success: true, studio: newStore });
  } catch (err) {
    console.error('Admin create studio error:', err);
    return res.status(500).json({ error: 'Failed to create studio partner' });
  }
});

// PUT /api/admin/studios/:id - Update studio details & capacity
router.put('/studios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      area,
      address,
      postcode,
      phone,
      email,
      leadTailor,
      dailyCapacity,
      machines,
      workers,
      specialties,
      openingHours,
      rating,
      lat,
      lng,
    } = req.body;

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (email !== undefined) data.email = email ? email.trim().toLowerCase() : null;
    if (area !== undefined) data.area = area.trim();
    if (address !== undefined) data.address = address.trim();
    if (postcode !== undefined) data.postcode = postcode.trim().toUpperCase();
    if (phone !== undefined) data.phone = phone ? phone.trim() : null;
    if (leadTailor !== undefined) data.leadTailor = leadTailor.trim();
    if (dailyCapacity !== undefined) data.dailyCapacity = parseInt(dailyCapacity, 10);
    if (machines !== undefined) data.machines = parseInt(machines, 10);
    if (workers !== undefined) data.workers = parseInt(workers, 10);
    if (openingHours !== undefined) data.openingHours = openingHours.trim();
    if (rating !== undefined) data.rating = parseFloat(rating);
    if (lat !== undefined) data.lat = parseFloat(lat);
    if (lng !== undefined) data.lng = parseFloat(lng);
    if (specialties !== undefined) {
      data.specialties = Array.isArray(specialties)
        ? specialties
        : specialties.split(',').map((s) => s.trim());
    }

    const updated = await prisma.partnerStore.update({
      where: { id },
      data,
    });

    // Also sync updated phone / email to linked studio user
    try {
      const studioUser = await prisma.user.findFirst({
        where: {
          role: 'STUDIO',
          OR: [{ studioId: id }, { studioName: updated.name }],
        },
      });
      if (studioUser) {
        const userUpdate = {};
        if (data.phone) userUpdate.phone = data.phone;
        if (data.email) userUpdate.email = data.email;
        if (data.leadTailor) userUpdate.name = data.leadTailor;
        if (data.name) userUpdate.studioName = data.name;
        if (data.status) userUpdate.status = data.status;
        if (Object.keys(userUpdate).length > 0) {
          await prisma.user.update({ where: { id: studioUser.id }, data: userUpdate });
        }
      }
    } catch (e) {
      console.warn('Sync studio user error on store update:', e.message);
    }

    return res.json({ success: true, studio: updated });
  } catch (err) {
    console.error('Admin update studio error:', err);
    return res.status(500).json({ error: 'Failed to update studio partner' });
  }
});

// -------------------------------------------------------------
// 4. ORDERS & DISPATCH MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/orders - Full orders list with cross filters
router.get('/orders', async (req, res) => {
  try {
    const { search, status, storeId, limit = 100 } = req.query;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (storeId && storeId !== 'ALL') {
      where.storeId = storeId;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { customerPhone: { contains: q, mode: 'insensitive' } },
        { hangTagNo: { contains: q, mode: 'insensitive' } },
        { serviceName: { contains: q, mode: 'insensitive' } },
        { garmentName: { contains: q, mode: 'insensitive' } },
        { storeName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
      include: {
        store: true,
        user: true,
      },
    });

    return res.json({
      success: true,
      count: orders.length,
      orders: orders.map(formatAdminOrder),
    });
  } catch (err) {
    console.error('Admin fetch orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch admin orders' });
  }
});

// PUT /api/admin/orders/:id - Master admin modification & studio reassignment
router.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      storeId,
      hangTagNo,
      price,
      partnerPayout,
      fitNotes,
      sewingNotes,
      assignedWorker,
      machineNo,
    } = req.body;

    const data = {};
    if (status !== undefined) data.status = status;
    if (hangTagNo !== undefined) data.hangTagNo = hangTagNo;
    if (price !== undefined) data.price = parseFloat(price);
    if (partnerPayout !== undefined) data.partnerPayout = parseFloat(partnerPayout);
    if (fitNotes !== undefined) data.fitNotes = fitNotes;
    if (sewingNotes !== undefined) data.sewingNotes = sewingNotes;
    if (assignedWorker !== undefined) data.assignedWorker = assignedWorker;
    if (machineNo !== undefined) data.machineNo = machineNo;
    if (req.body.retailSold !== undefined) data.retailSold = Boolean(req.body.retailSold);
    if (req.body.retailValue !== undefined) data.retailValue = req.body.retailValue ? parseFloat(req.body.retailValue) : null;
    if (req.body.retailCategory !== undefined) data.retailCategory = req.body.retailCategory;

    // Handle Studio Reassignment
    if (storeId !== undefined) {
      data.storeId = storeId;
      if (storeId) {
        const targetStore = await prisma.partnerStore.findUnique({
          where: { id: storeId },
        });
        if (targetStore) {
          data.storeName = targetStore.name;
          data.storePhone = targetStore.phone;
        }
      } else {
        data.storeName = null;
        data.storePhone = null;
      }
    }

    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data,
      include: {
        store: true,
        user: true,
      },
    });

    return res.json({
      success: true,
      order: formatAdminOrder(updated),
      message: 'Order updated successfully by Master Admin.',
    });
  } catch (err) {
    console.error('Admin update order error:', err);
    return res.status(500).json({ error: 'Failed to update order' });
  }
});

// -------------------------------------------------------------
// 5. GLOBAL OMNICHANNEL SEARCH
// -------------------------------------------------------------
// GET /api/admin/search?q=
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({
        success: true,
        customers: [],
        studios: [],
        orders: [],
      });
    }

    const query = q.trim();

    const [customers, studios, orders, inquiries] = await Promise.all([
      // Customers search
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { postcode: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          postcode: true,
        },
      }),

      // Studios search
      prisma.partnerStore.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { area: { contains: query, mode: 'insensitive' } },
            { postcode: { contains: query, mode: 'insensitive' } },
            { leadTailor: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),

      // Orders search
      prisma.order.findMany({
        where: {
          OR: [
            { id: { contains: query, mode: 'insensitive' } },
            { customerName: { contains: query, mode: 'insensitive' } },
            { customerPhone: { contains: query, mode: 'insensitive' } },
            { customerEmail: { contains: query, mode: 'insensitive' } },
            { hangTagNo: { contains: query, mode: 'insensitive' } },
            { storeName: { contains: query, mode: 'insensitive' } },
            { serviceName: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 15,
        include: {
          store: true,
          user: true,
        },
      }),

      // Contact Inquiries search
      prisma.contactInquiry.findMany({
        where: {
          OR: [
            { id: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { topic: { contains: query, mode: 'insensitive' } },
            { orderNumber: { contains: query, mode: 'insensitive' } },
            { message: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      query,
      results: {
        customers,
        studios,
        orders: orders.map(formatAdminOrder),
        inquiries: inquiries || [],
      },
    });
  } catch (err) {
    console.error('Admin search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// -------------------------------------------------------------
// 7. CONTACT & CONCIERGE INQUIRIES MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/inquiries - List inquiries with filtering & search
router.get('/inquiries', async (req, res) => {
  try {
    const { search, status, source, priority, limit = 100, page = 1 } = req.query;

    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (source && source !== 'ALL') {
      where.source = source;
    }

    if (priority && priority !== 'ALL') {
      where.priority = priority;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { topic: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
        { id: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(limit, 10) || 100, 200);
    const skip = ((parseInt(page, 10) || 1) - 1) * take;

    const [inquiries, totalCount, statusAgg] = await Promise.all([
      prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.contactInquiry.count({ where }),
      prisma.contactInquiry.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const statusCounts = {
      ALL: 0,
      NEW: 0,
      IN_REVIEW: 0,
      RESOLVED: 0,
      ARCHIVED: 0,
    };

    statusAgg.forEach((item) => {
      if (item.status && statusCounts[item.status] !== undefined) {
        statusCounts[item.status] = item._count.id;
      }
      statusCounts.ALL += item._count.id;
    });

    return res.json({
      success: true,
      count: inquiries.length,
      total: totalCount,
      statusCounts,
      inquiries,
    });
  } catch (err) {
    console.error('Admin fetch inquiries error:', err);
    return res.status(500).json({ error: 'Failed to fetch contact inquiries' });
  }
});

// GET /api/admin/inquiries/:id - Single inquiry details with linked user & order
router.get('/inquiries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const inquiry = await prisma.contactInquiry.findUnique({
      where: { id },
    });

    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    // Attempt to resolve associated user or order
    let linkedUser = null;
    let linkedOrder = null;

    if (inquiry.email || inquiry.phone) {
      linkedUser = await prisma.user.findFirst({
        where: {
          OR: [
            inquiry.email ? { email: { equals: inquiry.email, mode: 'insensitive' } } : undefined,
            inquiry.phone ? { phone: inquiry.phone } : undefined,
          ].filter(Boolean),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
        },
      });
    }

    if (inquiry.orderNumber) {
      linkedOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { id: inquiry.orderNumber },
            { hangTagNo: inquiry.orderNumber },
          ],
        },
        include: { store: true },
      });
    }

    return res.json({
      success: true,
      inquiry: {
        ...inquiry,
        linkedUser,
        linkedOrder: linkedOrder ? formatAdminOrder(linkedOrder) : null,
      },
    });
  } catch (err) {
    console.error('Admin get inquiry error:', err);
    return res.status(500).json({ error: 'Failed to retrieve inquiry' });
  }
});

// PUT /api/admin/inquiries/:id - Update status, priority, or internal notes
router.put('/inquiries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, adminNotes } = req.body;

    const data = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (adminNotes !== undefined) data.adminNotes = adminNotes;

    const updated = await prisma.contactInquiry.update({
      where: { id },
      data,
    });

    return res.json({ success: true, inquiry: updated });
  } catch (err) {
    console.error('Admin update inquiry error:', err);
    return res.status(500).json({ error: 'Failed to update inquiry' });
  }
});

// DELETE /api/admin/inquiries/:id - Delete an inquiry
router.delete('/inquiries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contactInquiry.delete({
      where: { id },
    });
    return res.json({ success: true, message: 'Inquiry deleted successfully' });
  } catch (err) {
    console.error('Admin delete inquiry error:', err);
    return res.status(500).json({ error: 'Failed to delete inquiry' });
  }
});

// ==========================================
// STUDIO VERIFICATIONS
// ==========================================

const VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const VERIFICATION_STORE_SELECT = {
  id: true,
  name: true,
  area: true,
  address: true,
  postcode: true,
  phone: true,
  email: true,
  leadTailor: true,
  machines: true,
  workers: true,
  verificationStatus: true,
};

function formatVerification(v, { withFiles = false } = {}) {
  return {
    id: v.id,
    storeId: v.storeId,
    status: v.status,
    rejectionReason: v.rejectionReason,
    reviewedById: v.reviewedById,
    reviewedAt: v.reviewedAt,
    createdAt: v.createdAt,
    studio: v.store || null,
    ...(withFiles
      ? {
          files: {
            shopFrontImage: getSignedFilePath(v.id, 'shopFrontImage'),
            interiorImage: getSignedFilePath(v.id, 'interiorImage'),
            machinesVideo: getSignedFilePath(v.id, 'machinesVideo'),
          },
        }
      : {}),
  };
}

/**
 * Email + push the studio about the review outcome. Never throws: a failed notification
 * must not undo an approval or rejection.
 */
async function notifyStudioOfVerification(store, approved, reason) {
  try {
    const owner = await prisma.user.findFirst({
      where: { studioId: store.id, role: 'STUDIO' },
      select: { email: true },
    });
    const toEmail = owner?.email || store.email;
    if (toEmail) {
      await sendStudioVerificationEmail({ toEmail, studioName: store.name, approved, reason });
    }
    await sendNotificationToStore(store.id, {
      title: approved ? '✅ Studio verified' : '⚠️ Verification not approved',
      body: approved
        ? 'You will now receive nearby tailoring requests.'
        : `Reason: ${reason}. Please upload new files.`,
      url: approved ? '/dashboard' : '/verification',
      tag: 'studio-verification',
      data: { type: 'STUDIO_VERIFICATION', status: approved ? 'APPROVED' : 'REJECTED' },
    });
  } catch (err) {
    console.warn('Studio verification notification failed:', err.message);
  }
}

// GET /api/admin/verifications/count - Pending count for the sidebar badge
router.get('/verifications/count', async (req, res) => {
  try {
    const pending = await prisma.studioVerification.count({ where: { status: 'PENDING' } });
    return res.json({ success: true, pending });
  } catch (err) {
    console.error('Admin verification count error:', err);
    return res.status(500).json({ error: 'Failed to count verifications' });
  }
});

// GET /api/admin/verifications?status=PENDING&search=
router.get('/verifications', async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status && VERIFICATION_STATUSES.includes(status)) {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.store = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { area: { contains: q, mode: 'insensitive' } },
          { postcode: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [verifications, grouped] = await Promise.all([
      prisma.studioVerification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { store: { select: VERIFICATION_STORE_SELECT } },
      }),
      prisma.studioVerification.groupBy({ by: ['status'], _count: { id: true } }),
    ]);

    const statusCounts = { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    grouped.forEach((g) => {
      statusCounts[g.status] = g._count.id;
      statusCounts.ALL += g._count.id;
    });

    return res.json({
      success: true,
      verifications: verifications.map((v) => formatVerification(v)),
      statusCounts,
    });
  } catch (err) {
    console.error('Admin fetch verifications error:', err);
    return res.status(500).json({ error: 'Failed to fetch studio verifications' });
  }
});

// GET /api/admin/verifications/:id - Submission details with signed file links
router.get('/verifications/:id', async (req, res) => {
  try {
    const verification = await prisma.studioVerification.findUnique({
      where: { id: req.params.id },
      include: { store: { select: VERIFICATION_STORE_SELECT } },
    });
    if (!verification) {
      return res.status(404).json({ error: 'Verification not found' });
    }
    return res.json({ success: true, verification: formatVerification(verification, { withFiles: true }) });
  } catch (err) {
    console.error('Admin fetch verification error:', err);
    return res.status(500).json({ error: 'Failed to fetch verification' });
  }
});

// POST /api/admin/verifications/:id/approve | /reject  { reason }
async function reviewVerification(req, res, approved) {
  try {
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!approved && !reason) {
      return res.status(400).json({ error: 'A rejection reason is required so the studio knows what to fix.' });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Only a still-pending submission can be reviewed, so two admins can't both act on it
      const updated = await tx.studioVerification.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          rejectionReason: approved ? null : reason,
          reviewedById: req.admin.id,
          reviewedAt: now,
        },
      });
      if (updated.count === 0) return null;

      const verification = await tx.studioVerification.findUnique({ where: { id } });
      const store = await tx.partnerStore.update({
        where: { id: verification.storeId },
        // Approval puts the store live; a rejected store stays switched off
        data: approved
          ? { verificationStatus: 'APPROVED', verifiedAt: now, status: 'ACTIVE' }
          : { verificationStatus: 'REJECTED', verifiedAt: null, status: 'INACTIVE' },
        select: VERIFICATION_STORE_SELECT,
      });
      if (approved) {
        await tx.user.updateMany({
          where: { studioId: store.id, role: 'STUDIO' },
          data: { status: 'ACTIVE' },
        });
      }
      return { ...verification, store };
    });

    if (!result) {
      const existing = await prisma.studioVerification.findUnique({ where: { id }, select: { status: true } });
      if (!existing) return res.status(404).json({ error: 'Verification not found' });
      return res.status(409).json({ error: `This verification was already ${existing.status.toLowerCase()}.` });
    }

    notifyStudioOfVerification(result.store, approved, reason);

    return res.json({ success: true, verification: formatVerification(result) });
  } catch (err) {
    console.error('Admin review verification error:', err);
    return res.status(500).json({ error: 'Failed to update verification' });
  }
}

router.post('/verifications/:id/approve', (req, res) => reviewVerification(req, res, true));
router.post('/verifications/:id/reject', (req, res) => reviewVerification(req, res, false));

module.exports = router;
