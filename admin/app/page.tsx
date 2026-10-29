'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import {
  fetchAdminOverview,
  fetchAdminCustomers,
  createAdminCustomer,
  updateAdminCustomer,
  fetchAdminStudios,
  createAdminStudio,
  updateAdminStudio,
  fetchAdminOrders,
  updateAdminOrder,
  fetchAdminInquiries,
  updateAdminInquiry,
  deleteAdminInquiry,
  fetchPendingVerificationCount,
  searchAdminGlobal,
  loginSuperAdmin,
  checkSuperAdminSession,
  getAdminToken,
  getAdminUser,
  logoutSuperAdmin,
} from '@/lib/api'
import { RaffuLogo } from '@/components/raffu-logo'
import { OverviewTab } from '@/components/overview-tab'
import { CustomersTab } from '@/components/customers-tab'
import { StudiosTab } from '@/components/studios-tab'
import { OrdersTab } from '@/components/orders-tab'
import { InquiriesTab } from '@/components/inquiries-tab'
import { VerificationsTab } from '@/components/verifications-tab'

export type AdminTab = 'overview' | 'customers' | 'studios' | 'orders' | 'inquiries' | 'verifications'

interface SuperAdminPageProps {
  initialTab?: AdminTab
}

export default function SuperAdminPage({ initialTab = 'overview' }: SuperAdminPageProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  // Authentication states - initialize authChecking consistently to prevent SSR hydration mismatch
  const [adminUser, setAdminUser] = useState<any | null>(null)
  const [authChecking, setAuthChecking] = useState<boolean>(true)

  // Login form states — NOT PREFETCHED: initialized clean & empty
  const [loginId, setLoginId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Data states
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab)

  const handleTabSwitch = (tab: AdminTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    const targetPath = tab === 'overview' ? '/' : `/${tab}`
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath)
    }
  }

  // Sync activeTab when navigating via browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname
      if (p === '/customers') setActiveTab('customers')
      else if (p === '/studios') setActiveTab('studios')
      else if (p === '/orders') setActiveTab('orders')
      else if (p === '/inquiries') setActiveTab('inquiries')
      else if (p === '/verifications') setActiveTab('verifications')
      else if (p === '/') setActiveTab('overview')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (pathname === '/customers') setActiveTab('customers')
    else if (pathname === '/studios') setActiveTab('studios')
    else if (pathname === '/orders') setActiveTab('orders')
    else if (pathname === '/inquiries') setActiveTab('inquiries')
    else if (pathname === '/verifications') setActiveTab('verifications')
    else if (pathname === '/') setActiveTab('overview')
  }, [pathname])

  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Shared in-memory cache to prevent layout fluctuation when switching routes
  const [overview, setOverview] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('admin_cache_overview')
        return cached ? JSON.parse(cached) : null
      } catch { return null }
    }
    return null
  })
  const [customers, setCustomers] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('admin_cache_customers')
        return cached ? JSON.parse(cached) : []
      } catch { return [] }
    }
    return []
  })
  const [studios, setStudios] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('admin_cache_studios')
        return cached ? JSON.parse(cached) : []
      } catch { return [] }
    }
    return []
  })
  const [orders, setOrders] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('admin_cache_orders')
        return cached ? JSON.parse(cached) : []
      } catch { return [] }
    }
    return []
  })
  const [inquiries, setInquiries] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('admin_cache_inquiries')
        return cached ? JSON.parse(cached) : []
      } catch { return [] }
    }
    return []
  })
  const [inquiryStatusCounts, setInquiryStatusCounts] = useState<{
    ALL: number
    NEW: number
    IN_REVIEW: number
    RESOLVED: number
    ARCHIVED: number
  }>({
    ALL: 0,
    NEW: 0,
    IN_REVIEW: 0,
    RESOLVED: 0,
    ARCHIVED: 0,
  })

  // Search & Filter states
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<any>(null)
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false)

  // Customers filter
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatusFilter, setCustomerStatusFilter] = useState('ALL')

  // Studios filter
  const [studioSearch, setStudioSearch] = useState('')
  const [studioAreaFilter, setStudioAreaFilter] = useState('ALL')

  // Orders filter
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL')
  const [orderStoreFilter, setOrderStoreFilter] = useState('ALL')
  const [orderRetailFilter, setOrderRetailFilter] = useState('ALL')

  // Inquiries filter
  const [inquirySearch, setInquirySearch] = useState('')
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('ALL')
  const [inquirySourceFilter, setInquirySourceFilter] = useState('ALL')

  // Modals & Edit States
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [viewingCustomerOrders, setViewingCustomerOrders] = useState<any | null>(null)

  const [editingStudio, setEditingStudio] = useState<any | null>(null)
  const [showAddStudioModal, setShowAddStudioModal] = useState(false)

  const [editingOrder, setEditingOrder] = useState<any | null>(null)

  const [pendingVerificationCount, setPendingVerificationCount] = useState(0)

  // Load all foundational data
  const loadAllData = async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [overviewData, customersData, studiosData, ordersData, inquiriesData, pendingVerifications] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminCustomers('', 'ALL', 'CUSTOMER'),
        fetchAdminStudios(),
        fetchAdminOrders(),
        fetchAdminInquiries(),
        fetchPendingVerificationCount(),
      ])
      setPendingVerificationCount(pendingVerifications)

      if (overviewData) {
        setOverview(overviewData)
        try { sessionStorage.setItem('admin_cache_overview', JSON.stringify(overviewData)) } catch {}
      }
      if (customersData) {
        setCustomers(customersData)
        try { sessionStorage.setItem('admin_cache_customers', JSON.stringify(customersData)) } catch {}
      }
      if (studiosData) {
        setStudios(studiosData)
        try { sessionStorage.setItem('admin_cache_studios', JSON.stringify(studiosData)) } catch {}
      }
      if (ordersData) {
        setOrders(ordersData)
        try { sessionStorage.setItem('admin_cache_orders', JSON.stringify(ordersData)) } catch {}
      }
      if (inquiriesData) {
        setInquiries(inquiriesData.inquiries || [])
        if (inquiriesData.statusCounts) {
          setInquiryStatusCounts(inquiriesData.statusCounts)
        }
        try { sessionStorage.setItem('admin_cache_inquiries', JSON.stringify(inquiriesData.inquiries || [])) } catch {}
      }
    } catch (err) {
      console.error('Failed to load admin data:', err)
      toast.error('Failed to connect to backend service.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Check persistent session on mount
  useEffect(() => {
    setMounted(true)
    let isMounted = true
    const token = getAdminToken()
    if (!token) {
      setAuthChecking(false)
      if (pathname !== '/') {
        router.replace('/')
      }
      return
    }

    // Listen for unauthorized events to automatically reset admin session
    const onUnauthorized = () => {
      if (isMounted) {
        setAdminUser(null)
        setAuthChecking(false)
        if (pathname !== '/') router.replace('/')
      }
    }
    window.addEventListener('admin:unauthorized', onUnauthorized)

    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setAuthChecking(false)
        if (!getAdminToken() && pathname !== '/') router.replace('/')
      }
    }, 2500)

    async function initSession() {
      try {
        const user = await checkSuperAdminSession()
        if (isMounted && user && user.role === 'ADMIN') {
          setAdminUser(user)
          // Always load foundational data silently in background
          loadAllData(true)
        } else if (isMounted) {
          setAdminUser(null)
          if (pathname !== '/') router.replace('/')
        }
      } catch (err) {
        console.warn('Session check notice:', err)
        if (isMounted) {
          setAdminUser(null)
          if (pathname !== '/') router.replace('/')
        }
      } finally {
        if (isMounted) {
          setAuthChecking(false)
          clearTimeout(safetyTimer)
        }
      }
    }

    initSession()
    return () => {
      isMounted = false
      window.removeEventListener('admin:unauthorized', onUnauthorized)
      clearTimeout(safetyTimer)
    }
  }, [])

  // Auto-refresh interval (silent 30s background poll when enabled and authenticated)
  useEffect(() => {
    if (!autoRefresh || !adminUser) return
    const interval = setInterval(() => {
      loadAllData(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, adminUser])

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Read directly from DOM elements first (supports browser autofill & password managers on first click)
    const form = e.currentTarget
    const formData = new FormData(form)
    const emailVal = (
      (formData.get('email') as string) ||
      (form.elements.namedItem('email') as HTMLInputElement)?.value ||
      loginId ||
      ''
    ).trim()
    const passwordVal = (
      (formData.get('password') as string) ||
      (form.elements.namedItem('password') as HTMLInputElement)?.value ||
      loginPassword ||
      ''
    ).trim()

    if (!emailVal || !passwordVal) {
      setLoginError('Please enter both Admin ID and Password.')
      return
    }

    setLoginLoading(true)
    setLoginError(null)

    try {
      const res = await loginSuperAdmin(emailVal, passwordVal)
      if (res.success && res.user) {
        toast.success('Super Admin session authenticated successfully')
        setAdminUser(res.user)
        setLoginId(emailVal)
        setLoginPassword('')
        // Silent background load of data so UI switches immediately
        loadAllData(true)
      } else {
        setLoginError(res.error || 'Invalid Super Admin credentials')
        toast.error(res.error || 'Authentication failed')
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login attempt failed')
      toast.error(err.message || 'Login attempt failed')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    logoutSuperAdmin()
    setAdminUser(null)
    setLoginId('')
    setLoginPassword('')
    setActiveTab('overview')
    if (pathname !== '/') {
      router.replace('/')
    }
    toast.info('Super Admin session ended')
  }

  // Omnichannel Global Search Debounce
  useEffect(() => {
    if (!globalSearchQuery.trim()) {
      setGlobalSearchResults(null)
      setIsSearchingGlobal(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true)
      const res = await searchAdminGlobal(globalSearchQuery)
      setGlobalSearchResults(res)
      setIsSearchingGlobal(false)
    }, 250)

    return () => clearTimeout(timer)
  }, [globalSearchQuery])

  // Filtered Lists
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Customer Master strictly only shows actual CUSTOMERS (never Admin or Studio accounts)
      if ((c.role || 'CUSTOMER') !== 'CUSTOMER') return false
      const matchStatus = customerStatusFilter === 'ALL' || c.status === customerStatusFilter
      const q = customerSearch.toLowerCase().trim()
      const matchSearch =
        !q ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.postcode && c.postcode.toLowerCase().includes(q))
      return matchStatus && matchSearch
    })
  }, [customers, customerSearch, customerStatusFilter])

  const filteredStudios = useMemo(() => {
    return studios.filter((s) => {
      const matchArea = studioAreaFilter === 'ALL' || s.area === studioAreaFilter
      const q = studioSearch.toLowerCase().trim()
      const matchSearch =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.area && s.area.toLowerCase().includes(q)) ||
        (s.postcode && s.postcode.toLowerCase().includes(q)) ||
        (s.leadTailor && s.leadTailor.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
      return matchArea && matchSearch
    })
  }, [studios, studioSearch, studioAreaFilter])

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter
      const matchStore = orderStoreFilter === 'ALL' || o.storeId === orderStoreFilter
      const matchRetail =
        orderRetailFilter === 'ALL' ||
        (orderRetailFilter === 'RETAIL_ONLY' && Boolean(o.retailSold)) ||
        (orderRetailFilter === 'ALTERATION_ONLY' && !o.retailSold)
      const q = orderSearch.toLowerCase().trim()
      const matchSearch =
        !q ||
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.customerName && o.customerName.toLowerCase().includes(q)) ||
        (o.customerPhone && o.customerPhone.includes(q)) ||
        (o.storeName && o.storeName.toLowerCase().includes(q)) ||
        (o.hangTagNo && o.hangTagNo.toLowerCase().includes(q)) ||
        (o.serviceName && o.serviceName.toLowerCase().includes(q)) ||
        (o.retailCategory && o.retailCategory.toLowerCase().includes(q))
      return matchStatus && matchStore && matchRetail && matchSearch
    })
  }, [orders, orderStatusFilter, orderStoreFilter, orderRetailFilter, orderSearch])

  // Distinct Areas
  const availableAreas = useMemo(() => {
    const set = new Set<string>()
    studios.forEach((s) => {
      if (s.area) set.add(s.area)
    })
    return Array.from(set)
  }, [studios])

  // ==========================================
  // HANDLERS: CUSTOMER MANAGEMENT
  // ==========================================
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCustomer) return

    try {
      const res = await updateAdminCustomer(editingCustomer.id, {
        name: editingCustomer.name,
        email: editingCustomer.email,
        phone: editingCustomer.phone,
        status: editingCustomer.status,
        role: 'CUSTOMER',
        address: editingCustomer.address,
        postcode: editingCustomer.postcode,
        measurements: editingCustomer.measurements,
      })

      if (res.success && res.customer) {
        toast.success(`Customer profile updated successfully`)
        // 1. Immediately update state in-memory so changes reflect instantly without refresh
        setCustomers((prev) =>
          prev.map((c) => (c.id === editingCustomer.id ? { ...c, ...res.customer } : c))
        )
        setEditingCustomer(null)

        // 2. Refresh customer list quietly in background for full relations
        fetchAdminCustomers(customerSearch, customerStatusFilter, 'CUSTOMER').then((list) => {
          if (list && list.length > 0) setCustomers(list)
        })
      } else {
        toast.error(res.error || 'Failed to update customer')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error saving customer')
    }
  }

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    const payload = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      postcode: formData.get('postcode') as string,
      status: formData.get('status') as string,
    }

    const res = await createAdminCustomer(payload)
    if (res.success && res.customer) {
      toast.success('New customer profile registered successfully')
      setShowAddCustomerModal(false)

      // 1. Immediately insert new customer at the top of the list
      const newCust = {
        ...res.customer,
        orders: [],
        ordersCount: 0,
        activeOrdersCount: 0,
        totalSpend: 0,
      }
      setCustomers((prev) => [newCust, ...prev.filter((c) => c.id !== res.customer.id)])

      // 2. Quietly update overview counts without freezing UI
      fetchAdminOverview().then((ov) => {
        if (ov) setOverview(ov)
      })
      // 3. Sync customer list in background to ensure any server-computed fields match
      fetchAdminCustomers('', 'ALL', 'CUSTOMER').then((list) => {
        if (list && list.length > 0) setCustomers(list)
      })
    } else {
      toast.error(res.error || 'Failed to create customer')
    }
  }


  // ==========================================
  // HANDLERS: STUDIO MANAGEMENT
  // ==========================================
  const handleSaveStudio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStudio) return

    try {
      const res = await updateAdminStudio(editingStudio.id, {
        name: editingStudio.name,
        area: editingStudio.area,
        address: editingStudio.address,
        postcode: editingStudio.postcode,
        phone: editingStudio.phone,
        email: editingStudio.email,
        leadTailor: editingStudio.leadTailor,
        dailyCapacity: editingStudio.dailyCapacity,
        machines: editingStudio.machines,
        workers: editingStudio.workers,
        openingHours: editingStudio.openingHours,
        specialties: editingStudio.specialties,
      })

      if (res.success && res.studio) {
        toast.success(`Studio "${editingStudio.name}" updated successfully`)
        // 1. Immediately update state
        setStudios((prev) =>
          prev.map((s) => (s.id === editingStudio.id ? { ...s, ...res.studio } : s))
        )
        setEditingStudio(null)

        // 2. Sync studios list quietly in background
        fetchAdminStudios(studioSearch, studioAreaFilter).then((list) => {
          if (list && list.length > 0) setStudios(list)
        })
      } else {
        toast.error(res.error || 'Failed to update studio')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating studio')
    }
  }

  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)

    const payload = {
      name: formData.get('name') as string,
      area: formData.get('area') as string,
      address: formData.get('address') as string,
      postcode: formData.get('postcode') as string,
      phone: formData.get('phone') as string,
      email: formData.get('email') as string,
      leadTailor: formData.get('leadTailor') as string,
      dailyCapacity: parseInt(formData.get('dailyCapacity') as string || '25', 10),
      machines: parseInt(formData.get('machines') as string || '6', 10),
      workers: parseInt(formData.get('workers') as string || '4', 10),
      openingHours: formData.get('openingHours') as string || '09:00 - 19:00',
    }

    const res = await createAdminStudio(payload)
    if (res.success && res.studio) {
      toast.success('New partner studio onboarded successfully')
      setShowAddStudioModal(false)

      // 1. Immediately add studio to local state
      const newStudio = {
        ...res.studio,
        orders: [],
        activeOrdersCount: 0,
        completedOrdersCount: 0,
        totalOrdersCount: 0,
        totalPayoutEarned: 0,
        utilization: 0,
      }
      setStudios((prev) => [newStudio, ...prev.filter((s) => s.id !== res.studio.id)])

      // 2. Quietly update overview counts
      fetchAdminOverview().then((ov) => {
        if (ov) setOverview(ov)
      })
      // 3. Sync studios in background
      fetchAdminStudios().then((list) => {
        if (list && list.length > 0) setStudios(list)
      })
    } else {
      toast.error(res.error || 'Failed to onboard studio')
    }
  }


  // ==========================================
  // HANDLERS: ORDER & DISPATCH REASSIGNMENT
  // ==========================================
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrder) return

    try {
      const res = await updateAdminOrder(editingOrder.id, {
        status: editingOrder.status,
        storeId: editingOrder.storeId,
        hangTagNo: editingOrder.hangTagNo,
        price: editingOrder.price,
        partnerPayout: editingOrder.partnerPayout,
        retailSold: Boolean(editingOrder.retailSold),
        retailValue: editingOrder.retailValue,
        retailCategory: editingOrder.retailCategory,
        assignedWorker: editingOrder.assignedWorker,
        machineNo: editingOrder.machineNo,
        fitNotes: editingOrder.fitNotes,
        sewingNotes: editingOrder.sewingNotes,
      })

      if (res.success && res.order) {
        toast.success(`Order ${editingOrder.id} updated and dispatched`)
        // 1. Immediately update order in local state
        setOrders((prev) =>
          prev.map((o) => (o.id === editingOrder.id ? { ...o, ...res.order } : o))
        )
        setEditingOrder(null)

        // 2. Quietly update overview metrics without fetching all other datasets
        fetchAdminOverview().then((ov) => {
          if (ov) setOverview(ov)
        })
      } else {
        toast.error(res.error || 'Failed to update order')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating order')
    }
  }

  // Quick Inline Order Status Updater (Optimistic update without modal)
  const handleQuickUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      // 1. Optimistic update in UI
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      )
      const res = await updateAdminOrder(orderId, { status: newStatus })
      if (res.success && res.order) {
        toast.success(`Order status updated to "${newStatus}"`)
        fetchAdminOverview().then((ov) => {
          if (ov) setOverview(ov)
        })
      } else {
        toast.error(res.error || 'Failed to update order status')
        loadAllData(true)
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating order status')
      loadAllData(true)
    }
  }

  // ==========================================
  // HANDLERS: CONTACT INQUIRIES MANAGEMENT
  // ==========================================
  const handleUpdateInquiryStatus = async (id: string, status: string, notes?: string) => {
    try {
      const res = await updateAdminInquiry(id, { status, adminNotes: notes })
      if (res.success && res.inquiry) {
        setInquiries((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...res.inquiry } : item))
        )
        // Refresh inquiries status counts & overview counts quietly
        fetchAdminInquiries().then((inqData) => {
          if (inqData?.statusCounts) setInquiryStatusCounts(inqData.statusCounts)
        })
        fetchAdminOverview().then((ov) => {
          if (ov) setOverview(ov)
        })
      } else {
        throw new Error(res.error || 'Failed to update inquiry status')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error updating inquiry')
      throw err
    }
  }

  const handleDeleteInquiry = async (id: string) => {
    try {
      const res = await deleteAdminInquiry(id)
      if (res.success) {
        setInquiries((prev) => prev.filter((item) => item.id !== id))
        fetchAdminInquiries().then((inqData) => {
          if (inqData?.statusCounts) setInquiryStatusCounts(inqData.statusCounts)
        })
        fetchAdminOverview().then((ov) => {
          if (ov) setOverview(ov)
        })
      } else {
        throw new Error(res.error || 'Failed to delete inquiry')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error deleting inquiry')
      throw err
    }
  }

  // ── 1. LOADING SESSION GATE ──
  if (!mounted || (authChecking && !adminUser)) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center text-[#1E2229] p-6 font-sans">
        <div className="size-12 rounded-2xl bg-[#9E593B] text-white grid place-items-center mb-4 shadow-sm animate-pulse">
          <ShieldCheck size={24} />
        </div>
        <p className="text-xs font-semibold tracking-wide text-[#78716C]">
          Verifying Super Admin session...
        </p>
      </div>
    )
  }

  // ── 2. SUPER ADMIN LOGIN SCREEN (LIGHT & PROPER ATELIER UI) ──
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-[#1E2229] flex flex-col justify-between font-sans selection:bg-[#9E593B]/20 selection:text-[#9E593B] relative">
        {/* Top Minimal Bar */}
        <div className="max-w-7xl w-full mx-auto p-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <RaffuLogo devanagariOnly size="md" />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#9E593B] px-2.5 py-1 rounded-lg bg-[#FAF3ED] border border-[#EADBCE]">
              Super Admin
            </span>
          </div>
        </div>

        {/* Center Light Login Card */}
        <div className="flex-1 flex items-center justify-center p-4 relative z-10">
          <div className="max-w-md w-full bg-white border border-[#E8E1D5] rounded-3xl p-8 sm:p-9 shadow-xl shadow-stone-900/5 space-y-6">
            <div className="text-center space-y-2">
              <div className="size-13 rounded-2xl bg-gradient-to-br from-[#9E593B] to-[#7B3F26] text-white grid place-items-center mx-auto shadow-md">
                <Lock size={22} />
              </div>
              <div className="inline-block px-3 py-0.5 rounded-full bg-[#FAF3ED] border border-[#EADBCE] text-[#9E593B] text-[10px] font-extrabold uppercase tracking-widest">
                Admin Access
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E2229]">
                Super Admin Login
              </h1>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle size={16} className="shrink-0 text-rose-500" />
                <span className="font-medium">{loginError}</span>
              </div>
            )}

            {/* Login Form: Clean, NOT pre-fetched */}
            <form onSubmit={handleLoginSubmit} method="POST" className="space-y-4 text-xs">
              <div>
                <label htmlFor="admin-email" className="font-bold text-[#1E2229] block mb-1.5">
                  Email or Admin ID
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 size-4 text-[#A8A29E] pointer-events-none" />
                  <input
                    id="admin-email"
                    name="email"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="Enter your email or admin ID"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-[#E8E1D5] rounded-xl text-[#1E2229] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9E593B] focus:border-transparent transition-all font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-password" className="font-bold text-[#1E2229] block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 size-4 text-[#A8A29E] pointer-events-none" />
                  <input
                    id="admin-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#E8E1D5] rounded-xl text-[#1E2229] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9E593B] focus:border-transparent transition-all text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-[#A8A29E] hover:text-[#1E2229] cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 px-4 rounded-xl bg-[#9E593B] hover:bg-[#8A4C32] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} />
                    <span>Sign In to Dashboard</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Minimal Footer */}
        <div className="p-6 text-center text-xs text-[#78716C] relative z-10">
          Raffu Super Admin • Secure Admin Session
        </div>

        <ToastContainer position="top-right" autoClose={3000} theme="light" />
      </div>
    )
  }

  // ── 3. SUPER ADMIN CONSOLE (AUTHENTICATED - LIGHT & PROPER THEME) ──
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1E2229] font-sans flex flex-col selection:bg-[#9E593B]/20 selection:text-[#9E593B]">
      {/* ── TOP MASTER BAR (LIGHT ATELIER THEME) ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E8E1D5] shadow-2xs">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Super Admin badge */}
          <div className="flex items-center gap-3 shrink-0">
            <RaffuLogo devanagariOnly size="md" />
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FAF3ED] text-[#9E593B] border border-[#EADBCE]">
              Super Admin
            </span>
          </div>

          {/* Omnichannel Global Search */}
          <div className="relative flex-1 max-w-xl mx-2 hidden md:block">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 size-4 text-[#A8A29E] pointer-events-none" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone, order ID, or studio..."
                className="w-full bg-[#FAF8F5] border border-[#E8E1D5] rounded-full pl-10 pr-9 py-2 text-xs text-[#1E2229] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9E593B] focus:border-transparent transition-all"
              />
              {globalSearchQuery && (
                <button
                  onClick={() => setGlobalSearchQuery('')}
                  className="absolute right-3 text-[#A8A29E] hover:text-[#1E2229]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Global Search Results Dropdown */}
            {globalSearchResults && (
              <div className="absolute top-12 left-0 right-0 bg-white text-[#1E2229] rounded-2xl shadow-xl border border-[#E8E1D5] overflow-hidden z-50 max-h-[460px] overflow-y-auto">
                <div className="p-2 border-b border-[#E8E1D5] flex items-center justify-between bg-[#FAF8F5] text-[11px] text-[#78716C] font-semibold uppercase tracking-wider">
                  <span>Search Matches for "{globalSearchQuery}"</span>
                  <button
                    onClick={() => setGlobalSearchResults(null)}
                    className="hover:text-[#1E2229]"
                  >
                    Close
                  </button>
                </div>

                {/* Customers matches */}
                {globalSearchResults.customers?.length > 0 && (
                  <div className="p-2 border-b border-[#E8E1D5]">
                    <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider block px-2 mb-1">
                      Customers ({globalSearchResults.customers.length})
                    </span>
                    {globalSearchResults.customers.map((c: any) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setEditingCustomer(c)
                          setGlobalSearchResults(null)
                        }}
                        className="flex items-center justify-between p-2 hover:bg-[#FAF3ED] rounded-lg cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="text-xs font-bold text-[#1E2229]">{c.name}</p>
                          <p className="text-[11px] text-[#78716C]">
                            {c.email || 'No email'} • {c.phone || 'No phone'}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Studios matches */}
                {globalSearchResults.studios?.length > 0 && (
                  <div className="p-2 border-b border-[#E8E1D5]">
                    <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider block px-2 mb-1">
                      Partner Studios ({globalSearchResults.studios.length})
                    </span>
                    {globalSearchResults.studios.map((s: any) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setEditingStudio(s)
                          setGlobalSearchResults(null)
                        }}
                        className="flex items-center justify-between p-2 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="text-xs font-bold text-[#1E2229]">{s.name}</p>
                          <p className="text-[11px] text-[#78716C]">
                            {s.area} • {s.postcode} • Lead: {s.leadTailor}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          Cap: {s.dailyCapacity}/day
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Orders matches */}
                {globalSearchResults.orders?.length > 0 && (
                  <div className="p-2">
                    <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider block px-2 mb-1">
                      Orders ({globalSearchResults.orders.length})
                    </span>
                    {globalSearchResults.orders.map((o: any) => (
                      <div
                        key={o.id}
                        onClick={() => {
                          setEditingOrder(o)
                          setGlobalSearchResults(null)
                        }}
                        className="flex items-center justify-between p-2 hover:bg-[#FAF3ED] rounded-lg cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#1E2229]">{o.id}</span>
                            <span className="text-[10px] bg-[#FAF8F5] text-[#78716C] px-1.5 py-0.2 rounded font-semibold border border-[#E8E1D5]">
                              Tag: {o.hangTagNo || 'N/A'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#78716C]">
                            {o.customerName} • {o.serviceName} • Store: {o.storeName}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          {o.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inquiries matches */}
                {globalSearchResults.inquiries?.length > 0 && (
                  <div className="p-2 border-t border-[#E8E1D5]">
                    <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider block px-2 mb-1">
                      Contact Inquiries ({globalSearchResults.inquiries.length})
                    </span>
                    {globalSearchResults.inquiries.map((inq: any) => (
                      <div
                        key={inq.id}
                        onClick={() => {
                          setInquirySearch(inq.name || inq.id)
                          handleTabSwitch('inquiries')
                          setGlobalSearchResults(null)
                        }}
                        className="flex items-center justify-between p-2 hover:bg-[#FAF3ED] rounded-lg cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1E2229]">{inq.name}</span>
                            <span className="text-[10px] bg-[#FAF8F5] text-[#9E593B] px-1.5 py-0.2 rounded font-semibold border border-[#EADBCE]">
                              {inq.source}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#78716C] line-clamp-1">
                            {inq.topic} • {inq.message}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          {inq.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {(!globalSearchResults.customers?.length &&
                  !globalSearchResults.studios?.length &&
                  !globalSearchResults.orders?.length &&
                  !globalSearchResults.inquiries?.length) && (
                  <div className="p-6 text-center text-xs text-[#78716C]">
                    No matching records found across customers, studios, orders, or inquiries.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Links & Refresh & Admin Profile */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Subtle Live Auto-Refresh Toggle Pill */}
            <button
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold shadow-2xs'
                  : 'bg-[#FAF8F5] text-[#78716C] border-[#E8E1D5] hover:text-[#1E2229]'
              }`}
              title={autoRefresh ? 'Live auto-refresh enabled (every 30s)' : 'Click to enable live 30s auto-refresh'}
            >
              <span className={`size-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-stone-300'}`} />
              <span>{autoRefresh ? 'Live: 30s' : 'Auto-refresh off'}</span>
            </button>

            <button
              onClick={() => loadAllData(true)}
              disabled={refreshing}
              title="Refresh live data now"
              className="p-2 text-[#78716C] hover:text-[#1E2229] rounded-lg hover:bg-[#F3EFEA] transition-colors cursor-pointer"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-[#9E593B]' : ''} />
            </button>

            {/* Admin identity badge */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-white border border-[#E8E1D5] rounded-full text-xs shadow-2xs">
              <ShieldCheck size={14} className="text-[#9E593B]" />
              <span className="font-semibold text-[#1E2229]">{adminUser.email}</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 rounded-lg hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
              title="Sign Out of Super Admin"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Light Atelier) */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1.5 overflow-x-auto border-t border-[#E8E1D5] bg-[#FAF8F5]/80 text-xs font-semibold py-1.5">
          <button
            onClick={() => handleTabSwitch('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <Activity size={14} />
            <span>Overview</span>
          </button>

          <button
            onClick={() => handleTabSwitch('customers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'customers'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <Users size={14} />
            <span>Customers</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'customers' ? 'bg-white/20 text-white' : 'bg-[#E8E1D5] text-[#1E2229]'
            }`}>
              {customers.length}
            </span>
          </button>

          <button
            onClick={() => handleTabSwitch('studios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'studios'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <Store size={14} />
            <span>Studios</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'studios' ? 'bg-white/20 text-white' : 'bg-[#E8E1D5] text-[#1E2229]'
            }`}>
              {studios.length}
            </span>
          </button>

          <button
            onClick={() => handleTabSwitch('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <Layers size={14} />
            <span>Orders</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'orders' ? 'bg-white/20 text-white' : 'bg-[#E8E1D5] text-[#1E2229]'
            }`}>
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => handleTabSwitch('inquiries')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'inquiries'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <MessageSquare size={14} />
            <span>Contact Inquiries</span>
            {inquiryStatusCounts.NEW > 0 ? (
              <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'inquiries' ? 'bg-amber-400 text-stone-900' : 'bg-amber-500 text-white animate-pulse'
              }`}>
                {inquiryStatusCounts.NEW} NEW
              </span>
            ) : (
              <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === 'inquiries' ? 'bg-white/20 text-white' : 'bg-[#E8E1D5] text-[#1E2229]'
              }`}>
                {inquiries.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabSwitch('verifications')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'verifications'
                ? 'bg-[#9E593B] text-white shadow-xs font-bold'
                : 'text-[#1E2229] hover:text-black hover:bg-[#F3EFEA]'
            }`}
          >
            <ShieldCheck size={14} />
            <span>Studio Verifications</span>
            {pendingVerificationCount > 0 && (
              <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'verifications' ? 'bg-amber-400 text-stone-900' : 'bg-amber-500 text-white animate-pulse'
              }`}>
                {pendingVerificationCount} PENDING
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div key={activeTab} className="animate-fadeIn transition-opacity duration-200">
          {/* ── TAB 1: OVERVIEW & ANALYTICS ── */}
          {activeTab === 'overview' && (
            <OverviewTab
              overview={overview}
              customers={customers}
              studios={studios}
              orders={orders}
              onNavigateTab={handleTabSwitch}
              onOpenAddCustomer={() => setShowAddCustomerModal(true)}
              onOpenAddStudio={() => setShowAddStudioModal(true)}
              onFilterOrderStatus={setOrderStatusFilter}
              onEditOrder={setEditingOrder}
            />
          )}

          {/* ── TAB 2: CUSTOMER MASTER MANAGEMENT ── */}
          {activeTab === 'customers' && (
            <CustomersTab
              customers={customers}
              customerSearch={customerSearch}
              setCustomerSearch={setCustomerSearch}
              customerStatusFilter={customerStatusFilter}
              setCustomerStatusFilter={setCustomerStatusFilter}
              onOpenAddCustomer={() => setShowAddCustomerModal(true)}
              onEditCustomer={setEditingCustomer}
              onViewCustomerOrders={setViewingCustomerOrders}
            />
          )}

          {/* ── TAB 3: STUDIO FLEET MANAGEMENT ── */}
          {activeTab === 'studios' && (
            <StudiosTab
              studios={studios}
              studioSearch={studioSearch}
              setStudioSearch={setStudioSearch}
              studioAreaFilter={studioAreaFilter}
              setStudioAreaFilter={setStudioAreaFilter}
              availableAreas={availableAreas}
              onOpenAddStudio={() => setShowAddStudioModal(true)}
              onEditStudio={setEditingStudio}
            />
          )}

          {/* ── TAB 4: ORDERS & DISPATCH CONSOLE ── */}
          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              studios={studios}
              orderSearch={orderSearch}
              setOrderSearch={setOrderSearch}
              orderStatusFilter={orderStatusFilter}
              setOrderStatusFilter={setOrderStatusFilter}
              orderStoreFilter={orderStoreFilter}
              setOrderStoreFilter={setOrderStoreFilter}
              orderRetailFilter={orderRetailFilter}
              setOrderRetailFilter={setOrderRetailFilter}
              onEditOrder={setEditingOrder}
              onQuickStatusChange={handleQuickUpdateOrderStatus}
            />
          )}

          {/* ── TAB 5: CONTACT & CONCIERGE INQUIRIES ── */}
          {activeTab === 'inquiries' && (
            <InquiriesTab
              inquiries={inquiries}
              statusCounts={inquiryStatusCounts}
              inquirySearch={inquirySearch}
              setInquirySearch={setInquirySearch}
              inquiryStatusFilter={inquiryStatusFilter}
              setInquiryStatusFilter={setInquiryStatusFilter}
              inquirySourceFilter={inquirySourceFilter}
              setInquirySourceFilter={setInquirySourceFilter}
              onUpdateInquiryStatus={handleUpdateInquiryStatus}
              onDeleteInquiry={handleDeleteInquiry}
              onRefresh={() => loadAllData(true)}
              refreshing={refreshing}
              onNavigateToOrder={(orderId) => {
                setOrderSearch(orderId)
                handleTabSwitch('orders')
              }}
            />
          )}

          {/* ── TAB 6: STUDIO VERIFICATIONS ── */}
          {activeTab === 'verifications' && (
            <VerificationsTab onPendingCountChange={setPendingVerificationCount} />
          )}
        </div>
      </main>

      {/* ── MODAL: EDIT CUSTOMER (MASTER ADMIN CAPABILITY) ── */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E8E1D5] max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingCustomer(null)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1E2229]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-[#FAF3ED] text-[#9E593B]">
                <Edit2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1E2229]">Master Admin Customer Editor</h3>
                <p className="text-xs text-[#78716C]">Edit customer account records and saved measurements</p>
              </div>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingCustomer.name || ''}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  required
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editingCustomer.email || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editingCustomer.phone || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Account Role</label>
                  <div className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl text-xs font-semibold text-[#78716C] flex items-center justify-between">
                    <span>CUSTOMER</span>
                    <span className="text-[10px] text-[#A8A29E]">(Fixed)</span>
                  </div>
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Account Status</label>
                  <select
                    value={editingCustomer.status || 'ACTIVE'}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, status: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-semibold text-[#1E2229]"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Street Address</label>
                  <input
                    type="text"
                    value={editingCustomer.address || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Postcode</label>
                  <input
                    type="text"
                    value={editingCustomer.postcode || ''}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, postcode: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Saved Measurements */}
              <div>
                <label className="font-bold text-[#1E2229] block mb-1">
                  Saved Measurements (JSON or Notes)
                </label>
                <textarea
                  rows={3}
                  value={
                    typeof editingCustomer.measurements === 'object'
                      ? JSON.stringify(editingCustomer.measurements, null, 2)
                      : (editingCustomer.measurements || '')
                  }
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, measurements: e.target.value })}
                  placeholder='e.g. {"waist": "32", "inseam": "30"}'
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E1D5]">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 border border-[#E8E1D5] rounded-xl text-[#1E2229] hover:bg-[#FAF8F5] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#9E593B] text-white rounded-xl hover:bg-[#8A4C32] font-bold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD NEW CUSTOMER ── */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E8E1D5] max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowAddCustomerModal(false)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1E2229]"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-[#1E2229] mb-1">Create Customer Record</h3>
            <p className="text-xs text-[#78716C] mb-4">Register a new customer profile into the database.</p>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Full Name *</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Jane Doe"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  placeholder="jane@example.com"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Phone</label>
                <input
                  name="phone"
                  placeholder="+44 7700 900123"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Postcode</label>
                  <input
                    name="postcode"
                    placeholder="SW1A 1AA"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue="ACTIVE"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Address</label>
                <input
                  name="address"
                  placeholder="Flat 4, 12 Kensington High St"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E1D5]">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 border border-[#E8E1D5] rounded-xl text-[#1E2229] hover:bg-[#FAF8F5] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#9E593B] text-white rounded-xl hover:bg-[#8A4C32] font-bold shadow-xs cursor-pointer"
                >
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT STUDIO (MASTER ADMIN CAPABILITY) ── */}
      {editingStudio && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E8E1D5] max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingStudio(null)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1E2229]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                <Store size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1E2229]">Master Studio Fleet Editor</h3>
                <p className="text-xs text-[#78716C]">Configure studio partner capacity, lead tailor, and parameters</p>
              </div>
            </div>

            <form onSubmit={handleSaveStudio} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Studio Name</label>
                <input
                  type="text"
                  value={editingStudio.name || ''}
                  onChange={(e) => setEditingStudio({ ...editingStudio, name: e.target.value })}
                  required
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-semibold text-[#1E2229]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Area / Borough</label>
                  <input
                    type="text"
                    value={editingStudio.area || ''}
                    onChange={(e) => setEditingStudio({ ...editingStudio, area: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Postcode</label>
                  <input
                    type="text"
                    value={editingStudio.postcode || ''}
                    onChange={(e) => setEditingStudio({ ...editingStudio, postcode: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Full Address</label>
                <input
                  type="text"
                  value={editingStudio.address || ''}
                  onChange={(e) => setEditingStudio({ ...editingStudio, address: e.target.value })}
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Lead Tailor</label>
                  <input
                    type="text"
                    value={editingStudio.leadTailor || ''}
                    onChange={(e) => setEditingStudio({ ...editingStudio, leadTailor: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editingStudio.phone || ''}
                    onChange={(e) => setEditingStudio({ ...editingStudio, phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Studio Email</label>
                <input
                  type="email"
                  value={editingStudio.email || ''}
                  onChange={(e) => setEditingStudio({ ...editingStudio, email: e.target.value })}
                  placeholder="e.g. atelier@raffu.com"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Daily Capacity</label>
                  <input
                    type="number"
                    value={editingStudio.dailyCapacity || 25}
                    onChange={(e) => setEditingStudio({ ...editingStudio, dailyCapacity: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-bold text-[#1E2229]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Machines</label>
                  <input
                    type="number"
                    value={editingStudio.machines || 4}
                    onChange={(e) => setEditingStudio({ ...editingStudio, machines: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Workers</label>
                  <input
                    type="number"
                    value={editingStudio.workers || 3}
                    onChange={(e) => setEditingStudio({ ...editingStudio, workers: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Opening Hours</label>
                <input
                  type="text"
                  value={editingStudio.openingHours || ''}
                  onChange={(e) => setEditingStudio({ ...editingStudio, openingHours: e.target.value })}
                  placeholder="Mon–Sat: 09:00 – 19:00"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E1D5]">
                <button
                  type="button"
                  onClick={() => setEditingStudio(null)}
                  className="px-4 py-2 border border-[#E8E1D5] rounded-xl text-[#1E2229] hover:bg-[#FAF8F5] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#9E593B] text-white rounded-xl hover:bg-[#8A4C32] font-bold shadow-xs cursor-pointer"
                >
                  Save Studio Specs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ONBOARD NEW STUDIO ── */}
      {showAddStudioModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E8E1D5] max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAddStudioModal(false)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1E2229]"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-[#1E2229] mb-1">Onboard New Partner Atelier</h3>
            <p className="text-xs text-[#78716C] mb-4">Register a partner studio workshop into Raffu fleet.</p>

            <form onSubmit={handleCreateStudio} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Studio Name *</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Mayfair Bespoke Alterations"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Area / Neighborhood</label>
                  <input
                    name="area"
                    placeholder="Mayfair"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Postcode *</label>
                  <input
                    name="postcode"
                    required
                    placeholder="W1K 4QG"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Address *</label>
                <input
                  name="address"
                  required
                  placeholder="14 Savile Row, London"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Lead Tailor</label>
                  <input
                    name="leadTailor"
                    placeholder="Master Ahmed"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Phone</label>
                  <input
                    name="phone"
                    placeholder="e.g. +91 98765 43210"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Studio Email</label>
                <input
                  name="email"
                  type="email"
                  placeholder="e.g. atelier@raffu.com"
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Daily Cap</label>
                  <input
                    name="dailyCapacity"
                    type="number"
                    defaultValue={25}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Machines</label>
                  <input
                    name="machines"
                    type="number"
                    defaultValue={6}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Workers</label>
                  <input
                    name="workers"
                    type="number"
                    defaultValue={4}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E1D5]">
                <button
                  type="button"
                  onClick={() => setShowAddStudioModal(false)}
                  className="px-4 py-2 border border-[#E8E1D5] rounded-xl text-[#1E2229] hover:bg-[#FAF8F5] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#9E593B] text-white rounded-xl hover:bg-[#8A4C32] font-bold shadow-xs cursor-pointer"
                >
                  Onboard Studio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ORDER REASSIGNMENT & DISPATCH MASTER CONTROL ── */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-[#E8E1D5] max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingOrder(null)}
              className="absolute top-4 right-4 text-[#A8A29E] hover:text-[#1E2229]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-[#FAF3ED] text-[#9E593B]">
                <Scissors size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1E2229]">
                  Dispatch & Order Control: {editingOrder.id}
                </h3>
                <p className="text-xs text-[#78716C]">
                  Re-assign workshop node, override status, or update garment specifications
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveOrder} className="space-y-4 text-xs">
              {/* STUDIO REASSIGNMENT DROPDOWN */}
              <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E8E1D5]">
                <label className="font-bold text-[#1E2229] block mb-1">
                  Assigned Partner Studio Workshop
                </label>
                <select
                  value={editingOrder.storeId || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, storeId: e.target.value })}
                  className="w-full p-2.5 bg-white border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-semibold text-[#1E2229]"
                >
                  <option value="">— Unassigned —</option>
                  {studios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.area || s.postcode}) — Cap: {s.dailyCapacity}/day
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#78716C] mt-1.5">
                  Re-assigning will transfer this order to the selected partner studio.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Order Status</label>
                  <select
                    value={editingOrder.status}
                    onChange={(e) => setEditingOrder({ ...editingOrder, status: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-bold text-[#1E2229]"
                  >
                    <option value="Allocated">Allocated</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Customer Arrived">Customer Arrived</option>
                    <option value="Fitting Completed">Fitting Completed</option>
                    <option value="Work in Progress">Work in Progress</option>
                    <option value="Ready">Ready</option>
                    <option value="Collected">Collected</option>
                    <option value="Closed">Closed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Physical Hang Tag No</label>
                  <input
                    type="text"
                    value={editingOrder.hangTagNo || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, hangTagNo: e.target.value })}
                    placeholder="e.g. HT-104"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Customer Price ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingOrder.price || 0}
                    onChange={(e) => setEditingOrder({ ...editingOrder, price: e.target.value })}
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-bold text-[#1E2229]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#1E2229] block mb-1">Assigned Worker / Machine</label>
                  <input
                    type="text"
                    value={editingOrder.assignedWorker || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, assignedWorker: e.target.value })}
                    placeholder="e.g. Tailor Marco"
                    className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                  />
                </div>
              </div>

              {/* Retail / Purchased Product Add-on */}
              <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#E8E1D5] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={15} className="text-[#9E593B]" />
                    <span className="font-bold text-xs text-[#1E2229]">Retail Product Purchased (Add-on)</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingOrder.retailSold)}
                      onChange={(e) => setEditingOrder({ ...editingOrder, retailSold: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#E8E1D5] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#9E593B]"></div>
                  </label>
                </div>

                {editingOrder.retailSold && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-[#78716C] block mb-1">Purchased Product / Category</label>
                      <input
                        type="text"
                        value={editingOrder.retailCategory || ''}
                        onChange={(e) => setEditingOrder({ ...editingOrder, retailCategory: e.target.value })}
                        placeholder="e.g. Garment Bag, Premium Hanger, Fabric Spray"
                        className="w-full p-2 bg-white border border-[#E8E1D5] rounded-lg text-xs focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#78716C] block mb-1">Retail Price ($)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={editingOrder.retailValue || 0}
                        onChange={(e) => setEditingOrder({ ...editingOrder, retailValue: parseFloat(e.target.value) || 0 })}
                        className="w-full p-2 bg-white border border-[#E8E1D5] rounded-lg text-xs focus:ring-2 focus:ring-[#9E593B] focus:outline-none font-bold text-[#1E2229]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="font-bold text-[#1E2229] block mb-1">Sewing / Alteration Instructions</label>
                <textarea
                  rows={2}
                  value={editingOrder.sewingNotes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, sewingNotes: e.target.value })}
                  placeholder="Master tailor stitch guidance..."
                  className="w-full p-2.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:ring-2 focus:ring-[#9E593B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E1D5]">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 border border-[#E8E1D5] rounded-xl text-[#1E2229] hover:bg-[#FAF8F5] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#9E593B] text-white rounded-xl hover:bg-[#8A4C32] font-bold shadow-xs cursor-pointer"
                >
                  Update & Reassign Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CUSTOMER PURCHASES & HISTORY MODAL ── */}
      {viewingCustomerOrders && (
        <div className="fixed inset-0 z-50 bg-[#1E2229]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E1D5] rounded-3xl max-w-2xl w-full p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-[#E8E1D5]">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-[#FAF3ED] text-[#9E593B] border border-[#EADBCE] grid place-items-center font-bold text-sm uppercase">
                  {viewingCustomerOrders.name ? viewingCustomerOrders.name[0] : 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1E2229]">{viewingCustomerOrders.name} — Purchases & Order History</h3>
                  <p className="text-xs text-[#78716C]">
                    {viewingCustomerOrders.email || 'No email'} • {viewingCustomerOrders.phone || 'No phone'} • Total Spent: <strong className="text-[#1E2229]">${viewingCustomerOrders.totalSpend || 0}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingCustomerOrders(null)}
                className="p-1.5 text-[#78716C] hover:text-[#1E2229] hover:bg-[#FAF8F5] rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-4 overflow-y-auto space-y-3 flex-1">
              {viewingCustomerOrders.orders && viewingCustomerOrders.orders.length > 0 ? (
                viewingCustomerOrders.orders.map((ord: any) => (
                  <div key={ord.id} className="p-3.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-2xl flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-xs text-[#1E2229]">{ord.id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ord.status === 'Ready' ? 'bg-emerald-100 text-emerald-800' :
                          ord.status === 'Work in Progress' ? 'bg-orange-100 text-orange-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {ord.status}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#1E2229]">
                        {ord.serviceName || 'Alteration Service'} — <span className="text-[#78716C] font-normal">{ord.garmentName || 'Standard Item'}</span>
                      </p>
                      {ord.retailSold ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            🛍️ Retail Purchased: {ord.retailCategory || 'Accessory / Product'} (+${ord.retailValue || 15})
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#A8A29E] block mt-0.5">No retail product added</span>
                      )}
                      <p className="text-[11px] text-[#A8A29E] mt-1 font-mono">
                        {ord.date ? `${ord.date}` : (ord.createdAt ? new Date(ord.createdAt).toLocaleDateString('en-GB') : '')} • Workshop: {ord.storeName || 'Assigned Studio'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-[#1E2229] block">${ord.price}</span>
                      <button
                        onClick={() => {
                          const fullOrder = orders.find(o => o.id === ord.id)
                          if (fullOrder) {
                            setViewingCustomerOrders(null)
                            setEditingOrder(fullOrder)
                          }
                        }}
                        className="mt-1.5 text-[11px] text-[#9E593B] hover:underline font-bold inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        Inspect Order <ExternalLink size={10} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-[#78716C]">
                  No past orders or purchases on record for this customer.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E8E1D5] flex justify-end">
              <button
                onClick={() => setViewingCustomerOrders(null)}
                className="px-4 py-2 bg-[#9E593B] text-white text-xs font-bold rounded-xl hover:bg-[#8A4C32] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss={false}
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  )
}
