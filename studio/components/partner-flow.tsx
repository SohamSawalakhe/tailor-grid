'use client'

import { useEffect, useState, useRef } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Camera,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Delete,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Filter,
  Layers,
  LogOut,
  MapPin,
  Menu,
  Key,
  Package,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  User,
  X,
  Zap,
} from 'lucide-react'
import { type FittingBooking, type OrderStatus, type Screen, type User as UserType } from './data'
import { fetchStudioOrders, updateOrder, fetchPendingDispatches, respondToDispatch, type PendingDispatchRequest } from '@/lib/api'
import { getStorageCookie, setStorageCookie } from '@/lib/cookies'
import { StudioProfileView } from './studio-profile-view'
import { CustomSelect } from './custom-select'

export type StudioTab = 'cockpit' | 'pipeline' | 'payouts' | 'profile'

interface BroadcastRequest {
  id: string
  customerName: string
  customerArea: string
  distanceMiles: number
  garmentName: string
  serviceName: string
  fittingType: 'PRE_PINNED' | 'NEED_STUDIO_FITTING'
  garmentBrand?: string
  fitNotes: string
  partnerPayout: number
  slaHours: number
  imageUrl: string
  otp: string
  isRealCustomerOrder?: boolean
  realOrder?: FittingBooking
  isDispatchSession?: boolean
  secondsRemaining?: number
  stage?: number
}

const GARMENT_FALLBACK_IMAGES: Record<string, string> = {
  trousers: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
  suits: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
  jackets: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&auto=format&fit=crop&q=80',
  dresses: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=80',
  denim: 'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=600&auto=format&fit=crop&q=80',
  shirts: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
  coats: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=600&auto=format&fit=crop&q=80',
}

function getGarmentPhoto(order?: Partial<FittingBooking> | null): string {
  const photo = order?.intakePhotoUrl || (order as any)?.imageUrl
  if (photo && typeof photo === 'string') {
    if (photo.startsWith('http') || photo.startsWith('data:')) return photo
    if (photo.startsWith('[')) {
      try {
        const parsed = JSON.parse(photo)
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          return parsed[0]
        }
      } catch { }
    }
  }
  const gid = order?.garmentId?.toLowerCase() || ''
  const gname = order?.garmentName?.toLowerCase() || ''
  if (gid.includes('dress') || gname.includes('dress') || gname.includes('gown')) return GARMENT_FALLBACK_IMAGES.dresses
  if (gid.includes('denim') || gname.includes('denim') || gname.includes('jean')) return GARMENT_FALLBACK_IMAGES.denim
  if (gid.includes('suit') || gname.includes('suit') || gname.includes('blazer') || gname.includes('jacket'))
    return GARMENT_FALLBACK_IMAGES.suits
  if (gid.includes('shirt') || gname.includes('shirt')) return GARMENT_FALLBACK_IMAGES.shirts
  if (gid.includes('coat') || gname.includes('coat')) return GARMENT_FALLBACK_IMAGES.coats
  return GARMENT_FALLBACK_IMAGES.trousers
}

function getAllGarmentPhotos(order?: Partial<FittingBooking> | null): string[] {
  if (!order) return [GARMENT_FALLBACK_IMAGES.trousers]
  const raw = order.intakePhotoUrl || (order as any)?.imageUrl || (order as any)?.images
  const fallback = getGarmentPhoto(order)
  if (!raw) return [fallback]

  if (Array.isArray(raw)) {
    const list = raw.filter((p) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:')))
    return list.length > 0 ? list : [fallback]
  }

  if (typeof raw === 'string') {
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const list = parsed.filter((p) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:')))
          if (list.length > 0) return list
        }
      } catch { }
    }
    if (raw.includes('||')) {
      const list = raw.split('||').map((s) => s.trim()).filter((p) => p.startsWith('http') || p.startsWith('data:'))
      if (list.length > 0) return list
    }
    if (raw.startsWith('http') || raw.startsWith('data:')) {
      return [raw]
    }
  }

  return [fallback]
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  Allocated: { label: 'New Request', bg: 'bg-amber-50', text: 'text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  Accepted: { label: 'Drop-Off Pending', bg: 'bg-blue-50', text: 'text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  'Customer Arrived': { label: 'At Counter', bg: 'bg-indigo-50', text: 'text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
  'Fitting Completed': { label: 'Tagged & Pinned', bg: 'bg-purple-50', text: 'text-purple-800 border-purple-200', dot: 'bg-purple-500' },
  'Work in Progress': { label: 'On Bench', bg: 'bg-amber-50', text: 'text-amber-900 border-amber-300', dot: 'bg-amber-600' },
  Ready: { label: 'Ready', bg: 'bg-emerald-50', text: 'text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  Collected: { label: 'Picked Up', bg: 'bg-teal-50', text: 'text-teal-800 border-teal-200', dot: 'bg-teal-500' },
  Closed: { label: 'Completed', bg: 'bg-stone-50', text: 'text-stone-700 border-stone-200', dot: 'bg-stone-400' },
}

interface PartnerFlowProps {
  go: (s: Screen) => void
  otp?: string
  user?: UserType | null
  onSignOut?: () => void
  onOpenProfile?: () => void
  onUpdateUser?: (updated: UserType) => void
  activeTab?: StudioTab
  onTabChange?: (tab: StudioTab) => void
}

function getSlaCountdown(job: FittingBooking): { text: string; urgent: boolean; percent: number } {
  if (!job.slaStartedAt) return { text: `${job.slaHours || 48}h`, urgent: false, percent: 100 }
  const elapsedHours = (Date.now() - new Date(job.slaStartedAt).getTime()) / (3600 * 1000)
  const total = job.slaHours || 48
  const remaining = total - elapsedHours
  const percent = Math.max(0, Math.min(100, (remaining / total) * 100))

  if (remaining <= 0) return { text: 'Overdue', urgent: true, percent: 0 }
  if (remaining < 6) return { text: `${Math.round(remaining)}h left`, urgent: true, percent }
  return { text: `${Math.floor(remaining)}h left`, urgent: false, percent }
}

export function formatMeasurementKey(key: string): string {
  const map: Record<string, string> = {
    waistHips: 'Waist & Hips',
    hemLine: 'Hem Line',
    hemLength: 'Dress Hem',
    delicateHem: 'Delicate Hem',
    hem: 'Hem',
    waist: 'Waist',
    waistSuppression: 'Waist Suppression',
    inseam: 'Inseam',
    sleeve: 'Sleeves',
    sleeveLength: 'Sleeves',
    chest: 'Chest',
    chestWaist: 'Chest & Waist',
    shirtLength: 'Shirt Length',
    jacketTorso: 'Jacket Torso',
    trouserInseamWaist: 'Trouser Inseam & Waist',
    riseSeat: 'Rise & Seat',
    bodiceFit: 'Bodice & Bust',
    strapsShoulders: 'Straps & Shoulders',
    bustBodice: 'Bust & Bodice',
    collarRoll: 'Collar Roll',
    tapering: 'Tapering',
    shoulder: 'Shoulder',
    custom: 'Notes & Specs',
    fit: 'Fit Style',
  }
  if (map[key]) return map[key]
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

export function isOrderPinMatch(order?: Partial<FittingBooking> | null, inputPin?: string | null): boolean {
  if (!order || !inputPin || !order.otp) return false
  const clean = String(inputPin).trim()
  if (!clean) return false

  // Strictly validate against authentic backend-generated OTP
  return String(order.otp).trim() === clean
}

export function cleanMeasurementVal(val?: string | null): string {
  if (!val) return ''
  const str = String(val).trim()
  if (str.toLowerCase().includes('to be measured') || str.toLowerCase() === 'pending') {
    return ''
  }
  return str
}

export function formatCustomerFitNotes(rawNotes?: string | null): string {
  if (!rawNotes) return ''
  let str = String(rawNotes).trim()
  if (!str) return ''
  if (str.startsWith('Measurements:')) {
    str = str.replace(/^Measurements:\s*/, '').trim()
  }
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const obj = JSON.parse(str)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return Object.entries(obj)
          .filter(([_, v]) => v !== undefined && v !== null && String(v).trim())
          .map(([k, v]) => `${formatMeasurementKey(k)}: ${String(v).trim()}`)
          .join(' · ')
      }
    } catch { }
  }
  return str
}

export function renderCustomerFitNotesBanner(rawNotes?: string | null) {
  if (!rawNotes) return null
  let str = rawNotes.trim()
  if (!str) return null

  if (str.startsWith('Measurements:')) {
    str = str.replace(/^Measurements:\s*/, '').trim()
  }

  let parsedMap: Record<string, string> | null = null

  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const obj = JSON.parse(str)
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        parsedMap = {}
        Object.entries(obj).forEach(([k, v]) => {
          if (v !== undefined && v !== null && String(v).trim()) {
            parsedMap![formatMeasurementKey(k)] = String(v).trim()
          }
        })
      }
    } catch { }
  } else if (str.includes('·') || str.includes(':')) {
    const parts = str.split('·').map((s) => s.trim()).filter(Boolean)
    const map: Record<string, string> = {}
    parts.forEach((p) => {
      const colonIdx = p.indexOf(':')
      if (colonIdx !== -1) {
        const k = p.slice(0, colonIdx).trim()
        const v = p.slice(colonIdx + 1).trim()
        if (k && v) map[k] = v
      }
    })
    if (Object.keys(map).length > 0) {
      parsedMap = map
    }
  }

  if (parsedMap && Object.keys(parsedMap).length > 0) {
    const entries = Object.entries(parsedMap)
    const allPending = entries.every(([_, v]) =>
      v.toLowerCase().includes('to be measured') || v.toLowerCase().includes('pending')
    )

    if (allPending) {
      return (
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E8E1D5] text-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-[#9E593B]/10 text-[#9E593B] flex items-center justify-center shrink-0">
                <Ruler size={15} />
              </div>
              <div>
                <span className="font-bold text-[#1E2229] text-xs block">In-Studio Fitting Order</span>
                <span className="text-[11px] text-[#7C6E65] block">Customer requested in-person measurement at intake</span>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-full shrink-0">
              Tailor Measurement Required
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {entries.map(([key]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-[11px] bg-white text-[#4A423C] px-2.5 py-1 rounded-lg border border-[#E3DCD1] shadow-2xs font-medium">
                <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
                <strong className="text-[#1E2229] font-semibold">{key}:</strong>
                <span className="text-amber-800 font-medium">To be measured</span>
              </span>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E8E1D5] text-xs space-y-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9E593B] block">
          Customer Fit Specifications
        </span>
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([key, val]) => {
            const isPending = val.toLowerCase().includes('to be measured') || val.toLowerCase().includes('pending')
            return (
              <span
                key={key}
                className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border shadow-2xs ${
                  isPending
                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                    : 'bg-white border-[#E3DCD1] text-[#1E2229]'
                }`}
              >
                <span className={`size-1.5 rounded-full shrink-0 ${isPending ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <strong className="font-semibold">{key}:</strong>
                <span>{isPending ? 'Tailor to measure' : val}</span>
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E8E1D5] text-xs space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9E593B] block">
        Customer Fit Instructions
      </span>
      <p className="text-[#1E2229] font-medium leading-relaxed">
        {str}
      </p>
    </div>
  )
}

export function parseOrderMeasurements(order?: Partial<FittingBooking> | null): Record<string, string> {
  if (!order) return {}

  const result: Record<string, string> = {}

  // 1. Process order.measurements
  if (order.measurements) {
    const rawMeas: any = order.measurements
    if (typeof rawMeas === 'object' && !Array.isArray(rawMeas)) {
      Object.entries(rawMeas).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim()) {
          result[k] = String(v).trim()
        }
      })
    } else if (typeof rawMeas === 'string') {
      const raw = rawMeas.trim()
      if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([k, v]) => {
              if (v !== undefined && v !== null && String(v).trim()) {
                result[k] = String(v).trim()
              }
            })
          }
        } catch { }
      }
    }
  }

  // 2. If empty, check order.pinnedAdjustment
  if (Object.keys(result).length === 0 && order.pinnedAdjustment) {
    const raw = String(order.pinnedAdjustment).trim()
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([k, v]) => {
            if (v !== undefined && v !== null && String(v).trim()) {
              result[k] = String(v).trim()
            }
          })
        }
      } catch { }
    } else if (raw.includes('·') || raw.includes(':')) {
      const parts = raw.split('·').map((s) => s.trim()).filter(Boolean)
      parts.forEach((p) => {
        const colonIdx = p.indexOf(':')
        if (colonIdx !== -1) {
          const k = p.slice(0, colonIdx).trim()
          const v = p.slice(colonIdx + 1).trim()
          if (k && v) result[k] = v
        }
      })
    }
  }

  // 3. Clean any entries whose value is serialized JSON
  Object.entries(result).forEach(([k, v]) => {
    if (typeof v === 'string' && v.trim().startsWith('{') && v.trim().endsWith('}')) {
      try {
        const inner = JSON.parse(v)
        if (inner && typeof inner === 'object') {
          delete result[k]
          Object.entries(inner).forEach(([ik, iv]) => {
            if (iv !== undefined && iv !== null && String(iv).trim()) {
              result[ik] = String(iv).trim()
            }
          })
        }
      } catch { }
    }
  })

  return result
}

export function formatOrderSpecsSummary(order?: Partial<FittingBooking> | null): string {
  if (!order) return ''
  const parsed = parseOrderMeasurements(order)
  const entries = Object.entries(parsed)
  if (entries.length > 0) {
    return entries.map(([k, v]) => `${formatMeasurementKey(k)}: ${v}`).join(' · ')
  }
  if (order.pinnedAdjustment && !order.pinnedAdjustment.startsWith('{')) {
    return order.pinnedAdjustment
  }
  return ''
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* NAV ITEMS                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
const NAV_ITEMS: { id: StudioTab; label: string; icon: typeof Zap; shortLabel: string }[] = [
  { id: 'cockpit', label: 'Workshop Cockpit', icon: Zap, shortLabel: 'Workshop' },
  { id: 'pipeline', label: 'Alterations Pipeline', icon: Layers, shortLabel: 'Orders' },
  { id: 'payouts', label: 'Payouts & Escrow', icon: CreditCard, shortLabel: 'Payouts' },
  { id: 'profile', label: 'Studio Configuration', icon: Sliders, shortLabel: 'Profile' },
]

export function PartnerFlow({
  go,
  user,
  onSignOut,
  onOpenProfile,
  onUpdateUser,
  activeTab: controlledTab,
  onTabChange,
}: PartnerFlowProps) {
  const rawStudioName = (user?.studioName || '').trim()
  const studioName =
    rawStudioName.length > 2 && rawStudioName.toLowerCase() !== 'x'
      ? rawStudioName
      : (user?.name && user.name.length > 2 && user.name.toLowerCase() !== 'x')
      ? `${user.name}'s Atelier`
      : 'Darzi Atelier · Soho Flagship'
  const tailorName =
    (user?.name && user.name.length > 1 && user.name.toLowerCase() !== 'x')
      ? user.name
      : (rawStudioName.length > 2 && rawStudioName.toLowerCase() !== 'x')
      ? rawStudioName
      : 'Master Tailor'

  const currentStudioId = user?.studioId || (user as any)?.storeId || 'store-x-106'

  const [internalTab, setInternalTab] = useState<StudioTab>('cockpit')
  const activeTab = controlledTab || internalTab
  const setActiveTab = (tab: StudioTab) => {
    setInternalTab(tab)
    if (onTabChange) onTabChange(tab)
  }
  const [online, setOnline] = useState(true)
  const [orders, setOrders] = useState<FittingBooking[]>([])
  const [selectedOrder, setSelectedOrder] = useState<FittingBooking | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Accepted')
  const [refreshing, setRefreshing] = useState(false)
  const [pendingDispatches, setPendingDispatches] = useState<PendingDispatchRequest[]>([])


  // Full View Image Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number>(0)

  const handleOpenFullView = (photos: string[], startIndex = 0) => {
    if (!photos || photos.length === 0) return
    setLightboxPhotos(photos)
    setLightboxIndex(startIndex)
  }

  const handleAddStudioPhoto = async (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const newPhoto = evt.target?.result as string
      if (!newPhoto) return
      const targetOrder = orders.find((o) => o.id === orderId)
      if (!targetOrder) return

      const existingPhotos = getAllGarmentPhotos(targetOrder).filter((p) => p.startsWith('http') || p.startsWith('data:'))
      const updatedPhotos = [...existingPhotos, newPhoto]
      const photoPayload = JSON.stringify(updatedPhotos)

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, intakePhotoUrl: photoPayload } : o)))
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, intakePhotoUrl: photoPayload } : prev))
      }

      await updateOrder(orderId, { intakePhotoUrl: photoPayload }).catch(() => { })
      setBroadcastToast('✓ Garment reference photo added to order!')
      setTimeout(() => setBroadcastToast(null), 4000)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // desktop collapse

  // ── 1. Live Broadcast Queue & 15-Second Countdown ───────────────────
  const [broadcastIdx, setBroadcastIdx] = useState(0)
  const [timerSecs, setTimerSecs] = useState(15)
  const [timerProgress, setTimerProgress] = useState(100)
  const broadcastExpiryRef = useRef<{ key: string; expiresAt: number; totalDurationMs: number } | null>(null)
  const [broadcastToast, setBroadcastToast] = useState<string | null>(null)

  // Permanently skipped order IDs for THIS studio (clicked Skip)
  const [permanentlySkippedIds, setPermanentlySkippedIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tg_studio_permanently_skipped_orders')
      if (stored) {
        try { return JSON.parse(stored) } catch { }
      }
    }
    return []
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tg_studio_permanently_skipped_orders', JSON.stringify(permanentlySkippedIds))
      } catch { }
    }
  }, [permanentlySkippedIds])

  // Timed-out timestamps (unattended 15s timer expiry -> repeats every 2 minutes)
  const [timeoutTimestamps, setTimeoutTimestamps] = useState<Record<string, number>>({})
  const [inlinePickupInput, setInlinePickupInput] = useState<Record<string, string>>({})
  const [inlinePickupError, setInlinePickupError] = useState<Record<string, string>>({})
  const [verifyingHandoverMap, setVerifyingHandoverMap] = useState<Record<string, boolean>>({})
  const [justGeneratedOtpMap, setJustGeneratedOtpMap] = useState<Record<string, boolean>>({})
  const [generatedOtpMap, setGeneratedOtpMap] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tg_generated_pickup_otps')
      if (stored) {
        try { return JSON.parse(stored) } catch { }
      }
    }
    return {}
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tg_generated_pickup_otps', JSON.stringify(generatedOtpMap))
      } catch { }
    }
  }, [generatedOtpMap])

  const isPickupOtpGenerated = (order?: Partial<FittingBooking> | null) => {
    if (!order || !order.id || !order.otp) return false
    if (order.pickupOtpGenerated) return true
    if (generatedOtpMap[order.id] && generatedOtpMap[order.id] === order.otp) return true
    return false
  }

  // Clean up timed-out timestamps after 2 minutes (120,000ms) so unattended requests re-broadcast every 2 mins!
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTimeoutTimestamps((prev) => {
        let changed = false
        const next = { ...prev }
        Object.entries(next).forEach(([id, ts]) => {
          if (now - ts >= 120000) {
            delete next[id]
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // ── 2. Drop-off Intake PIN Handshake State ─────────────────────────────────
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [activeIntake, setActiveIntake] = useState<FittingBooking | null>(null)
  const [showKeypad, setShowKeypad] = useState(false)

  // In-Store Measurements & Tailor Specs
  const [measHem, setMeasHem] = useState('')
  const [measWaist, setMeasWaist] = useState('')
  const [measSleeve, setMeasSleeve] = useState('')
  const [measInseam, setMeasInseam] = useState('')
  const [measCustom, setMeasCustom] = useState('')
  const [isEditingIntakeMeas, setIsEditingIntakeMeas] = useState(false)
  const [intakeMeasFields, setIntakeMeasFields] = useState<{ key: string; label: string; value: string }[]>([])
  const [hangTag, setHangTag] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const [sewNotes, setSewNotes] = useState('')
  const [worker, setWorker] = useState(tailorName)
  const [machine, setMachine] = useState('Primary Sewing Bench')

  // Edit Measurements Modal State
  const [isEditMeasOpen, setIsEditMeasOpen] = useState(false)
  const [editTargetOrder, setEditTargetOrder] = useState<FittingBooking | null>(null)
  const [editMeasFields, setEditMeasFields] = useState<{ key: string; label: string; value: string }[]>([])

  // Price adjustment / surcharge
  const [showPriceAdjust, setShowPriceAdjust] = useState(false)
  const [priceAdjustAmount, setPriceAdjustAmount] = useState('')
  const [priceAdjustReason, setPriceAdjustReason] = useState('')
  const [priceAdjustApproved, setPriceAdjustApproved] = useState(false)
  const [intakeSuccess, setIntakeSuccess] = useState(false)

  // ── 3. Customer Pickup Verification & Retail Modal ─────────────────────────
  const [pickupModalOrder, setPickupModalOrder] = useState<FittingBooking | null>(null)
  const [pickupOtpInput, setPickupOtpInput] = useState('')
  const [pickupOtpError, setPickupOtpError] = useState('')
  const [pickupVerified, setPickupVerified] = useState(false)
  const [retailAnswer, setRetailAnswer] = useState<'YES' | 'NO' | null>(null)
  const [retailValueInput, setRetailValueInput] = useState('45')
  const [retailCategoryInput, setRetailCategoryInput] = useState('Accessories & Ties')
  const [pickupCompleted, setPickupCompleted] = useState(false)

  // Workshop Controls State
  const [hoursWeekday, setHoursWeekday] = useState(() => {
    if (typeof window !== 'undefined') return getStorageCookie('tg_studio_hours_wd', '09:00 AM – 07:00 PM')
    return '09:00 AM – 07:00 PM'
  })
  const [hoursSaturday, setHoursSaturday] = useState(() => {
    if (typeof window !== 'undefined') return getStorageCookie('tg_studio_hours_sat', '10:00 AM – 06:00 PM')
    return '10:00 AM – 06:00 PM'
  })
  const [hoursSunday, setHoursSunday] = useState(() => {
    if (typeof window !== 'undefined') return getStorageCookie('tg_studio_hours_sun', 'Closed for Rest')
    return 'Closed for Rest'
  })
  const [isEditingHours, setIsEditingHours] = useState(false)
  const [editHoursWd, setEditHoursWd] = useState('09:00 AM – 07:00 PM')
  const [editHoursSat, setEditHoursSat] = useState('10:00 AM – 06:00 PM')
  const [editHoursSun, setEditHoursSun] = useState('Closed for Rest')

  const [capabilities, setCapabilities] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = getStorageCookie('tg_studio_capabilities')
      if (stored) {
        try { return JSON.parse(stored) } catch { }
      }
    }
    return [
      'Suit Tailoring & Formalwear',
      'Dress Hemming & Gown Fit',
      'Denim Chainstitch & Alterations',
      'Zip Replacements & Repairs',
    ]
  })
  const [newCapability, setNewCapability] = useState('')
  const [showAddCap, setShowAddCap] = useState(false)
  const [studioNotice, setStudioNotice] = useState<string | null>(null)
  const [capacityLimit, setCapacityLimit] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = getStorageCookie('tg_studio_capacity')
      if (stored) return parseInt(stored) || 25
    }
    return 25
  })

  const handleSetCapacity = (val: number) => {
    setCapacityLimit(val)
    if (typeof window !== 'undefined') {
      setStorageCookie('tg_studio_capacity', val.toString())
    }
    setStudioNotice(`Daily intake limit set to ${val} garments/day`)
    setTimeout(() => setStudioNotice(null), 3000)
  }

  const toggleCapability = (cap: string) => {
    const updated = capabilities.includes(cap)
      ? capabilities.filter(c => c !== cap)
      : [...capabilities, cap]
    setCapabilities(updated)
    if (typeof window !== 'undefined') {
      setStorageCookie('tg_studio_capabilities', JSON.stringify(updated))
    }
    setStudioNotice(`Updated capability: ${cap}`)
    setTimeout(() => setStudioNotice(null), 2500)
  }

  const handleAddCapability = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCapability.trim()) return
    const trimmed = newCapability.trim()
    if (!capabilities.includes(trimmed)) {
      const updated = [...capabilities, trimmed]
      setCapabilities(updated)
      if (typeof window !== 'undefined') {
        setStorageCookie('tg_studio_capabilities', JSON.stringify(updated))
      }
      setStudioNotice(`Added specialism: ${trimmed}`)
      setTimeout(() => setStudioNotice(null), 2500)
    }
    setNewCapability('')
    setShowAddCap(false)
  }

  const handleSaveHours = () => {
    setHoursWeekday(editHoursWd)
    setHoursSaturday(editHoursSat)
    setHoursSunday(editHoursSun)
    if (typeof window !== 'undefined') {
      setStorageCookie('tg_studio_hours_wd', editHoursWd)
      setStorageCookie('tg_studio_hours_sat', editHoursSat)
      setStorageCookie('tg_studio_hours_sun', editHoursSun)
    }
    setIsEditingHours(false)
    setStudioNotice('Workshop operating schedule updated')
    setTimeout(() => setStudioNotice(null), 2500)
  }

  const selectedOrderRef = useRef<FittingBooking | null>(null)
  selectedOrderRef.current = selectedOrder

  const updateOrdersAndSelected = (fetched: FittingBooking[]) => {
    setOrders(fetched)
    if (fetched.length === 0) {
      setSelectedOrder(null)
      return
    }

    const currentSelectedId = selectedOrderRef.current?.id
    if (currentSelectedId) {
      const stillExists = fetched.find((o) => o.id === currentSelectedId)
      setSelectedOrder(stillExists || null)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const fetched = await fetchStudioOrders(currentStudioId)
      if (fetched) {
        updateOrdersAndSelected(fetched)
      }
    } catch { }
    setRefreshing(false)
  }

  // Polling backend orders every 2.5s
  useEffect(() => {
    handleRefresh()
    const interval = setInterval(() => {
      if (online) {
        fetchStudioOrders(currentStudioId).then((fetched) => {
          if (fetched) {
            updateOrdersAndSelected(fetched)
          }
        }).catch(() => { })
      }
    }, 2500)

    return () => clearInterval(interval)
  }, [currentStudioId, online])

  // Listen for instant 0ms cross-tab cancellation broadcasts
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('tg_dispatch_channel')
      bc.onmessage = (event) => {
        if (event.data?.type === 'DISPATCH_CANCELLED' && event.data?.orderId) {
          const cancelledId = event.data.orderId
          setPendingDispatches((prev) => prev.filter((p) => p.orderId !== cancelledId))
          setOrders((prev) => prev.filter((o) => o.id !== cancelledId || o.status !== 'Allocated'))
          if (broadcastExpiryRef.current?.key?.startsWith(cancelledId)) {
            broadcastExpiryRef.current = null
          }
        }
      }
    } catch { }

    return () => {
      if (bc) bc.close()
    }
  }, [])

  // Single Dispatch Session Listener - Live Pending Dispatches Feed (1s interval)
  useEffect(() => {
    if (!online || !currentStudioId) {
      setPendingDispatches([])
      return
    }

    const checkDispatches = async () => {
      try {
        if (!currentStudioId) return
        const pending = await fetchPendingDispatches(currentStudioId)
        if (Array.isArray(pending)) {
          setPendingDispatches(pending)
        }
      } catch { }
    }

    checkDispatches()
    const dispatchInterval = setInterval(checkDispatches, 1000)
    return () => clearInterval(dispatchInterval)
  }, [online, currentStudioId])

  // Live incoming requests from real customer bookings (Status: Allocated)
  // Re-broadcasts every 2 minutes until accepted by a studio, UNLESS explicitly skipped by THIS studio.
  const liveAllocatedOrders = orders.filter((o) => {
    if (o.status !== 'Allocated') return false
    if (permanentlySkippedIds.includes(o.id)) return false // Explicitly skipped by THIS studio -> never show again!
    const timeoutTs = timeoutTimestamps[o.id]
    if (timeoutTs && Date.now() - timeoutTs < 120000) {
      return false // Unattended 15s timer expiry -> hide for 2 minutes before re-broadcasting
    }
    return true
  })

  // Map incoming dispatch requests (Single Dispatch Engine in Server Cache)
  const dispatchBroadcasts: BroadcastRequest[] = pendingDispatches
    .filter((pd) => !permanentlySkippedIds.includes(pd.orderId))
    .map((pd) => ({
      id: pd.orderId,
      customerName: pd.customerName || pd.order?.customerName || 'Customer',
      customerArea: pd.distance ? `${pd.distance} · Stage ${pd.stage || 1}` : 'Local Area · 0.8 mi away',
      distanceMiles: pd.distanceMiles || 0.8,
      garmentName: pd.garmentName || pd.order?.garmentName || 'Garment Alteration',
      serviceName: pd.serviceName || pd.order?.serviceName || 'Custom Fit & Alteration',
      fittingType: 'NEED_STUDIO_FITTING',
      garmentBrand: pd.order?.garmentBrand || '',
      fitNotes: pd.order?.fitNotes || 'Customer requested standard alteration pinning at counter.',
      partnerPayout: pd.payout || pd.order?.partnerPayout || 15,
      slaHours: pd.order?.slaHours || 48,
      imageUrl: pd.order?.imageUrl || pd.order?.intakePhotoUrl || '',
      otp: pd.order?.otp || '0000',
      isDispatchSession: true,
      secondsRemaining: pd.secondsRemaining,
      stage: pd.stage,
    }))

  // Map live allocated orders from database (real customer alteration bookings)
  const allocatedBroadcasts: BroadcastRequest[] = liveAllocatedOrders.map((o) => ({
    id: o.id,
    customerName: o.customerName || 'Valued Customer',
    customerArea: o.postcode ? `${o.postcode} · Local Area` : 'Local Area · 0.8 mi away',
    distanceMiles: 0.8,
    garmentName: o.garmentName || 'Garment Alteration',
    serviceName: o.serviceName || 'Custom Fit & Alteration',
    fittingType: 'NEED_STUDIO_FITTING' as const,
    garmentBrand: o.garmentBrand || '',
    fitNotes: o.fitNotes || o.pinnedAdjustment || 'Customer requested alteration fitting.',
    partnerPayout: o.partnerPayout || Math.round((o.price || 30) * 0.75),
    slaHours: o.slaHours || 48,
    imageUrl: o.intakePhotoUrl || (o as any).imageUrl || '',
    otp: o.otp || '0000',
    isRealCustomerOrder: true,
    realOrder: o,
    secondsRemaining: 15,
    stage: 1,
  }))

  // Merge live cache dispatch sessions and database allocated alteration bookings
  const dispatchOrderIds = new Set(dispatchBroadcasts.map((d) => d.id))
  const uniqueAllocatedBroadcasts = allocatedBroadcasts.filter((a) => !dispatchOrderIds.has(a.id))
  const allBroadcasts: BroadcastRequest[] = [...dispatchBroadcasts, ...uniqueAllocatedBroadcasts]

  const currentBroadcast = allBroadcasts.length > 0 ? allBroadcasts[broadcastIdx % allBroadcasts.length] : null
  const currentBroadcastKey = currentBroadcast ? `${currentBroadcast.id}-stage-${currentBroadcast.stage || 1}` : null

  const handleAcceptAllocatedOrder = async (order: FittingBooking) => {
    const assignedStudioId = currentStudioId
    const assignedStudioName = (user?.studioName && user.studioName.trim()) || studioName || (user?.name ? `${user.name}'s Atelier` : 'Partner Atelier')
    const assignedStudioPhone = user?.phone || user?.contact || ''
    const partnerPayout = order.partnerPayout || Math.round((order.price || 30) * 0.75)

    const updates: Partial<FittingBooking> = {
      status: 'Accepted',
      storeId: assignedStudioId,
      storeName: assignedStudioName,
      ...(assignedStudioPhone ? { storePhone: assignedStudioPhone } : {}),
      partnerPayout,
    }

    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...updates } : o)))
    setTimerSecs(15)
    setTimerProgress(100)
    await updateOrder(order.id, updates).catch(() => { })
  }

  const handleAcceptBroadcast = async (bc: BroadcastRequest) => {
    // 1. Live Dispatch Cache Request -> respond with ACCEPT
    if (bc.isDispatchSession) {
      if (!currentStudioId) return
      const res = await respondToDispatch(bc.id, currentStudioId, 'ACCEPT')
      if (res.success) {
        setBroadcastToast(`⚡ Order #${bc.id} accepted! Added to workshop queue.`)
        setTimeout(() => setBroadcastToast(null), 5000)
        setPendingDispatches((prev) => prev.filter((p) => p.orderId !== bc.id))

        // ✅ Immediately promote the newly created order from 'Allocated' → 'Accepted'
        // so it becomes visible in the pipeline (pipelineOrders filters out 'Allocated')
        const studioDisplayName =
          (user?.studioName && user.studioName.trim()) ||
          studioName ||
          (user?.name ? `${user.name}'s Atelier` : 'Partner Atelier')
        const promotionUpdates = {
          status: 'Accepted' as const,
          storeId: currentStudioId,
          storeName: studioDisplayName,
          ...(user?.phone ? { storePhone: user.phone } : {}),
        }
        // Optimistic UI update
        setOrders((prev) =>
          prev.map((o) => (o.id === bc.id ? { ...o, ...promotionUpdates } : o))
        )
        // Persist to DB
        updateOrder(bc.id, promotionUpdates).catch(() => {})

        handleRefresh()
      } else {
        if (res.code === 'ORDER_ALREADY_ASSIGNED') {
          setBroadcastToast('Order was accepted by another partner atelier.')
        } else {
          setBroadcastToast(res.message || 'Unable to accept request.')
        }
        setTimeout(() => setBroadcastToast(null), 4000)
        setPendingDispatches((prev) => prev.filter((p) => p.orderId !== bc.id))
      }
      return
    }

    // 2. Database Allocated Order
    if (bc.isRealCustomerOrder && bc.realOrder) {
      await handleAcceptAllocatedOrder(bc.realOrder)
      setBroadcastToast(`⚡ Order #${bc.id} accepted! Added to workshop queue.`)
      setTimeout(() => setBroadcastToast(null), 5000)
      handleRefresh()
    }
  }

  const handleSkipBroadcast = async (bc?: BroadcastRequest | null) => {
    if (!bc) return
    // Explicitly clicked Skip -> permanently hide for THIS studio!
    setPermanentlySkippedIds((prev) => Array.from(new Set([...prev, bc.id])))
    broadcastExpiryRef.current = null
    setTimerSecs(15)
    setTimerProgress(100)

    if (bc.isDispatchSession && currentStudioId) {
      respondToDispatch(bc.id, currentStudioId, 'SKIP').catch(() => { })
      setPendingDispatches((prev) => prev.filter((p) => p.orderId !== bc.id))
    }
  }

  // Smooth Timestamp-Based Timer (50ms continuous ticker, re-anchored on every stage transition)
  useEffect(() => {
    if (!online || !currentBroadcast || !currentBroadcastKey) {
      broadcastExpiryRef.current = null
      setTimerSecs(15)
      setTimerProgress(100)
      return
    }

    const bKey = currentBroadcastKey
    const bId = currentBroadcast.id
    const serverRemainingSec =
      typeof currentBroadcast.secondsRemaining === 'number' && currentBroadcast.secondsRemaining > 0
        ? currentBroadcast.secondsRemaining
        : 15

    // Initialize or re-anchor expiry timestamp when broadcast OR stage changes
    if (!broadcastExpiryRef.current || broadcastExpiryRef.current.key !== bKey) {
      const remainingMs = Math.max(1000, Math.min(15, serverRemainingSec) * 1000)
      broadcastExpiryRef.current = {
        key: bKey,
        expiresAt: Date.now() + remainingMs,
        totalDurationMs: 15000,
      }
      setTimerProgress(Math.max(0, Math.min(100, (remainingMs / 15000) * 100)))
      setTimerSecs(Math.ceil(remainingMs / 1000))
    }

    const interval = setInterval(() => {
      if (!broadcastExpiryRef.current || broadcastExpiryRef.current.key !== bKey) return

      const now = Date.now()
      const remainingMs = broadcastExpiryRef.current.expiresAt - now

      if (remainingMs <= 0) {
        // Unattended timer expired -> suppress locally for 2 minutes, then repeat
        setTimeoutTimestamps((tPrev) => ({ ...tPrev, [bId]: Date.now() }))
        broadcastExpiryRef.current = null
        setTimerSecs(15)
        setTimerProgress(0)
      } else {
        const secs = Math.ceil(remainingMs / 1000)
        const pct = Math.max(0, Math.min(100, (remainingMs / broadcastExpiryRef.current.totalDurationMs) * 100))
        setTimerSecs(secs)
        setTimerProgress(pct)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [online, currentBroadcastKey])

  // Status updates
  const handleUpdateStatus = (id: string, newStatus: OrderStatus) => {
    const updates: Partial<FittingBooking> = { status: newStatus }
    if (newStatus === 'Ready') {
      const freshPickupOtp = Math.floor(1000 + Math.random() * 9000).toString()
      updates.otp = freshPickupOtp
      updates.pickupOtpGenerated = true
      setGeneratedOtpMap((prev) => ({ ...prev, [id]: freshPickupOtp }))
    }
    if (newStatus === 'Work in Progress') {
      const existing = orders.find((o) => o.id === id)
      if (!existing?.slaStartedAt) updates.slaStartedAt = new Date().toISOString()
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
    if (selectedOrder?.id === id) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : prev))
    }
    updateOrder(id, updates).catch(() => { })
  }

  // Mark alteration done -> Moves to Ready & sets fresh secure pickup OTP in backend
  const handleMarkAlterationDone = (orderId: string) => {
    const freshPickupOtp = Math.floor(1000 + Math.random() * 9000).toString()
    const updates: Partial<FittingBooking> = {
      status: 'Ready',
      otp: freshPickupOtp,
      pickupOtpGenerated: true,
    }
    setGeneratedOtpMap((prev) => ({ ...prev, [orderId]: freshPickupOtp }))
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)))
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : prev))
    }
    updateOrder(orderId, updates).catch(() => { })
  }

  // Studio triggers Pickup OTP generation on demand
  const handleGeneratePickupOtp = async (orderId: string) => {
    const freshOtp = Math.floor(1000 + Math.random() * 9000).toString()
    const updates: Partial<FittingBooking> = {
      otp: freshOtp,
      pickupOtpGenerated: true,
    }
    setGeneratedOtpMap((prev) => ({ ...prev, [orderId]: freshOtp }))
    setJustGeneratedOtpMap((prev) => ({ ...prev, [orderId]: true }))
    setTimeout(() => {
      setJustGeneratedOtpMap((prev) => ({ ...prev, [orderId]: false }))
    }, 4000)

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates, pickupOtpGenerated: true } : o)))
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates, pickupOtpGenerated: true } : prev))
    }
    updateOrder(orderId, updates).catch(() => { })

    // Dispatch SMS to customer if phone exists
    const targetOrder = orders.find((o) => o.id === orderId)
    if (targetOrder?.customerPhone) {
      fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetOrder.customerPhone, otp: freshOtp }),
      }).catch(() => {})
    }

    setBroadcastToast(`🔑 Pickup OTP (${freshOtp}) generated & sent to customer!`)
    setTimeout(() => setBroadcastToast(null), 4000)
  }

  // Tailor verifies customer pickup OTP inline right next to the pickup button
  const handleVerifyInlinePickup = (orderId: string) => {
    const target = orders.find((o) => o.id === orderId)
    if (!target) return
    const inputPin = (inlinePickupInput[orderId] || '').trim()

    if (inputPin && isOrderPinMatch(target, inputPin)) {
      setInlinePickupError((prev) => ({ ...prev, [orderId]: '' }))
      // 🌟 Trigger Aftereffect Success Animation State
      setVerifyingHandoverMap((prev) => ({ ...prev, [orderId]: true }))

      // Hold aftereffect animation for 1200ms for visual delight before status transition
      setTimeout(() => {
        const updates: Partial<FittingBooking> = {
          status: 'Closed',
        }
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)))
        if (selectedOrder?.id === orderId) {
          setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : prev))
        }
        updateOrder(orderId, updates).catch(() => { })
        setVerifyingHandoverMap((prev) => ({ ...prev, [orderId]: false }))
        setBroadcastToast(`✓ Pickup Verified & Garment Handed Over!`)
        setTimeout(() => setBroadcastToast(null), 4000)
      }, 1200)
    } else {
      setInlinePickupError((prev) => ({ ...prev, [orderId]: 'Invalid PIN' }))
    }
  }

  // Intake with customer PIN - strictly for Accepted drop-offs
  const handleLookupPin = (pin: string) => {
    setPinError('')
    const clean = pin.trim()
    if (!clean) return

    // Strictly match an Accepted order waiting for drop-off
    const acceptedOrder = orders.find(
      (o) => o.status === 'Accepted' && isOrderPinMatch(o, clean)
    )

    if (acceptedOrder) {
      setActiveIntake(acceptedOrder)
      setHangTag(acceptedOrder.hangTagNo || '')
      setConditionNotes(acceptedOrder.fabricConditionNotes || '')
      const parsed = parseOrderMeasurements(acceptedOrder)
      setMeasHem(cleanMeasurementVal(parsed.hem || parsed.hemLine || parsed.hemLength || parsed.delicateHem || ''))
      setMeasWaist(cleanMeasurementVal(parsed.waist || parsed.waistHips || parsed.waistSuppression || ''))
      setMeasSleeve(cleanMeasurementVal(parsed.sleeve || parsed.sleeveLength || ''))
      setMeasInseam(cleanMeasurementVal(parsed.inseam || parsed.trouserInseamWaist || ''))
      setMeasCustom(cleanMeasurementVal(parsed.custom || parsed.notes || ''))
      setSewNotes(acceptedOrder.sewingNotes || '')
      setIntakeSuccess(false)
      setPriceAdjustApproved(false)
      setShowPriceAdjust(false)
      setIsEditingIntakeMeas(false)

      const entries = Object.entries(parsed)
      if (entries.length > 0) {
        setIntakeMeasFields(
          entries.map(([k, v]) => ({
            key: k,
            label: formatMeasurementKey(k),
            value: String(v),
          }))
        )
      } else {
        setIntakeMeasFields([
          { key: 'hem', label: 'Hem Adjustment', value: '' },
          { key: 'waist', label: 'Waist / Seat', value: '' },
          { key: 'sleeve', label: 'Sleeve Length', value: '' },
          { key: 'inseam', label: 'Finished Inseam', value: '' },
        ])
      }
      return
    }

    // Check other statuses to give helpful feedback
    const otherOrder = orders.find(
      (o) => isOrderPinMatch(o, clean)
    )

    if (otherOrder) {
      if (otherOrder.status === 'Work in Progress') {
        setPinError(`Order #${otherOrder.id} (${otherOrder.customerName}) is already on the sewing bench.`)
      } else if (otherOrder.status === 'Ready') {
        setPinError(`Order #${otherOrder.id} is already completed and ready on the rack for pickup.`)
      } else if (otherOrder.status === 'Closed' || otherOrder.status === 'Collected') {
        setPinError(`Order #${otherOrder.id} has already been completed and collected.`)
      } else if (otherOrder.status === 'Allocated') {
        setPinError(`Order #${otherOrder.id} is an incoming dispatch. Please accept it first.`)
      } else {
        setPinError(`Order #${otherOrder.id} is currently in "${otherOrder.status}" status.`)
      }
      return
    }

    setPinError(`No scheduled drop-off found with PIN "${clean}".`)
  }

  const handleConfirmIntakeAndStart = () => {
    if (!activeIntake) return
    const originalMeas = parseOrderMeasurements(activeIntake)
    const measurementsMap: Record<string, string> = { ...originalMeas }
    if (measHem) measurementsMap.hem = measHem
    if (measWaist) measurementsMap.waist = measWaist
    if (measSleeve) measurementsMap.sleeve = measSleeve
    if (measInseam) measurementsMap.inseam = measInseam
    if (measCustom) measurementsMap.custom = measCustom

    intakeMeasFields.forEach((f) => {
      if (f.value && f.value.trim()) {
        measurementsMap[f.key] = f.value.trim()
      }
    })

    const combinedSpecs = Object.entries(measurementsMap)
      .map(([k, v]) => `${formatMeasurementKey(k)}: ${v}`)
      .join(' · ')

    const updates: Partial<FittingBooking> = {
      status: 'Work in Progress',
      hangTagNo: hangTag,
      fabricConditionNotes: conditionNotes,
      pinnedAdjustment: combinedSpecs || 'Standard alteration',
      measurements: measurementsMap,
      sewingNotes: sewNotes,
      assignedWorker: worker,
      machineNo: machine,
      slaStartedAt: new Date().toISOString(),
      priceAdjustment: priceAdjustApproved ? parseFloat(priceAdjustAmount || '0') : 0,
      priceAdjustmentReason: priceAdjustApproved ? priceAdjustReason : undefined,
      priceAdjustmentStatus: priceAdjustApproved ? 'APPROVED' : 'NONE',
    }

    setOrders((prev) => prev.map((o) => (o.id === activeIntake.id ? { ...o, ...updates } : o)))
    setIntakeSuccess(true)
    updateOrder(activeIntake.id, updates).catch(() => { })

    setTimeout(() => {
      setActiveIntake(null)
      setIntakeSuccess(false)
      setPinInput('')
      setSelectedOrder(orders.find((o) => o.id === activeIntake.id) || activeIntake)
      setBroadcastToast(`✓ Placed on Sewing Bench: ${activeIntake.customerName} (${hangTag})`)
      setTimeout(() => setBroadcastToast(null), 4000)
    }, 1200)
  }

  // Edit measurements
  const handleOpenEditMeasurements = (order: FittingBooking) => {
    setEditTargetOrder(order)
    const parsed = parseOrderMeasurements(order)
    const entries = Object.entries(parsed)
    if (entries.length > 0) {
      setEditMeasFields(
        entries.map(([k, v]) => ({
          key: k,
          label: formatMeasurementKey(k),
          value: String(v),
        }))
      )
    } else {
      setEditMeasFields([
        { key: 'hem', label: 'Hem Adjustment', value: '' },
        { key: 'waist', label: 'Waist / Seat', value: '' },
        { key: 'sleeve', label: 'Sleeves / Cuffs', value: '' },
        { key: 'inseam', label: 'Finished Inseam', value: '' },
      ])
    }
    setIsEditMeasOpen(true)
  }

  const handleSaveMeasurements = () => {
    if (!editTargetOrder) return
    const updatedMap: Record<string, string> = {}
    editMeasFields.forEach((f) => {
      if (f.key && f.value !== undefined && f.value.trim()) {
        updatedMap[f.key] = f.value.trim()
      }
    })

    const combinedSpecs = Object.entries(updatedMap)
      .map(([k, v]) => `${formatMeasurementKey(k)}: ${v}`)
      .join(' · ')

    const updates: Partial<FittingBooking> = {
      pinnedAdjustment: combinedSpecs || 'Standard alteration',
      measurements: updatedMap,
    }

    setOrders((prev) => prev.map((o) => (o.id === editTargetOrder.id ? { ...o, ...updates } : o)))
    if (selectedOrder?.id === editTargetOrder.id) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : prev))
    }
    if (activeIntake?.id === editTargetOrder.id) {
      setActiveIntake((prev) => (prev ? { ...prev, ...updates } : prev))
    }
    updateOrder(editTargetOrder.id, updates).catch(() => { })
    setIsEditMeasOpen(false)
    setEditTargetOrder(null)
  }

  // Pickup verification & retail settlement
  const handleOpenPickupModal = (order: FittingBooking) => {
    setPickupModalOrder(order)
    setPickupOtpInput('')
    setPickupOtpError('')
    setPickupVerified(false)
    setRetailAnswer(null)
    setRetailValueInput('45')
    setRetailCategoryInput('Accessories & Ties')
    setPickupCompleted(false)
  }

  const handleVerifyPickupOtp = () => {
    if (!pickupModalOrder) return
    const clean = pickupOtpInput.trim()
    if (isOrderPinMatch(pickupModalOrder, clean)) {
      setPickupVerified(true)
      setPickupOtpError('')
    } else {
      setPickupOtpError(`Incorrect PIN "${clean}". Check with customer.`)
    }
  }

  const handleCompletePickupAndSettlement = () => {
    if (!pickupModalOrder) return
    const hasRetail = retailAnswer === 'YES'
    const retailVal = hasRetail ? 45 : undefined
    const retailCat = hasRetail ? 'Accessories & Ties' : undefined

    const updates: Partial<FittingBooking> = {
      status: 'Closed',
      retailSold: hasRetail,
      retailValue: retailVal,
      retailCategory: retailCat,
    }

    setOrders((prev) => prev.map((o) => (o.id === pickupModalOrder.id ? { ...o, ...updates } : o)))
    if (selectedOrder?.id === pickupModalOrder.id) {
      setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : prev))
    }
    updateOrder(pickupModalOrder.id, updates).catch(() => { })

    setPickupCompleted(true)
    setTimeout(() => {
      setPickupModalOrder(null)
      setPickupCompleted(false)
      setBroadcastToast(`✓ Order Handover Complete! Earnings Credited.`)
      setTimeout(() => setBroadcastToast(null), 5000)
    }, 1500)
  }

  // Stats computed from real database orders
  const todayEarned = orders
    .filter((o) => ['Work in Progress', 'Ready', 'Collected', 'Closed'].includes(o.status))
    .reduce((sum, o) => sum + (o.partnerPayout || Math.round((o.price || 35) * 0.8)), 0)

  const totalClosedDisbursed = orders
    .filter((o) => o.status === 'Closed' || o.status === 'Collected')
    .reduce((sum, o) => sum + (o.partnerPayout || Math.round((o.price || 35) * 0.8)), 0)

  const pipelineOrders = orders.filter((o) => o.status !== 'Allocated')

  const activeOnBench = pipelineOrders.filter((o) => o.status === 'Work in Progress').length
  const pendingDropOffs = pipelineOrders.filter((o) => o.status === 'Accepted').length
  const readyOnRack = pipelineOrders.filter((o) => o.status === 'Ready').length

  const filteredOrders = pipelineOrders.filter((o) => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.hangTagNo && o.hangTagNo.toLowerCase().includes(q)) ||
      (o.garmentName && o.garmentName.toLowerCase().includes(q))
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  // Timer circumference for circular progress
  const timerRadius = 22
  const timerCircumference = 2 * Math.PI * timerRadius
  const timerStrokeDashoffset = timerCircumference - (timerSecs / 15) * timerCircumference

  // PIN keypad helper
  const handleKeypadPress = (val: string) => {
    if (val === 'CLEAR') {
      setPinInput('')
      setPinError('')
      return
    }
    if (val === 'BACK') {
      setPinInput((prev) => prev.slice(0, -1))
      setPinError('')
      return
    }
    if (pinInput.length < 4) {
      const nextPin = pinInput + val
      setPinInput(nextPin)
      setPinError('')
      if (nextPin.length === 4) {
        handleLookupPin(nextPin)
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                     */
  /* ═══════════════════════════════════════════════════════════════════════════ */
  /* LUXURY ATELIER WORKBENCH — SIGNATURE WARM CREAM & TERRACOTTA PALETTE        */
  /* ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">

      {/* ── MOBILE BACKDROP ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-fadeIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SIDEBAR — OBSIDIAN LUXURY ATELIER NODE                                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-50 md:z-30
          h-screen
          bg-[#0A0D14] text-white
          flex flex-col border-r border-slate-800/80
          sidebar-transition shadow-2xl
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarCollapsed ? 'w-20' : 'w-72'}
        `}
      >
        {/* Sidebar Header: Brand & Workshop Node */}
        <div className={`flex items-center gap-3 px-4 h-18 border-b border-slate-800/80 shrink-0 ${sidebarCollapsed ? 'justify-center' : ''}`}>
          {!sidebarCollapsed ? (
            <>
              <div className="size-10 rounded-xl bg-gradient-to-br from-[#9E593B] to-[#7D3E24] text-white grid place-items-center shrink-0 shadow-md ring-1 ring-white/15">
                <Scissors size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-white truncate leading-tight tracking-tight">
                  {studioName}
                </div>
                <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-slate-300 font-medium">Workshop Node</span>
                  <span className="text-slate-500 font-mono text-[10px]">#{currentStudioId.slice(-6)}</span>
                </div>
              </div>
              {/* Collapse button — desktop only */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="hidden md:grid size-8 place-items-center hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
              {/* Close button — mobile only */}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="md:hidden grid size-8 place-items-center hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="size-10 rounded-xl bg-gradient-to-br from-[#9E593B] to-[#7D3E24] text-white grid place-items-center cursor-pointer hover:opacity-90 transition-all shadow-md ring-1 ring-white/15"
              title="Expand sidebar"
            >
              <Scissors size={18} />
            </button>
          )}
        </div>

        {/* Online Status Toggle Capsule */}
        <div className={`p-3.5 border-b border-slate-800/60 shrink-0 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setOnline(!online)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${online
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/50 shadow-xs'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex items-center justify-center shrink-0">
                  <span className={`size-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {online && <span className="absolute size-4 rounded-full bg-emerald-400/40 animate-ping" />}
                </div>
                <span className="truncate">{online ? 'Workshop Active' : 'Workshop Offline'}</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold tracking-wider shrink-0 ${online ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                {online ? 'RECEIVING' : 'PAUSED'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOnline(!online)}
              className="grid place-items-center cursor-pointer p-2.5 rounded-xl hover:bg-white/10"
              title={online ? 'Workshop Active — Click to pause' : 'Workshop Offline — Click to activate'}
            >
              <span className={`size-3 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            </button>
          )}
        </div>

        {/* Nav Items — The 4 Core Workshop Pillars */}
        <nav className="flex-1 p-3.5 pt-4 space-y-3 overflow-y-auto scrollbar-none">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id
            const Icon = item.icon
            const badge =
              item.id === 'cockpit' && allBroadcasts.length > 0 ? allBroadcasts.length :
                item.id === 'pipeline' ? pendingDropOffs : null

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false) }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`
                  w-full flex items-center gap-3.5 text-[13px] font-semibold rounded-xl transition-all cursor-pointer
                  ${sidebarCollapsed ? 'justify-center p-3' : 'px-4 py-3.5'}
                  ${active
                    ? 'bg-gradient-to-r from-[#9E593B] to-[#B36846] text-white shadow-md shadow-[#9E593B]/25 ring-1 ring-white/15'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <Icon size={19} className={active ? 'text-white' : 'text-slate-400 shrink-0'} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {badge !== null && badge > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full leading-none shadow-2xs ${item.id === 'cockpit' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/20 text-white'
                        }`}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* User / Studio Footer */}
        <div className={`p-3.5 border-t border-slate-800/80 space-y-1.5 shrink-0 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
          {!sidebarCollapsed && (
            <div
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div className="size-8 rounded-full bg-gradient-to-br from-[#9E593B] to-[#7D3E24] text-white text-xs font-bold grid place-items-center shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={tailorName} className="size-full object-cover rounded-full" />
                ) : (
                  tailorName.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{tailorName}</div>
                <div className="text-[10px] text-slate-400 truncate">{user?.area || user?.postcode || 'Partner Tailor'}</div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh Order Feed"
            className={`flex items-center gap-2.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all cursor-pointer
              ${sidebarCollapsed ? 'size-9 justify-center' : 'w-full px-3.5 py-2'}`}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#9E593B]' : ''} />
            {!sidebarCollapsed && <span>Sync Feed</span>}
          </button>

          <button
            type="button"
            onClick={() => {
              if (onSignOut) onSignOut()
              else go('partner')
            }}
            title="Sign Out"
            className={`flex items-center gap-2.5 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-xl transition-all cursor-pointer
              ${sidebarCollapsed ? 'size-9 justify-center' : 'w-full px-3.5 py-2'}`}
          >
            <LogOut size={14} />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MAIN WORKBENCH DESK — CLEAN SLATE MODERN SAAS                            */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8FAFC]">

        {/* ── UNIFIED TOP STATUS BAR ── */}
        <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 flex items-center px-4 lg:px-8 gap-4 shrink-0 z-20 shadow-2xs">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden size-9 grid place-items-center rounded-xl hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            <Menu size={18} />
          </button>

          {/* Dynamic Section Title & Subtitle */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {activeTab === 'cockpit' && 'Workshop Cockpit'}
                {activeTab === 'pipeline' && 'Alterations Pipeline'}
                {activeTab === 'payouts' && 'Payouts & Escrow Ledger'}
                {activeTab === 'profile' && 'Studio Node Configuration'}
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Node
              </span>
            </div>
            <span className="text-[11px] text-slate-500 truncate hidden sm:block">
              {activeTab === 'cockpit' && 'Express counter intake, PIN verification & active bench SLA clock'}
              {activeTab === 'pipeline' && 'Manage orders across intake, sewing bench, QA, and customer collection'}
              {activeTab === 'payouts' && 'Daily payouts with 80% net guaranteed via instant bank settlement'}
              {activeTab === 'profile' && 'Manage atelier equipment, specialisms, operating hours & contact info'}
            </span>
          </div>

          <div className="flex-1" />

          {/* Right Status Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Metrics Capsules */}
            <div className="hidden xl:flex items-center gap-2 text-xs bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 font-medium">
              <div className="px-2.5 py-1 rounded-lg bg-white shadow-2xs text-slate-800 font-bold flex items-center gap-1.5">
                <span className="text-emerald-700">${todayEarned}</span>
                <span className="text-[10px] text-slate-400 font-normal">Earned</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg text-slate-600 flex items-center gap-1">
                <span className="font-bold text-slate-800">{activeOnBench}</span>
                <span className="text-[10px] text-slate-400">Bench</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg text-slate-600 flex items-center gap-1">
                <span className="font-bold text-slate-800">{pendingDropOffs}</span>
                <span className="text-[10px] text-slate-400">Arrivals</span>
              </div>
            </div>


            {/* Refresh Feed */}
            <button
              type="button"
              onClick={handleRefresh}
              title="Sync Feed with Cloud"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-[#9E593B]' : 'text-slate-500'} />
              <span className="hidden md:inline">Sync</span>
            </button>

            {/* Online Toggle Switch */}
            <button
              type="button"
              onClick={() => setOnline(!online)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${online
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
              title={online ? 'Studio Active · Click to pause' : 'Studio Inactive · Click to activate'}
            >
              <span className={`size-2 rounded-full shrink-0 ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="hidden sm:inline">{online ? 'Active' : 'Paused'}</span>
            </button>

            {/* Master Tailor Profile Pill */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              title="Edit Studio Profile & Configuration"
              className="flex items-center gap-2.5 pl-3 border-l border-slate-200 hover:opacity-85 transition-opacity cursor-pointer group text-left"
            >
              <div className="size-8 rounded-full bg-gradient-to-br from-[#9E593B] to-[#7D3E24] text-white text-xs font-bold flex items-center justify-center shadow-2xs ring-2 ring-[#9E593B]/20 group-hover:scale-105 transition-transform overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt={tailorName} className="size-full object-cover" />
                ) : (
                  tailorName.charAt(0)
                )}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[130px] group-hover:text-[#9E593B] transition-colors">{tailorName}</div>
                <div className="text-[10px] text-[#9E593B] font-semibold">Master Tailor ✎</div>
              </div>
            </button>
          </div>
        </header>

        {/* ── SCROLLABLE WORKSPACE ── */}
        <main className="flex-1 overflow-y-auto">

          {/* ── TOP-CENTER FLOATING INCOMING DISPATCH NOTIFICATION ── */}
          {online && currentBroadcast && currentBroadcastKey ? (
            <div
              key={currentBroadcastKey}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl shadow-2xl transition-all duration-300 animate-in slide-in-from-top-4 fade-in"
            >
              <div className="bg-[#0F1115]/95 backdrop-blur-md text-white rounded-2xl p-4 shadow-2xl border border-[#9E593B]/60 relative overflow-hidden ring-1 ring-white/10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left: Garment Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative size-14 rounded-xl bg-stone-800 overflow-hidden shrink-0 border border-white/10 shadow-inner">
                      <img
                        src={getGarmentPhoto({ intakePhotoUrl: currentBroadcast.imageUrl, garmentName: currentBroadcast.garmentName })}
                        alt={currentBroadcast.garmentName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#9E593B] text-white rounded-md shadow-sm">
                          {currentBroadcast.isRealCustomerOrder ? 'New Alteration Request' : 'Incoming Dispatch'}
                        </span>
                        {currentBroadcast.garmentBrand && (
                          <span className="text-[10px] text-stone-300 bg-white/10 px-1.5 py-0.5 rounded-md">
                            {currentBroadcast.garmentBrand}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-white truncate">{currentBroadcast.garmentName}</h3>

                      <div className="flex items-center gap-2 text-[11px] text-stone-400">
                        <span className="text-stone-300 font-medium">{currentBroadcast.serviceName}</span>
                        <span>·</span>
                        <span>{currentBroadcast.customerArea}</span>
                        <span>·</span>
                        <span className="text-emerald-400 font-medium">{currentBroadcast.slaHours}h SLA</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Payout + Actions */}
                  <div className="flex items-center gap-3.5 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-white/10">
                    <div className="text-left sm:text-right pr-1">
                      <span className="text-[9px] uppercase tracking-wider text-stone-400 font-medium block leading-none mb-0.5">Net Payout</span>
                      <div className="text-xl font-bold text-emerald-400 leading-tight">${currentBroadcast.partnerPayout}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSkipBroadcast(currentBroadcast)}
                        className="px-3.5 py-1.5 rounded-full border border-white/20 hover:bg-white/10 text-xs font-medium text-stone-300 transition-colors cursor-pointer"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptBroadcast(currentBroadcast)}
                        className="px-4 py-1.5 rounded-full bg-[#9E593B] hover:bg-[#8A4C32] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <Zap size={13} className="fill-white" />
                        <span>Accept (${currentBroadcast.partnerPayout})</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Countdown Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-800/80 overflow-hidden">
                  <div
                    className="h-full bg-[#9E593B] transition-[width] duration-75 ease-linear"
                    style={{ width: `${timerProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* ── 2. MAIN WORKBENCH VIEW TABS ── */}
          <div className="p-4 lg:p-8 pt-4 space-y-6 max-w-[1440px] mx-auto">

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: WORKSHOP COCKPIT                                        */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'cockpit' && (
              <div className="space-y-6">

                {/* ── 4 UIVERSE-INSPIRED ELEVATED METRIC CARDS ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Today's Net Payout */}
                  <div className="uiverse-stat-card uiverse-stat-emerald group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Today's Payout
                      </span>
                      <div className="size-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <DollarSign size={16} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        ${todayEarned}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                        80% Net
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Rolling Escrow &bull; Instant Settlement
                    </p>
                  </div>

                  {/* Card 2: Active on Sewing Bench */}
                  <div className="uiverse-stat-card uiverse-stat-amber group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        On Sewing Bench
                      </span>
                      <div className="size-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <Scissors size={15} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {activeOnBench}
                      </span>
                      <span className="text-xs font-medium text-slate-500">garments</span>
                    </div>
                    <p className="text-[11px] text-amber-700 mt-2 font-semibold flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${activeOnBench > 0 ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                      {activeOnBench > 0 ? 'Live SLA Timers Running' : 'All Workstations Ready'}
                    </p>
                  </div>

                  {/* Card 3: Drop-Off Queue */}
                  <div className="uiverse-stat-card uiverse-stat-sky group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Drop-Off Queue
                      </span>
                      <div className="size-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <Package size={15} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {pendingDropOffs}
                      </span>
                      <span className="text-xs font-medium text-slate-500">scheduled</span>
                    </div>
                    <p className="text-[11px] text-sky-700 mt-2 font-semibold flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-sky-500" />
                      Counter PIN Ingress Active
                    </p>
                  </div>

                  {/* Card 4: Ready on Rack */}
                  <div className="uiverse-stat-card uiverse-stat-purple group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Ready on Rack
                      </span>
                      <div className="size-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <CheckCircle2 size={16} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {readyOnRack}
                      </span>
                      <span className="text-xs font-medium text-slate-500">finished</span>
                    </div>
                    <p className="text-[11px] text-purple-700 mt-2 font-semibold flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-purple-500" />
                      {readyOnRack > 0 ? 'Pickup Alerts Dispatched' : 'Rack Clear & Calibrated'}
                    </p>
                  </div>
                </div>

                {/* ── WORKBENCH FLOOR: DEDICATED DOCKET OR 3-STATION ATELIER PRODUCTION FLOOR ── */}
                {activeIntake ? (
                  /* ── FULL-WIDTH ATELIER INTAKE & INSPECTION DOCKET ── */
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 animate-scaleUp">
                    {/* Status Banner */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/90 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                      <div className="flex items-center gap-3.5">
                        <div className="size-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <CheckCircle2 size={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-emerald-950 uppercase tracking-wide">
                              Garment Intake &amp; Drop-Off Inspection
                            </span>
                            <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-300">
                              Drop-off PIN Verified
                            </span>
                          </div>
                          <p className="text-xs text-emerald-800 font-medium mt-0.5">
                            Customer authenticated at counter &bull; Inspect fabric, confirm tailoring specifications, and transfer to sewing bench.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveIntake(null)
                          setPinInput('')
                        }}
                        className="px-3.5 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-900 text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        ← Back to Floor
                      </button>
                    </div>

                    {/* 2-Column Inspection Grid */}
                    <div className="grid lg:grid-cols-12 gap-6 items-start">
                      {/* Left: Garment Profile & Condition */}
                      <div className="lg:col-span-5 space-y-5">
                        {/* Garment Summary Card */}
                        <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
                          <div className="flex items-start gap-4">
                            <div className="size-20 rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 shadow-2xs">
                              <img
                                src={getGarmentPhoto(activeIntake)}
                                alt={activeIntake.garmentName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9E593B] block mb-1">
                                Order #{activeIntake.id.slice(0, 8)}
                              </span>
                              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                                {activeIntake.garmentName}
                              </h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {activeIntake.customerName} &bull; {activeIntake.serviceName}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                  ${activeIntake.partnerPayout || Math.round((activeIntake.price || 35) * 0.75)} Net Payout (80%)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Customer Fit Notes */}
                          {activeIntake.fitNotes && formatCustomerFitNotes(activeIntake.fitNotes) && (
                            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 block">
                                Client Fit Instructions
                              </span>
                              <p className="text-slate-800 font-medium leading-relaxed">
                                {formatCustomerFitNotes(activeIntake.fitNotes)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Intake Inspection Checklist */}
                        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 space-y-4 shadow-2xs">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Tag size={14} className="text-[#9E593B]" />
                            <span>Garment Intake Tags &amp; Condition</span>
                          </h4>

                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">Garment Rack Hang-Tag</label>
                              <input
                                type="text"
                                value={hangTag}
                                onChange={(e) => setHangTag(e.target.value)}
                                placeholder="e.g. RACK-A-12"
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono font-bold text-slate-900 focus:border-[#9E593B] focus:outline-none bg-slate-50/50 transition-colors"
                              />
                            </div>

                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">Fabric Condition Notes</label>
                              <input
                                type="text"
                                value={conditionNotes}
                                onChange={(e) => setConditionNotes(e.target.value)}
                                placeholder="e.g. Clean wool, pristine condition, no preexisting snags"
                                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-900 focus:border-[#9E593B] focus:outline-none bg-slate-50/50 transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Measurements, Tailor Bench & Confirmation */}
                      <div className="lg:col-span-7 space-y-5">
                        {/* Measurements Section */}
                        <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Scissors size={15} className="text-[#9E593B]" />
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                Tailoring Specifications &amp; Pin Points
                              </span>
                            </div>

                            {!isEditingIntakeMeas ? (
                              <button
                                type="button"
                                onClick={() => setIsEditingIntakeMeas(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#9E593B] shadow-2xs transition-colors cursor-pointer"
                              >
                                <Edit3 size={12} />
                                <span>Modify Measurements</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsEditingIntakeMeas(false)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                              >
                                <Check size={12} />
                                <span>Done Editing</span>
                              </button>
                            )}
                          </div>

                          {!isEditingIntakeMeas ? (
                            <div className="space-y-3">
                              {intakeMeasFields.length > 0 && intakeMeasFields.some((f) => f.value && f.value.trim()) ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                  {intakeMeasFields.map((field, idx) => (
                                    <div
                                      key={idx}
                                      className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs"
                                    >
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                        {field.label}
                                      </span>
                                      <span className="font-mono font-bold text-slate-900 text-sm">
                                        {field.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-500 font-medium">
                                  No pre-set fit numbers &bull; Customer requested in-person measurement at bench.
                                </div>
                              )}

                              <p className="text-[11px] text-slate-400">
                                Fit specifications are locked to the docket. Click &quot;Modify Measurements&quot; if the customer asks for on-the-spot adjustments.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3 pt-1 animate-fadeIn">
                              <p className="text-xs text-slate-600 font-medium">
                                Update or enter custom fit parameters below:
                              </p>

                              <div className="grid sm:grid-cols-2 gap-2.5">
                                {intakeMeasFields.map((field, idx) => (
                                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                      {field.label}
                                    </label>
                                    <input
                                      type="text"
                                      value={field.value}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setIntakeMeasFields((prev) =>
                                          prev.map((f, i) => (i === idx ? { ...f, value: val } : f))
                                        )
                                        if (field.key === 'hem' || field.key.includes('hem')) setMeasHem(val)
                                        if (field.key === 'waist' || field.key.includes('waist')) setMeasWaist(val)
                                        if (field.key === 'sleeve' || field.key.includes('sleeve')) setMeasSleeve(val)
                                        if (field.key === 'inseam' || field.key.includes('inseam')) setMeasInseam(val)
                                      }}
                                      placeholder={`Enter ${field.label}`}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#9E593B] outline-none font-mono"
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newKey = `custom_${Date.now()}`
                                    setIntakeMeasFields((prev) => [
                                      ...prev,
                                      { key: newKey, label: 'Custom Fit Note', value: '' },
                                    ])
                                  }}
                                  className="text-xs text-[#9E593B] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={12} />
                                  <span>Add Custom Spec Field</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setIsEditingIntakeMeas(false)}
                                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold transition-colors cursor-pointer"
                                >
                                  ✓ Save Fit Specs
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Station Allocation */}
                        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 space-y-4 shadow-2xs">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Sliders size={14} className="text-[#9E593B]" />
                            <span>Workstation &amp; Tailor Assignment</span>
                          </h4>

                          <div className="grid sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">Assigned Master Tailor</label>
                              <input
                                type="text"
                                value={worker}
                                onChange={(e) => setWorker(e.target.value)}
                                placeholder="e.g. Master Tailor Marco"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 font-medium focus:border-[#9E593B] focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 mb-1">Sewing Machine Bench</label>
                              <input
                                type="text"
                                value={machine}
                                onChange={(e) => setMachine(e.target.value)}
                                placeholder="e.g. Juki DDL-8700 Bench #2"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 font-medium focus:border-[#9E593B] focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Complex Fabric Surcharge Option */}
                          <div className="pt-1">
                            {!showPriceAdjust ? (
                              <button
                                type="button"
                                onClick={() => setShowPriceAdjust(true)}
                                className="text-xs font-medium text-[#9E593B] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Plus size={12} />
                                <span>Add complex fabric / delicate lining surcharge</span>
                              </button>
                            ) : (
                              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                                <span className="font-bold text-amber-950">Complex Fabric Surcharge</span>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    placeholder="Amount ($)"
                                    value={priceAdjustAmount}
                                    onChange={(e) => setPriceAdjustAmount(e.target.value)}
                                    className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 font-bold"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Reason (e.g. delicate silk lining)"
                                    value={priceAdjustReason}
                                    onChange={(e) => setPriceAdjustReason(e.target.value)}
                                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-amber-300"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setPriceAdjustApproved(true)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-[#9E593B] text-white font-semibold cursor-pointer transition-colors"
                                  >
                                    {priceAdjustApproved ? '✓ Added' : 'Apply'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Confirmation Bar */}
                        <div className="pt-2 flex items-center justify-between gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveIntake(null)
                              setPinInput('')
                            }}
                            className="px-5 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            Cancel Intake
                          </button>

                          <button
                            type="button"
                            onClick={handleConfirmIntakeAndStart}
                            className="flex-1 bg-slate-900 hover:bg-[#9E593B] text-white py-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-95"
                          >
                            <Scissors size={15} />
                            <span>Confirm Intake &amp; Start Sewing SLA Clock →</span>
                          </button>
                        </div>

                        {intakeSuccess && (
                          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold text-center border border-emerald-200 animate-fadeIn">
                            ✓ Garment checked in &amp; placed on sewing bench! Live SLA started.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── ATELIER WORKBENCH FLOOR: HORIZONTAL EXPRESS COUNTER + 3-STATION KANBAN BOARD ── */
                  <div className="space-y-6">

                    {/* 1. HORIZONTAL EXPRESS INGRESS COUNTER BAR */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-sm">
                      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5">

                        {/* Left: Counter Context */}
                        <div className="flex items-center gap-3.5">
                          <div className="size-11 rounded-2xl bg-amber-50 text-[#9E593B] border border-amber-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                            <Package size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-bold text-slate-900">
                                Express Drop-Off Ingress
                              </h2>
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Counter Online
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Key in client's 4-digit drop-off PIN to verify booking, inspect garment, and queue to bench.
                            </p>
                          </div>
                        </div>

                        {/* Right: Direct 4-Digit Ingress Input Strip */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                          <div className="relative flex items-center gap-2">
                            {/* Hidden capture input */}
                            <input
                              id="studio-counter-pin-input"
                              type="text"
                              maxLength={4}
                              value={pinInput}
                              autoFocus
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '')
                                setPinInput(val)
                                setPinError('')
                                if (val.length === 4) {
                                  handleLookupPin(val)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && pinInput) handleLookupPin(pinInput)
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full text-transparent"
                              aria-label="Enter 4-digit PIN"
                            />

                            {[0, 1, 2, 3].map((idx) => {
                              const digit = pinInput[idx] || ''
                              const isFocused = pinInput.length === idx
                              return (
                                <div
                                  key={idx}
                                  className={`uiverse-pin-slot size-12 sm:size-13 font-mono font-bold text-xl sm:text-2xl ${
                                    digit ? 'filled text-slate-900' : isFocused ? 'active text-[#9E593B]' : 'text-slate-300'
                                  }`}
                                >
                                  {digit || (isFocused ? <span className="animate-pulse text-[#9E593B]">|</span> : '—')}
                                </div>
                              )
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleLookupPin(pinInput)}
                            disabled={pinInput.length === 0}
                            className={`px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
                              pinInput.length === 4
                                ? 'bg-slate-900 hover:bg-[#9E593B] text-white active:scale-95 shadow-sm'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <ShieldCheck size={16} />
                            <span>Verify Drop-off →</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowKeypad(!showKeypad)}
                            className="px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                            title="Toggle tactile on-screen keypad"
                          >
                            {showKeypad ? '✕ Keypad' : '🔢 Keypad'}
                          </button>
                        </div>
                      </div>

                      {/* Error Banner */}
                      {pinError && (
                        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center justify-between gap-2 animate-fadeIn">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={15} className="shrink-0 text-red-600" />
                            <span>{pinError}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPinInput('')}
                            className="text-xs underline text-red-800 font-bold cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}

                      {/* Tactile Keypad Drawer */}
                      {showKeypad && (
                        <div className="mt-4 pt-4 border-t border-slate-100 animate-fadeIn">
                          <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLEAR', '0', 'BACK'].map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => handleKeypadPress(key)}
                                className={`uiverse-keypad-btn ${
                                  key === 'CLEAR' || key === 'BACK' ? 'bg-slate-100 text-slate-700 text-xs font-bold' : ''
                                }`}
                              >
                                {key === 'BACK' ? '⌫' : key}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. THREE-STATION ATELIER PRODUCTION FLOOR (KANBAN WORKFLOW) */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

                      {/* ═══ STATION 1: DROP-OFF QUEUE ═══ */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col h-full w-full min-h-[340px]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 mb-4">
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0">
                              1
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                Scheduled Arrivals
                              </h3>
                              <p className="text-[11px] text-slate-400">Clients arriving today</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 rounded-full shrink-0">
                            {pendingDropOffs} expected
                          </span>
                        </div>

                        {/* List */}
                        <div className="space-y-3 flex-1 flex flex-col justify-start">
                          {orders.filter((o) => ['Accepted', 'Allocated', 'Customer Arrived'].includes(o.status)).length > 0 ? (
                            orders
                              .filter((o) => ['Accepted', 'Allocated', 'Customer Arrived'].includes(o.status))
                              .map((ord) => (
                                <div
                                  key={ord.id}
                                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all space-y-2.5 shadow-2xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="font-bold text-xs text-slate-900 truncate">
                                        {ord.customerName}
                                      </h4>
                                      <p className="text-[11px] text-slate-500 truncate">
                                        {ord.garmentName} &bull; {ord.serviceName}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                                      Drop-off Today
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11px] font-semibold text-emerald-700">
                                      ${ord.partnerPayout || Math.round((ord.price || 35) * 0.75)} Net Payout
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPinInput('')
                                        setPinError('')
                                        const el = document.getElementById('studio-counter-pin-input')
                                        if (el) {
                                          el.focus()
                                          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                        }
                                      }}
                                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold shrink-0 transition-colors cursor-pointer shadow-2xs"
                                    >
                                      Enter Customer PIN →
                                    </button>
                                  </div>
                                </div>
                              ))
                          ) : (
                            <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2 flex-1 flex flex-col items-center justify-center min-h-[200px]">
                              <Package size={24} className="mx-auto text-slate-400" />
                              <div className="text-xs font-bold text-slate-700">All Scheduled Drop-Offs Received</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                New bookings for today will populate here immediately upon client confirmation.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ═══ STATION 2: ACTIVE ON BENCH ═══ */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col h-full w-full min-h-[340px]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 mb-4">
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                              2
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                Sewing Bench
                              </h3>
                              <p className="text-[11px] text-slate-400">Under needle right now</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shrink-0">
                            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {activeOnBench} active
                          </span>
                        </div>

                        {/* List */}
                        <div className="space-y-3 flex-1 flex flex-col justify-start">
                          {orders.filter((o) => o.status === 'Work in Progress').length > 0 ? (
                            orders
                              .filter((o) => o.status === 'Work in Progress')
                              .map((order) => {
                                const sla = getSlaCountdown(order)
                                return (
                                  <div
                                    key={order.id}
                                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all space-y-3 shadow-2xs"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-2.5 min-w-0">
                                        <div className="size-11 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                          <img
                                            src={getGarmentPhoto(order)}
                                            alt={order.garmentName}
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 mb-0.5">
                                            {order.hangTagNo && (
                                              <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                                {order.hangTagNo}
                                              </span>
                                            )}
                                          </div>
                                          <h4 className="font-bold text-xs text-slate-900 truncate">{order.garmentName}</h4>
                                          <p className="text-[11px] text-slate-500 truncate">
                                            {order.customerName} &bull; {order.serviceName}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="font-extrabold text-xs text-emerald-700 block">
                                          ${order.partnerPayout || Math.round((order.price || 35) * 0.75)}
                                        </span>
                                        <span
                                          className={`text-[10px] font-semibold flex items-center justify-end gap-1 ${
                                            sla.urgent ? 'text-red-600 font-bold' : 'text-slate-500'
                                          }`}
                                        >
                                          <Clock size={11} />
                                          <span>{sla.text}</span>
                                        </span>
                                      </div>
                                    </div>

                                    {/* Tailoring Specs Snippet */}
                                    {(() => {
                                      const summary = formatOrderSpecsSummary(order)
                                      return summary ? (
                                        <div className="text-[10px] text-slate-700 bg-white px-2 py-1 rounded-md border border-slate-200 truncate font-mono">
                                          {summary}
                                        </div>
                                      ) : null
                                    })()}

                                    {/* SLA Countdown Progress */}
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                                        <span>Turnaround SLA</span>
                                        <span>{Math.round(sla.percent)}% remaining</span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-500 ${
                                            sla.urgent ? 'bg-red-500' : 'bg-[#9E593B]'
                                          }`}
                                          style={{ width: `${sla.percent}%` }}
                                        />
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleMarkAlterationDone(order.id)}
                                      className="w-full py-2 bg-slate-900 hover:bg-[#9E593B] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                                    >
                                      <CheckCircle size={13} />
                                      <span>Mark Done &amp; Alert Customer →</span>
                                    </button>
                                  </div>
                                )
                              })
                          ) : (
                            <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2 flex-1 flex flex-col items-center justify-center min-h-[200px]">
                              <Scissors size={24} className="mx-auto text-slate-400" />
                              <div className="text-xs font-bold text-slate-700">Sewing Bench Clear</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                No alterations currently in needle. Check in garments from the drop-off queue to start live SLA tracking.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ═══ STATION 3: READY ON RACK ═══ */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col h-full w-full min-h-[340px]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 mb-4">
                          <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                              3
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                                Ready on Rack
                              </h3>
                              <p className="text-[11px] text-slate-400">Customer pickup stage</p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-purple-800 bg-purple-50 border border-purple-200/80 px-2.5 py-0.5 rounded-full shrink-0">
                            {readyOnRack} on rack
                          </span>
                        </div>

                        {/* List */}
                        <div className="space-y-3 flex-1 flex flex-col justify-start">
                          {orders.filter((o) => o.status === 'Ready').length > 0 ? (
                            orders
                              .filter((o) => o.status === 'Ready')
                              .map((order) => (
                                <div
                                  key={order.id}
                                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all space-y-2.5 shadow-2xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="font-bold text-xs text-slate-900 truncate">
                                        {order.customerName}
                                      </h4>
                                      <p className="text-[11px] text-slate-500 truncate">
                                        {order.garmentName} &bull; {order.serviceName}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md shrink-0">
                                      {order.hangTagNo || 'Rack A-1'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                    <span className="font-bold text-emerald-700">
                                      ${order.partnerPayout || Math.round((order.price || 35) * 0.75)} Net Payout
                                    </span>
                                    <span className="text-[10px] text-purple-700 font-semibold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                                      Pickup Alert Sent
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenPickupModal(order)}
                                    className="w-full py-2 bg-slate-900 hover:bg-[#9E593B] text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-2xs flex items-center justify-center gap-1.5"
                                  >
                                    <CheckCircle2 size={13} />
                                    <span>Verify Pickup PIN &amp; Settle →</span>
                                  </button>
                                </div>
                              ))
                          ) : (
                            <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2 flex-1 flex flex-col items-center justify-center min-h-[200px]">
                              <CheckCircle2 size={24} className="mx-auto text-slate-400" />
                              <div className="text-xs font-bold text-slate-700">Rack Clear &amp; Calibrated</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                Alterations marked finished on the sewing bench will appear here ready for client collection.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 2: ORDERS PIPELINE                                         */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'pipeline' && (() => {
              const activeSelectedOrder = selectedOrder && filteredOrders.some((o) => o.id === selectedOrder.id) ? selectedOrder : null

              return (
                <div className="space-y-4">
                  {/* Search + Filters */}
                  <div className="bg-white border border-[#E8E1D5] rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9E593B]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search customer, garment, ID, rack tag..."
                        className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-[#E8E1D5] focus:border-[#9E593B] focus:outline-none transition-colors bg-[#FAF8F5]"
                      />
                    </div>
                    <div className="flex gap-1.5 flex-wrap text-xs">
                      {['ALL', 'Accepted', 'Work in Progress', 'Ready', 'Closed'].map((s) => {
                        const labelMap: Record<string, string> = {
                          ALL: `All (${pipelineOrders.length})`,
                          Accepted: `Drop-Offs (${pendingDropOffs})`,
                          'Work in Progress': `On Bench (${activeOnBench})`,
                          Ready: `Ready (${readyOnRack})`,
                          Closed: `Completed (${pipelineOrders.filter(o => o.status === 'Closed' || o.status === 'Collected').length})`,
                        }
                        return (
                          <button
                            key={s}
                            onClick={() => {
                              setStatusFilter(s)
                              setSelectedOrder(null)
                            }}
                            className={`px-3 py-1.5 rounded-full font-semibold transition-colors cursor-pointer ${statusFilter === s
                              ? 'bg-[#0F1115] text-white shadow-xs'
                              : 'bg-white border border-[#E8E1D5] text-[#1E2229] hover:border-[#9E593B] hover:bg-[#F3EFEA]'
                              }`}
                          >
                            {labelMap[s] || s}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-12 gap-5 items-start">
                    {/* Order List */}
                    <div className={`${activeSelectedOrder ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-2.5 transition-all duration-300`}>
                      {filteredOrders.map((order) => {
                        const isSelected = activeSelectedOrder?.id === order.id
                        const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.Closed
                        return (
                          <div
                            key={order.id}
                            onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                            className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all ${isSelected
                              ? 'border-[#9E593B] shadow-xs ring-2 ring-[#9E593B]/20'
                              : 'border-[#E8E1D5] hover:border-[#9E593B]'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="size-12 rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#E8E1D5] shrink-0">
                                  <img src={getGarmentPhoto(order)} alt={order.garmentName} className="w-full h-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${st.bg} ${st.text}`}>
                                      {order.status}
                                    </span>
                                    {order.hangTagNo && (
                                      <span className="font-mono text-[10px] bg-[#FFF7F2] border border-[#9E593B]/20 text-[#9E593B] px-1.5 py-0.5 rounded font-semibold">
                                        {order.hangTagNo}
                                      </span>
                                    )}
                                    {order.retailSold !== undefined && order.retailSold !== null && (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${order.retailSold
                                        ? 'bg-amber-50 text-amber-900 border-amber-300'
                                        : 'bg-stone-50 text-stone-600 border-stone-200'
                                        }`}>
                                        {order.retailSold ? '🛍️ Retail: Yes' : 'Retail: No'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-bold text-xs text-[#1E2229] truncate">{order.garmentName}</div>
                                  <div className="text-[11px] text-[#6B7280]">{order.serviceName} · {order.customerName}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-bold text-sm text-emerald-800">${order.partnerPayout || Math.round((order.price || 35) * 0.75)}</div>
                                <div className="text-[10px] text-[#9E593B] font-semibold">Net Payout</div>
                              </div>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-[#E8E1D5] flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleOpenEditMeasurements(order)} className="text-xs font-semibold text-[#9E593B] hover:underline flex items-center gap-1 cursor-pointer">
                                <Edit3 size={11} /> Edit Specs
                              </button>
                              <div className="flex items-center gap-2">
                                {order.status === 'Accepted' && (
                                  <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">Awaiting Drop-Off</span>
                                )}
                                {order.status === 'Work in Progress' && (
                                  <button onClick={() => handleMarkAlterationDone(order.id)} className="text-xs font-semibold text-white bg-[#0F1115] hover:bg-[#9E593B] px-3 py-1 rounded-xl flex items-center gap-1 cursor-pointer shadow-xs">
                                    <CheckCircle size={12} /> Mark Done
                                  </button>
                                )}
                                {order.status === 'Ready' && (
                                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">Ready on Rack</span>
                                )}
                                {order.status === 'Closed' && (
                                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Completed ✓</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {filteredOrders.length === 0 && (
                        <div className="p-8 text-center bg-white rounded-2xl border border-[#E8E1D5] text-xs text-[#6B7280]">No orders found matching your search.</div>
                      )}
                    </div>

                    {/* Order Detail - ONLY shown when an alteration is specifically clicked */}
                    {activeSelectedOrder && (
                      <div className="lg:col-span-5 bg-white border border-[#E8E1D5] rounded-2xl p-5 sm:p-6 shadow-2xs sticky top-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[#E8E1D5]">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="size-14 rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#E8E1D5] shrink-0">
                              <img src={getGarmentPhoto(activeSelectedOrder)} alt={activeSelectedOrder.garmentName} className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm text-[#1E2229] truncate">{activeSelectedOrder.garmentName}</h3>
                              <p className="text-xs text-[#6B7280]">{activeSelectedOrder.serviceName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xl font-bold text-emerald-800">${activeSelectedOrder.partnerPayout || Math.round((activeSelectedOrder.price || 35) * 0.8)}</div>
                              <div className="text-[10px] text-[#9E593B] font-semibold">Net (80%)</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(null)}
                              className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#1E2229] hover:bg-[#FAF8F5] border border-transparent hover:border-[#E8E1D5] transition-all cursor-pointer ml-1"
                              title="Close details"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={15} className="text-[#9E593B] shrink-0" />
                            <div>
                              <div className="font-semibold text-[#1E2229]">Paid ${(activeSelectedOrder.price || 35)} Online</div>
                              <div className="text-[11px] text-[#6B7280]">80% releases 15 days post-handover</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold bg-white text-[#1E2229] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full shrink-0">Stripe Escrow</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-[#F3EFEA]/80 border border-[#E8E1D5] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#1E2229] flex items-center gap-1.5"><Ruler size={13} className="text-[#9E593B]" /> Measurements</span>
                            <button onClick={() => handleOpenEditMeasurements(activeSelectedOrder)} className="text-xs font-semibold text-[#9E593B] hover:underline flex items-center gap-1 cursor-pointer bg-white border border-[#E8E1D5] px-2.5 py-0.5 rounded-lg">
                              <Edit3 size={11} /> Edit
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {(() => {
                              const parsed = parseOrderMeasurements(activeSelectedOrder)
                              const entries = Object.entries(parsed)
                              if (entries.length === 0) {
                                return [
                                  { label: 'Hem', val: 'Standard' },
                                  { label: 'Waist', val: 'Standard' },
                                  { label: 'Sleeves', val: 'Standard' },
                                  { label: 'Inseam', val: 'Original' },
                                ].map((m) => (
                                  <div key={m.label} className="bg-white p-2 rounded-xl border border-[#E8E1D5]">
                                    <span className="text-[10px] text-[#9E593B] font-bold block mb-0.5 uppercase">{m.label}</span>
                                    <span className="font-semibold text-[#1E2229]">{m.val}</span>
                                  </div>
                                ))
                              }
                              return entries.map(([k, v]) => (
                                <div key={k} className="bg-white p-2 rounded-xl border border-[#E8E1D5]">
                                  <span className="text-[10px] text-[#9E593B] font-bold block mb-0.5 uppercase">{formatMeasurementKey(k)}</span>
                                  <span className="font-semibold text-[#1E2229] break-words">{String(v)}</span>
                                </div>
                              ))
                            })()}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white border border-[#E8E1D5] space-y-2 text-xs divide-y divide-[#E8E1D5]">
                          <div className="flex justify-between pb-1.5"><span className="text-[#6B7280]">Customer:</span><span className="font-semibold text-[#1E2229]">{activeSelectedOrder.customerName}</span></div>
                          <div className="flex justify-between py-1.5"><span className="text-[#6B7280]">Phone:</span><a href={`tel:${activeSelectedOrder.customerPhone}`} className="font-semibold text-[#9E593B] hover:underline">{activeSelectedOrder.customerPhone || 'N/A'}</a></div>
                          <div className="flex justify-between py-1.5"><span className="text-[#6B7280]">Rack Tag:</span><span className="font-mono font-bold text-[#1E2229]">{activeSelectedOrder.hangTagNo || 'N/A'}</span></div>
                          {activeSelectedOrder.retailSold !== undefined && activeSelectedOrder.retailSold !== null && (
                            <div className="flex justify-between py-1.5 items-center">
                              <span className="text-[#6B7280]">Retail Accessory:</span>
                              <span className={`font-semibold px-2 py-0.5 rounded text-[10px] border ${activeSelectedOrder.retailSold
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-stone-50 text-stone-600 border-stone-200'
                                }`}>
                                {activeSelectedOrder.retailSold ? '🛍️ Yes (Purchased)' : 'No Retail Sold'}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between pt-1.5"><span className="text-[#6B7280]">Turnaround:</span><span className="font-semibold text-[#1E2229]">{activeSelectedOrder.slaHours || 48}h Guaranteed</span></div>
                        </div>

                        {/* Garment Reference Photos Section */}
                        {(() => {
                          const photos = getAllGarmentPhotos(activeSelectedOrder)
                          return (
                            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#1E2229] flex items-center gap-1.5">
                                  <Camera size={13} className="text-[#9E593B]" />
                                  Garment Photos ({photos.length})
                                </span>
                                <label className="text-xs font-semibold text-[#9E593B] hover:underline flex items-center gap-1 cursor-pointer bg-white border border-[#E8E1D5] px-2.5 py-1 rounded-lg shadow-2xs transition-all active:scale-95">
                                  <Plus size={11} /> Add Photo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleAddStudioPhoto(activeSelectedOrder.id, e)}
                                  />
                                </label>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {photos.map((photoUrl, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => handleOpenFullView(photos, idx)}
                                    className="relative aspect-square rounded-xl overflow-hidden border border-[#E8E1D5] bg-stone-100 group cursor-pointer shadow-2xs hover:border-[#9E593B] transition-all"
                                    title="Click to inspect photo in full view"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={`Garment Photo ${idx + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Eye size={16} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-[#6B7280] italic">
                                Click any thumbnail to inspect in full view.
                              </p>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}



            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 4: PAYOUTS                                                 */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'payouts' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="bg-white border border-[#E8E1D5] rounded-2xl p-5 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-[#6B7280] tracking-wider block">Pending 15-Day Escrow</span>
                    <div className="text-2xl font-bold text-[#1E2229] mt-1">${todayEarned}</div>
                    <div className="text-xs text-[#9E593B] font-medium mt-1">Releases 15 days post-handover</div>
                  </div>
                  <div className="bg-white border border-[#E8E1D5] rounded-2xl p-5 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-[#6B7280] tracking-wider block">Disbursed to Bank</span>
                    <div className="text-2xl font-bold text-emerald-800 mt-1">${totalClosedDisbursed}</div>
                    <div className="text-xs text-[#6B7280] mt-1">Stripe Connect Direct Deposit</div>
                  </div>
                  <div className="bg-white border border-[#E8E1D5] rounded-2xl p-5 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-[#6B7280] tracking-wider block">Studio Revenue Share</span>
                    <div className="text-2xl font-bold text-[#1E2229] mt-1">80% Net</div>
                    <div className="text-xs text-[#6B7280] mt-1">20% Platform Fee</div>
                  </div>
                </div>

                {/* Stripe Connect */}
                <div className="bg-white border border-[#E8E1D5] rounded-2xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="size-10 rounded-xl bg-[#FFF7F2] text-[#9E593B] border border-[#9E593B]/20 grid place-items-center shrink-0">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#1E2229]">Stripe Connect · Verified Payouts</span>
                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">✓ Active</span>
                      </div>
                      <p className="text-xs text-[#6B7280] mt-0.5">Customer payments held in 15-day rolling escrow · Automatic direct deposits</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#6B7280]">Schedule: </span>
                    <span className="text-xs font-bold text-[#1E2229]">15 Days Post-Pickup</span>
                  </div>
                </div>

                {/* Ledger */}
                <div className="bg-white border border-[#E8E1D5] rounded-2xl p-6 shadow-2xs space-y-4">
                  <h2 className="font-bold text-base text-[#1E2229]">15-Day Rolling Payout Ledger</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#FAF8F5] border-b border-[#E8E1D5] text-[#6B7280]">
                        <tr>
                          <th className="p-3.5 font-bold">Order / Customer</th>
                          <th className="p-3.5 font-bold">Paid</th>
                          <th className="p-3.5 font-bold">Fee (20%)</th>
                          <th className="p-3.5 font-bold">Studio Net (80%)</th>
                          <th className="p-3.5 font-bold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8E1D5]">
                        {orders
                          .filter((o) => ['Closed', 'Collected', 'Ready', 'Work in Progress'].includes(o.status))
                          .map((o) => {
                            const price = o.price || 30
                            const fee = Math.round(price * 0.2 * 100) / 100
                            const net = o.partnerPayout || Math.round(price * 0.8 * 100) / 100
                            const isSettled = o.status === 'Closed' || o.status === 'Collected'
                            return (
                              <tr key={o.id}>
                                <td className="p-3.5 font-semibold text-[#1E2229]">
                                  #{o.id} · {o.customerName}
                                  {o.retailSold !== undefined && o.retailSold !== null && (
                                    <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${o.retailSold
                                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                                      : 'bg-stone-50 text-stone-600 border-stone-200'
                                      }`}>
                                      {o.retailSold ? '🛍️ Retail: Yes' : 'Retail: No'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3.5 text-[#1E2229]">${price}.00</td>
                                <td className="p-3.5 text-[#6B7280]">-${fee}</td>
                                <td className="p-3.5 font-bold text-emerald-800">${net}</td>
                                <td className="p-3.5 text-right">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${isSettled ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                    {isSettled ? 'Deposited' : '15-Day Escrow'}
                                  </span>
                                  {(() => {
                                    const summary = formatOrderSpecsSummary(o)
                                    return summary ? (
                                      <div className="text-[11px] text-[#1E2229] bg-white px-2.5 py-1 rounded-lg border border-[#E8E1D5] truncate font-mono mt-1">
                                        {summary}
                                      </div>
                                    ) : null
                                  })()}
                                </td>
                              </tr>
                            )
                          })}
                        {orders.filter((o) => ['Closed', 'Collected', 'Ready', 'Work in Progress'].includes(o.status)).length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-xs text-[#6B7280]">No settlements yet. Working orders will appear here.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 5: STUDIO PROFILE & CONFIGURATION                           */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'profile' && user && (
              <StudioProfileView
                user={user}
                onUpdateUser={onUpdateUser}
                onBack={() => setActiveTab('cockpit')}
                onSignOut={onSignOut}
              />
            )}

          </div>
        </main>

        {/* ── MOBILE BOTTOM TAB BAR ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E8E1D5] flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id
            const Icon = item.icon
            const badge = item.id === 'cockpit' && allBroadcasts.length > 0 ? allBroadcasts.length : null
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded transition-colors cursor-pointer relative ${active ? 'text-[#9E593B] font-bold' : 'text-[#6B7280] font-medium'
                  }`}
              >
                <Icon size={18} />
                <span className="text-[9px]">{item.shortLabel}</span>
                {badge && (
                  <span className="absolute -top-0.5 right-0.5 size-4 bg-amber-400 text-stone-950 text-[9px] font-bold rounded-full grid place-items-center">{badge}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS — CLEAN MINIMALIST DIALOGS                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* Edit Measurements */}
      {isEditMeasOpen && editTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full p-6 rounded-2xl shadow-xl border border-[#E8E1D5] space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
              <div>
                <h3 className="font-bold text-base text-[#1E2229]">Edit Garment Specifications</h3>
                <p className="text-xs text-[#6B7280]">{editTargetOrder.garmentName} · {editTargetOrder.customerName}</p>
              </div>
              <button onClick={() => setIsEditMeasOpen(false)} className="p-1 text-[#6B7280] hover:text-[#1E2229] rounded-lg hover:bg-[#FAF8F5] cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              {editMeasFields.map((f, idx) => (
                <div key={`${f.key}-${idx}`}>
                  <label className="block font-semibold text-[#1E2229] mb-1">{f.label}</label>
                  <input
                    type="text"
                    value={f.value}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditMeasFields((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, value: val } : item))
                      )
                    }}
                    placeholder={`e.g. ${f.label} measurement / spec`}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8E1D5] bg-white focus:border-[#9E593B] focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#E8E1D5] flex justify-end gap-2">
              <button
                onClick={() => setIsEditMeasOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E8E1D5] text-xs font-semibold text-[#6B7280] hover:bg-[#FAF8F5]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMeasurements}
                className="px-4 py-2 rounded-xl bg-[#0F1115] hover:bg-[#9E593B] text-white text-xs font-semibold shadow-xs transition-colors"
              >
                Save Specs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pickup Verification Modal */}
      {pickupModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl border border-[#E8E1D5] space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#E8E1D5] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E593B] block">
                  Customer Handover
                </span>
                <h3 className="font-bold text-base text-[#1E2229]">
                  Verify Pickup PIN
                </h3>
              </div>
              <button onClick={() => setPickupModalOrder(null)} className="p-1 text-[#6B7280] hover:text-[#1E2229] rounded-lg hover:bg-[#FAF8F5] cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {!pickupVerified ? (
              <div className="space-y-4">
                <p className="text-xs text-[#6B7280]">
                  Ask <strong>{pickupModalOrder.customerName}</strong> for their 4-digit pickup code:
                </p>

                <div className="space-y-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pickupOtpInput}
                    onChange={(e) => setPickupOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full text-center font-mono font-bold text-2xl tracking-[0.25em] py-3.5 rounded-xl border border-[#E8E1D5] focus:border-[#9E593B] focus:outline-none"
                  />
                  {pickupOtpError && (
                    <p className="text-xs text-red-600 font-medium">{pickupOtpError}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleVerifyPickupOtp}
                  className="w-full py-3 bg-[#0F1115] hover:bg-[#9E593B] text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  Verify Customer Code →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                  <span>✓ Identity Verified! Ready for garment handover.</span>
                </div>

                {/* Retail In-Store Sales Prompt - Simple Yes or No */}
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] space-y-3 text-xs">
                  <label className="font-semibold text-[#1E2229] block">
                    Did the customer purchase retail accessories during pickup?
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRetailAnswer('YES')}
                      className={`flex-1 py-2.5 rounded-xl font-semibold border transition-colors cursor-pointer ${retailAnswer === 'YES'
                        ? 'bg-[#0F1115] text-white border-[#0F1115]'
                        : 'bg-white text-[#1E2229] border-[#E8E1D5] hover:bg-[#F3EFEA]'
                        }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setRetailAnswer('NO')}
                      className={`flex-1 py-2.5 rounded-xl font-semibold border transition-colors cursor-pointer ${retailAnswer === 'NO'
                        ? 'bg-[#0F1115] text-white border-[#0F1115]'
                        : 'bg-white text-[#1E2229] border-[#E8E1D5] hover:bg-[#F3EFEA]'
                        }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCompletePickupAndSettlement}
                  disabled={retailAnswer === null}
                  className={`w-full py-3 rounded-xl text-xs font-semibold transition-all shadow-xs ${retailAnswer === null
                    ? 'bg-[#E8E1D5] text-[#9CA3AF] cursor-not-allowed'
                    : 'bg-[#9E593B] hover:bg-[#8A4C32] text-white cursor-pointer active:scale-95'
                    }`}
                >
                  {pickupCompleted ? '✓ Order Settled!' : 'Complete Handover & Lock Earnings →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Full-Screen Lightbox Image Modal (Full View) */}
      {lightboxPhotos && lightboxPhotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md animate-in fade-in duration-200 select-none"
          onClick={() => setLightboxPhotos(null)}
        >
          <div
            className="relative max-w-5xl w-full h-full max-h-[90vh] flex flex-col items-center justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Control Bar */}
            <div className="w-full flex items-center justify-between text-white/90 pb-3 border-b border-white/15">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs bg-white/10 px-3.5 py-1.5 rounded-full border border-white/20">
                  Reference Photo {lightboxIndex + 1} of {lightboxPhotos.length}
                </span>
              </div>

              <button
                onClick={() => setLightboxPhotos(null)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer border border-white/20"
              >
                <span>Close Full View</span>
                <span className="font-mono text-sm">✕</span>
              </button>
            </div>

            {/* Main Image Display */}
            <div className="relative flex-1 w-full my-4 flex items-center justify-center overflow-hidden">
              <img
                src={lightboxPhotos[lightboxIndex]}
                alt={`Full View Photo ${lightboxIndex + 1}`}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl transition-all duration-300"
              />

              {/* Navigation Controls */}
              {lightboxPhotos.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : lightboxPhotos.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black text-white p-3 rounded-full border border-white/20 transition-transform active:scale-95 shadow-xl cursor-pointer"
                    title="Previous Photo"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={() => setLightboxIndex((prev) => (prev < lightboxPhotos.length - 1 ? prev + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black text-white p-3 rounded-full border border-white/20 transition-transform active:scale-95 shadow-xl cursor-pointer"
                    title="Next Photo"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>

            {/* Bottom Thumbnail Strip */}
            {lightboxPhotos.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto max-w-full py-2 px-3 bg-black/50 rounded-2xl border border-white/15">
                {lightboxPhotos.map((photo, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className={`size-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${lightboxIndex === idx ? 'border-[#9E593B] scale-105 shadow-lg' : 'border-white/30 opacity-60 hover:opacity-100'
                      }`}
                  >
                    <img src={photo} alt="Thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workshop Notification / Toast Banner */}
      {(broadcastToast || studioNotice) && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0F1115]/95 backdrop-blur-md text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{broadcastToast || studioNotice}</span>
        </div>
      )}
    </div>
  )
}
