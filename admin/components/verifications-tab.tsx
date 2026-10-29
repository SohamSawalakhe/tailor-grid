'use client'

import React, { useEffect, useState } from 'react'
import {
  Search,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  X,
  Store,
  MapPin,
  Phone,
  Mail,
  Scissors,
  Users,
  Eye,
  Loader2,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'react-toastify'
import { fetchAdminVerifications, fetchAdminVerificationById, reviewAdminVerification } from '@/lib/api'

export interface StudioVerificationItem {
  id: string
  storeId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  rejectionReason: string | null
  reviewedAt: string | null
  createdAt: string
  studio: {
    id: string
    name: string
    area: string
    address: string
    postcode: string
    phone: string | null
    email: string | null
    leadTailor: string
    machines: number
    workers: number
    verificationStatus: string
  } | null
  files?: {
    shopFrontImage: string
    interiorImage: string
    machinesVideo: string
  }
}

const STATUS_FILTERS = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'ALL', label: 'All' },
]

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={11} /> Approved
      </span>
    )
  }
  if (status === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
        <XCircle size={11} /> Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={11} /> Pending
    </span>
  )
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface VerificationsTabProps {
  // Lets the header badge update right after an approve/reject
  onPendingCountChange?: (count: number) => void
}

export function VerificationsTab({ onPendingCountChange }: VerificationsTabProps) {
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<StudioVerificationItem[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StudioVerificationItem | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const load = async () => {
    setLoading(true)
    const data = await fetchAdminVerifications(statusFilter, search.trim())
    setItems(data.verifications)
    setStatusCounts(data.statusCounts)
    onPendingCountChange?.(data.statusCounts.PENDING || 0)
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search])

  const openDetail = async (item: StudioVerificationItem) => {
    setIsClosing(false)
    setSelected(item)
    setRejecting(false)
    setRejectReason('')
    setLoadingDetail(true)
    const detail = await fetchAdminVerificationById(item.id)
    setLoadingDetail(false)
    if (!detail) {
      toast.error('Could not load the verification files')
      return
    }
    setSelected(detail)
  }

  const closeDetail = () => {
    if (submittingReview || isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      setSelected(null)
      setIsClosing(false)
      setRejecting(false)
      setRejectReason('')
    }, 180)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomImage) {
          setZoomImage(null)
        } else if (selected && !submittingReview && !isClosing) {
          closeDetail()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, zoomImage, submittingReview, isClosing])

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!selected) return
    if (action === 'reject' && !rejectReason.trim()) {
      toast.error('Please write a reason so the studio knows what to fix')
      return
    }
    setSubmittingReview(true)
    const result = await reviewAdminVerification(selected.id, action, rejectReason.trim())
    setSubmittingReview(false)
    if (!result.success) {
      toast.error(result.error || 'Failed to update verification')
      load()
      return
    }
    toast.success(
      action === 'approve'
        ? `${selected.studio?.name || 'Studio'} is verified and will now receive requests`
        : `${selected.studio?.name || 'Studio'} was rejected and asked to upload again`
    )
    setIsClosing(true)
    setTimeout(() => {
      setSelected(null)
      setIsClosing(false)
      setRejecting(false)
      setRejectReason('')
      load()
    }, 180)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1E2229] flex items-center gap-2">
            <ShieldCheck size={20} className="text-[#9E593B]" />
            Studio Verifications
          </h2>
          <p className="text-xs text-[#78716C] mt-1">
            Review each new studio&apos;s shop photos and machines video. Only approved studios receive tailoring requests.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E8E1D5] bg-white text-xs font-bold text-[#1E2229] hover:bg-[#F3EFEA] cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition-colors ${
                statusFilter === f.id
                  ? 'bg-[#9E593B] text-white border-[#9E593B]'
                  : 'bg-white text-[#1E2229] border-[#E8E1D5] hover:bg-[#F3EFEA]'
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-80">{statusCounts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search studio, area, phone…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#E8E1D5] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#9E593B]/30"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-[#E8E1D5] rounded-2xl overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-10 flex justify-center text-[#78716C]">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck size={28} className="mx-auto text-[#D6CFC4]" />
            <p className="text-sm font-semibold text-[#1E2229] mt-2">No verifications here</p>
            <p className="text-xs text-[#78716C] mt-1">
              {statusFilter === 'PENDING' ? 'All caught up — no studios are waiting for review.' : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FAF8F5] text-[11px] uppercase tracking-wider text-[#78716C]">
                <tr>
                  <th className="text-left font-bold px-4 py-3">Studio</th>
                  <th className="text-left font-bold px-4 py-3 hidden md:table-cell">Contact</th>
                  <th className="text-left font-bold px-4 py-3 hidden sm:table-cell">Submitted</th>
                  <th className="text-left font-bold px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EFEA]">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className="hover:bg-[#FAF8F5] cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#1E2229]">{item.studio?.name || 'Unknown studio'}</p>
                      <p className="text-xs text-[#78716C]">
                        {[item.studio?.area, item.studio?.postcode].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-[#57534E]">
                      <p>{item.studio?.phone || '—'}</p>
                      <p className="truncate max-w-56">{item.studio?.email || ''}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-[#57534E]">{formatDate(item.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#9E593B]">
                        <Eye size={14} />
                        {item.status === 'PENDING' ? 'Review' : 'View'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <div
          className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 ${
            isClosing ? 'animate-backdropExit' : 'animate-backdropEnter'
          }`}
          onClick={closeDetail}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-[#E8E1D5] max-w-3xl w-full max-h-[94vh] flex flex-col overflow-hidden ${
              isClosing ? 'animate-modalExit' : 'animate-modalEnter'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-white border-b border-[#F3EFEA] px-4 sm:px-5 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#FAF3EC] text-[#9E593B] grid place-items-center shrink-0">
                  <Store size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#1E2229] truncate">{selected.studio?.name || 'Studio'}</h3>
                    <StatusBadge status={selected.status} />
                  </div>
                  <p className="text-[11px] text-[#78716C]">Submitted {formatDate(selected.createdAt)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="w-7 h-7 rounded-lg text-[#78716C] hover:text-[#1E2229] hover:bg-[#F3EFEA] grid place-items-center cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3 sm:space-y-3.5 overflow-y-auto">
              {/* Studio details card */}
              <div className="bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl p-2.5 sm:p-3 text-xs text-[#57534E] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-1.5 min-w-0 md:col-span-2">
                  <MapPin size={13} className="text-[#9E593B] shrink-0" />
                  <span className="truncate" title={[selected.studio?.address, selected.studio?.area, selected.studio?.postcode].filter(Boolean).join(', ')}>
                    {[selected.studio?.address, selected.studio?.area, selected.studio?.postcode].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Phone size={13} className="text-[#9E593B] shrink-0" />
                  <span className="truncate">{selected.studio?.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Mail size={13} className="text-[#9E593B] shrink-0" />
                  <span className="truncate" title={selected.studio?.email || ''}>{selected.studio?.email || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users size={13} className="text-[#9E593B] shrink-0" />
                  <span className="truncate">Lead: {selected.studio?.leadTailor || '—'} · {selected.studio?.workers ?? '—'} workers</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <Scissors size={13} className="text-[#9E593B] shrink-0" />
                  <span className="truncate">{selected.studio?.machines ?? '—'} machines listed</span>
                </div>
              </div>

              {selected.status === 'REJECTED' && selected.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Rejected {formatDate(selected.reviewedAt)}: </span>
                    {selected.rejectionReason}
                  </div>
                </div>
              )}

              {/* Files - 3 column media grid side-by-side */}
              {loadingDetail || !selected.files ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse">
                  {[
                    { label: 'Shop front' },
                    { label: 'Inside shop' },
                    { label: 'Machines video' },
                  ].map((s, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                        <span>{s.label}</span>
                      </div>
                      <div className="w-full h-32 sm:h-36 rounded-xl bg-[#F3EFEA] border border-[#E8E1D5] flex flex-col items-center justify-center gap-1.5 text-[#A8A29E]">
                        <Loader2 size={16} className="animate-spin text-[#9E593B]" />
                        <span className="text-[10px] font-medium">Loading media…</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeIn">
                  {/* Shop front */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      <span>Shop front</span>
                      <span className="text-[9px] text-[#A8A29E] font-normal lowercase">click to zoom</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setZoomImage(selected.files!.shopFrontImage)}
                      className="group relative block w-full h-32 sm:h-36 rounded-xl overflow-hidden bg-[#F3EFEA] border border-[#E8E1D5] cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.files.shopFrontImage}
                        alt="Shop front"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white p-1 rounded-md">
                          <ZoomIn size={13} />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Inside the shop */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      <span>Inside shop</span>
                      <span className="text-[9px] text-[#A8A29E] font-normal lowercase">click to zoom</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setZoomImage(selected.files!.interiorImage)}
                      className="group relative block w-full h-32 sm:h-36 rounded-xl overflow-hidden bg-[#F3EFEA] border border-[#E8E1D5] cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.files.interiorImage}
                        alt="Inside the shop"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white p-1 rounded-md">
                          <ZoomIn size={13} />
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* Machines video */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#78716C] mb-1">
                      <span>Machines video</span>
                    </div>
                    <div className="w-full h-32 sm:h-36 rounded-xl overflow-hidden bg-black border border-[#E8E1D5] flex items-center justify-center">
                      <video
                        src={selected.files.machinesVideo}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Review actions */}
              {selected.status === 'PENDING' && (
                <div className="border-t border-[#F3EFEA] pt-3">
                  {rejecting ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1E2229]">
                          Reason for rejection <span className="text-red-600">*</span>
                        </label>
                        <p className="text-[11px] text-[#78716C]">The studio sees this reason and can upload new files.</p>
                      </div>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        autoFocus
                        placeholder="e.g. The shop front photo is blurry and the signboard isn't visible."
                        className="w-full rounded-xl border border-[#E8E1D5] p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRejecting(false)}
                          disabled={submittingReview}
                          className="px-3.5 py-1.5 rounded-xl border border-[#E8E1D5] text-xs font-bold text-[#1E2229] hover:bg-[#F3EFEA] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview('reject')}
                          disabled={submittingReview || !rejectReason.trim()}
                          className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                        >
                          {submittingReview ? <Loader2 size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
                          Confirm rejection
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setRejecting(true)}
                        disabled={submittingReview || loadingDetail}
                        className="px-3.5 py-1.5 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview('approve')}
                        disabled={submittingReview || loadingDetail}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
                      >
                        {submittingReview ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Approve studio
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-size image viewer */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          onClick={() => setZoomImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomImage}
            alt="Verification photo"
            className="max-w-full max-h-full object-contain rounded-lg animate-scaleUp shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}
