'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Edit2,
  Home,
  MapPin,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { toast } from 'react-toastify'
import type { FittingBooking, Screen, User as UserType } from './data'
import { fetchOrders, updateUserProfile } from '@/lib/api'
import { setStoredCity } from './use-city-location'
import {
  getSavedAddresses,
  removeSavedAddress,
  type SavedAddressItem,
} from '@/lib/saved-addresses'

interface ProfileViewProps {
  go: (s: Screen | string) => void
  user: UserType | null
  onUpdateUser: (u: UserType) => void
  onOpenAuth: (authType?: 'signin' | 'signup') => void
  onSignOut: () => void
}

export function ProfileView({ go, user, onUpdateUser, onOpenAuth, onSignOut }: ProfileViewProps) {
  const [orders, setOrders] = useState<FittingBooking[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)

  // Edit Mode toggle for Personal Details
  const [isEditingPersonal, setIsEditingPersonal] = useState(false)

  // Profile Form States
  const [name, setName] = useState(user?.name || '')

  // Saved Addresses list state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressItem[]>([])

  useEffect(() => {
    setSavedAddresses(getSavedAddresses(user?.id))
  }, [user?.id])

  useEffect(() => {
    const handleSync = () => {
      setSavedAddresses(getSavedAddresses(user?.id))
    }
    window.addEventListener('tg_saved_addresses_changed', handleSync)
    return () => window.removeEventListener('tg_saved_addresses_changed', handleSync)
  }, [user?.id])

  const handleDeleteSavedAddress = (id: string) => {
    const updated = removeSavedAddress(id, user?.id)
    setSavedAddresses(updated)
    toast.success('Address removed.', { position: 'top-center' })
  }

  const handleSelectSavedAddress = (item: SavedAddressItem) => {
    const cityName = item.city || item.locality || item.address.split(',')[0]
    setStoredCity(cityName, { lat: item.lat, lng: item.lng })
    if (typeof window !== 'undefined') {
      try {
        const payload = {
          city: cityName,
          coords: { lat: item.lat, lng: item.lng },
          isLiveLocation: false,
          isLocationSaved: true,
          isCardFlipped: false,
          addressDetails: {
            houseNo: item.details?.houseNo || '',
            apartment: item.details?.apartment || (item.title && item.title !== 'Saved Address' ? item.title : '') || '',
            locality: item.details?.locality || item.locality || '',
            city: item.details?.city || item.city || cityName,
            landmark: item.details?.landmark || '',
          },
        }
        sessionStorage.setItem('tg_book_session', JSON.stringify(payload))
      } catch { }
    }
    go('book')
  }

  // Feedback states
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name || '')

      const contactQuery = user.email || user.phone || user.contact
      if (contactQuery) {
        setIsLoadingOrders(true)
        fetchOrders(contactQuery)
          .then((ords) => {
            if (ords) {
              setOrders(ords)
            }
          })
          .catch(() => { })
          .finally(() => setIsLoadingOrders(false))
      }
    }
  }, [user])

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!user) return

    setIsSaving(true)

    try {
      const res = await updateUserProfile({
        name: name.trim(),
      })

      setIsSaving(false)
      setIsEditingPersonal(false)
      toast.success('Profile saved successfully.', { position: 'top-center' })
      if (res?.user) {
        onUpdateUser(res.user)
      } else {
        onUpdateUser({ ...user, name: name.trim() })
      }
    } catch (err: any) {
      setIsSaving(false)
      toast.error(err.message || 'Failed to update profile.', { position: 'top-center' })
    }
  }

  const handleCancelEdit = () => {
    if (user) {
      setName(user.name || '')
    }
    setIsEditingPersonal(false)
  }

  // Guest State
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[360px] text-center space-y-5 animate-in fade-in">
          <div className="size-12 rounded-full bg-[#EBE6DE] grid place-items-center mx-auto text-[#18191B]">
            <UserIcon size={20} />
          </div>

          <div>
            <h1 className="font-serif text-2xl font-bold text-[#18191B]">Account</h1>
            <p className="text-xs text-[#7A7E85] mt-1">Sign in to view your profile and saved fits.</p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className="w-full rounded-full border border-[#E8E1D5] bg-white hover:bg-[#F3EFEA] hover:border-[#0F1115] text-[#18191B] py-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="w-full rounded-full bg-[#18191B] hover:bg-[#9E593B] text-white py-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-[0.99]"
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => go('home')}
              className="w-full text-xs font-semibold text-[#7A7E85] hover:text-[#18191B] py-2 transition-colors cursor-pointer"
            >
              Return to Atelier Grid
            </button>
          </div>
        </div>
      </div>
    )
  }

  const initial = (user.name || 'U')[0].toUpperCase()

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-10 sm:py-14 px-4 sm:px-6 lg:px-10">
      <div className="max-w-[1100px] w-full mx-auto space-y-10">

        {/* Back link */}
        <div>
          <button
            onClick={() => go('home')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7A7E85] hover:text-[#18191B] transition-colors cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span>Atelier Grid</span>
          </button>
        </div>

        {/* Minimal Identity Bar */}
        <div className="flex items-center justify-between pb-8 border-b border-[#E8E1D5]">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="size-14 sm:size-16 rounded-full overflow-hidden shrink-0 bg-[#18191B] text-white font-serif text-xl sm:text-2xl font-bold grid place-items-center">
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.name}
                  width={64}
                  height={64}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="size-full object-cover"
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#18191B] leading-tight">{user.name}</h1>
              <p className="text-xs sm:text-sm text-[#7A7E85] mt-0.5">{user.email || user.contact}</p>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSaveProfile} className="space-y-10">

          {/* Section 1: Personal Details */}
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#9E593B]">Personal Details</h2>

              {!isEditingPersonal && (
                <button
                  type="button"
                  onClick={() => setIsEditingPersonal(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#18191B] hover:text-[#9E593B] transition-colors cursor-pointer"
                >
                  <Edit2 size={12} />
                  <span>Edit</span>
                </button>
              )}
            </div>

            {/* Fields layout */}
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-[#7A7E85] mb-1">Full Name</label>
                {isEditingPersonal ? (
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent border-b border-[#D5CDC2] focus:border-[#18191B] py-2 text-sm sm:text-base text-[#18191B] outline-none transition-colors"
                  />
                ) : (
                  <p className="py-2 text-sm sm:text-base font-semibold text-[#18191B] border-b border-transparent">{name}</p>
                )}
              </div>

              {/* Email & Mobile Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#7A7E85] mb-1">Email</label>
                  <p className="py-2 text-xs sm:text-sm text-[#5A5D64] truncate border-b border-[#E8E1D5]">{user.email || user.contact}</p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#7A7E85] mb-1">Verified Mobile</label>
                  <p className="py-2 text-xs sm:text-sm text-[#5A5D64] truncate border-b border-[#E8E1D5]">{user.phone || 'None'}</p>
                </div>
              </div>

              {/* Save / Cancel buttons inside Personal Details when editing */}
              {isEditingPersonal && (
                <div className="pt-3 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-full bg-[#18191B] hover:bg-[#9E593B] text-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 shadow-xs active:scale-[0.99]"
                  >
                    {isSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-full border border-[#D5CDC2] hover:border-[#18191B] text-[#7A7E85] hover:text-[#18191B] px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* View Order History Link */}
          <div className="pt-2 border-t border-[#E8E1D5]">
            <button
              type="button"
              onClick={() => go('orders')}
              className="text-xs sm:text-sm font-semibold text-[#18191B] hover:text-[#9E593B] transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View Order History ({orders.length})</span>
              <ChevronRight size={14} />
            </button>
          </div>

        </form>


        {/* Section 3: View Saved Addresses */}
        <div className="pt-6 border-t border-[#E8E1D5] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#9E593B]">
              Saved Addresses {savedAddresses.length > 0 && `(${savedAddresses.length})`}
            </h2>
            <button
              type="button"
              onClick={() => go('book')}
              className="text-xs font-semibold text-[#18191B] hover:text-[#9E593B] transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <Plus size={12} />
              <span>Add New Address</span>
            </button>
          </div>

          {savedAddresses.length > 0 ? (
            <div className="divide-y divide-[#EAE6DF]">
              {savedAddresses.map((item) => {
                const tagLower = item.title?.toLowerCase() || ''
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectSavedAddress(item)}
                    className="py-3.5 flex items-start justify-between gap-4 group cursor-pointer hover:bg-neutral-100/50 -mx-2 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <span className="text-[#18191B] mt-0.5 shrink-0">
                        {tagLower.includes('home') ? (
                          <Home size={16} />
                        ) : tagLower.includes('work') || tagLower.includes('office') ? (
                          <Briefcase size={16} />
                        ) : (
                          <MapPin size={16} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-[#18191B] group-hover:text-[#9E593B] transition-colors flex items-center gap-2">
                          <span>{item.title}</span>
                          {item.locality && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9E593B] px-1.5 py-0.5 rounded-sm bg-[#FAF3ED]">
                              {item.locality}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#7A7E85] mt-0.5 line-clamp-2">
                          {item.address}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteSavedAddress(item.id)
                      }}
                      className="text-xs font-semibold text-[#A1A4AB] hover:text-red-600 transition-colors p-1 cursor-pointer shrink-0"
                      title="Remove address"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-6 text-left space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-[#18191B]">No saved addresses yet</p>
              <p className="text-xs text-[#7A7E85]">
                Addresses you save during booking or from the map search will be stored here for easy access.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
