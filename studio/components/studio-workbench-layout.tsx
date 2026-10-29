'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ToastContainer, toast } from 'react-toastify'
import { makeOtp, type User, type VerificationStatus } from '@/components/data'
import { PartnerFlow } from '@/components/partner-flow'
import { NormalLoader } from '@/components/normal-loader'
import { getCurrentUser, CUSTOMER_SITE_URL, logoutUser, getCustomerSiteUrl } from '@/lib/api'
import { getAuthUser, setAuthUser, clearAllAuth, setCookie } from '@/lib/cookies'

let inMemoryUser: User | null = null

export function StudioWorkbenchLayout({ children }: { children?: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(() => {
    if (inMemoryUser) return inMemoryUser
    if (typeof window !== 'undefined') {
      const cached = getAuthUser<User>()
      if (cached && (cached.role === 'STUDIO' || cached.role === 'ADMIN' || cached.role === 'TEMP_STUDIO')) {
        inMemoryUser = cached
        return cached
      }
    }
    return null
  })

  const [loadingUser, setLoadingUser] = useState<boolean>(() => {
    if (inMemoryUser) return false
    if (typeof window !== 'undefined') {
      const cached = getAuthUser<User>()
      if (cached && (cached.role === 'STUDIO' || cached.role === 'ADMIN')) {
        return false
      }
    }
    return true
  })
  const [otp] = useState(() => makeOtp())

  const customerSiteUrl = CUSTOMER_SITE_URL

  useEffect(() => {
    let isMounted = true

    getCurrentUser()
      .then((u) => {
        if (!isMounted) return
        if (u && (u.role === 'STUDIO' || u.role === 'ADMIN' || u.role === 'TEMP_STUDIO')) {
          inMemoryUser = u
          setUser(u)
        } else {
          inMemoryUser = null
          setUser(null)
          clearAllAuth()
          if (typeof window !== 'undefined') {
            window.location.replace(customerSiteUrl)
          }
        }
      })
      .catch(() => {
        if (!isMounted) return
        inMemoryUser = null
        setUser(null)
        clearAllAuth()
        if (typeof window !== 'undefined') {
          window.location.replace(customerSiteUrl)
        }
      })
      .finally(() => {
        if (isMounted) setLoadingUser(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // If auth check completes and user is TEMP_STUDIO, redirect to onboarding
  useEffect(() => {
    if (!loadingUser && user) {
      if (user.role === 'TEMP_STUDIO') {
        window.location.replace('/?step=1')
        return
      }
      if (user.role !== 'STUDIO' && user.role !== 'ADMIN') {
        window.location.replace(customerSiteUrl)
      }
    }
  }, [loadingUser, user, customerSiteUrl])

  // Once files are submitted (or the studio is already verified) the verification page is gone
  useEffect(() => {
    if (!user || user.role !== 'STUDIO') return
    const status = user.verificationStatus || 'UNSUBMITTED'
    if (pathname?.startsWith('/verification') && (status === 'PENDING' || status === 'APPROVED')) {
      router.replace('/dashboard')
    }
  }, [user, pathname, router])

  const handleVerificationStatusChange = (status: VerificationStatus, rejectionReason?: string | null) => {
    setUser((prev) => {
      if (!prev) return prev
      const updated: User = { ...prev, verificationStatus: status, verificationRejectionReason: rejectionReason ?? null }
      inMemoryUser = updated
      setAuthUser(updated)
      return updated
    })
  }

  const handleUpdateUser = (updated: User) => {
    setUser(updated)
    setAuthUser(updated)
    toast.success('Studio profile updated successfully!', {
      position: 'top-center',
      autoClose: 3500,
    })
  }

  const handleSignOut = async () => {
    try {
      await logoutUser()
    } catch {
      clearAllAuth()
    }
    setUser(null)
    setCookie('tg_studio_signout', '1', 1 / 1440, '/')
    const targetUrl = getCustomerSiteUrl('/?signout=studio')
    if (typeof window !== 'undefined') {
      window.location.href = targetUrl
      return
    }
    router.replace(targetUrl)
  }

  if (loadingUser || !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FAF8F5]">
        <NormalLoader />
        <ToastContainer
          position="top-center"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <main className="flex-1 flex flex-col">
        <PartnerFlow
          go={() => { }}
          otp={otp}
          user={user}
          onSignOut={handleSignOut}
          onOpenProfile={() => router.push('/settings')}
          onUpdateUser={handleUpdateUser}
          activeTab={
            pathname?.includes('catalog')
              ? 'catalog'
              : pathname?.includes('orders')
              ? 'pipeline'
              : pathname?.includes('payouts')
              ? 'payouts'
              : pathname?.includes('settings') || pathname?.includes('profile')
              ? 'profile'
              : pathname?.includes('verification')
              ? 'verification'
              : 'cockpit'
          }
          onVerificationStatusChange={handleVerificationStatusChange}
          onTabChange={(tab) => {
            const pathMap: Record<string, string> = {
              cockpit: '/dashboard',
              pipeline: '/orders',
              catalog: '/catalog',
              payouts: '/payouts',
              profile: '/settings',
              verification: '/verification',
            }
            const target = pathMap[tab] || '/dashboard'
            if (pathname !== target) {
              router.push(target)
            }
          }}
        />
      </main>
      {children}
      <ToastContainer
        position="top-center"
        autoClose={3500}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  )
}
