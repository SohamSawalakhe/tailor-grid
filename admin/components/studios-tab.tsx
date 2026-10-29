'use client'

import React from 'react'
import {
  Search,
  Plus,
  Edit2,
  Download,
} from 'lucide-react'

interface StudiosTabProps {
  studios: any[]
  studioSearch: string
  setStudioSearch: (val: string) => void
  studioAreaFilter: string
  setStudioAreaFilter: (val: string) => void
  availableAreas: string[]
  onOpenAddStudio: () => void
  onEditStudio: (studio: any) => void
}

export function StudiosTab({
  studios,
  studioSearch,
  setStudioSearch,
  studioAreaFilter,
  setStudioAreaFilter,
  availableAreas,
  onOpenAddStudio,
  onEditStudio,
}: StudiosTabProps) {
  const totalCapacity = studios.reduce((sum, s) => sum + (s.dailyCapacity || 0), 0)
  const totalActiveOrders = studios.reduce((sum, s) => sum + (s.activeOrdersCount || 0), 0)
  const totalWorkers = studios.reduce((sum, s) => sum + (s.workers || 0), 0)

  const filteredStudios = studios.filter((s) => {
    const matchArea = studioAreaFilter === 'ALL' || s.area === studioAreaFilter
    const q = studioSearch.toLowerCase().trim()
    const matchSearch =
      !q ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.area && s.area.toLowerCase().includes(q)) ||
      (s.postcode && s.postcode.toLowerCase().includes(q)) ||
      (s.leadTailor && s.leadTailor.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    return matchArea && matchSearch
  })

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredStudios.length) return
    const headers = [
      'Studio ID',
      'Name',
      'Area',
      'Address',
      'Postcode',
      'Phone',
      'Email',
      'Lead Tailor',
      'Daily Capacity',
      'Active Orders',
      'Machines',
      'Workers',
      'Rating',
      'Opening Hours',
    ]

    const rows = filteredStudios.map((s) => [
      `"${s.id || ''}"`,
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${s.area || ''}"`,
      `"${(s.address || '').replace(/"/g, '""')}"`,
      `"${s.postcode || ''}"`,
      `"${s.phone || ''}"`,
      `"${s.email || ''}"`,
      `"${(s.leadTailor || '').replace(/"/g, '""')}"`,
      s.dailyCapacity || 0,
      s.activeOrdersCount || 0,
      s.machines || 0,
      s.workers || 0,
      s.rating || 0,
      `"${s.openingHours || ''}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `raffu_studios_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      {/* ── 1. CLEAN MICRO-METRICS STRIP ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] text-[#78716C] font-semibold block">Partner Studios</span>
          <span className="text-lg font-bold text-[#1E2229] mt-0.5 block">{studios.length}</span>
        </div>
        <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] text-[#78716C] font-semibold block">Daily Capacity</span>
          <span className="text-lg font-bold text-[#1E2229] mt-0.5 block">{totalCapacity} pcs/day</span>
        </div>
        <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] text-orange-800 font-semibold block">Active Orders In Flight</span>
          <span className="text-lg font-bold text-orange-900 mt-0.5 block">{totalActiveOrders}</span>
        </div>
        <div className="bg-white border border-[#E8E1D5] rounded-2xl p-3 shadow-2xs">
          <span className="text-[11px] text-[#78716C] font-semibold block">Active Tailors & Staff</span>
          <span className="text-lg font-bold text-[#1E2229] mt-0.5 block">{totalWorkers}</span>
        </div>
      </div>

      {/* ── 2. FILTER & ACTION TOOLBAR ── */}
      <div className="bg-white rounded-2xl p-4 border border-[#E8E1D5] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 size-4 text-[#A8A29E]" />
            <input
              type="text"
              value={studioSearch}
              onChange={(e) => setStudioSearch(e.target.value)}
              placeholder="Search by studio name, postcode, lead..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9E593B]"
            />
          </div>

          <select
            value={studioAreaFilter}
            onChange={(e) => setStudioAreaFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8E1D5] rounded-xl text-[#1E2229] font-medium focus:outline-none focus:ring-2 focus:ring-[#9E593B]"
          >
            <option value="ALL">All Areas</option>
            {availableAreas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-[#78716C] font-semibold mr-1">
            {filteredStudios.length} of {studios.length} Studios
          </span>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F3EFEA] text-[#1E2229] border border-[#E8E1D5] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Export filtered studios to CSV"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenAddStudio}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#9E593B] text-white text-xs font-bold rounded-xl hover:bg-[#8A4C32] transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Add Studio</span>
          </button>
        </div>
      </div>

      {/* ── 3. STUDIOS CARDS GRID ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStudios.map((s) => (
          <div
            key={s.id}
            className="bg-white rounded-2xl border border-[#E8E1D5] p-5 shadow-xs hover:border-[#9E593B]/40 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              {/* Top Row: Name & Edit button */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E593B] bg-[#FAF3ED] px-2 py-0.5 rounded-full border border-[#EADBCE]">
                    {s.area || 'Studio Partner'}
                  </span>
                  <h3 className="text-sm font-bold text-[#1E2229] mt-1.5 line-clamp-1">
                    {s.name}
                  </h3>
                  <p className="text-[11px] text-[#78716C] line-clamp-1 mt-0.5">
                    {s.address} • {s.postcode}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditStudio(s)}
                    className="p-1.5 text-[#78716C] hover:text-[#1E2229] hover:bg-[#FAF8F5] rounded-lg transition-colors cursor-pointer"
                    title="View / Edit Studio Details"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>

              {/* Capacity & Load Bar */}
              <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E8E1D5] mb-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-[#78716C]">Active Orders:</span>
                  <span className="text-[#1E2229]">
                    <strong>{s.activeOrdersCount ?? 0}</strong> / {s.dailyCapacity} max
                  </span>
                </div>
                <div className="w-full bg-[#E8E1D5] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (s.utilization ?? 0) > 85
                        ? 'bg-rose-500'
                        : (s.utilization ?? 0) > 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, s.utilization ?? 0)}%` }}
                  />
                </div>
              </div>

              {/* Quick Specs */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                <div className="bg-[#FAF8F5] border border-[#E8E1D5] p-2 rounded-xl">
                  <span className="text-[10px] text-[#78716C] block font-semibold">Machines</span>
                  <strong className="text-[#1E2229] font-bold">{s.machines || 4}</strong>
                </div>
                <div className="bg-[#FAF8F5] border border-[#E8E1D5] p-2 rounded-xl">
                  <span className="text-[10px] text-[#78716C] block font-semibold">Workers</span>
                  <strong className="text-[#1E2229] font-bold">{s.workers || 3}</strong>
                </div>
                <div className="bg-[#FAF8F5] border border-[#E8E1D5] p-2 rounded-xl">
                  <span className="text-[10px] text-[#78716C] block font-semibold">Rating</span>
                  <strong className="text-amber-700 font-bold">★ {s.rating || 4.9}</strong>
                </div>
              </div>

              <div className="text-[11px] text-[#78716C] space-y-1 mb-2">
                <p className="flex items-center justify-between">
                  <span>Verification:</span>
                  <strong
                    className={`font-bold ${
                      s.verificationStatus === 'APPROVED'
                        ? 'text-emerald-700'
                        : s.verificationStatus === 'PENDING'
                        ? 'text-amber-700'
                        : s.verificationStatus === 'REJECTED'
                        ? 'text-rose-700'
                        : 'text-[#78716C]'
                    }`}
                  >
                    {s.verificationStatus === 'APPROVED'
                      ? 'Verified'
                      : s.verificationStatus === 'PENDING'
                      ? 'Pending review'
                      : s.verificationStatus === 'REJECTED'
                      ? 'Rejected'
                      : 'Not submitted'}
                  </strong>
                </p>
                <p className="flex items-center justify-between">
                  <span>Lead Tailor:</span>
                  <strong className="text-[#1E2229] font-semibold">{s.leadTailor || 'Master Tailor'}</strong>
                </p>
                <p className="flex items-center justify-between">
                  <span>Phone:</span>
                  <strong className="text-[#1E2229] font-mono font-semibold">{s.phone || '—'}</strong>
                </p>
                <p className="flex items-center justify-between">
                  <span>Email:</span>
                  <strong
                    className="text-[#1E2229] font-medium truncate max-w-[190px]"
                    title={s.email}
                  >
                    {s.email || '—'}
                  </strong>
                </p>
                <p className="flex items-center justify-between">
                  <span>Hours:</span>
                  <strong className="text-[#1E2229]">{s.openingHours || '09:00 - 19:00'}</strong>
                </p>
              </div>
            </div>

            {/* Specialties Pills */}
            {s.specialties && s.specialties.length > 0 && (
              <div className="pt-2 border-t border-[#E8E1D5] flex flex-wrap gap-1">
                {s.specialties.slice(0, 3).map((spec: string) => (
                  <span
                    key={spec}
                    className="text-[9px] font-semibold bg-[#FAF8F5] text-[#78716C] border border-[#E8E1D5] px-2 py-0.5 rounded-md"
                  >
                    {spec}
                  </span>
                ))}
                {s.specialties.length > 3 && (
                  <span className="text-[9px] text-[#A8A29E] font-semibold px-1">
                    +{s.specialties.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
