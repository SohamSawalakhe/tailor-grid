'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Store, Video, ShieldCheck, AlertTriangle, X, UploadCloud, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { fetchStudioVerification, submitStudioVerification } from '@/lib/api'
import type { User, VerificationStatus } from './data'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']

type FieldKey = 'shopFrontImage' | 'interiorImage' | 'machinesVideo'

const FIELDS: {
  key: FieldKey
  title: string
  hint: string
  icon: typeof Camera
  kind: 'image' | 'video'
}[] = [
  {
    key: 'shopFrontImage',
    title: 'Shop front photo',
    hint: 'A clear photo of your shop from the street, with the signboard visible.',
    icon: Store,
    kind: 'image',
  },
  {
    key: 'interiorImage',
    title: 'Inside the shop photo',
    hint: 'A photo of your work area, showing the counter and workbench.',
    icon: Camera,
    kind: 'image',
  },
  {
    key: 'machinesVideo',
    title: 'Machines video',
    hint: 'A short video (under 1 minute) walking past your sewing machines.',
    icon: Video,
    kind: 'video',
  },
]

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function validateFile(file: File, kind: 'image' | 'video'): string | null {
  if (kind === 'image') {
    if (!IMAGE_TYPES.includes(file.type)) return 'Please choose a JPG, PNG, WEBP or HEIC photo.'
    if (file.size > MAX_IMAGE_BYTES) return 'Photos must be 10 MB or smaller.'
  } else {
    if (!VIDEO_TYPES.includes(file.type)) return 'Please choose an MP4, MOV or WEBM video.'
    if (file.size > MAX_VIDEO_BYTES) return 'The video must be 100 MB or smaller.'
  }
  return null
}

interface StudioVerificationViewProps {
  user?: User | null
  onStatusChange: (status: VerificationStatus, rejectionReason?: string | null) => void
}

export function StudioVerificationView({ user, onStatusChange }: StudioVerificationViewProps) {
  const [files, setFiles] = useState<Partial<Record<FieldKey, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<FieldKey, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  // Set once the upload succeeds, so leaving the page any way still hides the sidebar item
  const submittedRef = useRef(false)
  const [rejectionReason, setRejectionReason] = useState<string | null>(
    user?.verificationStatus === 'REJECTED' ? user?.verificationRejectionReason || null : null
  )
  const inputRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({})
  const previewsRef = useRef(previews)
  previewsRef.current = previews

  // Pick up a review that happened since the cached user was loaded
  useEffect(() => {
    fetchStudioVerification().then((state) => {
      if (!state) return
      if (state.verificationStatus === 'REJECTED') setRejectionReason(state.rejectionReason)
      if (state.verificationStatus !== user?.verificationStatus) {
        onStatusChange(state.verificationStatus, state.rejectionReason)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((url) => url && URL.revokeObjectURL(url))
      if (submittedRef.current) onStatusChange('PENDING', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finishSubmission = () => {
    if (!submittedRef.current) return
    submittedRef.current = false
    setShowSuccess(false)
    onStatusChange('PENDING', null)
  }

  const pickFile = (key: FieldKey, kind: 'image' | 'video', file?: File | null) => {
    if (!file) return
    const error = validateFile(file, kind)
    if (error) {
      toast.error(error, { position: 'top-center' })
      return
    }
    setPreviews((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]!)
      return { ...prev, [key]: URL.createObjectURL(file) }
    })
    setFiles((prev) => ({ ...prev, [key]: file }))
  }

  const clearFile = (key: FieldKey) => {
    setPreviews((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]!)
      const next = { ...prev }
      delete next[key]
      return next
    })
    setFiles((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    if (inputRefs.current[key]) inputRefs.current[key]!.value = ''
  }

  const allSelected = FIELDS.every((f) => files[f.key])

  const handleSubmit = async () => {
    if (!allSelected || submitting) return
    setSubmitting(true)
    setProgress(0)
    const result = await submitStudioVerification(
      {
        shopFrontImage: files.shopFrontImage!,
        interiorImage: files.interiorImage!,
        machinesVideo: files.machinesVideo!,
      },
      setProgress
    )
    setSubmitting(false)

    if (result.success) {
      // Status is handed to the layout when the popup is dismissed (that also leaves this page)
      submittedRef.current = true
      setShowSuccess(true)
      return
    }
    // Already submitted from another device or tab
    if (result.verificationStatus === 'PENDING' || result.verificationStatus === 'APPROVED') {
      onStatusChange(result.verificationStatus, null)
      return
    }
    toast.error(result.error || 'Upload failed. Please try again.', { position: 'top-center' })
  }

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto w-full space-y-5">
      <div className="bg-white border border-[#E8E1D5] rounded-2xl p-5 sm:p-6 flex gap-4 items-start">
        <div className="w-11 h-11 rounded-xl bg-[#FAF3EC] text-[#9E593B] grid place-items-center shrink-0">
          <ShieldCheck size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">Verify your studio</h2>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            Upload two photos of your shop and a short video of your machines. Once our team approves them,
            you&apos;ll start receiving tailoring requests from nearby customers. You only need to do this once.
          </p>
        </div>
      </div>

      {rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3 items-start">
          <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-red-800">Your last submission was not approved</p>
            <p className="text-sm text-red-700 mt-1 break-words">Reason: {rejectionReason}</p>
            <p className="text-xs text-red-600 mt-1">Please upload new files below and submit again.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FIELDS.map((field) => {
          const Icon = field.icon
          const file = files[field.key]
          const preview = previews[field.key]
          return (
            <div key={field.key} className="bg-white border border-[#E8E1D5] rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon size={18} className="text-[#9E593B]" />
                <h3 className="text-sm font-bold text-slate-900 flex-1">{field.title}</h3>
                {file && <CheckCircle2 size={18} className="text-emerald-600" />}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{field.hint}</p>

              <input
                ref={(el) => {
                  inputRefs.current[field.key] = el
                }}
                type="file"
                accept={field.kind === 'image' ? IMAGE_TYPES.join(',') : VIDEO_TYPES.join(',')}
                capture={field.kind === 'image' ? 'environment' : undefined}
                className="hidden"
                onChange={(e) => pickFile(field.key, field.kind, e.target.files?.[0])}
                disabled={submitting}
              />

              {preview && file ? (
                <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-[4/3]">
                  {field.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt={field.title} className="w-full h-full object-cover" />
                  ) : (
                    <video src={preview} controls playsInline className="w-full h-full object-cover bg-black" />
                  )}
                  {!submitting && (
                    <button
                      type="button"
                      onClick={() => clearFile(field.key)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center cursor-pointer hover:bg-black/80"
                      aria-label={`Remove ${field.title}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRefs.current[field.key]?.click()}
                  disabled={submitting}
                  className="aspect-[4/3] rounded-xl border-2 border-dashed border-[#E8E1D5] hover:border-[#9E593B] hover:bg-[#FAF3EC]/50 transition-colors flex flex-col items-center justify-center gap-2 text-slate-500 cursor-pointer"
                >
                  <UploadCloud size={26} />
                  <span className="text-xs font-semibold">
                    {field.kind === 'image' ? 'Take or choose a photo' : 'Record or choose a video'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {field.kind === 'image' ? 'JPG, PNG, WEBP · max 10 MB' : 'MP4, MOV, WEBM · max 100 MB'}
                  </span>
                </button>
              )}

              {file && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 gap-2">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0">{formatBytes(file.size)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-white border border-[#E8E1D5] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          {submitting ? (
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
                <span>Uploading files…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-[#9E593B] transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {allSelected
                ? 'All files are ready. Submit them for review.'
                : `${FIELDS.filter((f) => files[f.key]).length} of 3 files added.`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allSelected || submitting}
          className="px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#9E593B] to-[#B36846] shadow-md shadow-[#9E593B]/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? 'Uploading…' : 'Submit for verification'}
        </button>
      </div>

      {showSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F1115]/60 backdrop-blur-sm animate-fadeIn"
          onClick={finishSubmission}
          role="dialog"
          aria-modal="true"
          aria-labelledby="verification-success-title"
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl border border-[#E8E1D5] shadow-2xl p-7 sm:p-8 text-center animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mx-auto w-16 h-16 mb-5">
              <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
              <span className="relative w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 grid place-items-center">
                <CheckCircle2 size={34} />
              </span>
            </div>
            <h3 id="verification-success-title" className="text-xl font-bold text-slate-900">
              Submitted successfully!
            </h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Thanks{user?.studioName ? `, ${user.studioName}` : ''}! Our team will review your shop photos and
              machines video, usually within 24 hours.
            </p>
            <div className="mt-5 bg-[#FAF3EC] border border-[#F0E2D3] rounded-2xl p-4 text-left space-y-2.5">
              <p className="flex items-start gap-2.5 text-xs text-slate-700">
                <ShieldCheck size={16} className="text-[#9E593B] shrink-0 mt-px" />
                We&apos;ll email you and send a notification as soon as your studio is reviewed.
              </p>
              <p className="flex items-start gap-2.5 text-xs text-slate-700">
                <Store size={16} className="text-[#9E593B] shrink-0 mt-px" />
                Once approved, you&apos;ll start receiving tailoring requests from nearby customers.
              </p>
            </div>
            <button
              type="button"
              onClick={finishSubmission}
              autoFocus
              className="mt-6 w-full px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#9E593B] to-[#B36846] shadow-md shadow-[#9E593B]/25 cursor-pointer hover:brightness-105 transition"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
