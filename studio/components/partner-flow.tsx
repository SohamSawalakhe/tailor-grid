'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
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
  Store,
  Star,
  Tag,
  TrendingUp,
  User,
  X,
  XCircle,
  Zap,
  FileText,
} from 'lucide-react'
import { type FittingBooking, type OrderStatus, type Screen, type User as UserType, type VerificationStatus } from './data'
import { StudioVerificationView } from './studio-verification-view'
import { fetchStudioOrders, updateOrder, updateStudioStatus, fetchPendingDispatches, respondToDispatch, logoutUser, fetchStudioCatalog, sendOtp, getCustomerSiteUrl, CUSTOMER_SITE_URL, type PendingDispatchRequest, type StudioCatalogItemData } from '@/lib/api'
import { getStorageCookie, setStorageCookie, clearAllAuth, setCookie } from '@/lib/cookies'
import { StudioProfileView } from './studio-profile-view'
import { CustomSelect } from './custom-select'
import { StudioAvatar } from './studio-avatar'
import { PriceCatalogView, getCurrencySymbol } from './price-catalog-view'
import { PriceCatalogModal } from './price-catalog-modal'
import { WelcomeAboardModal } from './welcome-aboard-modal'
import { RaffuLogo } from './raffu-logo'
import { toast } from 'react-toastify'
import { isPushSupported, subscribeToPush } from '@/lib/push-notifications'

export type StudioTab = 'cockpit' | 'pipeline' | 'payouts' | 'profile' | 'catalog' | 'verification'

interface BroadcastRequest {
  id: string
  customerName: string
  customerArea: string
  distanceMiles: number
  garmentName: string
  quantity?: number
  serviceName: string
  fittingType: 'PRE_PINNED' | 'NEED_STUDIO_FITTING'
  garmentBrand?: string
  fitNotes: string
  notes?: string
  partnerPayout: number
  price?: number
  currency?: string
  currencySymbol?: string
  slaHours: number
  imageUrl: string
  intakePhotoUrl?: string
  images?: string[]
  garmentId?: string
  otp: string
  isRealCustomerOrder?: boolean
  realOrder?: FittingBooking
  isDispatchSession?: boolean
  secondsRemaining?: number
  stage?: number
}

export function getDefaultGarmentImage(garmentNameOrId?: string, serviceName?: string): string {
  const str = `${garmentNameOrId || ''} ${serviceName || ''}`.toLowerCase()
  if (str.includes('shirt') || str.includes('blouse') || str.includes('top') || str.includes('tee') || str.includes('polo') || str.includes('cuff') || str.includes('collar')) {
    return '/images/service_shirt.jpg'
  }
  if (str.includes('dress') || str.includes('gown') || str.includes('jumpsuit') || str.includes('skirt') || str.includes('slit')) {
    return '/images/service_dress.jpg'
  }
  if (str.includes('jacket') || str.includes('coat') || str.includes('outerwear') || str.includes('blouson') || str.includes('zipper') || str.includes('lining')) {
    return '/images/service_jacket.jpg'
  }
  if (str.includes('suit') || str.includes('blazer') || str.includes('tux') || str.includes('tuxedo')) {
    return '/images/service_suit.jpg'
  }
  if (str.includes('ethnic') || str.includes('sherwani') || str.includes('lehenga') || str.includes('kurta') || str.includes('saree') || str.includes('occasion') || str.includes('bridal') || str.includes('embroidery')) {
    return '/images/service_ethnic.jpg'
  }
  if (str.includes('trouser') || str.includes('jean') || str.includes('pant') || str.includes('chino') || str.includes('denim') || str.includes('hem') || str.includes('inseam') || str.includes('waist')) {
    return '/images/service_trousers.jpg'
  }
  return '/images/service_trousers.jpg'
}

function playAtelierChime() {
  if (typeof window === 'undefined') return
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Tone 1: High crisp tailor bell (587.33 Hz - D5)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0.2, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // Tone 2: Harmonic (880 Hz - A5)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.12)
    gain2.gain.setValueAtTime(0.28, now + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.6)
  } catch {}
}

function getGarmentPhoto(order?: Partial<FittingBooking> | { intakePhotoUrl?: string; imageUrl?: string; garmentName?: string; garmentId?: string; serviceName?: string } | null): string {
  if (!order) return '/images/service_trousers.jpg'
  const photo = order.intakePhotoUrl || (order as any)?.imageUrl
  if (photo && typeof photo === 'string') {
    const trimmed = photo.trim()
    if (trimmed.startsWith('http') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
      return trimmed
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          const first = parsed[0].trim()
          if (first.startsWith('http') || first.startsWith('data:') || first.startsWith('/')) {
            return first
          }
        }
      } catch { }
    }
  }
  return getDefaultGarmentImage(order.garmentId || order.garmentName, order.serviceName)
}

function getAllGarmentPhotos(order?: Partial<FittingBooking> | { intakePhotoUrl?: string; imageUrl?: string; images?: string[]; garmentName?: string; garmentId?: string; serviceName?: string } | null): string[] {
  if (!order) return ['/images/service_trousers.jpg']

  const sources: any[] = []
  if ((order as any)?.images && Array.isArray((order as any).images)) {
    sources.push(...(order as any).images)
  }
  if (order.intakePhotoUrl) {
    sources.push(order.intakePhotoUrl)
  }
  if ((order as any)?.imageUrl) {
    sources.push((order as any).imageUrl)
  }

  const photos: string[] = []

  for (const src of sources) {
    if (!src) continue
    if (typeof src === 'string') {
      const trimmed = src.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:') || item.startsWith('/'))) {
                photos.push(item)
              }
            }
          }
        } catch { }
      } else if (trimmed.includes('||')) {
        const split = trimmed.split('||').map((s) => s.trim()).filter((p) => p.startsWith('http') || p.startsWith('data:') || p.startsWith('/'))
        photos.push(...split)
      } else if (trimmed.startsWith('http') || trimmed.startsWith('data:') || trimmed.startsWith('/')) {
        photos.push(trimmed)
      }
    } else if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:') || item.startsWith('/'))) {
          photos.push(item)
        }
      }
    }
  }

  const unique = Array.from(new Set(photos))
  if (unique.length === 0) {
    return [getDefaultGarmentImage(order?.garmentId || order?.garmentName, order?.serviceName)]
  }

  return unique
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
  Cancelled: { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-800 border-red-200', dot: 'bg-red-500' },
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
  onVerificationStatusChange?: (status: VerificationStatus, rejectionReason?: string | null) => void
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

export function getCleanCustomerNote(order?: any): string {
  if (!order) return ''
  const candidates = [
    order.notes,
    order.fitNotes,
    order.bookingNotes,
    order.sewingNotes,
  ]
  for (const c of candidates) {
    if (typeof c === 'string') {
      const trimmed = c.trim()
      if (
        trimmed &&
        !trimmed.startsWith('{') &&
        !trimmed.startsWith('[') &&
        trimmed !== 'Requested from Atelier Booking Portal' &&
        trimmed !== 'Customer requested alteration fitting.' &&
        trimmed !== 'Customer requested standard alteration pinning at counter.'
      ) {
        return trimmed
      }
    }
  }
  return ''
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
                className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border shadow-2xs ${isPending
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
    } else if (raw.includes('·') || raw.includes(':') || raw.includes(',')) {
      const parts = raw.split(/[·,]/).map((s) => s.trim()).filter(Boolean)
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
export interface NavItemConfig {
  id: StudioTab
  label: string
  icon: typeof Zap
  shortLabel: string
  href: string
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'cockpit', label: 'Workshop Dashboard', icon: Zap, shortLabel: 'Dashboard', href: '/dashboard' },
  { id: 'pipeline', label: 'Orders & Alterations', icon: Layers, shortLabel: 'Orders', href: '/orders' },
  { id: 'catalog', label: 'Price Catalog', icon: Tag, shortLabel: 'Catalog', href: '/catalog' },
  { id: 'payouts', label: 'Earnings & Payouts', icon: CreditCard, shortLabel: 'Earnings', href: '/payouts' },
  { id: 'profile', label: 'Studio Settings', icon: Sliders, shortLabel: 'Settings', href: '/settings' },
  // Shown only until the studio has submitted its verification files (see needsVerification)
  { id: 'verification', label: 'Verify Your Studio', icon: ShieldCheck, shortLabel: 'Verify', href: '/verification' },
]

export function PartnerFlow({
  go,
  user,
  onSignOut,
  onOpenProfile,
  onUpdateUser,
  activeTab: controlledTab,
  onTabChange,
  onVerificationStatusChange,
}: PartnerFlowProps) {
  const verificationStatus: VerificationStatus = user?.verificationStatus || 'UNSUBMITTED'
  const needsVerification = user?.role === 'STUDIO' && (verificationStatus === 'UNSUBMITTED' || verificationStatus === 'REJECTED')
  const visibleNavItems = NAV_ITEMS.filter((item) => item.id !== 'verification' || needsVerification)

  const rawStudioName = (user?.studioName || '').trim()
  const studioName =
    rawStudioName.length > 2 && rawStudioName.toLowerCase() !== 'x'
      ? rawStudioName
      : (user?.name && user.name.length > 2 && user.name.toLowerCase() !== 'x')
        ? `${user.name}'s Atelier`
        : 'Raffu Atelier · Soho Flagship'
  const tailorName =
    (user?.name && user.name.length > 1 && user.name.toLowerCase() !== 'x')
      ? user.name
      : (rawStudioName.length > 2 && rawStudioName.toLowerCase() !== 'x')
        ? rawStudioName
        : 'Master Tailor'

  const currentStudioId = user?.studioId || (user as any)?.storeId || ''

  const handleSignOutClick = async () => {
    if (onSignOut) {
      onSignOut()
    } else {
      try {
        await logoutUser()
      } catch {
        clearAllAuth()
      }
      setCookie('tg_studio_signout', '1', 1 / 1440, '/')
      const targetUrl = getCustomerSiteUrl('/?signout=studio')
      if (typeof window !== 'undefined') {
        window.location.href = targetUrl
      }
    }
  }

  const router = useRouter()
  const pathname = usePathname()

  const getTabFromPathname = (path?: string): StudioTab | null => {
    if (!path) return null
    if (path.startsWith('/orders')) return 'pipeline'
    if (path.startsWith('/catalog') || path.startsWith('/pricing')) return 'catalog'
    if (path.startsWith('/payouts') || path.startsWith('/earnings')) return 'payouts'
    if (path.startsWith('/settings') || path.startsWith('/profile')) return 'profile'
    if (path.startsWith('/dashboard')) return 'cockpit'
    if (path.startsWith('/verification')) return 'verification'
    return null
  }

  const [currentTab, setCurrentTab] = useState<StudioTab>(() => {
    if (typeof window !== 'undefined') {
      const fromPath = getTabFromPathname(window.location.pathname)
      if (fromPath) return fromPath
    }
    return getTabFromPathname(pathname) || controlledTab || 'cockpit'
  })

  // Synchronize with external prop changes
  useEffect(() => {
    if (controlledTab) {
      setCurrentTab(controlledTab)
    }
  }, [controlledTab])

  // Synchronize on browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const fromPath = getTabFromPathname(window.location.pathname)
      if (fromPath) {
        setCurrentTab(fromPath)
        if (onTabChange) onTabChange(fromPath)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onTabChange])

  const activeTab: StudioTab = currentTab

  const TAB_TO_ROUTE: Record<StudioTab, string> = {
    cockpit: '/dashboard',
    pipeline: '/orders',
    catalog: '/catalog',
    payouts: '/payouts',
    profile: '/settings',
    verification: '/verification',
  }

  const setActiveTab = (tab: StudioTab) => {
    setCurrentTab(tab)
    if (onTabChange) onTabChange(tab)
    const target = TAB_TO_ROUTE[tab]
    if (target && typeof window !== 'undefined' && window.location.pathname !== target) {
      window.history.pushState(null, '', target)
    }
  }

  // A studio can only be switched on once an admin has verified it
  const isVerified = verificationStatus === 'APPROVED'
  const isStoreOn = isVerified && user?.storeStatus !== 'INACTIVE'
  const [online, setOnline] = useState<boolean>(isStoreOn)
  const [isStatusUpdating, setIsStatusUpdating] = useState<boolean>(false)

  // Sync online state whenever the store status or verification changes
  useEffect(() => {
    setOnline(isStoreOn)
  }, [isStoreOn])

  // Dedicated handler to toggle studio Active / Inactive live status
  const handleToggleActiveStatus = async () => {
    if (!isVerified) {
      toast.info(
        verificationStatus === 'PENDING'
          ? 'Your verification is under review. You can turn your store on once it is approved.'
          : 'Please verify your studio first. Your store stays inactive until it is approved.',
        { position: 'top-center', autoClose: 4000 }
      )
      if (needsVerification) setActiveTab('verification')
      return
    }

    if (!hasFilledCatalog) {
      toast.info('Please configure your Price Catalog first before making your studio active.', {
        position: 'top-center',
        autoClose: 4000,
      })
      setActiveTab('catalog')
      if (onTabChange) onTabChange('catalog')
      return
    }

    if (isStatusUpdating) return
    setIsStatusUpdating(true)
    const nextStatus = online ? 'INACTIVE' : 'ACTIVE'

    try {
      const res = await updateStudioStatus(nextStatus)
      if (res && res.success) {
        setOnline(nextStatus === 'ACTIVE')
        if (onUpdateUser && res.user) {
          onUpdateUser(res.user)
        }
        if (nextStatus === 'ACTIVE') {
          toast.success('Studio is now Active! Visible to customers on Raffu map & bookings.', {
            position: 'top-center',
            autoClose: 3500,
          })
        } else {
          toast.info('Studio is now Inactive (Offline). Hidden from customer searches & bookings.', {
            position: 'top-center',
            autoClose: 3500,
          })
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update studio status. Please try again.', {
        position: 'top-center',
      })
    } finally {
      setIsStatusUpdating(false)
    }
  }
  const [orders, setOrders] = useState<FittingBooking[]>([])
  const [selectedOrder, setSelectedOrder] = useState<FittingBooking | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Accepted')
  const [refreshing, setRefreshing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('Just now')
  const [pendingDispatches, setPendingDispatches] = useState<PendingDispatchRequest[]>([])
  const [payoutsFilter, setPayoutsFilter] = useState<'ALL' | 'COLLECTED' | 'DUE' | 'IN_PROGRESS'>('ALL')
  const [payoutsSearch, setPayoutsSearch] = useState('')

  // Handle URL deep-linking from push notifications (e.g. /?orderId=TG-XXXXXX)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const targetOrderId = params.get('orderId')
    if (targetOrderId && orders.length > 0) {
      const match = orders.find((o) => o.id === targetOrderId)
      if (match) {
        setSelectedOrder(match)
        setActiveTab('pipeline')
      }
    }
  }, [orders])

  // Native Google Chrome notification prompt - ONLY for authenticated studio partners
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isPushSupported()) return
    if (!user?.id) return

    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default'

    if (perm === 'granted') {
      subscribeToPush({ storeId: currentStudioId, userId: user?.id }).catch(() => {})
      return
    }

    if (perm === 'default') {
      const handleUserClick = () => {
        try {
          Notification.requestPermission().then((result) => {
            if (result === 'granted') {
              subscribeToPush({ storeId: currentStudioId, userId: user?.id }).catch(() => {})
            }
          }).catch(() => {})
        } catch (e) {}

        window.removeEventListener('click', handleUserClick)
        window.removeEventListener('touchstart', handleUserClick)
      }

      window.addEventListener('click', handleUserClick, { once: true, passive: true })
      window.addEventListener('touchstart', handleUserClick, { once: true, passive: true })

      return () => {
        window.removeEventListener('click', handleUserClick)
        window.removeEventListener('touchstart', handleUserClick)
      }
    }
  }, [currentStudioId, user?.id])

  // Dynamic Studio Operating Currency (Configured in Workshop Price Catalog or Profile)
  // Dynamic Studio Operating Currency (Configured in Workshop Price Catalog or Profile - Defaults to USD)
  const [studioCurrency, setStudioCurrency] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const studioId = user?.studioId || (user as any)?.id
      const saved = (studioId && localStorage.getItem(`tg_studio_currency_${studioId}`)) || localStorage.getItem('tg_studio_currency')
      if (saved) return saved
    }
    const userCurr = (user as any)?.currency
    if (userCurr && userCurr !== 'GBP') return userCurr
    return 'USD'
  })
  const [studioCurrencySymbol, setStudioCurrencySymbol] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const studioId = user?.studioId || (user as any)?.id
      const saved = (studioId && localStorage.getItem(`tg_studio_currency_symbol_${studioId}`)) || localStorage.getItem('tg_studio_currency_symbol')
      if (saved) return saved
      const savedCurr = (studioId && localStorage.getItem(`tg_studio_currency_${studioId}`)) || localStorage.getItem('tg_studio_currency')
      if (savedCurr) return getCurrencySymbol(savedCurr)
    }
    const userCurr = (user as any)?.currency
    if (userCurr && userCurr !== 'GBP') return (user as any)?.currencySymbol || getCurrencySymbol(userCurr)
    return '$'
  })

  // Sync if user object prop updates
  useEffect(() => {
    if ((user as any)?.currency && (user as any).currency !== 'GBP') {
      setStudioCurrency((user as any).currency)
    }
    if ((user as any)?.currencySymbol && (user as any).currency !== 'GBP') {
      setStudioCurrencySymbol((user as any).currencySymbol)
    } else if ((user as any)?.currency && (user as any).currency !== 'GBP') {
      setStudioCurrencySymbol(getCurrencySymbol((user as any).currency))
    }
  }, [user])

  // Price Catalog Verification State & Persistent Prompt (cached in localStorage to prevent flash on reload)
  const [hasFilledCatalog, setHasFilledCatalog] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const studioId = user?.studioId || (user as any)?.id
      if (studioId) {
        const cached = localStorage.getItem(`tg_has_filled_catalog_${studioId}`)
        if (cached === 'true') return true
        if (cached === 'false') return false
      }
    }
    return null
  })
  const [studioCatalogItems, setStudioCatalogItems] = useState<StudioCatalogItemData[]>([])
  const [showCatalogPromptModal, setShowCatalogPromptModal] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)

  // Verify on login / mount if studio has configured price catalog
  useEffect(() => {
    let isMounted = true
    const studioIdToVerify = user?.studioId || (user as any)?.id

    if (!studioIdToVerify) return

    fetchStudioCatalog(studioIdToVerify)
      .then((data) => {
        if (!isMounted) return
        setHasFilledCatalog(data.hasFilledCatalog)
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(`tg_has_filled_catalog_${studioIdToVerify}`, data.hasFilledCatalog ? 'true' : 'false')
          } catch {}
        }
        if (Array.isArray(data.items)) {
          setStudioCatalogItems(data.items)
        }
        if (typeof window !== 'undefined') {
          const cachedCurr = localStorage.getItem(`tg_studio_currency_${studioIdToVerify}`) || localStorage.getItem('tg_studio_currency')
          if (cachedCurr) {
            setStudioCurrency(cachedCurr)
            setStudioCurrencySymbol(
              localStorage.getItem(`tg_studio_currency_symbol_${studioIdToVerify}`) ||
              localStorage.getItem('tg_studio_currency_symbol') ||
              getCurrencySymbol(cachedCurr)
            )
          } else if (data.currency && data.currency !== 'GBP') {
            setStudioCurrency(data.currency)
            setStudioCurrencySymbol(data.currencySymbol || getCurrencySymbol(data.currency))
          } else {
            setStudioCurrency('USD')
            setStudioCurrencySymbol('$')
          }
        } else if (data.currency && data.currency !== 'GBP') {
          setStudioCurrency(data.currency)
          setStudioCurrencySymbol(data.currencySymbol || getCurrencySymbol(data.currency))
        } else {
          setStudioCurrency('USD')
          setStudioCurrencySymbol('$')
        }
        // Show Welcome Aboard modal only once after fresh sign up, after 3.5 seconds on the dashboard
        if (typeof window !== 'undefined') {
          const justSignedUp = sessionStorage.getItem('tg_just_signed_up') === 'true'
          const alreadySeen = localStorage.getItem(`tg_welcome_seen_${studioIdToVerify}`) === 'true'

          if (justSignedUp && !alreadySeen && !data.hasFilledCatalog) {
            setTimeout(() => {
              if (isMounted) {
                setShowWelcomeModal(true)
                try {
                  localStorage.setItem(`tg_welcome_seen_${studioIdToVerify}`, 'true')
                  sessionStorage.removeItem('tg_just_signed_up')
                } catch {}
              }
            }, 3500)
          }
        }
      })
      .catch((err) => {
        console.warn('Price catalog verification notice:', err)
      })

    return () => {
      isMounted = false
    }
  }, [user?.studioId, (user as any)?.id])

  // Full View Image Lightbox State
  const [lightboxPhotos, setLightboxPhotos] = useState<string[] | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number>(0)

  const handleOpenFullView = (photos: string[], startIndex = 0) => {
    if (!photos || photos.length === 0) return
    setLightboxPhotos(photos)
    setLightboxIndex(startIndex)
  }

  const handleAddStudioPhoto = async (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const targetOrder = orders.find((o) => o.id === orderId)
    if (!targetOrder) return

    const readPromises = Array.from(fileList).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (evt) => resolve((evt.target?.result as string) || '')
          reader.readAsDataURL(file)
        })
    )

    const newPhotos = (await Promise.all(readPromises)).filter(Boolean)
    if (newPhotos.length === 0) return

    const existingPhotos = getAllGarmentPhotos(targetOrder).filter((p) => p.startsWith('http') || p.startsWith('data:'))
    const updatedPhotos = [...existingPhotos, ...newPhotos]
    const photoPayload = JSON.stringify(updatedPhotos)

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, intakePhotoUrl: photoPayload } : o)))
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, intakePhotoUrl: photoPayload } : prev))
    }

    await updateOrder(orderId, { intakePhotoUrl: photoPayload }).catch(() => { })
    setBroadcastToast(`✓ Added ${newPhotos.length} reference photo${newPhotos.length > 1 ? 's' : ''} to order!`)
    setTimeout(() => setBroadcastToast(null), 4000)
    e.target.value = ''
  }

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // desktop collapse

  // ── 1. Live Broadcast Queue & 15-Second Countdown ───────────────────
  const [broadcastIdx, setBroadcastIdx] = useState(0)
  const [isMorphing, setIsMorphing] = useState(false)
  const morphTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [timerSecs, setTimerSecs] = useState(15)
  const [timerProgress, setTimerProgress] = useState(100)
  const broadcastExpiryRef = useRef<{ key: string; expiresAt: number; totalDurationMs: number } | null>(null)
  const [broadcastToast, setBroadcastToast] = useState<string | null>(null)

  const handleMorphNext = (step = 1) => {
    setIsMorphing(true)
    if (morphTimeoutRef.current) clearTimeout(morphTimeoutRef.current)
    setBroadcastIdx((prev) => prev + step)
    morphTimeoutRef.current = setTimeout(() => {
      setIsMorphing(false)
    }, 380)
  }

  // Skipped order IDs for this session only (resets on reload so orders are not permanently lost)
  const [permanentlySkippedIds, setPermanentlySkippedIds] = useState<string[]>([])
  // Accepted order IDs to immediately prevent re-triggering broadcast bar upon acceptance
  const [acceptedOrderIds, setAcceptedOrderIds] = useState<string[]>([])

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

  // ── Workshop Notifications Center ──────────────────────────────────────────
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationTab, setNotificationTab] = useState<'all' | 'dropoff' | 'dispatch' | 'ready'>('all')
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('tg_read_notifications')
        return stored ? JSON.parse(stored) : []
      } catch { }
    }
    return []
  })
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('tg_dismissed_notifications')
        return stored ? JSON.parse(stored) : []
      } catch { }
    }
    return []
  })
  const notificationRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tg_read_notifications', JSON.stringify(readNotificationIds))
      } catch { }
    }
  }, [readNotificationIds])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('tg_dismissed_notifications', JSON.stringify(dismissedNotificationIds))
      } catch { }
    }
  }, [dismissedNotificationIds])

  // Close notifications popover on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false)
      }
    }
    if (notificationOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [notificationOpen])

  // Auto-dismiss PIN error banner after 7 seconds
  useEffect(() => {
    if (!pinError) return
    const timer = setTimeout(() => {
      setPinError('')
    }, 7000)
    return () => clearTimeout(timer)
  }, [pinError])

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

  // Cancel Order Modal State (Allowed only till first PIN / drop-off intake)
  const [orderToCancel, setOrderToCancel] = useState<FittingBooking | null>(null)
  const [cancelReason, setCancelReason] = useState<string>('Studio capacity reached / unable to service')
  const [isCancellingOrder, setIsCancellingOrder] = useState<boolean>(false)

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
    // Preserve accepted status for orders confirmed in this session
    const sanitized = fetched.map((o) => {
      if (acceptedOrderIds.includes(o.id) && o.status === 'Allocated') {
        return { ...o, status: 'Accepted' as const }
      }
      return o
    })
    setOrders(sanitized)
    if (sanitized.length === 0) {
      setSelectedOrder(null)
      return
    }

    const currentSelectedId = selectedOrderRef.current?.id
    if (currentSelectedId) {
      const stillExists = sanitized.find((o) => o.id === currentSelectedId)
      setSelectedOrder(stillExists || null)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const [fetched, pending] = await Promise.all([
        currentStudioId ? fetchStudioOrders(currentStudioId) : Promise.resolve(null),
        currentStudioId ? fetchPendingDispatches(currentStudioId) : Promise.resolve(null),
      ])
      if (fetched) {
        updateOrdersAndSelected(fetched)
      }
      if (Array.isArray(pending)) {
        setPendingDispatches(pending)
      }
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 2000)
      const now = new Date()
      setLastSyncedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
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

  // Instantly handle saved catalog: updates cards, orders, parent user state, and cross-tab broadcasts with 0ms delay
  const handleCatalogSaved = (items: StudioCatalogItemData[], curr?: string, currSym?: string) => {
    setHasFilledCatalog(true)
    if (typeof window !== 'undefined') {
      const studioId = user?.studioId || (user as any)?.id
      if (studioId) {
        try {
          localStorage.setItem(`tg_has_filled_catalog_${studioId}`, 'true')
        } catch {}
      }
    }
    setShowCatalogPromptModal(false)
    if (Array.isArray(items)) {
      setStudioCatalogItems(items)
    }
    const effectiveCurr = curr || items?.[0]?.currency || studioCurrency
    const effectiveSym = currSym || items?.[0]?.currencySymbol || getCurrencySymbol(effectiveCurr)

    // 1. Immediately update reactive studio currency state
    setStudioCurrency(effectiveCurr)
    setStudioCurrencySymbol(effectiveSym)

    // 2. Instantly update current in-memory orders so cards reflect without reload
    setOrders((prev) =>
      prev.map((o) => ({
        ...o,
        currency: effectiveCurr,
        currencySymbol: effectiveSym,
      }))
    )

    // 3. Trigger instant background sync with backend
    handleRefresh()

    // 4. Sync authenticated user in parent layout & cookie storage
    if (onUpdateUser && user) {
      onUpdateUser({
        ...user,
        currency: effectiveCurr,
        currencySymbol: effectiveSym,
      } as any)
    }

    // 5. Broadcast cross-tab and intra-window instant event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tg_currency_updated', {
          detail: { currency: effectiveCurr, currencySymbol: effectiveSym },
        })
      )
      try {
        const bc = new BroadcastChannel('tg_currency_channel')
        bc.postMessage({ currency: effectiveCurr, currencySymbol: effectiveSym })
        bc.close()
      } catch { }
    }
  }

  // Cross-tab and window synchronization listener for instant currency updates
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleCurrencyEvent = (e: any) => {
      const { currency, currencySymbol } = e.detail || {}
      if (currency) setStudioCurrency(currency)
      if (currencySymbol) {
        setStudioCurrencySymbol(currencySymbol)
      } else if (currency) {
        setStudioCurrencySymbol(getCurrencySymbol(currency))
      }
      setOrders((prev) =>
        prev.map((o) => ({
          ...o,
          currency: currency || o.currency,
          currencySymbol: currencySymbol || o.currencySymbol,
        }))
      )
      handleRefresh()
    }

    window.addEventListener('tg_currency_updated', handleCurrencyEvent)

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('tg_currency_channel')
      bc.onmessage = (event) => {
        const { currency, currencySymbol } = event.data || {}
        if (currency) setStudioCurrency(currency)
        if (currencySymbol) {
          setStudioCurrencySymbol(currencySymbol)
        } else if (currency) {
          setStudioCurrencySymbol(getCurrencySymbol(currency))
        }
        setOrders((prev) =>
          prev.map((o) => ({
            ...o,
            currency: currency || o.currency,
            currencySymbol: currencySymbol || o.currencySymbol,
          }))
        )
        handleRefresh()
      }
    } catch { }

    return () => {
      window.removeEventListener('tg_currency_updated', handleCurrencyEvent)
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
  const liveAllocatedOrders = orders.filter((o) => {
    if (o.status !== 'Allocated') return false
    if (permanentlySkippedIds.includes(o.id)) return false
    if (acceptedOrderIds.includes(o.id)) return false
    if (o.storeId && currentStudioId && o.storeId !== currentStudioId) return false
    return true
  })

  const cleanDistanceLabel = (dist?: string | number) => {
    if (!dist) return '0.8 mi away'
    const num = parseFloat(String(dist))
    if (!isNaN(num)) {
      if (num < 0.05) return '0.1 mi away'
      return `${num.toFixed(1)} mi away`
    }
    return String(dist).replace(/(\d+(\.\d+)?([eE][-+]?\d+)?)\s*mi/i, (_, n) => {
      const val = parseFloat(n)
      if (isNaN(val) || val < 0.05) return '0.1 mi'
      return `${val.toFixed(1)} mi`
    })
  }

  // Helper to determine if a service is disabled by this studio partner
  const isServiceDisabledForStudio = (serviceId?: string, serviceName?: string, garmentId?: string) => {
    if (!studioCatalogItems || studioCatalogItems.length === 0) return false
    const sId = serviceId ? serviceId.toLowerCase().trim() : ''
    const sName = serviceName ? serviceName.toLowerCase().trim() : ''
    const gId = garmentId ? garmentId.toLowerCase().trim() : ''

    const matches = studioCatalogItems.filter((item) => {
      const itemSId = item.serviceId ? item.serviceId.toLowerCase().trim() : ''
      const itemName = item.name ? item.name.toLowerCase().trim() : ''
      const itemCat = item.categoryId ? item.categoryId.toLowerCase().trim() : ''

      if (sId && itemSId && sId === itemSId) return true
      if (sName && itemName && sName === itemName) return true
      if (gId && itemCat && gId === itemCat) return true
      return false
    })

    if (matches.length > 0) {
      // If matching items exist, service is disabled if NONE of the matches are enabled with price > 0
      const hasActive = matches.some((item) => item.enabled !== false && Number(item.price) > 0)
      return !hasActive
    }
    return false
  }

  // Map incoming dispatch requests (Single Dispatch Engine in Server Cache)
  const dispatchBroadcasts: BroadcastRequest[] = pendingDispatches
    .filter((pd) => !permanentlySkippedIds.includes(pd.orderId) && !acceptedOrderIds.includes(pd.orderId))
    .filter((pd) => !isServiceDisabledForStudio(
      pd.order?.serviceId || (pd as any).serviceId,
      pd.serviceName || pd.order?.serviceName,
      pd.order?.garmentId || (pd as any).garmentId
    ))
    .map((pd) => ({
      id: pd.orderId,
      customerName: pd.customerName || pd.order?.customerName || 'Customer',
      customerArea: pd.distance ? `${cleanDistanceLabel(pd.distance)} · Stage ${pd.stage || 1}` : 'Local Area · 0.8 mi away',
      distanceMiles: pd.distanceMiles || 0.8,
      garmentName: pd.garmentName || pd.order?.garmentName || 'Garment Alteration',
      quantity: pd.quantity || pd.order?.quantity || 1,
      serviceName: pd.serviceName || pd.order?.serviceName || 'Custom Fit & Alteration',
      fittingType: 'NEED_STUDIO_FITTING',
      garmentBrand: pd.order?.garmentBrand || '',
      notes: pd.order?.notes || pd.order?.fitNotes || pd.order?.bookingNotes || '',
      fitNotes: pd.order?.notes || pd.order?.fitNotes || pd.order?.bookingNotes || '',
      partnerPayout: pd.payout || pd.order?.partnerPayout || 15,
      price: pd.order?.price,
      currency: pd.order?.currency,
      currencySymbol: pd.order?.currencySymbol,
      slaHours: pd.order?.slaHours || 48,
      imageUrl: pd.order?.imageUrl || pd.order?.intakePhotoUrl || '',
      otp: pd.order?.otp || '0000',
      isDispatchSession: true,
      realOrder: pd.order,
      secondsRemaining: pd.secondsRemaining,
      stage: pd.stage,
    }))

  // Map live allocated orders from database (real customer alteration bookings)
  const allocatedBroadcasts: BroadcastRequest[] = liveAllocatedOrders
    .filter((o) => !isServiceDisabledForStudio(o.serviceId, o.serviceName, o.garmentId))
    .map((o) => ({
      id: o.id,
      customerName: o.customerName || 'Valued Customer',
      customerArea: o.postcode ? `${o.postcode} · Local Area` : 'Local Area · 0.8 mi away',
      distanceMiles: 0.8,
      garmentName: o.garmentName || 'Garment Alteration',
      quantity: o.quantity || 1,
      serviceName: o.serviceName || 'Custom Fit & Alteration',
      fittingType: 'NEED_STUDIO_FITTING' as const,
      garmentBrand: o.garmentBrand || '',
      notes: o.notes || o.fitNotes || '',
      fitNotes: o.notes || o.fitNotes || '',
      partnerPayout: o.partnerPayout || Math.round((o.price || 30) * 0.75),
      price: o.price,
      currency: o.currency,
      currencySymbol: o.currencySymbol,
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

  const totalBroadcasts = allBroadcasts.length
  const currentBroadcastIndex = totalBroadcasts > 0 ? broadcastIdx % totalBroadcasts : 0
  const currentBroadcast = totalBroadcasts > 0 ? allBroadcasts[currentBroadcastIndex] : null
  const currentBroadcastKey = currentBroadcast ? `${currentBroadcast.id}-stage-${currentBroadcast.stage || 1}` : null

  // Next order in bundle (peeking behind front card)
  const nextBroadcastIndex = totalBroadcasts > 1 ? (currentBroadcastIndex + 1) % totalBroadcasts : -1
  const nextBroadcast = nextBroadcastIndex !== -1 ? allBroadcasts[nextBroadcastIndex] : null

  // Third order in bundle (for deep stack if 3+ orders)
  const thirdBroadcastIndex = totalBroadcasts > 2 ? (currentBroadcastIndex + 2) % totalBroadcasts : -1
  const thirdBroadcast = thirdBroadcastIndex !== -1 ? allBroadcasts[thirdBroadcastIndex] : null

  const handleAcceptAllocatedOrder = async (order: FittingBooking) => {
    const assignedStudioId = currentStudioId
    const assignedStudioName = (user?.studioName && user.studioName.trim()) || studioName || (user?.name ? `${user.name}'s Atelier` : 'Partner Atelier')
    const assignedStudioPhone = user?.phone || user?.contact || ''
    const partnerPayout = order.price || order.partnerPayout || 30

    // Immediately mark as accepted so broadcast bar will never re-open for this order
    setAcceptedOrderIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]))

    const updates: Partial<FittingBooking> = {
      status: 'Accepted',
      storeId: assignedStudioId,
      storeName: assignedStudioName,
      ...(assignedStudioPhone ? { storePhone: assignedStudioPhone } : {}),
      partnerPayout,
    }

    // Immediately remove from broadcast bar & reset timer (0ms)
    broadcastExpiryRef.current = null
    setTimerSecs(15)
    setTimerProgress(100)
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...updates } : o)))

    // Instantly notify customer browser tab over BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bcChannel = new BroadcastChannel('tg_dispatch_channel')
        bcChannel.postMessage({
          type: 'DISPATCH_ACCEPTED',
          orderId: order.id,
          storeId: assignedStudioId,
          storeName: assignedStudioName,
          storePhone: assignedStudioPhone,
          storeAddress: user?.address || 'Partner Atelier',
        })
        bcChannel.close()
      } catch { }
    }

    await updateOrder(order.id, updates).catch(() => { })
  }

  const handleAcceptBroadcast = async (bc: BroadcastRequest) => {
    // 0. Instantly close broadcast bar and reset countdown progress (0ms delay)
    broadcastExpiryRef.current = null
    setTimerSecs(15)
    setTimerProgress(100)
    setPendingDispatches((prev) => prev.filter((p) => p.orderId !== bc.id))
    setAcceptedOrderIds((prev) => (prev.includes(bc.id) ? prev : [...prev, bc.id]))

    const studioDisplayName =
      (user?.studioName && user.studioName.trim()) ||
      studioName ||
      (user?.name ? `${user.name}'s Atelier` : 'Partner Atelier')
    const studioPhone = user?.phone || user?.contact || ''

    // Instantly notify customer tab with 0ms delay via cross-tab channel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bcChannel = new BroadcastChannel('tg_dispatch_channel')
        bcChannel.postMessage({
          type: 'DISPATCH_ACCEPTED',
          orderId: bc.id,
          storeId: currentStudioId,
          storeName: studioDisplayName,
          storePhone: studioPhone,
          storeAddress: user?.address || 'Partner Atelier',
        })
        bcChannel.close()
      } catch { }
    }

    // Immediately promote in studio workbench orders list
    const promotionUpdates: Partial<FittingBooking> = {
      status: 'Accepted' as const,
      storeId: currentStudioId,
      storeName: studioDisplayName,
      ...(studioPhone ? { storePhone: studioPhone } : {}),
      partnerPayout: bc.price || bc.partnerPayout || 30,
    }
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === bc.id)
      if (exists) {
        return prev.map((o) => (o.id === bc.id ? { ...o, ...promotionUpdates } : o))
      } else if (bc.realOrder) {
        return [{ ...bc.realOrder, ...promotionUpdates }, ...prev]
      } else {
        const initialOrder: FittingBooking = {
          id: bc.id,
          customerName: bc.customerName || 'Valued Customer',
          customerEmail: 'customer@example.com',
          customerPhone: '',
          postcode: bc.customerArea || '',
          garmentId: 'trousers',
          garmentName: bc.garmentName || 'Garment Alteration',
          serviceId: 'tailoring',
          serviceName: bc.serviceName || 'Custom Fit & Alteration',
          storeId: currentStudioId,
          storeName: studioDisplayName,
          storePhone: studioPhone,
          date: new Date().toISOString().split('T')[0],
          timeSlot: '14:00 - 15:00',
          garmentBrand: bc.garmentBrand || '',
          fitNotes: bc.notes || bc.fitNotes || '',
          sewingNotes: '',
          slaHours: bc.slaHours || 48,
          partnerPayout: bc.price || bc.partnerPayout || 30,
          retailSold: false,
          intakePhotoUrl: bc.imageUrl || '',
          status: 'Accepted',
          price: bc.price || bc.partnerPayout || 30,
          otp: bc.otp || '0000',
        }
        return [initialOrder, ...prev]
      }
    })
    setBroadcastToast(`⚡ Order #${bc.id} accepted! Added to workshop queue.`)
    setTimeout(() => setBroadcastToast(null), 5000)

    // 1. Live Dispatch Cache Request -> respond with ACCEPT
    if (bc.isDispatchSession) {
      if (!currentStudioId) return
      const res = await respondToDispatch(bc.id, currentStudioId, 'ACCEPT')
      if (res.success) {
        if (res.order) {
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === bc.id)
            if (idx >= 0) {
              const copy = [...prev]
              copy[idx] = { ...copy[idx], ...res.order, status: 'Accepted' }
              return copy
            }
            return [{ ...res.order, status: 'Accepted' }, ...prev]
          })
        }
        updateOrder(bc.id, promotionUpdates).catch(() => { })
      } else {
        if (res.code === 'ORDER_ALREADY_ASSIGNED') {
          setBroadcastToast('Order was accepted by another partner atelier.')
          setAcceptedOrderIds((prev) => prev.filter((id) => id !== bc.id))
          setOrders((prev) => prev.filter((o) => o.id !== bc.id))
        } else {
          setBroadcastToast(res.message || 'Unable to accept request.')
          setAcceptedOrderIds((prev) => prev.filter((id) => id !== bc.id))
        }
        setTimeout(() => setBroadcastToast(null), 4000)
        handleRefresh()
      }
      return
    }

    // 2. Database Allocated Order
    if (bc.isRealCustomerOrder && bc.realOrder) {
      await handleAcceptAllocatedOrder(bc.realOrder)
    }
  }

  const handleSkipBroadcast = async (bc?: BroadcastRequest | null) => {
    if (!bc) return
    broadcastExpiryRef.current = null
    setTimerSecs(15)
    setTimerProgress(100)
    setBroadcastIdx((prev) => prev + 1)

    // Store in permanentlySkippedIds so this studio never sees this order again in this session
    setPermanentlySkippedIds((prev) => (prev.includes(bc.id) ? prev : [...prev, bc.id]))

    if (bc.isDispatchSession && currentStudioId) {
      respondToDispatch(bc.id, currentStudioId, 'SKIP').catch(() => { })
      setPendingDispatches((prev) => prev.filter((p) => p.orderId !== bc.id))
    }
  }

  // Smooth Timestamp-Based Timer (50ms continuous ticker, re-anchored on every broadcast rotation or stage transition)
  useEffect(() => {
    if (!online || !currentBroadcast || !currentBroadcastKey) {
      broadcastExpiryRef.current = null
      setTimerSecs(15)
      setTimerProgress(100)
      return
    }

    const bKey = currentBroadcastKey
    const serverRemainingSec =
      typeof currentBroadcast.secondsRemaining === 'number' && currentBroadcast.secondsRemaining > 0
        ? currentBroadcast.secondsRemaining
        : 15

    const remainingMs = Math.max(1000, Math.min(15, serverRemainingSec) * 1000)
    broadcastExpiryRef.current = {
      key: bKey,
      expiresAt: Date.now() + remainingMs,
      totalDurationMs: 15000,
    }
    setTimerProgress(Math.max(0, Math.min(100, (remainingMs / 15000) * 100)))
    setTimerSecs(Math.ceil(remainingMs / 1000))

    const interval = setInterval(() => {
      if (!broadcastExpiryRef.current) return

      const now = Date.now()
      const remainingMs = broadcastExpiryRef.current.expiresAt - now

      if (remainingMs <= 0) {
        // Cycle to next broadcast order in queue and immediately re-anchor with depth morphism
        handleMorphNext(1)
        setTimerSecs(15)
        setTimerProgress(100)
      } else {
        const secs = Math.ceil(remainingMs / 1000)
        const pct = Math.max(0, Math.min(100, (remainingMs / broadcastExpiryRef.current.totalDurationMs) * 100))
        setTimerSecs(secs)
        setTimerProgress(pct)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [online, currentBroadcastKey, broadcastIdx])

  // Play audio chime and trigger desktop push alert when an incoming dispatch appears
  const lastNotifiedBroadcastRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentBroadcast || !currentBroadcastKey) return
    if (lastNotifiedBroadcastRef.current === currentBroadcastKey) return

    lastNotifiedBroadcastRef.current = currentBroadcastKey

    // 1. Play crystal tailor chime
    playAtelierChime()

    // 2. Trigger native OS / Service Worker notification if in background or tab minimized
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notifTitle = `⚡ INCOMING DISPATCH: ${currentBroadcast.garmentName || 'Garment Alteration'}`
        const notifBody = `${currentBroadcast.serviceName || 'Custom Fit'} · ${currentBroadcast.customerArea || 'Nearby'} · 15s to accept`

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(notifTitle, {
              body: notifBody,
              icon: '/android-chrome-192x192.png',
              badge: '/favicon-32x32.png',
              tag: `dispatch-${currentBroadcast.id}`,
              renotify: true,
              data: {
                url: `/?orderId=${currentBroadcast.id}&dispatch=true`,
              },
            } as any)
          }).catch(() => {})
        } else {
          new Notification(notifTitle, {
            body: notifBody,
            icon: '/android-chrome-192x192.png',
            tag: `dispatch-${currentBroadcast.id}`,
          })
        }
      } catch (err) {
        console.warn('Local dispatch notification notice:', err)
      }
    }
  }, [currentBroadcastKey, currentBroadcast])

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
      sendOtp(targetOrder.customerPhone).catch(() => { })
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
      if (otherOrder.status === 'Ready') {
        // Customer arrived at counter for pickup! Open Pickup Handover & Payment modal immediately
        setPinInput('')
        setPinError('')
        handleOpenPickupModal(otherOrder, clean)
        return
      }
      if (otherOrder.status === 'Work in Progress') {
        setPinError(`Order #${otherOrder.id} (${otherOrder.customerName}) is already on the sewing bench.`)
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

  // Cancel Order Handlers (Only allowed before first PIN is entered / drop-off intake)
  const handleInitiateCancelOrder = (order: FittingBooking) => {
    setOrderToCancel(order)
    setCancelReason('Studio capacity reached / unable to service')
  }

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return
    setIsCancellingOrder(true)
    const targetId = orderToCancel.id
    const targetCust = orderToCancel.customerName
    const reasonText = cancelReason.trim() || 'Studio unable to service alteration before drop-off'

    try {
      // 1. Update status to Cancelled in PostgreSQL database
      await updateOrder(targetId, {
        status: 'Cancelled',
        fabricConditionNotes: `Cancelled by Studio: ${reasonText}`,
      }).catch((e) => console.warn('Backend cancel update error:', e))

      // 2. Broadcast cancellation via BroadcastChannel to customer's live tracking view (instant 0ms)
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('tg_dispatch_channel')
          bc.postMessage({
            type: 'ORDER_CANCELLED',
            orderId: targetId,
            customerName: targetCust,
            by: 'STUDIO',
            reason: reasonText,
          })
          bc.postMessage({
            type: 'DISPATCH_CANCELLED',
            orderId: targetId,
          })
          bc.close()
        } catch { }
      }

      // 3. Update localStorage and dispatch event for cross-tab and local consumers
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem(`tg_order_${targetId}`)
          if (saved) {
            const parsed = JSON.parse(saved)
            parsed.status = 'Cancelled'
            parsed.cancelledBy = 'STUDIO'
            parsed.cancelReason = reasonText
            localStorage.setItem(`tg_order_${targetId}`, JSON.stringify(parsed))
          }
          window.dispatchEvent(
            new CustomEvent('tg_order_status_change', {
              detail: { orderId: targetId, status: 'Cancelled', by: 'STUDIO', reason: reasonText },
            })
          )
        } catch { }
      }

      // 4. Update Studio local state so order is marked Cancelled
      setOrders((prev) =>
        prev.map((o) => (o.id === targetId ? { ...o, status: 'Cancelled' as OrderStatus } : o))
      )
      if (selectedOrder?.id === targetId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: 'Cancelled' as OrderStatus } : null))
      }

      setBroadcastToast(`✓ Order #${targetId} cancelled. Client ${targetCust} has been notified.`)
      setTimeout(() => setBroadcastToast(null), 5000)
    } catch (err) {
      console.error('Failed to cancel order:', err)
    } finally {
      setIsCancellingOrder(false)
      setOrderToCancel(null)
    }
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
      pinnedAdjustment: Object.keys(updatedMap).length > 0 ? JSON.stringify(updatedMap) : (combinedSpecs || 'Standard alteration'),
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
  const handleOpenPickupModal = (order: FittingBooking, prefilledPin?: string) => {
    setPickupModalOrder(order)
    const pin = prefilledPin ? prefilledPin.trim() : ''
    setPickupOtpInput(pin)
    setPickupOtpError('')
    setPickupVerified(pin ? isOrderPinMatch(order, pin) : false)
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
    const collectedPrice = pickupModalOrder.price || 0

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
      setBroadcastToast(`✓ Payment Received! +${studioCurrencySymbol}${collectedPrice} added to Today's Revenue. Handover complete.`)
      setTimeout(() => setBroadcastToast(null), 5000)
    }, 1500)
  }

  // Stats computed from real database orders (actual standard rate customer pays directly at studio upon pickup)
  // Revenue ONLY increases when 2nd OTP is verified and order is Closed / Collected!
  const todayEarned = orders
    .filter((o) => o.status === 'Closed' || o.status === 'Collected')
    .reduce((sum, o) => sum + (o.price || 0), 0)

  // Pending value currently in progress or awaiting pickup
  const pendingPickupValue = orders
    .filter((o) => ['Work in Progress', 'Ready'].includes(o.status))
    .reduce((sum, o) => sum + (o.price || 0), 0)

  const totalClosedDisbursed = todayEarned

  const pipelineOrders = orders

  const activeOnBench = pipelineOrders.filter((o) => o.status === 'Work in Progress').length
  const pendingDropOffs = pipelineOrders.filter((o) => ['Accepted', 'Allocated', 'Customer Arrived'].includes(o.status)).length
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

  // ── Workshop Notifications Generation ──────────────────────────────────────
  const cleanGarmentTitle = (name?: string) => {
    if (!name) return 'Garment'
    return name
      .replace(/trousers\s*&\s*jeans/i, 'Trousers')
      .replace(/\s*&\s*jeans/i, '')
      .trim()
  }

  const cleanServiceTitle = (service?: string) => {
    if (!service) return 'Alteration'
    return service
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s*-\s*standard/i, '')
      .trim()
  }

  interface WorkshopNotificationItem {
    id: string
    category: 'dropoff' | 'dispatch' | 'ready' | 'bench'
    title: string
    subtitle: string
    time: string
    badge?: string
    actionLabel: string
    onAction: () => void
  }

  const allNotifications: WorkshopNotificationItem[] = [
    // 1. Customer Arrived at Counter (High Priority Drop-off)
    ...orders
      .filter((o) => o.status === 'Customer Arrived')
      .map((o) => ({
        id: `arrived-${o.id}`,
        category: 'dropoff' as const,
        title: `At Counter · ${o.customerName}`,
        subtitle: `${cleanGarmentTitle(o.garmentName)} · ${cleanServiceTitle(o.serviceName)}`,
        time: 'Now',
        badge: 'Counter',
        actionLabel: 'Enter OTP',
        onAction: () => {
          setReadNotificationIds((prev) => Array.from(new Set([...prev, `arrived-${o.id}`])))
          setPinInput('')
          setPinError('')
          setNotificationOpen(false)
          setActiveTab('pipeline')
          const el = document.getElementById('studio-counter-pin-input')
          if (el) {
            el.focus()
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        },
      })),

    // 2. Scheduled Drop-Offs arriving today
    ...orders
      .filter((o) => o.status === 'Accepted')
      .map((o) => ({
        id: `dropoff-${o.id}`,
        category: 'dropoff' as const,
        title: `Drop-off · ${o.customerName}`,
        subtitle: `${cleanGarmentTitle(o.garmentName)} · ${cleanServiceTitle(o.serviceName)}`,
        time: o.timeSlot || 'Today',
        badge: 'Drop-off',
        actionLabel: 'Enter OTP',
        onAction: () => {
          setReadNotificationIds((prev) => Array.from(new Set([...prev, `dropoff-${o.id}`])))
          setPinInput('')
          setPinError('')
          setNotificationOpen(false)
          setActiveTab('pipeline')
          const el = document.getElementById('studio-counter-pin-input')
          if (el) {
            el.focus()
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        },
      })),

    // 3. New Booking Requests (Allocated orders awaiting studio confirmation)
    ...orders
      .filter((o) => o.status === 'Allocated' && !permanentlySkippedIds.includes(o.id) && !acceptedOrderIds.includes(o.id))
      .map((o) => ({
        id: `allocated-${o.id}`,
        category: 'dispatch' as const,
        title: `Booking · ${o.customerName}`,
        subtitle: `${cleanGarmentTitle(o.garmentName)} · ${cleanServiceTitle(o.serviceName)} · ${o.currencySymbol || studioCurrencySymbol}${o.price || 35}`,
        time: 'New',
        badge: 'Booking',
        actionLabel: 'Accept',
        onAction: () => {
          setReadNotificationIds((prev) => Array.from(new Set([...prev, `allocated-${o.id}`])))
          setNotificationOpen(false)
          setActiveTab('pipeline')
          handleAcceptAllocatedOrder(o)
        },
      })),

    // 4. Live Incoming Dispatch Requests
    ...dispatchBroadcasts.map((bc) => ({
      id: `dispatch-${bc.id}`,
      category: 'dispatch' as const,
      title: 'New Request',
      subtitle: `${cleanGarmentTitle(bc.garmentName)} · ${cleanServiceTitle(bc.serviceName)} · ${bc.currencySymbol || studioCurrencySymbol}${bc.price || bc.partnerPayout}`,
      time: bc.secondsRemaining ? `${bc.secondsRemaining}s left` : 'Live',
      badge: 'Live',
      actionLabel: 'Review',
      onAction: () => {
        setReadNotificationIds((prev) => Array.from(new Set([...prev, `dispatch-${bc.id}`])))
        setNotificationOpen(false)
        setActiveTab('pipeline')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      },
    })),

    // 5. Ready on Rack for Customer Pickup
    ...orders
      .filter((o) => o.status === 'Ready')
      .map((o) => ({
        id: `ready-${o.id}`,
        category: 'ready' as const,
        title: `Ready · ${o.customerName}`,
        subtitle: `${cleanGarmentTitle(o.garmentName)} · Rack ${o.hangTagNo || 'A-1'}`,
        time: 'Ready',
        badge: 'Rack',
        actionLabel: 'Handover',
        onAction: () => {
          setReadNotificationIds((prev) => Array.from(new Set([...prev, `ready-${o.id}`])))
          setSelectedOrder(o)
          setActiveTab('pipeline')
          setNotificationOpen(false)
          handleOpenPickupModal(o)
        },
      })),

    // 6. Sewing Bench In-Progress Alterations
    ...orders
      .filter((o) => o.status === 'Work in Progress')
      .slice(0, 3)
      .map((o) => ({
        id: `bench-${o.id}`,
        category: 'bench' as const,
        title: `On Bench · ${o.customerName}`,
        subtitle: `${cleanGarmentTitle(o.garmentName)} · Tag #${o.hangTagNo || 'A-1'}`,
        time: 'Sewing',
        badge: 'Bench',
        actionLabel: 'View',
        onAction: () => {
          setReadNotificationIds((prev) => Array.from(new Set([...prev, `bench-${o.id}`])))
          setSelectedOrder(o)
          setActiveTab('pipeline')
          setNotificationOpen(false)
        },
      })),
  ]

  const visibleNotifications = allNotifications.filter(
    (n) => !dismissedNotificationIds.includes(n.id)
  )

  const unreadNotificationCount = visibleNotifications.filter(
    (n) => !readNotificationIds.includes(n.id)
  ).length

  const filteredNotifications = visibleNotifications.filter((n) => {
    if (notificationTab === 'all') return true
    return n.category === notificationTab
  })

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
          ${sidebarCollapsed ? 'w-20' : 'w-64'}
        `}
      >
        {/* Sidebar Header: Brand Node */}
        <div className={`relative flex items-center justify-center px-4 h-18 border-b border-slate-800/80 shrink-0`}>
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center justify-center py-1">
                <RaffuLogo theme="dark" devanagariOnly size="lg" />
              </div>
              {/* Collapse button — desktop only */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="hidden md:grid size-8 place-items-center hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer absolute right-3"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
              {/* Close button — mobile only */}
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="md:hidden grid size-8 place-items-center hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer absolute right-3"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex items-center justify-center cursor-pointer hover:opacity-85 transition-opacity py-1"
              title="Expand sidebar"
            >
              <RaffuLogo theme="dark" devanagariOnly size="md" />
            </button>
          )}
        </div>



        {/* Nav Items — The 4 Core Workshop Pillars */}
        <nav className="flex-1 p-3.5 pt-4 space-y-3 overflow-y-auto scrollbar-none">
          {visibleNavItems.map((item) => {
            const active = activeTab === item.id
            const Icon = item.icon
            const badge =
              item.id === 'cockpit' && allBroadcasts.length > 0 ? allBroadcasts.length :
                item.id === 'pipeline' ? pendingDropOffs : null

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setSidebarOpen(false)
                  setActiveTab(item.id)
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`
                  w-full flex items-center gap-3.5 text-[13px] font-semibold rounded-xl transition-all cursor-pointer text-left
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
                    {item.id === 'verification' && (
                      <span className="size-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* User / Studio Footer */}
        <div className={`p-3.5 border-t border-slate-800/80 space-y-1.5 shrink-0 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(false)
                setActiveTab('profile')
              }}
              title={tailorName}
              className="hover:scale-105 transition-transform cursor-pointer"
            >
              <StudioAvatar avatar={user?.avatar} name={tailorName} size="md" showStatusDot={true} status={online ? 'ACTIVE' : 'INACTIVE'} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(false)
                setActiveTab('profile')
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors text-left"
            >
              <StudioAvatar avatar={user?.avatar} name={tailorName} size="sm" showStatusDot={true} status={online ? 'ACTIVE' : 'INACTIVE'} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{tailorName}</div>
                <div className="text-[10px] text-slate-400 truncate">{user?.area || user?.postcode || 'Partner Tailor'}</div>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOutClick}
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
                {activeTab === 'cockpit' && 'Workshop Dashboard'}
                {activeTab === 'pipeline' && 'Orders & Alterations'}
                {activeTab === 'catalog' && 'Price Catalog'}
                {activeTab === 'payouts' && 'Earnings & Payouts'}
                {activeTab === 'profile' && 'Studio Settings'}
                {activeTab === 'verification' && 'Verify Your Studio'}
              </h1>
              {!hasFilledCatalog ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('catalog')
                    if (onTabChange) onTabChange('catalog')
                  }}
                  title="Configure Price Catalog to activate your store"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/90 px-2.5 py-0.5 rounded-full transition-all cursor-pointer shadow-2xs"
                >
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span>Offline · Setup Required</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isStatusUpdating}
                  onClick={handleToggleActiveStatus}
                  aria-disabled={!isVerified}
                  title={
                    !isVerified
                      ? 'Store stays inactive until your studio is verified.'
                      : online
                      ? 'Studio is ACTIVE: Visible to customers on Raffu map & bookings. Click to switch to Inactive (Offline).'
                      : 'Studio is INACTIVE: Hidden from customer map, searches & bookings. Click to switch to Active (Online).'
                  }
                  className={`group inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full transition-all border cursor-pointer select-none shadow-2xs ${
                    online
                      ? 'bg-emerald-50 hover:bg-emerald-100/90 text-emerald-800 border-emerald-300/90 hover:border-emerald-400'
                      : 'bg-slate-100 hover:bg-slate-200/90 text-slate-700 border-slate-300/90 hover:border-slate-400'
                  } ${isStatusUpdating ? 'opacity-70 cursor-wait' : ''} ${!isVerified ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span className="relative flex size-2">
                    {online ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full size-2 bg-slate-400" />
                    )}
                  </span>
                  <span className="tracking-tight">
                    {online ? 'Store Active' : !isVerified ? 'Store Inactive · Not verified' : 'Store Inactive'}
                  </span>
                  {/* Miniature toggle switch indicator */}
                  <span
                    className={`inline-flex items-center shrink-0 w-6 h-3.5 rounded-full transition-colors p-0.5 pointer-events-none ${
                      online ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`size-2.5 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                        online ? 'translate-x-2.5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-500 truncate hidden sm:block">
              {activeTab === 'cockpit' && 'Quick order check-in, customer PIN verification, and active alteration orders'}
              {activeTab === 'pipeline' && 'Manage orders from customer drop-off to tailoring and final pickup'}
              {activeTab === 'catalog' && 'Configure custom pricing, turnaround times, and alteration offerings'}
              {activeTab === 'payouts' && 'Track your daily earnings and direct payouts to your bank account'}
              {activeTab === 'profile' && 'Manage your shop details, opening hours, equipment, and contact info'}
              {activeTab === 'verification' && 'Upload shop photos and a machines video to start receiving requests'}
            </span>
          </div>

          <div className="flex-1" />

          {/* Right Status Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Metrics Capsules */}
            <div className="hidden xl:flex items-center gap-2 text-xs bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 font-medium">
              <div className="px-2.5 py-1 rounded-lg bg-white shadow-2xs text-slate-800 font-bold flex items-center gap-1.5">
                <span className="text-emerald-700">{studioCurrencySymbol}{todayEarned}</span>
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

            {/* Workshop Notification Center Bell */}
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setNotificationOpen(!notificationOpen)}
                className={`relative size-9 rounded-xl border flex items-center justify-center cursor-pointer transition-all ${notificationOpen
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 shadow-2xs'
                  }`}
                title="Workshop Notifications & Alerts"
                aria-label="Workshop Notifications"
              >
                <Bell size={16} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 size-4.5 rounded-full bg-[#9E593B] text-white text-[9px] font-black flex items-center justify-center shadow-xs ring-2 ring-white animate-pulse">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {notificationOpen && (
                <div className="fixed right-2 sm:absolute sm:right-0 top-auto sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2" style={{top: 'calc(4rem + 0.5rem)'}}>
                  {/* Popover Header */}
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <Bell size={15} className="text-[#9E593B]" />
                      <span className="text-xs font-bold text-slate-900">Notifications</span>
                      {unreadNotificationCount > 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#9E593B]/10 text-[#9E593B]">
                          {unreadNotificationCount} unread
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400">
                          All caught up
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadNotificationCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setReadNotificationIds((prev) => Array.from(new Set([...prev, ...allNotifications.map((n) => n.id)])))}
                          className="text-[11px] font-semibold text-[#9E593B] hover:underline cursor-pointer transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                      {visibleNotifications.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDismissedNotificationIds((prev) => Array.from(new Set([...prev, ...visibleNotifications.map((n) => n.id)])))}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                          title="Clear all notifications"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                    {[
                      { id: 'all', label: 'All', count: visibleNotifications.length, unread: visibleNotifications.filter((n) => !readNotificationIds.includes(n.id)).length },
                      { id: 'dropoff', label: 'Drop-Offs', count: visibleNotifications.filter((n) => n.category === 'dropoff').length, unread: visibleNotifications.filter((n) => n.category === 'dropoff' && !readNotificationIds.includes(n.id)).length },
                      { id: 'dispatch', label: 'Requests', count: visibleNotifications.filter((n) => n.category === 'dispatch').length, unread: visibleNotifications.filter((n) => n.category === 'dispatch' && !readNotificationIds.includes(n.id)).length },
                      { id: 'ready', label: 'Ready', count: visibleNotifications.filter((n) => n.category === 'ready').length, unread: visibleNotifications.filter((n) => n.category === 'ready' && !readNotificationIds.includes(n.id)).length },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNotificationTab(tab.id as any)}
                        className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${notificationTab === tab.id
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                          }`}
                      >
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${notificationTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                            }`}>
                            {tab.count}
                          </span>
                        )}
                        {tab.unread > 0 && (
                          <span className="size-1.5 rounded-full bg-[#9E593B]" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Notification Items List */}
                  <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                    {filteredNotifications.length > 0 ? (
                      filteredNotifications.map((item) => {
                        const isUnread = !readNotificationIds.includes(item.id)
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setReadNotificationIds((prev) => Array.from(new Set([...prev, item.id])))
                              item.onAction()
                            }}
                            className={`p-3.5 transition-colors flex items-start gap-3 group cursor-pointer ${isUnread ? 'bg-[#FAF8F5] hover:bg-[#F5EFE8]' : 'hover:bg-slate-50/80 bg-white'
                              }`}
                          >
                            <div
                              className={`size-8.5 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${item.category === 'dropoff'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200/60'
                                : item.category === 'dispatch'
                                  ? 'bg-[#9E593B]/10 text-[#9E593B] border border-[#9E593B]/20'
                                  : item.category === 'ready'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200/60'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                                }`}
                            >
                              {item.category === 'dropoff' && <Package size={15} />}
                              {item.category === 'dispatch' && <Zap size={15} />}
                              {item.category === 'ready' && <ShoppingBag size={15} />}
                              {item.category === 'bench' && <Scissors size={15} />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {isUnread && (
                                    <span className="size-1.5 rounded-full bg-[#9E593B] shrink-0" title="Unread" />
                                  )}
                                  <h4 className={`text-xs truncate ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                                    {item.title}
                                  </h4>
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0">{item.time}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.subtitle}</p>

                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-[#9E593B] group-hover:underline flex items-center gap-1">
                                  {item.actionLabel} →
                                </span>
                                {item.badge && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200/70">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDismissedNotificationIds((prev) => Array.from(new Set([...prev, item.id])))
                              }}
                              className="size-5 rounded-md hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0 mt-0.5"
                              title="Dismiss notification"
                              aria-label="Dismiss"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })
                    ) : (
                      <div className="py-10 px-4 text-center space-y-2">
                        <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                          <Bell size={18} />
                        </div>
                        <div className="text-xs font-bold text-slate-800">No Notifications</div>
                        <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto leading-relaxed">
                          All caught up. New requests and drop-offs will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>


            {/* Master Tailor Profile Pill & Hover Sign Out */}
            <div className="relative group/profile flex items-center gap-2 pl-3 border-l border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                title="Edit Studio Profile & Configuration"
                className="flex items-center gap-2.5 hover:opacity-85 transition-opacity cursor-pointer group text-left"
              >
                <StudioAvatar
                  avatar={user?.avatar}
                  name={tailorName}
                  size="sm"
                  showStatusDot={true}
                  status={online ? 'ACTIVE' : 'INACTIVE'}
                  className="group-hover:scale-105 transition-transform"
                />
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[130px] group-hover:text-[#9E593B] transition-colors">{tailorName}</div>
                  <div className="text-[10px] text-[#9E593B] font-semibold flex items-center gap-1">
                    <span>Master Tailor</span>
                    <span className="opacity-70">✎</span>
                  </div>
                </div>
              </button>

              {/* Dedicated Hover Sign Out Button */}
              <button
                type="button"
                onClick={handleSignOutClick}
                title="Sign Out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all cursor-pointer shrink-0 opacity-70 group-hover/profile:opacity-100"
                aria-label="Sign Out"
              >
                <LogOut size={14} />
              </button>

              {/* Hover Flyout Dropdown Menu */}
              <div className="absolute right-0 top-full pt-2 w-60 opacity-0 pointer-events-none group-hover/profile:opacity-100 group-hover/profile:pointer-events-auto transition-all duration-200 z-50">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 space-y-2 text-left">
                  {/* Profile Header */}
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
                    <StudioAvatar
                      avatar={user?.avatar}
                      name={tailorName}
                      size="md"
                      showStatusDot={true}
                      status={online ? 'ACTIVE' : 'INACTIVE'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{tailorName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{user?.email || user?.phone || 'Master Tailor'}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`size-1.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span className={`text-[9px] font-bold ${online ? 'text-emerald-600' : 'text-slate-600'} uppercase tracking-wider`}>
                          {online ? 'Active Studio (Online)' : 'Inactive (Offline)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Menu Actions */}
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('profile')}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#9E593B] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                    >
                      <Edit3 size={13} className="text-[#9E593B]" />
                      <span>Edit Studio Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSignOutClick}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut size={13} className="text-red-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── SCROLLABLE WORKSPACE ── */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-20 md:pb-0">
          {/* Action Required: Incomplete Price Catalog Banner */}
          {hasFilledCatalog === false && (
            <div className="bg-gradient-to-r from-amber-600 via-[#9E593B] to-amber-700 text-white px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md border-b border-amber-800/40">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Tag className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-amber-100">
                      Setup Incomplete
                    </span>
                    <span className="font-semibold text-sm">Please configure your Price Catalog</span>
                  </div>
                  <p className="text-xs text-amber-100 mt-0.5">
                    Your workshop cannot receive order allocations from customers until you add your alteration rates.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className="py-1.5 px-4 bg-white text-[#0F1115] hover:bg-amber-50 font-bold text-xs rounded-xl shadow-xs transition-transform active:scale-95 shrink-0 cursor-pointer"
              >
                Configure Catalog →
              </button>
            </div>
          )}

          {/* ── TOP-CENTER FLOATING INCOMING DISPATCH NOTIFICATION (STACKED BUNDLE SUPPORT) ── */}
          {online && currentBroadcast && currentBroadcastKey ? (
            <div className="fixed top-16 md:top-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl transition-all duration-300 animate-in slide-in-from-top-4 fade-in">
              <div className="relative">
                {/* 3rd Stacked Card (Deep glassmorphism background layer - visible when 3+ requests exist) */}
                {totalBroadcasts > 2 && thirdBroadcast && (
                  <div
                    onClick={() => handleMorphNext(2)}
                    className={`absolute -bottom-8 inset-x-6 sm:inset-x-8 h-16 rounded-2xl bg-[#090B10]/75 backdrop-blur-md border border-white/10 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.6)] -z-20 cursor-pointer opacity-70 hover:opacity-100 hover:-bottom-9 active:scale-[0.99] transition-all duration-200 flex items-end justify-center pb-1 text-[10px] text-stone-300 font-semibold tracking-wide ${isMorphing ? 'animate-card-morph-recede' : ''
                      }`}
                    title={`+${totalBroadcasts - 2} more requests waiting in queue — Click to view`}
                  >
                    <span>+{totalBroadcasts - 2} More Request{totalBroadcasts - 2 > 1 ? 's' : ''} Waiting In Stack · Tap to View</span>
                  </div>
                )}

                {/* 2nd Stacked Card (Frosted glass layer directly behind front card - clickable back card) */}
                {totalBroadcasts > 1 && nextBroadcast && (
                  <div
                    onClick={() => handleMorphNext(1)}
                    className={`absolute -bottom-7 inset-x-2.5 sm:inset-x-3 h-20 rounded-2xl bg-[#141720]/80 backdrop-blur-xl border border-white/15 hover:border-[#9E593B]/80 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] -z-10 cursor-pointer hover:-bottom-8 active:scale-[0.99] transition-all duration-200 group flex items-end justify-between px-3.5 sm:px-4 pb-2 ${isMorphing ? 'animate-card-morph-recede' : ''
                      }`}
                    title={`Next Request: ${nextBroadcast.garmentName} — Click to bring to front`}
                  >
                    <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] text-stone-300 min-w-0 pr-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E8A588] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9E593B]"></span>
                      </span>
                      <span className="font-semibold text-white group-hover:text-[#E8A588] transition-colors truncate">
                        Next: {nextBroadcast.garmentName}
                      </span>
                      <span className="text-stone-500 hidden sm:inline">·</span>
                      <span className="text-stone-300 truncate hidden sm:inline">{nextBroadcast.customerArea}</span>
                      <span className="text-stone-500">·</span>
                      <span className="text-emerald-400 font-bold shrink-0">{nextBroadcast.currencySymbol || studioCurrencySymbol}{nextBroadcast.price || nextBroadcast.partnerPayout}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 bg-white/10 group-hover:bg-[#9E593B] text-[#E8A588] group-hover:text-white backdrop-blur-md border border-white/15 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-all shadow-sm">
                      <span>Click to View</span>
                      <span className="text-xs group-hover:translate-x-0.5 transition-transform">↴</span>
                    </div>
                  </div>
                )}

                {/* Front / Active Request Card (Luxury Dark Glassmorphism with Depth Morphism Forward) */}
                <div
                  className={`bg-[#0F1116]/85 backdrop-blur-2xl text-white rounded-2xl p-4 border border-white/20 ring-1 ring-[#9E593B]/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_0_24px_rgba(158,89,59,0.12)] relative overflow-hidden z-10 transition-all duration-200 ${isMorphing ? 'animate-card-morph-forward' : ''
                    }`}
                >
                  {/* Subtle Diagonal Glass Sheen Highlight */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.08] pointer-events-none rounded-2xl" />

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                    {/* Left: Garment Info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {(() => {
                        const broadcastPhotos = getAllGarmentPhotos(currentBroadcast.realOrder || {
                          intakePhotoUrl: currentBroadcast.imageUrl || currentBroadcast.intakePhotoUrl,
                          imageUrl: currentBroadcast.imageUrl,
                          images: currentBroadcast.images,
                          garmentName: currentBroadcast.garmentName,
                          garmentId: currentBroadcast.garmentId,
                          serviceName: currentBroadcast.serviceName,
                        })
                        return (
                          <div
                            onClick={() => broadcastPhotos.length > 0 && handleOpenFullView(broadcastPhotos, 0)}
                            className="relative size-14 rounded-xl bg-black/40 backdrop-blur-md overflow-hidden shrink-0 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] group cursor-pointer hover:border-white/40 transition-all"
                            title={broadcastPhotos.length > 1 ? `Click to view all ${broadcastPhotos.length} client photos` : "Click to view photo"}
                          >
                            <img
                              src={broadcastPhotos[0] || getGarmentPhoto({ intakePhotoUrl: currentBroadcast.imageUrl, garmentName: currentBroadcast.garmentName })}
                              alt={currentBroadcast.garmentName || 'Garment'}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(e) => {
                                e.currentTarget.onerror = null
                                e.currentTarget.src = getDefaultGarmentImage(currentBroadcast.garmentName)
                              }}
                            />
                            {broadcastPhotos.length > 1 && (
                              <span className="absolute bottom-0 right-0 bg-[#9E593B] text-white text-[9px] font-bold px-1 rounded-tl">
                                +{broadcastPhotos.length - 1}
                              </span>
                            )}
                          </div>
                        )
                      })()}

                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-[#9E593B] to-[#B36846] text-white rounded-md shadow-sm border border-white/20">
                            {currentBroadcast.isRealCustomerOrder ? 'New Alteration Request' : 'Incoming Dispatch'}
                          </span>

                          {/* Scalable Compact Order Counter with Glass styling */}
                          {totalBroadcasts > 1 && (
                            <span className="text-[10px] text-stone-200 bg-white/10 backdrop-blur-md border border-white/15 px-2 py-0.5 rounded-md font-semibold tracking-wide shadow-xs">
                              {currentBroadcastIndex + 1} of {totalBroadcasts}
                            </span>
                          )}

                          {currentBroadcast.garmentBrand && (
                            <span className="text-[10px] text-stone-300 bg-white/10 backdrop-blur-md border border-white/10 px-1.5 py-0.5 rounded-md">
                              {currentBroadcast.garmentBrand}
                            </span>
                          )}

                          <span className="text-[10px] text-amber-200 bg-amber-500/20 backdrop-blur-md border border-amber-400/30 px-2 py-0.5 rounded-md font-bold tracking-wide">
                            {(currentBroadcast.quantity && currentBroadcast.quantity > 1) ? `${currentBroadcast.quantity} Garments` : `${currentBroadcast.quantity || 1} Garment`}
                          </span>

                          {(() => {
                            const bPhotos = getAllGarmentPhotos(currentBroadcast.realOrder || {
                              intakePhotoUrl: currentBroadcast.imageUrl || currentBroadcast.intakePhotoUrl,
                              imageUrl: currentBroadcast.imageUrl,
                              images: currentBroadcast.images,
                              garmentName: currentBroadcast.garmentName,
                            })
                            if (bPhotos.length <= 1) return null
                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenFullView(bPhotos, 0)}
                                className="text-[10px] text-amber-200 bg-amber-500/20 backdrop-blur-md border border-amber-400/30 px-1.5 py-0.5 rounded-md hover:bg-amber-500/30 transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
                                title="Inspect client reference photos"
                              >
                                <Camera size={10} />
                                <span>{bPhotos.length} Photos</span>
                              </button>
                            )
                          })()}
                        </div>

                        <h3 className="text-sm font-semibold text-white truncate">{currentBroadcast.garmentName}</h3>

                        <div className="flex items-center gap-2 text-[11px] text-stone-400">
                          <span className="text-stone-300 font-medium">{currentBroadcast.serviceName}</span>
                          <span>·</span>
                          <span>{currentBroadcast.customerArea}</span>
                          <span>·</span>
                          <span className="text-emerald-400 font-medium">{currentBroadcast.slaHours}h SLA</span>
                        </div>
                        {(() => {
                          const noteText = getCleanCustomerNote(currentBroadcast.realOrder || currentBroadcast)
                          if (!noteText) return null
                          return (
                            <div className="mt-1 text-[11px] bg-white/[0.08] backdrop-blur-md border border-white/10 rounded-md px-2 py-0.5 text-stone-200 flex items-center gap-1.5 max-w-sm truncate shadow-2xs">
                              <FileText size={11} className="text-[#E8A588] shrink-0" />
                              <span className="truncate">
                                <strong className="text-white font-semibold">Note:</strong> {noteText}
                              </span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-white/10">
                      <button
                        type="button"
                        onClick={() => handleSkipBroadcast(currentBroadcast)}
                        className="px-4 py-2 rounded-full border border-white/20 bg-white/[0.06] hover:bg-white/[0.14] backdrop-blur-md text-xs font-medium text-stone-300 hover:text-white transition-all cursor-pointer shadow-xs active:scale-95"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptBroadcast(currentBroadcast)}
                        className="px-5 py-2 rounded-full bg-gradient-to-r from-[#9E593B] to-[#B36846] hover:from-[#8A4C32] hover:to-[#9E593B] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_4px_16px_rgba(158,89,59,0.45),inset_0_1px_0_rgba(255,255,255,0.25)] border border-white/20 active:scale-95"
                      >
                        <Zap size={13} className="fill-white" />
                        <span>Accept Request</span>
                      </button>
                    </div>
                  </div>

                  {/* Bottom Countdown Progress Bar with Glowing Copper Beam */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-900/90 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#9E593B] via-[#E8A588] to-[#9E593B] shadow-[0_0_10px_rgba(232,165,136,0.6)]"
                      style={{
                        width: `${timerProgress}%`,
                        transition: timerProgress >= 98 ? 'none' : 'width 75ms linear'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── 2. MAIN WORKBENCH VIEW TABS ── */}
          <div className="p-3 sm:p-4 lg:p-8 pt-3 sm:pt-4 space-y-4 sm:space-y-6 max-w-[1440px] w-full mx-auto min-w-0">

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: WORKSHOP COCKPIT                                        */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'cockpit' && (
              <div className="space-y-6 animate-fadeIn">

                {/* ── VERIFICATION STATUS BANNER (requests only flow to verified studios) ── */}
                {user?.role === 'STUDIO' && verificationStatus !== 'APPROVED' && (
                  <div
                    className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                      verificationStatus === 'PENDING'
                        ? 'bg-blue-50 border-blue-200'
                        : verificationStatus === 'REJECTED'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="flex gap-3 items-start flex-1 min-w-0">
                      {verificationStatus === 'PENDING' ? (
                        <Clock size={20} className="text-blue-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={20} className={`shrink-0 mt-0.5 ${verificationStatus === 'REJECTED' ? 'text-red-600' : 'text-amber-600'}`} />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {verificationStatus === 'PENDING' && 'Verification under review'}
                          {verificationStatus === 'REJECTED' && 'Verification not approved'}
                          {verificationStatus === 'UNSUBMITTED' && 'Verify your studio to start receiving requests'}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 break-words">
                          {verificationStatus === 'PENDING' &&
                            "We're checking your shop photos and machines video. You'll start receiving tailoring requests once approved."}
                          {verificationStatus === 'REJECTED' &&
                            `Reason: ${user?.verificationRejectionReason || 'Not specified'}. Please upload new files.`}
                          {verificationStatus === 'UNSUBMITTED' &&
                            'Upload two shop photos and a short video of your machines. New requests are paused until your studio is verified.'}
                        </p>
                      </div>
                    </div>
                    {needsVerification && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('verification')}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#9E593B] hover:bg-[#8A4D33] cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck size={15} />
                        {verificationStatus === 'REJECTED' ? 'Upload again' : 'Verify now'}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Offline Status Alert Banner (unverified studios see the verification banner instead) ── */}
                {isVerified && !online && (
                  <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-amber-100 border border-amber-300/70 flex items-center justify-center shrink-0 text-amber-700">
                        <Store size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-amber-950">Store is Currently Inactive (Offline)</h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-full">Hidden</span>
                        </div>
                        <p className="text-xs text-amber-800/90 mt-0.5">
                          Your workshop is temporarily hidden from customer store searches, map discovery, and direct booking requests.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isStatusUpdating}
                      onClick={handleToggleActiveStatus}
                      className="shrink-0 self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-xs cursor-pointer"
                    >
                      <span className="size-2 rounded-full bg-white animate-pulse" />
                      Turn Store Active (Online)
                    </button>
                  </div>
                )}

                {/* ── 4 UIVERSE-INSPIRED ELEVATED METRIC CARDS ── */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Card 1: Today's Orders & Revenue */}
                  <div className="uiverse-stat-card uiverse-stat-emerald group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Today's Revenue
                      </span>
                      <div className="size-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs font-extrabold text-sm">
                        <span>{studioCurrencySymbol}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {studioCurrencySymbol}{todayEarned}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                        Collected at Pickup
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 font-medium flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Direct Studio Payment &bull; Unlocked at Pickup PIN
                    </p>
                    {pendingPickupValue > 0 && (
                      <p className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {studioCurrencySymbol}{pendingPickupValue} pending payment (on bench / rack)
                      </p>
                    )}
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
                      {activeOnBench > 0 ? 'Work in progress' : 'Ready for new orders'}
                    </p>
                  </div>

                  {/* Card 3: Drop-Off Queue */}
                  <div className="uiverse-stat-card uiverse-stat-sky group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Drop-Offs Today
                      </span>
                      <div className="size-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <Package size={15} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {pendingDropOffs}
                      </span>
                      <span className="text-xs font-medium text-slate-500">expected</span>
                    </div>
                    <p className="text-[11px] text-sky-700 mt-2 font-semibold flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-sky-500" />
                      Ready for customer check-in
                    </p>
                  </div>

                  {/* Card 4: Ready on Rack */}
                  <div className="uiverse-stat-card uiverse-stat-purple group cursor-default">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Ready for Pickup
                      </span>
                      <div className="size-8 rounded-xl bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs">
                        <CheckCircle2 size={16} />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {readyOnRack}
                      </span>
                      <span className="text-xs font-medium text-slate-500">completed</span>
                    </div>
                    <p className="text-[11px] text-purple-700 mt-2 font-semibold flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-purple-500" />
                      {readyOnRack > 0 ? 'Customer notified for pickup' : 'No orders on rack'}
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
                            {(() => {
                              const intakePhotos = getAllGarmentPhotos(activeIntake)
                              return (
                                <div
                                  onClick={() => handleOpenFullView(intakePhotos, 0)}
                                  className="relative size-20 rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 shadow-2xs cursor-pointer group hover:border-[#9E593B] transition-all"
                                  title={intakePhotos.length > 1 ? `Click to view all ${intakePhotos.length} photos` : 'Click to inspect photo'}
                                >
                                  <img
                                    src={intakePhotos[0] || getGarmentPhoto(activeIntake)}
                                    alt={activeIntake.garmentName || 'Garment'}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null
                                      e.currentTarget.src = getDefaultGarmentImage(activeIntake.garmentId || activeIntake.garmentName, activeIntake.serviceName)
                                    }}
                                  />
                                  {intakePhotos.length > 1 && (
                                    <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded-tl-md">
                                      +{intakePhotos.length - 1}
                                    </span>
                                  )}
                                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye size={16} />
                                  </div>
                                </div>
                              )
                            })()}
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
                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                  ${activeIntake.price || 35} Standard Rate · Pay at Pickup
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                  Qty: {activeIntake.quantity || 1} {activeIntake.quantity === 1 ? 'Garment' : 'Garments'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Customer Fit Notes */}
                          {(() => {
                            const intakeNote = getCleanCustomerNote(activeIntake)
                            if (!intakeNote) return null
                            return (
                              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                  <FileText size={12} className="text-[#9E593B]" />
                                  <span>Client Fitting &amp; Alteration Notes</span>
                                </span>
                                <p className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">
                                  {intakeNote}
                                </p>
                              </div>
                            )
                          })()}
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

                      {/* Right: Reference Photos, Tailor Bench & Confirmation */}
                      <div className="lg:col-span-7 space-y-5">
                        {/* Client Reference Photos (Right Side) */}
                        {(() => {
                          const intakePhotos = getAllGarmentPhotos(activeIntake)
                          if (intakePhotos.length === 0) return null
                          return (
                            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                  <Camera size={14} className="text-[#9E593B]" />
                                  <span>Client Reference Photos ({intakePhotos.length})</span>
                                </h4>
                                <span className="text-[11px] text-slate-400 font-medium">Click any photo to enlarge</span>
                              </div>

                              <div className={`grid gap-3 ${
                                intakePhotos.length === 1 ? 'grid-cols-2' :
                                intakePhotos.length === 2 ? 'grid-cols-2' :
                                intakePhotos.length === 3 ? 'grid-cols-3' :
                                'grid-cols-2 sm:grid-cols-4'
                              }`}>
                                {intakePhotos.map((photoUrl, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => handleOpenFullView(intakePhotos, idx)}
                                    className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group cursor-pointer shadow-2xs hover:border-[#9E593B] hover:shadow-sm transition-all"
                                    title={`Inspect Photo #${idx + 1}`}
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={`Garment Photo ${idx + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                      onError={(e) => {
                                        e.currentTarget.onerror = null
                                        e.currentTarget.src = getDefaultGarmentImage(activeIntake.garmentId || activeIntake.garmentName, activeIntake.serviceName)
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                      <Eye size={16} />
                                    </div>
                                    <span className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                                      #{idx + 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}


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

                          {/* Critical Work & Complex Fabric Surcharge Option */}
                          <div className="pt-2">
                            {(() => {
                              const studioCurrSym = activeIntake.currencySymbol || studioCurrencySymbol || (user as any)?.currencySymbol || '$'
                              const adjNum = parseFloat(priceAdjustAmount) || 0
                              const basePriceNum = activeIntake.price || 0
                              const calculatedTotal = basePriceNum + (priceAdjustApproved ? adjNum : 0)

                              return (
                                <>
                                  {!showPriceAdjust ? (
                                    <button
                                      type="button"
                                      onClick={() => setShowPriceAdjust(true)}
                                      className="text-xs font-semibold text-[#9E593B] hover:underline flex items-center gap-1.5 cursor-pointer transition-colors"
                                    >
                                      <Plus size={13} />
                                      <span>+ Add critical work / delicate fabric surcharge (applied at drop-off)</span>
                                    </button>
                                  ) : (
                                    <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-xs space-y-3 shadow-2xs">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <Sparkles size={14} className="text-amber-700" />
                                          <span className="font-bold text-amber-950">
                                            Critical Work &amp; Delicate Fabric Surcharge
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowPriceAdjust(false)
                                            setPriceAdjustApproved(false)
                                            setPriceAdjustAmount('')
                                            setPriceAdjustReason('')
                                          }}
                                          className="text-[11px] text-amber-800 hover:text-black font-semibold cursor-pointer"
                                        >
                                          ✕ Cancel
                                        </button>
                                      </div>

                                      <p className="text-[11px] text-amber-800 leading-relaxed">
                                        Add extra money for delicate fabrics (silk, chiffon, velvet), complex hand-beading, intensive relining, or emergency rush turnaround identified during garment inspection.
                                      </p>

                                      {/* Quick preset chips */}
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {[
                                          'Delicate silk / chiffon fabric',
                                          'Hand-beaded & sequin detailing',
                                          'Complex inner lining / padding',
                                          'Critical seam reconstruction',
                                          'Express rush turnaround',
                                        ].map((preset) => (
                                          <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setPriceAdjustReason(preset)}
                                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                                              priceAdjustReason === preset
                                                ? 'bg-amber-900 text-white border-amber-900'
                                                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/70'
                                            }`}
                                          >
                                            {preset}
                                          </button>
                                        ))}
                                      </div>

                                      <div className="flex flex-col sm:flex-row gap-2">
                                        <div className="relative">
                                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs pointer-events-none">
                                            {studioCurrSym}
                                          </span>
                                          <input
                                            type="number"
                                            step="0.50"
                                            min="0"
                                            placeholder="Extra amount"
                                            value={priceAdjustAmount}
                                            onChange={(e) => {
                                              setPriceAdjustAmount(e.target.value)
                                              if (priceAdjustApproved) setPriceAdjustApproved(false)
                                            }}
                                            className="w-full sm:w-28 pl-6 pr-2.5 py-2 rounded-xl bg-white border border-amber-300 font-bold text-slate-900 focus:outline-none focus:border-[#9E593B]"
                                          />
                                        </div>

                                        <input
                                          type="text"
                                          placeholder="Specific reason for extra charge..."
                                          value={priceAdjustReason}
                                          onChange={(e) => {
                                            setPriceAdjustReason(e.target.value)
                                            if (priceAdjustApproved) setPriceAdjustApproved(false)
                                          }}
                                          className="flex-1 px-3 py-2 rounded-xl bg-white border border-amber-300 text-slate-900 focus:outline-none focus:border-[#9E593B]"
                                        />

                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!priceAdjustAmount || parseFloat(priceAdjustAmount) <= 0) {
                                              toast.error('Please enter a valid extra amount.')
                                              return
                                            }
                                            setPriceAdjustApproved(true)
                                            toast.success(`Applied ${studioCurrSym}${parseFloat(priceAdjustAmount).toFixed(2)} critical work surcharge.`)
                                          }}
                                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-[#9E593B] text-white font-semibold text-xs cursor-pointer transition-colors shadow-2xs active:scale-95 shrink-0"
                                        >
                                          {priceAdjustApproved ? '✓ Surcharge Applied' : 'Apply Surcharge'}
                                        </button>
                                      </div>

                                      {/* Itemized Price Calculation Preview */}
                                      {adjNum > 0 && priceAdjustApproved && (
                                        <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between text-[11px] font-semibold text-amber-950">
                                          <span>
                                            Base: {studioCurrSym}{basePriceNum.toFixed(2)} + Critical Work: {studioCurrSym}{adjNum.toFixed(2)}
                                          </span>
                                          <span className="font-extrabold text-xs text-[#9E593B]">
                                            Total at Pickup: {studioCurrSym}{calculatedTotal.toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )
                            })()}
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
                                Customer Drop-Off Check-In
                              </h2>
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Ready at Counter
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Enter the customer&apos;s 4-digit PIN to confirm the order and begin alterations.
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
                                  className={`uiverse-pin-slot size-12 sm:size-13 font-mono font-bold text-xl sm:text-2xl ${digit ? 'filled text-slate-900' : isFocused ? 'active text-[#9E593B]' : 'text-slate-300'
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
                            className={`px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer ${pinInput.length === 4
                              ? 'bg-slate-900 hover:bg-[#9E593B] text-white active:scale-95 shadow-sm'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              }`}
                          >
                            <ShieldCheck size={16} />
                            <span>Check In Order →</span>
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
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setPinInput('')
                                setPinError('')
                              }}
                              className="text-xs underline text-red-800 hover:text-red-950 font-bold cursor-pointer transition-colors"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => setPinError('')}
                              className="size-5 rounded-md hover:bg-red-100 text-red-600 hover:text-red-800 flex items-center justify-center cursor-pointer transition-colors"
                              title="Dismiss notification"
                              aria-label="Dismiss notification"
                            >
                              <X size={14} />
                            </button>
                          </div>
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
                                className={`uiverse-keypad-btn ${key === 'CLEAR' || key === 'BACK' ? 'bg-slate-100 text-slate-700 text-xs font-bold' : ''
                                  }`}
                              >
                                {key === 'BACK' ? '⌫' : key}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expected Drop-Offs Notification Banner */}
                      {pendingDropOffs > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs animate-fadeIn">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                              {pendingDropOffs}
                            </span>
                            <span className="font-bold text-slate-800">
                              Expected Drop-Off{pendingDropOffs > 1 ? 's' : ''} Today:
                            </span>
                            <span className="text-slate-400 text-[11px] hidden sm:inline">
                              Ask customer for their 4-digit drop-off PIN
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {orders
                              .filter((o) => o.status === 'Accepted')
                              .slice(0, 4)
                              .map((o) => (
                                <button
                                  key={o.id}
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
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/80 text-slate-800 text-[11px] font-medium cursor-pointer transition-all hover:scale-[1.02] shadow-2xs group"
                                  title={`Check in ${o.customerName} via counter PIN`}
                                >
                                  <span className="font-semibold text-slate-900 group-hover:text-[#9E593B]">
                                    {o.customerName}
                                  </span>
                                  <span className="text-[10px] font-semibold text-amber-800 bg-white px-1.5 py-0.5 rounded border border-amber-200/60 shadow-2xs">
                                    OTP at Counter
                                  </span>
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
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">
                              Scheduled Drop-Offs
                            </h3>
                            <p className="text-[11px] text-slate-400">Customers arriving today</p>
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
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      {(() => {
                                        const cardPhotos = getAllGarmentPhotos(ord)
                                        return (
                                          <div
                                            onClick={() => handleOpenFullView(cardPhotos, 0)}
                                            className="relative size-11 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer group/thumb hover:border-[#9E593B] shadow-2xs transition-all"
                                            title={cardPhotos.length > 1 ? `Click to view all ${cardPhotos.length} photos` : 'Click to inspect photo'}
                                          >
                                            <img
                                              src={cardPhotos[0] || getGarmentPhoto(ord)}
                                              alt={ord.garmentName || 'Garment'}
                                              className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                              onError={(e) => {
                                                e.currentTarget.onerror = null
                                                e.currentTarget.src = getDefaultGarmentImage(ord.garmentId || ord.garmentName, ord.serviceName)
                                              }}
                                            />
                                            {cardPhotos.length > 1 && (
                                              <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1 rounded-tl-md">
                                                +{cardPhotos.length - 1}
                                              </span>
                                            )}
                                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                              <Eye size={12} />
                                            </div>
                                          </div>
                                        )
                                      })()}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h4 className="font-bold text-xs text-slate-900 truncate">
                                            {ord.customerName}
                                          </h4>
                                          {getAllGarmentPhotos(ord).length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenFullView(getAllGarmentPhotos(ord), 0)}
                                              className="text-[9px] font-bold text-[#9E593B] bg-[#FFF7F2] border border-[#9E593B]/30 px-1 py-0.2 rounded hover:bg-[#9E593B] hover:text-white transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                              title={`View all ${getAllGarmentPhotos(ord).length} reference photos`}
                                            >
                                              <Camera size={9} />
                                              <span>{getAllGarmentPhotos(ord).length}</span>
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 truncate">
                                          {ord.garmentName} &bull; {ord.serviceName}
                                        </p>
                                      </div>
                                    </div>
                                    {ord.status === 'Allocated' ? (
                                      <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        New Request
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                                        Drop-off Today
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between pt-1 gap-2">
                                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                                      <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-extrabold text-[10px]">
                                        Qty: {ord.quantity || 1} {ord.quantity === 1 ? 'Garment' : 'Garments'}
                                      </span>
                                      <span className="text-slate-400">·</span>
                                      <span className="text-slate-500 font-medium">Due at Pickup</span>
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleInitiateCancelOrder(ord)}
                                        className="px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                                        title="Cancel order before drop-off"
                                      >
                                        Cancel
                                      </button>
                                      {ord.status === 'Allocated' ? (
                                        <button
                                          type="button"
                                          onClick={() => handleAcceptAllocatedOrder(ord)}
                                          className="px-3 py-1.5 rounded-lg bg-[#0F1115] hover:bg-[#9E593B] text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
                                        >
                                          <span>⚡ Accept Booking</span>
                                        </button>
                                      ) : (
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
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                          ) : (
                            <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2 flex-1 flex flex-col items-center justify-center min-h-[200px]">
                              <Package size={24} className="mx-auto text-slate-400" />
                              <div className="text-xs font-bold text-slate-700">No Drop-Offs Waiting</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                New customer bookings for today will appear here.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ═══ STATION 2: ACTIVE ON BENCH ═══ */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col h-full w-full min-h-[340px]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 mb-4">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">
                              Sewing Bench
                            </h3>
                            <p className="text-[11px] text-slate-400">In progress right now</p>
                          </div>
                          <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shrink-0">
                            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {activeOnBench} in progress
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
                                        {(() => {
                                          const cardPhotos = getAllGarmentPhotos(order)
                                          return (
                                            <div
                                              onClick={() => handleOpenFullView(cardPhotos, 0)}
                                              className="relative size-11 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer group/thumb hover:border-[#9E593B] shadow-2xs transition-all"
                                              title={cardPhotos.length > 1 ? `Click to view all ${cardPhotos.length} photos` : 'Click to inspect photo'}
                                            >
                                              <img
                                                src={cardPhotos[0] || getGarmentPhoto(order)}
                                                alt={order.garmentName || 'Garment'}
                                                className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                                onError={(e) => {
                                                  e.currentTarget.onerror = null
                                                  e.currentTarget.src = getDefaultGarmentImage(order.garmentId || order.garmentName, order.serviceName)
                                                }}
                                              />
                                              {cardPhotos.length > 1 && (
                                              <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1 rounded-tl-md">
                                                  +{cardPhotos.length - 1}
                                                </span>
                                              )}
                                              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                <Eye size={12} />
                                              </div>
                                            </div>
                                          )
                                        })()}
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                            {order.hangTagNo && (
                                              <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                                {order.hangTagNo}
                                              </span>
                                            )}
                                            {getAllGarmentPhotos(order).length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenFullView(getAllGarmentPhotos(order), 0)}
                                                className="text-[9px] font-bold text-[#9E593B] bg-[#FFF7F2] border border-[#9E593B]/30 px-1 py-0.2 rounded hover:bg-[#9E593B] hover:text-white transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                                title={`View all ${getAllGarmentPhotos(order).length} reference photos`}
                                              >
                                                <Camera size={9} />
                                                <span>{getAllGarmentPhotos(order).length}</span>
                                              </button>
                                            )}
                                          </div>
                                          <h4 className="font-bold text-xs text-slate-900 truncate">{order.garmentName}</h4>
                                          <p className="text-[11px] text-slate-500 truncate">
                                            {order.customerName} &bull; {order.serviceName}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        <span className="font-extrabold text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md block mb-1 text-center">
                                          Qty: {order.quantity || 1} {order.quantity === 1 ? 'pc' : 'pcs'}
                                        </span>
                                        <span
                                          className={`text-[10px] font-semibold flex items-center justify-end gap-1 ${sla.urgent ? 'text-red-600 font-bold' : 'text-slate-500'
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
                                          className={`h-full rounded-full transition-all duration-500 ${sla.urgent ? 'bg-red-500' : 'bg-[#9E593B]'
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
                              <div className="text-xs font-bold text-slate-700">No Orders in Progress</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                No alterations are currently being worked on. Check in a dropped-off garment to start tailoring.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ═══ STATION 3: READY ON RACK ═══ */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col h-full w-full min-h-[340px]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 mb-4">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">
                              Ready on Rack
                            </h3>
                            <p className="text-[11px] text-slate-400">Ready for customer pickup</p>
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
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      {(() => {
                                        const cardPhotos = getAllGarmentPhotos(order)
                                        return (
                                          <div
                                            onClick={() => handleOpenFullView(cardPhotos, 0)}
                                            className="relative size-11 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer group/thumb hover:border-[#9E593B] shadow-2xs transition-all"
                                            title={cardPhotos.length > 1 ? `Click to view all ${cardPhotos.length} photos` : 'Click to inspect photo'}
                                          >
                                            <img
                                              src={cardPhotos[0] || getGarmentPhoto(order)}
                                              alt={order.garmentName || 'Garment'}
                                              className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                              onError={(e) => {
                                                e.currentTarget.onerror = null
                                                e.currentTarget.src = getDefaultGarmentImage(order.garmentId || order.garmentName, order.serviceName)
                                              }}
                                            />
                                            {cardPhotos.length > 1 && (
                                              <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1 rounded-tl-md">
                                                +{cardPhotos.length - 1}
                                              </span>
                                            )}
                                            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                              <Eye size={12} />
                                            </div>
                                          </div>
                                        )
                                      })()}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h4 className="font-bold text-xs text-slate-900 truncate">
                                            {order.customerName}
                                          </h4>
                                          {getAllGarmentPhotos(order).length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleOpenFullView(getAllGarmentPhotos(order), 0)}
                                              className="text-[9px] font-bold text-[#9E593B] bg-[#FFF7F2] border border-[#9E593B]/30 px-1 py-0.2 rounded hover:bg-[#9E593B] hover:text-white transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                              title={`View all ${getAllGarmentPhotos(order).length} reference photos`}
                                            >
                                              <Camera size={9} />
                                              <span>{getAllGarmentPhotos(order).length}</span>
                                            </button>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 truncate">
                                          {order.garmentName} &bull; {order.serviceName}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md shrink-0">
                                      {order.hangTagNo || 'Rack A-1'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                                    <span className="font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">
                                      <span className="bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md font-extrabold text-[10px]">
                                        Qty: {order.quantity || 1} {order.quantity === 1 ? 'Garment' : 'Garments'}
                                      </span>
                                      <span className="text-slate-400">·</span>
                                      <span className="text-slate-500 font-medium">Due at Pickup</span>
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
                                    <span>Enter Pickup PIN &amp; Hand Over →</span>
                                  </button>
                                </div>
                              ))
                          ) : (
                            <div className="py-8 px-4 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2 flex-1 flex flex-col items-center justify-center min-h-[200px]">
                              <CheckCircle2 size={24} className="mx-auto text-slate-400" />
                              <div className="text-xs font-bold text-slate-700">Rack is Empty</div>
                              <p className="text-[11px] text-slate-400 leading-relaxed max-w-[240px] mx-auto">
                                Finished garments will appear here waiting for customer collection.
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
                <div className="space-y-4 animate-fadeIn">
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
                                {(() => {
                                  const rowPhotos = getAllGarmentPhotos(order)
                                  return (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleOpenFullView(rowPhotos, 0)
                                      }}
                                      className="relative size-12 rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#E8E1D5] shrink-0 cursor-pointer group/thumb hover:border-[#9E593B] shadow-2xs transition-all"
                                      title={rowPhotos.length > 1 ? `Click to view all ${rowPhotos.length} photos` : 'Click to inspect photo'}
                                    >
                                      <img
                                        src={rowPhotos[0] || getGarmentPhoto(order)}
                                        alt={order.garmentName || 'Garment'}
                                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                        onError={(e) => {
                                          e.currentTarget.onerror = null
                                          e.currentTarget.src = getDefaultGarmentImage(order.garmentId || order.garmentName, order.serviceName)
                                        }}
                                      />
                                      {rowPhotos.length > 1 && (
                                        <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1 rounded-tl-md">
                                          +{rowPhotos.length - 1}
                                        </span>
                                      )}
                                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                        <Eye size={14} />
                                      </div>
                                    </div>
                                  )
                                })()}
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
                                    {getAllGarmentPhotos(order).length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenFullView(getAllGarmentPhotos(order), 0)
                                        }}
                                        className="text-[10px] font-bold text-[#9E593B] bg-[#FFF7F2] border border-[#9E593B]/30 px-1.5 py-0.5 rounded hover:bg-[#9E593B] hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1"
                                        title={`View all ${getAllGarmentPhotos(order).length} reference photos`}
                                      >
                                        <Camera size={10} />
                                        <span>{getAllGarmentPhotos(order).length} Photos</span>
                                      </button>
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
                                  {(() => {
                                    const notePreview = getCleanCustomerNote(order)
                                    if (!notePreview) return null
                                    return (
                                      <div className="mt-2 text-[11px] bg-[#FAF8F5] border border-[#E8E1D5] text-[#1E2229] px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                                        <FileText size={12} className="text-[#9E593B] shrink-0 mt-0.5" />
                                        <span className="font-medium text-[#5A5D64] line-clamp-2 leading-tight">
                                          <strong className="text-[#1E2229] font-bold">Client Note:</strong> {notePreview}
                                        </span>
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-bold text-sm text-emerald-800">{order.currencySymbol || studioCurrencySymbol}{order.price || 35}</div>
                                <div className="text-[10px] text-[#9E593B] font-semibold">Standard Rate</div>
                              </div>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-[#E8E1D5] flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {order.status === 'Accepted' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleInitiateCancelOrder(order)}
                                      className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                                      title="Cancel order before garment drop-off"
                                    >
                                      <XCircle size={11} /> Cancel Order
                                    </button>
                                    <span className="text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">Awaiting Drop-Off</span>
                                  </>
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
                            {(() => {
                              const drawerPhotos = getAllGarmentPhotos(activeSelectedOrder)
                              return (
                                <div
                                  onClick={() => handleOpenFullView(drawerPhotos, 0)}
                                  className="relative size-14 rounded-xl overflow-hidden bg-[#FAF8F5] border border-[#E8E1D5] shrink-0 cursor-pointer group shadow-2xs hover:border-[#9E593B] transition-all"
                                  title={drawerPhotos.length > 1 ? `Click to view all ${drawerPhotos.length} photos in full view` : 'Click to inspect photo'}
                                >
                                  <img
                                    src={drawerPhotos[0] || getGarmentPhoto(activeSelectedOrder)}
                                    alt={activeSelectedOrder.garmentName || 'Garment'}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e) => {
                                      e.currentTarget.onerror = null
                                      e.currentTarget.src = getDefaultGarmentImage(activeSelectedOrder.garmentId || activeSelectedOrder.garmentName, activeSelectedOrder.serviceName)
                                    }}
                                  />
                                  {drawerPhotos.length > 1 && (
                                    <span className="absolute bottom-0 right-0 bg-[#0F1115]/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded-tl-md">
                                      +{drawerPhotos.length - 1}
                                    </span>
                                  )}
                                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                    <Eye size={16} />
                                  </div>
                                </div>
                              )
                            })()}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-bold text-sm text-[#1E2229] truncate">{activeSelectedOrder.garmentName}</h3>
                                {getAllGarmentPhotos(activeSelectedOrder).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenFullView(getAllGarmentPhotos(activeSelectedOrder), 0)}
                                    className="text-[9px] font-bold text-[#9E593B] bg-[#FFF7F2] border border-[#9E593B]/30 px-1.5 py-0.2 rounded hover:bg-[#9E593B] hover:text-white transition-colors cursor-pointer inline-flex items-center gap-0.5"
                                    title="Inspect all reference photos"
                                  >
                                    <Camera size={9} />
                                    <span>{getAllGarmentPhotos(activeSelectedOrder).length} Photos</span>
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-[#6B7280]">{activeSelectedOrder.serviceName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xl font-bold text-emerald-800">{activeSelectedOrder.currencySymbol || studioCurrencySymbol}{activeSelectedOrder.price || 35}</div>
                              <div className="text-[10px] text-[#9E593B] font-semibold">Standard Rate</div>
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
                              <div className="font-semibold text-[#1E2229]">Standard Rate: ${(activeSelectedOrder.price || 35)}</div>
                              <div className="text-[11px] text-[#6B7280]">Customer pays directly to studio at pickup</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold bg-white text-[#1E2229] border border-[#E8E1D5] px-2.5 py-0.5 rounded-full shrink-0">Pay at Pickup</span>
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

                        {/* Customer Fitting & Alteration Notes Section */}
                        {(() => {
                          const clientNote = getCleanCustomerNote(activeSelectedOrder)
                          return (
                            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E2229]">
                                <div className="w-5 h-5 rounded-md bg-[#9E593B]/10 text-[#9E593B] flex items-center justify-center shrink-0">
                                  <FileText size={12} />
                                </div>
                                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#9E593B]">
                                  Customer Fitting &amp; Alteration Notes
                                </span>
                              </div>
                              {clientNote ? (
                                <p className="text-xs font-semibold text-[#1E2229] bg-white p-3 rounded-xl border border-[#E8E1D5] leading-relaxed break-words whitespace-pre-wrap shadow-2xs">
                                  {clientNote}
                                </p>
                              ) : (
                                <p className="text-xs text-[#6B7280] italic bg-white p-2.5 rounded-xl border border-[#E8E1D5]">
                                  No special fitting notes or instructions provided by client.
                                </p>
                              )}
                            </div>
                          )
                        })()}

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
                                    key="order-garment-add-photo-input"
                                    id="order-garment-add-photo-input"
                                    type="file"
                                    accept="image/*"
                                    multiple
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
                                      onError={(e) => {
                                        e.currentTarget.onerror = null
                                        e.currentTarget.src = getDefaultGarmentImage(activeSelectedOrder.garmentId || activeSelectedOrder.garmentName, activeSelectedOrder.serviceName)
                                      }}
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

                        {/* Order Cancellation Control (Only before First PIN / Drop-Off Intake) */}
                        {activeSelectedOrder.status === 'Accepted' && (
                          <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 flex items-center justify-between gap-3 animate-fadeIn">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-red-950 flex items-center gap-1.5">
                                <AlertCircle size={14} className="text-red-600 shrink-0" />
                                <span>Awaiting Garment Drop-Off</span>
                              </div>
                              <p className="text-[11px] text-red-700 mt-0.5 leading-snug">
                                You can decline or cancel this order before the client provides their intake PIN.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleInitiateCancelOrder(activeSelectedOrder)}
                              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer active:scale-95 flex items-center gap-1.5"
                            >
                              <XCircle size={13} />
                              <span>Cancel Order</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}



            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 4: EARNINGS & PAYOUTS                                       */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'payouts' && (() => {
              const allLedgerOrders = orders.filter((o) => o.status !== 'Cancelled')
              const collectedOrders = allLedgerOrders.filter((o) => o.status === 'Closed' || o.status === 'Collected')
              const readyOrders = allLedgerOrders.filter((o) => o.status === 'Ready')
              const inProgressOrders = allLedgerOrders.filter((o) =>
                ['Work in Progress', 'Fitting Completed', 'Customer Arrived', 'Accepted', 'Allocated'].includes(o.status)
              )

              const totalCollectedSum = collectedOrders.reduce((sum, o) => sum + (o.price || 0), 0)
              const totalPendingPickupSum = readyOrders.reduce((sum, o) => sum + (o.price || 0), 0)
              const totalInProgressSum = inProgressOrders.reduce((sum, o) => sum + (o.price || 0), 0)

              // Filter orders based on active status tab and search query
              const filteredLedger = allLedgerOrders.filter((o) => {
                if (payoutsFilter === 'COLLECTED' && !(o.status === 'Closed' || o.status === 'Collected')) return false
                if (payoutsFilter === 'DUE' && o.status !== 'Ready') return false
                if (
                  payoutsFilter === 'IN_PROGRESS' &&
                  !['Work in Progress', 'Fitting Completed', 'Customer Arrived', 'Accepted', 'Allocated'].includes(o.status)
                ) {
                  return false
                }

                if (payoutsSearch.trim()) {
                  const q = payoutsSearch.toLowerCase().trim()
                  const matchId = o.id.toLowerCase().includes(q)
                  const matchCustomer = (o.customerName || '').toLowerCase().includes(q)
                  const matchGarment = (o.garmentName || o.garmentId || '').toLowerCase().includes(q)
                  const matchService = (o.serviceName || '').toLowerCase().includes(q)
                  const matchPhone = (o.customerPhone || '').toLowerCase().includes(q)
                  return matchId || matchCustomer || matchGarment || matchService || matchPhone
                }
                return true
              })

              return (
                <div className="w-full space-y-5 animate-in fade-in duration-200">
                  {/* Clean Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#E8E1D5]">
                    <div>
                      <h1 className="text-xl font-bold text-[#1E2229]">
                        Earnings &amp; Payouts
                      </h1>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        Direct counter settlements and payment history
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                        100% Direct Payout &bull; 0% Platform Fee
                      </span>
                      <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-1.5 rounded-xl border border-[#E8E1D5] bg-white hover:bg-[#FAF8F5] text-[#6B7280] hover:text-[#1E2229] transition-colors cursor-pointer"
                        title="Sync latest records"
                      >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#9E593B]' : ''} />
                      </button>
                    </div>
                  </div>

                  {/* ── 3 CLEAN METRIC TILES ── */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {/* Card 1: Collected */}
                    <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 sm:p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          Collected
                        </span>
                        <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 grid place-items-center font-extrabold text-xs shrink-0">
                          <span>{studioCurrencySymbol}</span>
                        </div>
                      </div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#1E2229] mt-2">
                        {studioCurrencySymbol}{totalCollectedSum}
                      </div>
                      <p className="text-xs text-emerald-700 font-semibold mt-1">
                        {collectedOrders.length} order{collectedOrders.length === 1 ? '' : 's'} settled at counter
                      </p>
                    </div>

                    {/* Card 2: Due at Pickup */}
                    <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 sm:p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          Due at Pickup
                        </span>
                        <div className="size-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 grid place-items-center">
                          <Clock size={14} />
                        </div>
                      </div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#1E2229] mt-2">
                        {studioCurrencySymbol}{totalPendingPickupSum}
                      </div>
                      <p className="text-xs text-amber-800 font-medium mt-1">
                        {readyOrders.length} ready on rack
                      </p>
                    </div>

                    {/* Card 3: In Production */}
                    <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 sm:p-5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          In Progress
                        </span>
                        <div className="size-7 rounded-lg bg-sky-50 text-sky-600 border border-sky-200/60 grid place-items-center">
                          <Scissors size={14} />
                        </div>
                      </div>
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#1E2229] mt-2">
                        {studioCurrencySymbol}{totalInProgressSum}
                      </div>
                      <p className="text-xs text-[#6B7280] font-medium mt-1">
                        {inProgressOrders.length} active in tailoring
                      </p>
                    </div>
                  </div>

                  {/* ── SIMPLE LEDGER TABLE CARD ── */}
                  <div className="bg-white border border-[#E8E1D5] rounded-2xl shadow-2xs overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-4 border-b border-[#E8E1D5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-sm text-[#1E2229]">
                          Payment Ledger
                        </h2>
                        <span className="text-xs text-[#6B7280] font-medium">
                          ({filteredLedger.length})
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search input */}
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                          <input
                            type="text"
                            value={payoutsSearch}
                            onChange={(e) => setPayoutsSearch(e.target.value)}
                            placeholder="Search orders..."
                            className="w-full sm:w-56 pl-7 pr-6 py-1.5 bg-[#FAF8F5] border border-[#E8E1D5] rounded-lg text-xs text-[#1E2229] placeholder:text-[#6B7280] focus:outline-none focus:border-[#9E593B] focus:bg-white"
                          />
                          {payoutsSearch && (
                            <button
                              type="button"
                              onClick={() => setPayoutsSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>

                        {/* Filter pills */}
                        <div className="inline-flex items-center bg-[#FAF8F5] border border-[#E8E1D5] p-0.5 rounded-lg gap-0.5 text-xs">
                          {(
                            [
                              { key: 'ALL', label: 'All', count: allLedgerOrders.length },
                              { key: 'COLLECTED', label: 'Collected', count: collectedOrders.length },
                              { key: 'DUE', label: 'Due at Pickup', count: readyOrders.length },
                              { key: 'IN_PROGRESS', label: 'In Progress', count: inProgressOrders.length },
                            ] as const
                          ).map((tab) => {
                            const isSelected = payoutsFilter === tab.key
                            return (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() => setPayoutsFilter(tab.key)}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer text-xs ${isSelected
                                    ? 'bg-white text-[#1E2229] shadow-2xs font-bold'
                                    : 'text-[#6B7280] hover:text-[#1E2229]'
                                  }`}
                              >
                                {tab.label} ({tab.count})
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* ── Mobile: Card list (hidden on sm+) ── */}
                    <div className="sm:hidden divide-y divide-[#E8E1D5]">
                      {filteredLedger.length === 0 ? (
                        <div className="py-10 text-center text-xs text-[#6B7280]">No orders found.</div>
                      ) : filteredLedger.map((o) => {
                        const price = o.price || 30
                        const isSettled = o.status === 'Closed' || o.status === 'Collected'
                        const isReadyForPickup = o.status === 'Ready'
                        const isInProduction = ['Work in Progress', 'Fitting Completed'].includes(o.status)
                        const ledgerPhotos = getAllGarmentPhotos(o)
                        const garmentImg = ledgerPhotos[0] || getGarmentPhoto(o)
                        return (
                          <div key={o.id} className="p-3 flex items-start gap-3">
                            {/* Garment thumbnail */}
                            <div
                              onClick={() => handleOpenFullView(ledgerPhotos, 0)}
                              className="relative size-12 rounded-xl overflow-hidden border border-[#E8E1D5] shrink-0 cursor-pointer shadow-2xs"
                            >
                              <img
                                src={garmentImg}
                                alt={o.garmentName || 'Garment'}
                                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = getDefaultGarmentImage(o.garmentId || o.garmentName) }}
                                className="size-full object-cover"
                              />
                              {ledgerPhotos.length > 1 && (
                                <span className="absolute bottom-0 right-0 bg-[#9E593B] text-white text-[8px] font-bold px-1 rounded-tl">+{ledgerPhotos.length - 1}</span>
                              )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-xs text-[#1E2229] truncate">{o.garmentName || 'Garment'}</div>
                                  <div className="text-[10px] text-[#6B7280] truncate">{o.serviceName || 'Custom Alteration'}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-xs text-[#1E2229]">{o.currencySymbol || studioCurrencySymbol}{price}.00</div>
                                  <div className="text-[10px] text-emerald-700 font-semibold">100% Studio</div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {/* Status pill */}
                                  {isSettled ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 size={10} /><span>Collected</span>
                                    </span>
                                  ) : isReadyForPickup ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      <Clock size={10} /><span>Due at Pickup</span>
                                    </span>
                                  ) : isInProduction ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                      <Scissors size={10} /><span>In Tailoring</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                                      <Package size={10} /><span>Drop-Off</span>
                                    </span>
                                  )}
                                  <span className="text-[10px] text-[#6B7280]">{o.date || 'Today'} · {o.timeSlot || 'Slot'}</span>
                                </div>
                                {/* Action */}
                                {isReadyForPickup ? (
                                  <button
                                    type="button"
                                    onClick={() => { setPickupModalOrder(o); setPickupOtpInput('') }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] cursor-pointer shadow-2xs shrink-0"
                                  >
                                    Verify PIN
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => { setSelectedOrder(o); setActiveTab('pipeline') }}
                                    className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] text-[#1E2229] border border-[#E8E1D5] font-semibold text-[10px] cursor-pointer shrink-0"
                                  >
                                    Inspect
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-[#6B7280]">{o.customerName} · {o.customerPhone}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* ── Desktop: Full table (hidden on mobile) ── */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#FAF8F5] border-b border-[#E8E1D5] text-[#6B7280] font-bold text-[11px] uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Order &amp; Customer</th>
                            <th className="py-3 px-4">Garment &amp; Service</th>
                            <th className="py-3 px-4">Date &amp; Slot</th>
                            <th className="py-3 px-4 text-right">Amount</th>
                            <th className="py-3 px-4 text-center">Status</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-[#E8E1D5]">
                          {filteredLedger.map((o) => {
                            const price = o.price || 30
                            const isSettled = o.status === 'Closed' || o.status === 'Collected'
                            const isReadyForPickup = o.status === 'Ready'
                            const isInProduction = ['Work in Progress', 'Fitting Completed'].includes(o.status)
                            const ledgerPhotos = getAllGarmentPhotos(o)
                            const garmentImg = ledgerPhotos[0] || getGarmentPhoto(o)

                            return (
                              <tr key={o.id} className="hover:bg-[#FAF8F5]/60 transition-colors">
                                {/* 1. Order & Customer */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      onClick={() => handleOpenFullView(ledgerPhotos, 0)}
                                      className="relative size-9 rounded-lg overflow-hidden border border-[#E8E1D5] shrink-0 group cursor-pointer shadow-2xs hover:border-[#9E593B] transition-all"
                                      title={ledgerPhotos.length > 1 ? `Click to view all ${ledgerPhotos.length} photos` : "Click to enlarge photo"}
                                    >
                                      <img
                                        src={garmentImg}
                                        alt={o.garmentName || 'Garment'}
                                        onError={(e) => {
                                          e.currentTarget.onerror = null
                                          e.currentTarget.src = getDefaultGarmentImage(o.garmentId || o.garmentName)
                                        }}
                                        className="size-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                      {ledgerPhotos.length > 1 && (
                                        <span className="absolute bottom-0 right-0 bg-[#9E593B] text-white text-[8px] font-bold px-1 rounded-tl">
                                          +{ledgerPhotos.length - 1}
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-bold text-xs text-[#1E2229]">
                                          #{o.id}
                                        </span>
                                        {ledgerPhotos.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenFullView(ledgerPhotos, 0)}
                                            className="text-[9px] font-bold text-[#9E593B] hover:text-[#7A3F28] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                            title="Inspect all reference photos"
                                          >
                                            <Camera size={9} />
                                            <span>{ledgerPhotos.length}</span>
                                          </button>
                                        )}
                                      </div>
                                      <div className="font-semibold text-xs text-[#1E2229] mt-0.5">
                                        {o.customerName || 'Customer'}
                                      </div>
                                      {o.customerPhone && (
                                        <div className="text-[10px] text-[#6B7280]">
                                          {o.customerPhone}
                                        </div>
                                      )}
                                      {o.retailSold && (
                                        <span className="inline-block mt-0.5 text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                                          Retail Purchased
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* 2. Garment & Service */}
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-xs text-[#1E2229]">
                                    {o.garmentName || 'Garment Alteration'}
                                  </div>
                                  <div className="text-xs text-[#6B7280] mt-0.5">
                                    {o.serviceName || 'Custom Alteration'}
                                  </div>
                                </td>

                                {/* 3. Date & Slot */}
                                <td className="py-3 px-4 text-[#6B7280]">
                                  <div className="text-xs text-[#1E2229] font-medium">
                                    {o.date || 'Today'}
                                  </div>
                                  <div className="text-[10px] text-[#6B7280]">
                                    {o.timeSlot || 'Standard Slot'}
                                  </div>
                                </td>

                                {/* 4. Amount */}
                                <td className="py-3 px-4 text-right">
                                  <div className="font-bold text-xs text-[#1E2229]">
                                    {o.currencySymbol || studioCurrencySymbol}{price}.00
                                  </div>
                                  <div className="text-[10px] text-emerald-700 font-semibold">
                                    100% Studio
                                  </div>
                                </td>

                                {/* 5. Status */}
                                <td className="py-3 px-4 text-center">
                                  {isSettled ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 size={11} />
                                      <span>Collected</span>
                                    </span>
                                  ) : isReadyForPickup ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      <Clock size={11} />
                                      <span>Due at Pickup</span>
                                    </span>
                                  ) : isInProduction ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                      <Scissors size={11} />
                                      <span>In Tailoring</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                                      <Package size={11} />
                                      <span>Drop-Off</span>
                                    </span>
                                  )}
                                </td>

                                {/* 6. Action */}
                                <td className="py-3 px-4 text-right">
                                  {isReadyForPickup ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPickupModalOrder(o)
                                        setPickupOtpInput('')
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                                    >
                                      Verify PIN
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedOrder(o)
                                        setActiveTab('pipeline')
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#1E2229] border border-[#E8E1D5] font-semibold text-xs cursor-pointer transition-colors"
                                    >
                                      Inspect
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}

                          {filteredLedger.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-10 text-center text-xs text-[#6B7280]">
                                No orders found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })()}


            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB 5: STUDIO PROFILE & CONFIGURATION                           */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'profile' && user && (
              <div className="animate-fadeIn w-full">
                <StudioProfileView
                  user={user}
                  onUpdateUser={onUpdateUser}
                  onBack={() => setActiveTab('cockpit')}
                  onSignOut={onSignOut}
                />
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: STUDIO PRICE CATALOG CONFIGURATION                         */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'catalog' && (
              <div className="animate-fadeIn w-full">
                <PriceCatalogView
                  user={user}
                  onSaved={handleCatalogSaved}
                />
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════════ */}
            {/* TAB: ONE-TIME STUDIO VERIFICATION                               */}
            {/* ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'verification' && needsVerification && (
              <StudioVerificationView
                user={user}
                onStatusChange={(status, reason) => onVerificationStatusChange?.(status, reason)}
              />
            )}

          </div>
        </main>

        {/* ── MOBILE BOTTOM TAB BAR ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8E1D5] flex items-center justify-around h-16 safe-area-inset-bottom shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
          {visibleNavItems.map((item) => {
            const active = activeTab === item.id
            const Icon = item.icon
            const badge =
              item.id === 'cockpit' && allBroadcasts.length > 0 ? allBroadcasts.length :
              item.id === 'pipeline' ? pendingDropOffs : null
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id)
                  if (onTabChange) onTabChange(item.id)
                }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer relative min-w-[52px] ${
                  active
                    ? 'text-[#9E593B]'
                    : 'text-[#9CA3AF]'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${
                  active ? 'bg-[#FAF3EC]' : ''
                }`}>
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className={`text-[9px] font-semibold leading-none ${
                  active ? 'text-[#9E593B]' : 'text-[#9CA3AF]'
                }`}>{item.shortLabel}</span>
                {badge !== null && badge > 0 && (
                  <span className="absolute top-0.5 right-1.5 min-w-[16px] h-4 px-1 bg-amber-400 text-stone-950 text-[9px] font-black rounded-full grid place-items-center">{badge > 9 ? '9+' : badge}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS — CLEAN MINIMALIST DIALOGS                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}



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
                {(() => {
                  const pSymbol = pickupModalOrder.currencySymbol || studioCurrencySymbol || '$'
                  const basePrice = pickupModalOrder.price || 0
                  const surcharge = pickupModalOrder.priceAdjustment || 0
                  const finalTotal = basePrice + surcharge

                  return (
                    <>
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-bold text-emerald-950">
                            <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                            Pickup PIN Verified!
                          </span>
                          <span className="text-base font-extrabold text-emerald-800">
                            {pSymbol}{finalTotal.toFixed(2)}
                          </span>
                        </div>

                        {surcharge > 0 ? (
                          <div className="pt-2 border-t border-emerald-200/70 text-[11px] space-y-1">
                            <div className="flex justify-between text-emerald-800">
                              <span>Base Workshop Alteration:</span>
                              <span className="font-semibold">{pSymbol}{basePrice.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-amber-900 font-semibold">
                              <span>Critical Work Surcharge ({pickupModalOrder.priceAdjustmentReason || 'Delicate work'}):</span>
                              <span>+{pSymbol}{surcharge.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-extrabold text-emerald-950 pt-1 border-t border-emerald-200/60 text-xs">
                              <span>Total Counter Settlement:</span>
                              <span>{pSymbol}{finalTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-emerald-800">
                            Collect <strong>{pSymbol}{finalTotal.toFixed(2)}</strong> standard counter payment directly from {pickupModalOrder.customerName}.
                          </p>
                        )}
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
                        {pickupCompleted
                          ? '✓ Payment Collected & Settled!'
                          : `Complete Handover & Collect ${pSymbol}${finalTotal.toFixed(2)} →`}
                      </button>
                    </>
                  )
                })()}
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
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/images/service_trousers.jpg'
                }}
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
                    <img
                      src={photo}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/images/service_trousers.jpg'
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cancel Order Confirmation Modal (Before First PIN / Drop-Off Intake) ── */}
      {orderToCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            if (!isCancellingOrder) setOrderToCancel(null)
          }}
        >
          <div
            className="bg-white border border-[#E8E1D5] rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#1E2229]">Cancel Alteration Order</h3>
                  <p className="text-xs text-[#6B7280]">
                    Order #{orderToCancel.id} &bull; {orderToCancel.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isCancellingOrder}
                onClick={() => setOrderToCancel(null)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#1E2229] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Info notice */}
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} className="text-amber-600 shrink-0" />
                <span>Garment Awaiting Drop-Off (No PIN Entered)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                This alteration has not been dropped off or checked in at the sewing bench. Cancelling will immediately notify{' '}
                <span className="font-semibold">{orderToCancel.customerName}</span> on their live tracking dashboard and release any card holds.
              </p>
            </div>

            {/* Garment summary */}
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] text-xs flex items-center justify-between">
              <div>
                <div className="font-bold text-[#1E2229]">{orderToCancel.garmentName}</div>
                <div className="text-[11px] text-[#6B7280]">{orderToCancel.serviceName}</div>
              </div>
              <span className="font-bold text-sm text-[#1E2229]">
                ${orderToCancel.partnerPayout || orderToCancel.price || 20}
              </span>
            </div>

            {/* Reason selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1E2229]">
                Reason for Cancellation
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={isCancellingOrder}
                className="w-full text-xs font-medium px-3 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-[#1E2229] focus:outline-none focus:border-[#9E593B]"
              >
                <option value="Studio capacity reached / unable to service">
                  Studio capacity reached / fully booked
                </option>
                <option value="Fabric / alteration type cannot be fulfilled">
                  Fabric or alteration complexity cannot be fulfilled
                </option>
                <option value="Customer requested cancellation before arrival">
                  Client requested cancellation before arrival
                </option>
                <option value="Customer no-show / did not arrive for scheduled slot">
                  Customer no-show / missed arrival window
                </option>
                <option value="Workshop maintenance / emergency closure">
                  Workshop maintenance / temporary closure
                </option>
              </select>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isCancellingOrder}
                onClick={() => setOrderToCancel(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E8E1D5] text-xs font-bold text-[#6B7280] hover:text-[#1E2229] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isCancellingOrder}
                onClick={handleConfirmCancelOrder}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isCancellingOrder ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Cancelling &amp; Notifying...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={14} />
                    <span>Cancel Order &amp; Send Message</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workshop Notification / Toast Banner */}
      {(broadcastToast || studioNotice) && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 bg-[#0F1115]/95 backdrop-blur-md text-white px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl shadow-2xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in max-w-[calc(100vw-2rem)]">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{broadcastToast || studioNotice}</span>
        </div>
      )}

      {/* Welcome Aboard Modal (Featuring 3 Distinct UI Designs) */}
      <WelcomeAboardModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        user={user}
        onProceedToCatalog={(chosenCurrency) => {
          if (chosenCurrency) {
            setStudioCurrency(chosenCurrency)
            setStudioCurrencySymbol(getCurrencySymbol(chosenCurrency))
          }
          setShowWelcomeModal(false)
          setShowCatalogPromptModal(false)
          setActiveTab('catalog')
        }}
        onSkipToDashboard={() => setShowWelcomeModal(false)}
      />

      {/* Persistent Price Catalog Modal Prompt */}
      <PriceCatalogModal
        isOpen={showCatalogPromptModal}
        onClose={() => setShowCatalogPromptModal(false)}
        user={user}
        onSaved={handleCatalogSaved}
      />
    </div>
  )
}
