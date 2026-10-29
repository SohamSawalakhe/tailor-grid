'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Clock,
  CreditCard,
  Gauge,
  Headphones,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  Scissors,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react'
import Link from 'next/link'
import type { User as UserType } from './data'
import { updateUserProfile, sendOtp, updateStudioStatus } from '@/lib/api'
import { UberMapModal, SelectedLocationData } from './uber-map-modal'
import { AnimatedLocationPin } from './animated-location-pin'
import { OtpVerificationCard } from './otp-input'
import { StudioAvatar } from './studio-avatar'
import { PriceCatalogView } from './price-catalog-view'
import { toast } from 'react-toastify'

interface StudioProfileViewProps {
  user: UserType
  onUpdateUser?: (updated: UserType) => void
  onBack?: () => void
  onSignOut?: () => void
}

const SPECIALTIES = [
  'Custom Alterations',
  'Precision Hemming',
  'Express Tailoring',
  'Suit Tailoring',
  'Dress Hemming',
  'Denim Chainstitch',
  'Silk & Gowns',
  'Leather & Outerwear',
  'Zip Replacements',
  'Waist Suppression',
  'Cuff Relinking',
]

const ATELIER_PRESETS = [
  {
    name: 'Mayfair Sartoria',
    url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=600&auto=format&fit=crop',
  },
  {
    name: 'Savile Row Suite',
    url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=600&auto=format&fit=crop',
  },
  {
    name: 'Milan Workshop',
    url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?q=80&w=600&auto=format&fit=crop',
  },
  {
    name: 'Craft Denim Bench',
    url: 'https://images.unsplash.com/photo-1589310243389-96a5483213a8?q=80&w=600&auto=format&fit=crop',
  },
]

// Helper to split raw stored address into manual Shop No. and map-detected street address
function parseAddressParts(rawAddress: string, userId?: string) {
  let stored = typeof window !== 'undefined' && userId ? (localStorage.getItem(`raffu_studio_shop_no_${userId}`)) : null
  let sNo = (stored || '').trim()
  let street = (rawAddress || '').trim()

  if (sNo && street) {
    if (street.toLowerCase().startsWith(sNo.toLowerCase())) {
      street = street.slice(sNo.length).replace(/^[,\s-]+/, '').trim()
    }
  } else if (!sNo && street) {
    const match = street.match(/^([^,]+),\s*(.+)$/)
    if (match) {
      sNo = match[1].trim()
      street = match[2].trim()
    } else {
      sNo = street
      street = ''
    }
  }

  return { shopNo: sNo, mapStreet: street }
}

function buildFullAddress(shopNoStr: string, mapStreetStr: string) {
  const s = shopNoStr.trim()
  const m = mapStreetStr.trim()
  if (s && m) return `${s}, ${m}`
  return s || m || ''
}

export function StudioProfileView({
  user,
  onUpdateUser,
  onBack,
  onSignOut,
}: StudioProfileViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'craft' | 'catalog'>('profile')

  const [name, setName] = useState(user?.name || '')
  const [studioName, setStudioName] = useState(user?.studioName || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [verifiedPhone, setVerifiedPhone] = useState(user?.phone || '')
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const [otpError, setOtpError] = useState('')

  // Address is driven via map pin; ONLY Shop No. / Workshop Unit is manually written
  const initialAddress = parseAddressParts(user?.address || '', user?.id)
  const [shopNo, setShopNo] = useState(initialAddress.shopNo)
  const [mapStreetAddress, setMapStreetAddress] = useState(initialAddress.mapStreet)
  const [area, setArea] = useState(user?.area ?? '')
  const [postcode, setPostcode] = useState(user?.postcode ?? '')
  const [lat, setLat] = useState<number | null>(user?.lat ?? null)
  const [lng, setLng] = useState<number | null>(user?.lng ?? null)
  const [avatar, setAvatar] = useState(user?.avatar || '')
  // A studio can only be switched on once an admin has verified it
  const isVerified = user?.verificationStatus === 'APPROVED'
  const storeStatus: 'ACTIVE' | 'INACTIVE' = isVerified && user?.storeStatus !== 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'
  const [studioStatus, setStudioStatus] = useState<'ACTIVE' | 'INACTIVE'>(storeStatus)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  useEffect(() => {
    setStudioStatus(storeStatus)
  }, [storeStatus])

  const handleToggleStatus = async () => {
    if (!isVerified) {
      toast.info(
        user?.verificationStatus === 'PENDING'
          ? 'Your verification is under review. You can turn your store on once it is approved.'
          : 'Please verify your studio first. Your store stays inactive until it is approved.',
        { position: 'top-center', autoClose: 4000 }
      )
      return
    }
    if (isUpdatingStatus) return
    setIsUpdatingStatus(true)
    const nextStatus = studioStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      const res = await updateStudioStatus(nextStatus)
      if (res && res.success) {
        setStudioStatus(nextStatus)
        if (onUpdateUser && res.user) {
          onUpdateUser(res.user)
        }
        if (nextStatus === 'ACTIVE') {
          toast.success('Studio is now Active! Visible on customer map & booking.', {
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
      toast.error(err.message || 'Failed to update studio status.', {
        position: 'top-center',
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const [showPresets, setShowPresets] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [isMapModalOpen, setIsMapModalOpen] = useState(false)



  const [specialties, setSpecialties] = useState<string[]>(() => {
    if (user.specialties && Array.isArray(user.specialties) && user.specialties.length > 0) {
      return user.specialties
    }
    return ['Custom Alterations', 'Precision Hemming', 'Express Tailoring']
  })

  const [openingHours, setOpeningHours] = useState(user?.openingHours || 'Mon–Sat: 09:00 – 19:00')
  const [dailyCapacity, setDailyCapacity] = useState<number>(Number(user?.dailyCapacity) || 25)
  const [machines, setMachines] = useState<number>(Number(user?.machines) || 4)
  const [workers, setWorkers] = useState<number>(Number(user?.workers) || 4)

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleShopNoChange = (val: string) => {
    setShopNo(val)
    if (user?.id && typeof window !== 'undefined') {
      localStorage.setItem(`raffu_studio_shop_no_${user.id}`, val)
    }
  }

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setStudioName(user.studioName || '')
      if (user.phone) {
        setPhone(user.phone)
        setVerifiedPhone(user.phone)
      }

      const { shopNo: initShopNo, mapStreet: initMapStreet } = parseAddressParts(user.address || '', user.id)
      setShopNo(initShopNo || '')
      setMapStreetAddress(initMapStreet || '')

      setArea(user.area || '')
      setPostcode(user.postcode || '')
      setLat(user.lat ?? null)
      setLng(user.lng ?? null)
      if (user.specialties && Array.isArray(user.specialties) && user.specialties.length > 0) {
        setSpecialties(user.specialties)
      }
      setOpeningHours(user.openingHours || 'Mon–Sat: 09:00 – 19:00')
      setDailyCapacity(Number(user.dailyCapacity) || 25)
      setMachines(Number(user.machines) || 4)
      setWorkers(Number(user.workers) || 4)
      setAvatar(user.avatar || '')
    }
  }, [user])

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [otpCountdown])

  const currentDigits = (user.phone || '').replace(/\D/g, '')
  const currentInputDigits = phone.replace(/\D/g, '')
  const verifiedDigits = verifiedPhone.replace(/\D/g, '')
  const isPhoneChanged = Boolean(currentDigits && currentInputDigits !== currentDigits)
  const isNewPhoneVerified = Boolean(currentInputDigits && currentInputDigits === verifiedDigits)

  const handleSendOtpToNewPhone = async (force: boolean = false) => {
    const raw = phone.trim()
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly.length < 10) {
      setError('Please enter a valid 10-digit mobile number with country code (e.g. +91 98765 43210).')
      return
    }

    setOtpSending(true)
    setOtpError('')
    setError('')
    try {
      const res = await sendOtp(raw, force)
      setOtpSending(false)
      if (res.phone) setPhone(res.phone)
      setOtpValue('')
      setOtpCountdown(30)
      setIsOtpModalOpen(true)
      toast.info(`Verification code sent via SMS to ${res.phone || raw}`, {
        position: 'top-center',
      })
    } catch (err: any) {
      setOtpSending(false)
      const msg = err?.message || 'Failed to send verification code.'
      setError(msg)
      toast.error(msg, { position: 'top-center' })
    }
  }

  const handleVerifyNewPhoneOtp = async () => {
    const cleanOtp = otpValue.trim()
    if (!cleanOtp || cleanOtp.length < 4) {
      setOtpError('Please enter the 4-digit verification code.')
      return
    }

    setOtpLoading(true)
    setOtpError('')
    setError('')
    try {
      const cleanPostcode = postcode.trim()
      const fullAddr = buildFullAddress(shopNo, mapStreetAddress)
      const updates: Partial<UserType> & { otp: string } = {
        id: user.id,
        email: user.email,
        name: name.trim(),
        studioName: studioName.trim(),
        phone: phone.trim(),
        otp: cleanOtp,
        address: fullAddr.trim(),
        area: area.trim(),
        postcode: cleanPostcode,
        lat: lat,
        lng: lng,
        specialties: specialties,
        openingHours: openingHours.trim(),
        dailyCapacity: Number(dailyCapacity) || 25,
        machines: Number(machines) || 4,
        workers: Number(workers) || 4,
        avatar: avatar ? avatar.trim() : null,
        status: studioStatus,
      }

      const res = await updateUserProfile(updates)
      setOtpLoading(false)
      setIsOtpModalOpen(false)
      setVerifiedPhone(phone.trim())
      setSuccess(true)

      toast.success(`Mobile verified & updated to ${phone.trim()}!`, {
        position: 'top-center',
        autoClose: 4000,
      })

      const mergedUser: UserType = {
        ...user,
        ...updates,
        ...(res?.user || {}),
        phone: phone.trim(),
        avatar: avatar ? avatar.trim() : null,
      }

      if (onUpdateUser) {
        onUpdateUser(mergedUser)
      }

      setTimeout(() => {
        setSuccess(false)
      }, 3500)
    } catch (err: any) {
      setOtpLoading(false)
      const msg = err?.message || 'Invalid or expired verification code.'
      setOtpError(msg)
      toast.error(msg, { position: 'top-center' })
    }
  }

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  // Handle map selection callback from UberMapModal: directly apply chosen workshop location
  const handleSelectMapLocation = async (data: SelectedLocationData) => {
    setIsMapModalOpen(false)

    const nextStreet = data.streetAddress || mapStreetAddress
    const nextArea = data.area || area
    const nextPostcode = data.postcode || postcode
    const nextLat = data.lat ?? lat
    const nextLng = data.lng ?? lng

    setMapStreetAddress(nextStreet)
    if (data.area) setArea(data.area)
    if (data.postcode) setPostcode(data.postcode)
    if (data.lat) setLat(data.lat)
    if (data.lng) setLng(data.lng)

    const fullAddr = buildFullAddress(shopNo, nextStreet)
    const label = nextStreet || nextArea || 'Workshop Location'
    const newLocStr = [shopNo, nextStreet, nextArea, data.city, nextPostcode ? `(${nextPostcode})` : ''].filter(Boolean).join(', ') || label

    try {
      const updates: Partial<UserType> = {
        id: user.id,
        email: user.email,
        name: name.trim(),
        studioName: studioName.trim(),
        phone: (verifiedPhone || user.phone || phone).trim(),
        address: fullAddr.trim(),
        area: nextArea.trim(),
        postcode: nextPostcode.trim(),
        lat: nextLat,
        lng: nextLng,
        specialties: specialties,
        openingHours: openingHours.trim(),
        dailyCapacity: Number(dailyCapacity) || 25,
        machines: Number(machines) || 4,
        workers: Number(workers) || 4,
        avatar: avatar ? avatar.trim() : null,
      }

      const res = await updateUserProfile(updates)
      if (onUpdateUser) {
        onUpdateUser({
          ...user,
          ...updates,
          ...(res?.user || {}),
        })
      }
    } catch (err) {
      console.warn('Auto-save location update error:', err)
    }

    toast.success(`Workshop location updated: ${newLocStr}`, {
      position: 'top-center',
      autoClose: 3500,
    })
  }

  // Handle local image file upload (auto-compressed via Canvas to <60KB)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, or WebP).')
      return
    }

    setError('')
    const reader = new FileReader()
    reader.onload = (loadEvt) => {
      const rawData = loadEvt.target?.result as string
      if (!rawData) return

      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 600
        let width = img.width
        let height = img.height

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const compressed = canvas.toDataURL('image/jpeg', 0.82)
          setAvatar(compressed)
          setShowPresets(false)
        } else {
          setAvatar(rawData)
          setShowPresets(false)
        }
      }
      img.onerror = () => {
        setAvatar(rawData)
        setShowPresets(false)
      }
      img.src = rawData
    }
    reader.readAsDataURL(file)
  }

  const applyPreset = (url: string) => {
    setAvatar(url)
    setShowPresets(false)
    setError('')
  }

  const handleApplyCustomUrl = () => {
    if (!customUrl.trim()) return
    setAvatar(customUrl.trim())
    setCustomUrl('')
    setShowUrlInput(false)
    setError('')
  }

  const handleRemoveImage = async () => {
    setAvatar('')
    if (fileInputRef.current) fileInputRef.current.value = ''

    // Auto-save removal to backend immediately
    try {
      const fullAddr = buildFullAddress(shopNo, mapStreetAddress)
      const updates: Partial<UserType> = {
        id: user.id,
        email: user.email,
        name: name.trim(),
        studioName: studioName.trim(),
        phone: (verifiedPhone || user.phone || phone).trim(),
        address: fullAddr.trim(),
        area: area.trim(),
        postcode: postcode.trim(),
        lat: lat,
        lng: lng,
        specialties: specialties,
        openingHours: openingHours.trim(),
        dailyCapacity: Number(dailyCapacity) || 25,
        machines: Number(machines) || 4,
        workers: Number(workers) || 4,
        avatar: null,
      }
      const res = await updateUserProfile(updates)
      const mergedUser: UserType = {
        ...user,
        ...updates,
        ...(res?.user || {}),
        avatar: null,
      }
      if (onUpdateUser) {
        onUpdateUser(mergedUser)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      console.warn('Auto-save avatar removal error:', err)
    }
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)

    const cleanedPhone = phone.trim()
    const phoneDigits = cleanedPhone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      setSaving(false)
      setError('Please enter a valid 10-digit mobile number (e.g. +91 98765 43210).')
      return
    }

    if (!shopNo.trim()) {
      setSaving(false)
      setError('Please enter your Shop No. / Workshop Unit.')
      toast.warning('Shop No. / Unit is required.', { position: 'top-center' })
      return
    }

    if (!lat || !lng) {
      setSaving(false)
      setError('Please pin your exact workshop location on the map. Latitude & Longitude are compulsory.')
      toast.warning('Workshop Map Pin is required.', { position: 'top-center' })
      setIsMapModalOpen(true)
      return
    }

    const cleanPostcode = postcode.trim()

    // If phone number was changed and not verified via OTP yet, prompt OTP verification modal!
    if (isPhoneChanged && !isNewPhoneVerified) {
      setSaving(false)
      await handleSendOtpToNewPhone()
      return
    }

    try {
      const fullAddress = buildFullAddress(shopNo, mapStreetAddress)
      const updates: Partial<UserType> = {
        id: user.id,
        email: user.email,
        name: name.trim(),
        studioName: studioName.trim(),
        phone: cleanedPhone,
        address: fullAddress.trim(),
        area: area.trim(),
        postcode: cleanPostcode,
        lat: lat,
        lng: lng,
        specialties: specialties,
        openingHours: openingHours.trim(),
        dailyCapacity: Number(dailyCapacity) || 25,
        machines: Number(machines) || 4,
        workers: Number(workers) || 4,
        avatar: avatar ? avatar.trim() : null,
      }

      const res = await updateUserProfile(updates)
      setSaving(false)
      setSuccess(true)

      toast.success('Atelier configuration saved successfully!', {
        position: 'top-center',
        autoClose: 3500,
      })

      const mergedUser: UserType = {
        ...user,
        ...updates,
        ...(res?.user || {}),
        avatar: avatar ? avatar.trim() : null,
      }

      if (onUpdateUser) {
        onUpdateUser(mergedUser)
      }

      setTimeout(() => {
        setSuccess(false)
      }, 3500)
    } catch (err: any) {
      setSaving(false)
      const msg = err?.message || 'Failed to save changes. Please try again.'
      setError(msg)
      toast.error(msg, { position: 'top-center' })
    }
  }

  return (
    <div className="w-full max-w-full space-y-6 animate-in fade-in duration-200 min-w-0">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-[#E8E1D5] pb-4 sm:pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="size-2 rounded-full bg-[#9E593B]" />
            <span className="text-[11px] font-bold tracking-widest text-[#9E593B] uppercase">
              Partner Workbench
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-bold font-serif text-[#1E2229]">
            Studio Configuration
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5 sm:mt-1">
            Manage your atelier identity, master tailor credentials, and craft capabilities.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 w-full sm:w-auto">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#1E2229] hover:text-black bg-white hover:bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#9E593B] hover:bg-[#8A4C32] rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <span>Saving...</span>
            ) : success ? (
              <>
                <Check size={14} />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Feedback Banners ── */}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <Check size={16} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">
            Atelier profile successfully saved to database! Updates are live across the Raffu Grid.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 animate-in fade-in">
          {error}
        </div>
      )}

      {/* ── Tab Switcher ── */}
      <div className="flex items-center gap-2 border-b border-[#E8E1D5] pb-px mb-2 overflow-x-auto no-scrollbar scroll-smooth">
        <button
          type="button"
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 ${activeSubTab === 'profile'
              ? 'border-[#9E593B] text-[#9E593B]'
              : 'border-transparent text-[#6B7280] hover:text-[#1E2229]'
            }`}
        >
          <Store size={14} />
          <span>Atelier Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('craft')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 ${activeSubTab === 'craft'
              ? 'border-[#9E593B] text-[#9E593B]'
              : 'border-transparent text-[#6B7280] hover:text-[#1E2229]'
            }`}
        >
          <Sliders size={14} />
          <span>Craft & Specialisms</span>
          <span className="size-4 rounded-full bg-[#FAF3EC] text-[#9E593B] text-[10px] font-extrabold grid place-items-center">
            {specialties.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('catalog')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer shrink-0 ${activeSubTab === 'catalog'
              ? 'border-[#9E593B] text-[#9E593B]'
              : 'border-transparent text-[#6B7280] hover:text-[#1E2229]'
            }`}
        >
          <Tag size={14} />
          <span>Price Catalog</span>
        </button>
      </div>

      {/* ── Form View or Price Catalog ── */}
      {activeSubTab === 'catalog' ? (
        <div className="pt-2">
          <PriceCatalogView user={user} />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-7 sm:space-y-8">
          {activeSubTab === 'profile' ? (
            <div className="space-y-7 sm:space-y-8">
            {/* Atelier Identity & Branding Card */}
            <div className="p-4 sm:p-7 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs space-y-4 sm:space-y-5 min-w-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-5">
                <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                  <StudioAvatar
                    avatar={avatar}
                    name={studioName || name || 'Master Tailor'}
                    size="xl"
                    shape="rounded"
                    showStatusDot={true}
                    status={studioStatus}
                    className="border border-[#E8E1D5] shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-xl font-serif font-bold text-[#1E2229] truncate max-w-[200px] sm:max-w-none">
                        {studioName || 'Your Atelier Name'}
                      </h2>
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Verified Atelier
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          {user?.verificationStatus === 'PENDING' ? 'Verification Pending' : 'Not Verified'}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 transition-colors ${
                        studioStatus === 'INACTIVE'
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        <span className={`size-1.5 rounded-full ${studioStatus === 'INACTIVE' ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`} />
                        {studioStatus === 'INACTIVE' ? 'Store Inactive · Offline' : 'Store Active · Online'}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5 truncate">
                      Lead Craftsman: <strong className="text-[#1E2229]">{name || 'Master Tailor'}</strong>
                    </p>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-[#6B7280] mt-1 flex-wrap">
                      <span className="bg-[#FAF3EC] text-[#9E593B] px-1.5 py-0.5 rounded font-bold text-[10px] shrink-0">
                        Direct Settlement
                      </span>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setIsMapModalOpen(true)}
                        className="truncate max-w-[140px] sm:max-w-[200px] hover:text-[#9E593B] transition-colors cursor-pointer text-left underline decoration-dotted underline-offset-2"
                        title="Click to adjust map pin"
                      >
                        {buildFullAddress(shopNo, mapStreetAddress) || area || 'Studio Address'}
                      </button>
                      {lat && lng && (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => setIsMapModalOpen(true)}
                            className="text-emerald-700 hover:text-[#9E593B] font-semibold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                            title="Click to adjust GPS pin"
                          >
                            <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                            GPS Pinned
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Photo & Profile Actions */}
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <input
                    key="atelier-avatar-file-input"
                    id="atelier-avatar-file-input"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8E1D5] bg-white hover:bg-[#FAF8F5] text-xs font-semibold text-[#1E2229] transition-colors cursor-pointer shadow-2xs"
                  >
                    <Upload size={13} className="text-[#9E593B]" />
                    <span>Upload Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPresets(!showPresets)
                      setShowUrlInput(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8E1D5] bg-white hover:bg-[#FAF8F5] text-xs font-semibold text-[#1E2229] transition-colors cursor-pointer shadow-2xs"
                  >
                    <ImageIcon size={13} className="text-[#9E593B]" />
                    <span>Presets</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUrlInput(!showUrlInput)
                      setShowPresets(false)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E8E1D5] bg-white hover:bg-[#FAF8F5] text-xs font-semibold text-[#1E2229] transition-colors cursor-pointer shadow-2xs"
                  >
                    <LinkIcon size={13} className="text-[#9E593B]" />
                    <span>URL</span>
                  </button>

                  {avatar && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-2 text-[#6B7280] hover:text-rose-600 transition-colors cursor-pointer"
                      title="Reset Photo"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Preset Drawer */}
              {showPresets && (
                <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#6B7280]">
                    <span>Choose Atelier Atmosphere:</span>
                    <button
                      type="button"
                      onClick={() => setShowPresets(false)}
                      className="text-[#9E593B] hover:underline"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {ATELIER_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyPreset(p.url)}
                        className="group relative rounded-xl overflow-hidden aspect-4/3 border border-[#E8E1D5] hover:border-[#9E593B] transition-all text-left cursor-pointer"
                      >
                        <img src={p.url} alt={p.name} className="size-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                          <span className="text-[10px] text-white font-bold truncate">{p.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* URL Drawer */}
              {showUrlInput && (
                <div className="flex gap-2 animate-in fade-in">
                  <input
                    key="atelier-avatar-url-input"
                    id="atelier-avatar-url-input"
                    type="url"
                    value={customUrl || ''}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomUrl}
                    className="px-4 py-2 bg-[#1E2229] text-white text-xs font-semibold rounded-xl hover:bg-[#9E593B] transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* ── Studio Visibility & Active Discovery Card ── */}
            <div className="p-4 sm:p-6 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                    studioStatus === 'INACTIVE'
                      ? 'bg-slate-100 border-slate-200 text-slate-500'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    <Store size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-[#1E2229]">
                        Store Discovery & Live Visibility
                      </h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        studioStatus === 'INACTIVE'
                          ? 'bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        <span className={`size-1.5 rounded-full ${studioStatus === 'INACTIVE' ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'}`} />
                        {studioStatus === 'INACTIVE' ? 'Store Inactive · Offline' : 'Store Active · Online'}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1 max-w-xl leading-relaxed">
                      {studioStatus === 'INACTIVE'
                        ? 'Your atelier is currently hidden from customer searches, neighborhood map pins, and alteration booking requests. Toggle Active when ready to accept orders.'
                        : 'Your atelier is actively published across the customer marketplace, verified nearby studio map, and open to accept alteration orders.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={handleToggleStatus}
                  className={`shrink-0 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none shadow-2xs ${
                    studioStatus === 'INACTIVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 active:scale-95'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 active:scale-95'
                  } ${isUpdatingStatus ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <span className="relative flex size-2">
                    {studioStatus === 'ACTIVE' ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full size-2 bg-slate-400" />
                    )}
                  </span>
                  <span>{studioStatus === 'INACTIVE' ? 'Turn Store Active' : 'Set Store Inactive'}</span>
                  {/* Miniature switch track */}
                  <span
                    className={`inline-flex items-center shrink-0 w-7 h-4 rounded-full transition-colors p-0.5 pointer-events-none ${
                      studioStatus === 'ACTIVE' ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`size-3 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                        studioStatus === 'ACTIVE' ? 'translate-x-3' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>

            {/* Form Fields Grid */}
            <div className="p-4 sm:p-7 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs space-y-6 min-w-0">
              <div className="border-b border-[#E8E1D5] pb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-[#1E2229]">
                    Atelier & Master Tailor Details
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Update your studio identity, contact details, and workshop location.
                  </p>
                </div>
                {lat && lng && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Coordinates: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    Atelier / Studio Name *
                  </label>
                  <input
                    key="atelier-studio-name-input"
                    id="atelier-studio-name-input"
                    type="text"
                    required
                    placeholder="e.g. Mayfair Sartoria or Atelier Studio"
                    value={studioName || ''}
                    onChange={(e) => setStudioName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    Lead Master Tailor *
                  </label>
                  <input
                    key="atelier-lead-craftsman-input"
                    id="atelier-lead-craftsman-input"
                    type="text"
                    required
                    placeholder="e.g. Master Tailor or Craftsman Name"
                    value={name || ''}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>

                {/* ── Shop No. / Workshop Unit (ONLY address field entered manually) ── */}
                <div className="space-y-1.5 sm:col-span-2 min-w-0">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                      Shop No. / Workshop Unit *
                    </label>
                    <span className="text-[10px] font-semibold text-[#9E593B] bg-[#FAF3EC] px-2 py-0.5 rounded-full border border-[#E8E1D5] shrink-0">
                      Manual Entry
                    </span>
                  </div>
                  <div className="relative">
                    <Store size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      key="atelier-shop-no-input"
                      id="atelier-shop-no-input"
                      type="text"
                      required
                      placeholder="e.g. Shop No. 4, Ground Floor, Gala 12, or Suite 2B"
                      value={shopNo || ''}
                      onChange={(e) => handleShopNoChange(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs font-medium text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                    />
                  </div>
                  <p className="text-[11px] text-[#6B7280]">
                    Only your shop / gala / unit number needs to be typed manually. Street, neighborhood, and PIN are auto-detected via the map pin below.
                  </p>
                </div>

                {/* ── Interactive Live Map Pin Trigger ── */}
                <div className="space-y-1.5 sm:col-span-2 min-w-0">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider leading-snug">
                      Workshop Map Pin (GPS Location) *
                    </label>
                    {lat && lng ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Location Pinned
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                        Pin not set
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMapModalOpen(true)}
                    className="w-full flex items-center justify-between gap-2.5 px-3.5 sm:px-4 py-3 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] hover:bg-white hover:border-[#9E593B] text-left transition-all cursor-pointer group shadow-2xs min-w-0"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <AnimatedLocationPin
                        size={22}
                        isConfirmed={Boolean(lat && lng)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#1E2229] group-hover:text-[#9E593B] transition-colors truncate">
                          {lat && lng ? 'Workshop Location Pinned' : 'Choose Exact Location on Map'}
                        </div>
                        <div className="text-[11px] text-[#6B7280] truncate mt-0.5">
                          {lat && lng
                            ? `${mapStreetAddress || area || 'Pinned Workshop'}${postcode ? ` (${postcode})` : ''}`
                            : 'Tap to position your pin on the live interactive map & auto-detect coordinates'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-[#9E593B] bg-[#FAF3EC] border border-[#E8E1D5] px-2 sm:px-2.5 py-1 rounded-lg shrink-0 group-hover:bg-[#9E593B] group-hover:text-white transition-colors">
                      {lat && lng ? 'Adjust Pin' : 'Pin on Map'}
                    </span>
                  </button>
                </div>

                {/* ── Auto-Synced Address Details (Derived via Map Changes) ── */}
                <div className="space-y-2 sm:col-span-2 min-w-0">
                  <div className="flex flex-wrap items-start gap-1">
                    <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
                      <span>Map-Detected Workshop Address</span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Auto-synced via Pin
                      </span>
                    </label>
                    <span className="text-[10px] text-[#6B7280] ml-auto hidden sm:inline">
                      Updated dynamically via Map Pin
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-[#FAF8F5] border border-[#E8E1D5] min-w-0">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">
                        Street / Road (Via Map)
                      </span>
                      <div
                        className="text-xs font-medium text-[#1E2229] bg-white border border-[#E8E1D5] rounded-lg px-2.5 py-1.5 truncate"
                        title={mapStreetAddress || 'Set via Map Pin'}
                      >
                        {mapStreetAddress || (lat && lng ? 'Location Pinned' : 'Pin on map to detect')}
                      </div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">
                        Area / Neighborhood (Via Map)
                      </span>
                      <div
                        className="text-xs font-medium text-[#1E2229] bg-white border border-[#E8E1D5] rounded-lg px-2.5 py-1.5 truncate"
                        title={area || 'Set via Map Pin'}
                      >
                        {area || (lat && lng ? 'Location Pinned' : 'Pin on map to detect')}
                      </div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider block">
                        Postcode / ZIP / PIN (Via Map)
                      </span>
                      <div
                        className="text-xs font-mono font-bold text-[#1E2229] bg-white border border-[#E8E1D5] rounded-lg px-2.5 py-1.5 truncate"
                        title={postcode || 'Set via Map Pin'}
                      >
                        {postcode || (lat && lng ? 'Auto-detected' : '—')}
                      </div>
                    </div>
                  </div>

                  {/* Combined Dispatch Address Preview */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-[11px] text-[#1E2229] min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MapPin size={13} className="text-emerald-700 shrink-0" />
                      <span className="font-bold text-emerald-900">Client Delivery Address:</span>
                    </div>
                    <span className="truncate font-medium text-emerald-950 min-w-0 flex-1">
                      {[shopNo, mapStreetAddress || area, postcode ? `(${postcode})` : ''].filter(Boolean).join(', ') || 'Enter Shop No. and pin your workshop location on the map'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                      SMS Alert Phone (Dispatch) *
                    </label>
                    {!isPhoneChanged ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Verified
                      </span>
                    ) : isNewPhoneVerified ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        New Number Verified
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        OTP Required
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      key="atelier-phone-input"
                      id="atelier-phone-input"
                      type="tel"
                      inputMode="tel"
                      required
                      placeholder="+91 98765 43210 or +1 (555) 019-2834"
                      value={phone || ''}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/[^\d+ ]/g, ''))
                        setError('')
                      }}
                      className={`w-full pl-9 ${isPhoneChanged && !isNewPhoneVerified ? 'pr-24' : 'pr-3.5'
                        } py-2.5 text-xs text-[#1E2229] bg-white border rounded-xl focus:outline-none transition-colors ${isPhoneChanged && !isNewPhoneVerified
                          ? 'border-amber-300 focus:border-amber-500 bg-amber-50/20'
                          : 'border-[#E8E1D5] focus:border-[#9E593B]'
                        }`}
                    />
                    {isPhoneChanged && !isNewPhoneVerified && (
                      <button
                        type="button"
                        onClick={() => handleSendOtpToNewPhone()}
                        disabled={otpSending || currentInputDigits.length < 10}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-extrabold text-white bg-[#9E593B] hover:bg-[#8A4C32] rounded-lg transition-all cursor-pointer disabled:opacity-50"
                      >
                        {otpSending ? 'Sending...' : 'Verify OTP'}
                      </button>
                    )}
                  </div>
                  {isPhoneChanged && !isNewPhoneVerified && (
                    <p className="text-[10px] text-amber-700 font-medium">
                      Mobile number changed. Click <strong>Verify OTP</strong> or <strong>Save Changes</strong> to receive an SMS code.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    Partner Email (Read-Only)
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                    <input
                      key="atelier-email-input"
                      id="atelier-email-input"
                      type="email"
                      readOnly
                      value={user?.email || user?.contact || ''}
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs text-[#6B7280] bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl cursor-not-allowed select-none"
                    />
                  </div>
                </div>
              </div>
            </div>


            {/* Bottom Nav */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex items-center justify-center sm:justify-start gap-1.5 py-2 text-xs font-semibold text-[#6B7280] hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Sign Out of Atelier</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveSubTab('craft')}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1E2229] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs sm:ml-auto w-full sm:w-auto"
              >
                <span>Next: Craft & Specialisms</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* TAB 2: CRAFT & SPECIALISMS */
          <div className="space-y-6 sm:space-y-7 min-w-0">
            {/* Primary Node Territory Section */}
            <div className="p-4 sm:p-7 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs space-y-4 min-w-0">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    Primary Node Territory (Radius)
                  </label>
                  {lat && lng && (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                      Radius Centered on Live Pin
                    </span>
                  )}
                </div>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    key="atelier-area-input"
                    id="atelier-area-input"
                    type="text"
                    value={area || ''}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. Vasai Road, Umela or Soho & Central London"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  Catchment zone for Raffu courier allocation and customer radius matching (5-mile radius).
                </p>
              </div>
            </div>

            {/* Machine Specialties & Capabilities */}
            <div className="p-4 sm:p-7 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs space-y-4 min-w-0">
              <div className="border-b border-[#E8E1D5] pb-2 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-bold text-sm text-[#1E2229]">Workshop Specialisms & Machinery</h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Select the alteration and bespoke services your sewing bench and pressers support.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#9E593B] bg-[#FAF3EC] px-2.5 py-1 rounded-lg border border-[#E8E1D5] shrink-0">
                  {specialties.length} Selected
                </span>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-2.5">
                {SPECIALTIES.map((spec) => {
                  const selected = specialties.includes(spec)
                  return (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => toggleSpecialty(spec)}
                      className={`p-3 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer flex items-center justify-between min-w-0 ${selected
                          ? 'bg-[#FAF3EC] border-[#9E593B] text-[#9E593B] font-bold shadow-2xs'
                          : 'bg-white border-[#E8E1D5] text-[#1E2229] hover:bg-[#FAF8F5]'
                        }`}
                    >
                      <span className="truncate">{spec}</span>
                      {selected && <Check size={13} className="shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Workshop Capacity & Bench Setup */}
            <div className="p-4 sm:p-7 rounded-2xl bg-white border border-[#E8E1D5] shadow-2xs space-y-4 min-w-0">
              <div className="border-b border-[#E8E1D5] pb-2">
                <h3 className="font-bold text-sm text-[#1E2229]">Atelier Capacity & Bench Machinery</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Configure daily intake thresholds to manage customer garment queue pacing.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
                    <Gauge size={12} />
                    Daily Capacity (Garments/Day)
                  </label>
                  <input
                    key="atelier-daily-capacity-input"
                    id="atelier-daily-capacity-input"
                    type="number"
                    min={1}
                    max={200}
                    value={dailyCapacity !== undefined && dailyCapacity !== null ? dailyCapacity : 25}
                    onChange={(e) => setDailyCapacity(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
                    <Wrench size={12} />
                    Sewing Bench Machines
                  </label>
                  <input
                    key="atelier-machines-input"
                    id="atelier-machines-input"
                    type="number"
                    min={1}
                    max={50}
                    value={machines !== undefined && machines !== null ? machines : 4}
                    onChange={(e) => setMachines(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>

                <div className="space-y-1.5 min-w-0">
                  <label className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
                    <Clock size={12} />
                    Weekly Operating Hours
                  </label>
                  <input
                    key="atelier-opening-hours-input"
                    id="atelier-opening-hours-input"
                    type="text"
                    value={openingHours || 'Mon–Sat: 09:00 – 19:00'}
                    onChange={(e) => setOpeningHours(e.target.value)}
                    placeholder="e.g. Mon–Sat: 09:00 – 19:00"
                    className="w-full px-3.5 py-2.5 text-xs text-[#1E2229] bg-white border border-[#E8E1D5] rounded-xl focus:outline-none focus:border-[#9E593B] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Direct Studio Settlement Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F5] border border-[#E8E1D5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-white border border-[#E8E1D5] text-[#9E593B] grid place-items-center shadow-2xs shrink-0">
                  <CreditCard size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-[#1E2229]">Direct Studio Settlement</div>
                  <div className="text-[11px] text-[#6B7280] truncate">Customer pays standard alteration price directly at pickup.</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full whitespace-nowrap self-start sm:self-auto shrink-0">
                Connected & Verified
              </span>
            </div>

            {/* Bottom Nav */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('profile')}
                className="flex items-center justify-center sm:justify-start gap-1.5 py-2 text-xs font-semibold text-[#1E2229] hover:text-[#9E593B] transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back to Profile</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#9E593B] hover:bg-[#8A4C32] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 w-full sm:w-auto"
              >
                {saving ? (
                  <span>Saving Atelier Profile...</span>
                ) : success ? (
                  <>
                    <Check size={14} />
                    <span>Profile Saved!</span>
                  </>
                ) : (
                  <span>Save Atelier Profile</span>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    )}

      {/* ── Edit Atelier Identity Modal ── */}


      {/* Uber-Style Locality Picker Google Map Modal */}
      <UberMapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        onSelectLocation={handleSelectMapLocation}
        initialCity={area || ''}
        initialArea={area || ''}
        initialAddress={mapStreetAddress || ''}
        initialPostcode={postcode || ''}
        initialLat={lat ?? undefined}
        initialLng={lng ?? undefined}
      />

      {/* Phone Change OTP Verification Modal */}
      {isOtpModalOpen && (
        <OtpVerificationCard
          isModal={true}
          theme="studio"
          phoneNumber={phone}
          value={otpValue}
          onChange={(val) => {
            setOtpValue(val)
            setOtpError('')
          }}
          onVerify={handleVerifyNewPhoneOtp}
          onResend={() => handleSendOtpToNewPhone(true)}
          resendCountdown={otpCountdown}
          loading={otpLoading}
          error={otpError}
          title="Verify New Mobile Number"
          subtitle="We have sent a 4-digit verification code to your new dispatch mobile number."
          onClose={() => {
            setIsOtpModalOpen(false)
            setOtpError('')
          }}
        />
      )}
    </div>
  )
}
