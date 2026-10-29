import type { User, FittingBooking, VerificationStatus } from '../components/data'
import {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
  getAuthUser,
  setAuthUser,
  removeAuthUser,
  getAuthRole,
  setAuthRole,
  removeAuthRole,
  clearAllAuth,
  clearUnnecessaryDataOnLogin,
  decodeJwtPayload,
  hasActiveSession,
} from './cookies'

import { API_BASE, API_ROUTES, getApiUrl } from './api-routes'

export { API_BASE, API_ROUTES, getApiUrl }

let silentRefreshTimer: any = null

export function cancelSilentRefresh(): void {
  if (silentRefreshTimer) {
    clearTimeout(silentRefreshTimer)
    silentRefreshTimer = null
  }
}

/**
 * Automatically & silently refreshes access token before 15 minutes expire
 * Keeps studio partner session perpetually alive without interruption.
 */
export function scheduleSilentRefresh(token?: string | null): void {
  if (typeof window === 'undefined') return

  cancelSilentRefresh()

  const currentToken = token || getAuthToken()
  if (!currentToken) {
    if (hasActiveSession()) {
      silentRefreshTimer = setTimeout(() => {
        refreshAccessToken().then((newToken) => {
          if (newToken) scheduleSilentRefresh(newToken)
        })
      }, 1000)
    }
    return
  }

  try {
    const payload = decodeJwtPayload(currentToken)
    const exp = payload?.exp ? payload.exp * 1000 : null
    let delay = 12 * 60 * 1000 // default 12 minutes

    if (exp) {
      const remaining = exp - Date.now()
      delay = remaining > 150000 ? remaining - 150000 : Math.max(10000, remaining / 2)
    }

    silentRefreshTimer = setTimeout(async () => {
      try {
        const freshToken = await refreshAccessToken()
        if (freshToken) {
          scheduleSilentRefresh(freshToken)
        }
      } catch (err) {
        console.warn('[AUTH] Notice during studio silent auto-refresh:', err)
      }
    }, delay)
  } catch (_) {
    silentRefreshTimer = setTimeout(() => {
      refreshAccessToken().then((t) => {
        if (t) scheduleSilentRefresh(t)
      })
    }, 12 * 60 * 1000)
  }
}

export const CUSTOMER_SITE_URL = (
  process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL ||
  process.env.CUSTOMER_SITE_URL ||
  ''
).replace(/\/$/, '')

export function getCustomerSiteUrl(path: string = '', tokenOrCodeOrRt?: string | null): string {
  const base = CUSTOMER_SITE_URL
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  const url = base ? `${base}${cleanPath}` : cleanPath || '/'
  
  if (tokenOrCodeOrRt) {
    const separator = url.includes('?') ? '&' : '?'
    let paramName = 'refreshToken'
    if (tokenOrCodeOrRt.startsWith('ac_')) {
      paramName = 'code'
    } else {
      const decoded = decodeJwtPayload(tokenOrCodeOrRt)
      if (decoded?.tokenType === 'access') {
        paramName = 'token'
      } else {
        paramName = 'refreshToken'
      }
    }
    return `${url}${separator}${paramName}=${encodeURIComponent(tokenOrCodeOrRt)}`
  }
  return url
}

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

export async function refreshAccessToken(providedRefreshToken?: string): Promise<string | null> {
  const refreshToken = providedRefreshToken || getRefreshToken()

  if (isRefreshing && refreshPromise && !providedRefreshToken) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const res = await fetch(getApiUrl(API_ROUTES.AUTH.REFRESH), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      })

      if (res.status === 401 || res.status === 403) {
        clearAllAuth()
        return null
      }

      if (!res.ok) {
        return null
      }

      const data = await res.json()
      const newAt = data.accessToken || data.token
      if (newAt) {
        setAuthToken(newAt)
        if (data.refreshToken) {
          setRefreshToken(data.refreshToken)
        }
        if (data.user) {
          const currentRole = getAuthRole()
          const effectiveRole = (data.user.role === 'STUDIO' || currentRole === 'STUDIO')
            ? 'STUDIO'
            : (data.user.role === 'ADMIN' ? 'ADMIN' : (data.user.role === 'TEMP_STUDIO' || currentRole === 'TEMP_STUDIO' ? 'TEMP_STUDIO' : (data.user.role || 'TEMP_STUDIO')))
          setAuthUser({ ...data.user, role: effectiveRole })
          setAuthRole(effectiveRole)
        }
        scheduleSilentRefresh(newAt)
        return newAt
      }

      clearAllAuth()
      return null
    } catch {
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function exchangeAuthCode(code: string): Promise<{
  success: boolean
  token: string
  accessToken?: string
  refreshToken?: string
  user: User
  role: string
}> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.OAUTH_EXCHANGE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to exchange authorization code')
    }
    const data = await res.json()
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      const effectiveRole = (data.role === 'STUDIO' || data.user?.role === 'STUDIO') ? 'STUDIO' : 'TEMP_STUDIO'
      const enrichedUser = data.user ? { ...data.user, role: effectiveRole } : null
      if (enrichedUser) {
        setAuthUser(enrichedUser)
        setAuthRole(effectiveRole)
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

export async function logoutUser(): Promise<void> {
  try {
    const token = getAuthToken()
    const refreshToken = getRefreshToken()
    await fetch(getApiUrl(API_ROUTES.AUTH.LOGOUT), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
    })
  } catch (err) {
    console.warn('Backend studio logout request notice:', err)
  } finally {
    clearAllAuth()
  }
}

export async function sendOtp(phone: string, forceResend: boolean = false): Promise<{ success: boolean; message: string; phone?: string; cooldown?: boolean }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.SEND_OTP), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, forceResend }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to send verification code')
    }
    return await res.json()
  } catch (err: any) {
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('fetch failed'))) {
      throw new Error('Unable to connect to authentication server. Please ensure the backend is running.')
    }
    throw err
  }
}

export async function verifyOtp(params: {
  phone: string
  otp: string
  name?: string
  email?: string
  userId?: string
  role?: 'CUSTOMER' | 'STUDIO'
  postcode?: string
}): Promise<{
  token?: string
  accessToken?: string
  refreshToken?: string
  authCode?: string
  user?: User
  hasPhone?: boolean
  isNewUser?: boolean
  phone?: string
  message?: string
}> {
  const token = getAuthToken()
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.VERIFY_OTP), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Invalid verification code')
    }

    const data = await res.json()
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.user.role || 'STUDIO')
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

export async function linkPhone(params: {
  phone: string
  otp?: string
  userId?: string
}): Promise<{ success: boolean; user: User; token: string; accessToken?: string; refreshToken?: string; authCode?: string; hasPhone: boolean }> {
  const token = getAuthToken()
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.LINK_PHONE), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...params, id: params.userId }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to link mobile number')
    }

    const data = await res.json()
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
    }
    if (data.user) {
      setAuthUser(data.user)
      setAuthRole('STUDIO')
    }
    return data
  } catch (err: any) {
    throw err
  }
}

export async function loginWithGoogle(params: {
  idToken?: string
  accessToken?: string
  profile?: Partial<User>
  email?: string
  name?: string
  googleId?: string
  avatar?: string
  role?: 'CUSTOMER' | 'STUDIO' | 'ADMIN'
  isSignup?: boolean
  flow?: 'login' | 'signup'
  isLogin?: boolean
}): Promise<{ token?: string; accessToken?: string; refreshToken?: string; authCode?: string; user: User; needsPhone?: boolean; isNewUser?: boolean; tempSignupId?: string; expiresIn?: number }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.GOOGLE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Google authentication failed')
    }

    const data = await res.json()
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.user.role || 'STUDIO')
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

export async function checkEmailExists(email: string, role: string = 'STUDIO'): Promise<{ exists: boolean; error?: string; user?: User }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.CHECK_EMAIL(email, role)))
    if (res.ok) {
      return await res.json()
    }
    return { exists: false }
  } catch {
    return { exists: false }
  }
}

export async function signUpUser(data: {
  tempSignupId?: string
  name: string
  email?: string
  phone?: string
  address?: string
  postcode?: string
  role?: 'CUSTOMER' | 'STUDIO' | 'ADMIN'
  storeName?: string
  storeArea?: string
  machines?: string
  specialties?: string[]
  lat?: number
  lng?: number
}): Promise<{ token: string; accessToken?: string; refreshToken?: string; authCode?: string; user: User; needsPhone?: boolean }> {
  try {
    const token = getAuthToken()
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.SIGNUP), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...data, role: 'STUDIO' }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Sign up failed')
    }

    const result = await res.json()
    const at = result.accessToken || result.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (result.refreshToken) setRefreshToken(result.refreshToken)
      if (result.user) {
        setAuthUser(result.user)
        setAuthRole(result.user.role || 'STUDIO')
      }
    }
    return result
  } catch (err: any) {
    throw err
  }
}

export async function loginUser(data: {
  email?: string
  phone?: string
  identifier?: string
  role?: 'CUSTOMER' | 'STUDIO' | 'ADMIN'
}): Promise<{ token: string; accessToken?: string; refreshToken?: string; authCode?: string; user: User; needsPhone?: boolean }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.LOGIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Login failed')
    }

    const result = await res.json()
    const at = result.accessToken || result.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (result.refreshToken) setRefreshToken(result.refreshToken)
      if (result.user) {
        setAuthUser(result.user)
        setAuthRole(result.user.role || 'STUDIO')
      }
    }
    return result
  } catch (err: any) {
    throw err
  }
}

export async function updateUserProfile(updates: Partial<User> & { otp?: string }): Promise<{ success: boolean; user: User; token?: string; accessToken?: string; refreshToken?: string }> {
  let token = getAuthToken()
  let res = await fetch(getApiUrl(API_ROUTES.AUTH.UPDATE_PROFILE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(updates),
  })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await fetch(getApiUrl(API_ROUTES.AUTH.UPDATE_PROFILE), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify(updates),
      })
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Server error (${res.status})`)
  }

  const data = await res.json()
  const at = data.accessToken || data.token
  if (at) {
    setAuthToken(at)
  }
  if (data.refreshToken) {
    setRefreshToken(data.refreshToken)
  }
  if (data.user) {
    setAuthUser(data.user)
    setAuthRole('STUDIO')
  }
  return data
}

export async function updateStudioStatus(status?: 'ACTIVE' | 'INACTIVE'): Promise<{ success: boolean; user: User; status: 'ACTIVE' | 'INACTIVE'; message: string }> {
  let token = getAuthToken()
  let res = await fetch(getApiUrl(API_ROUTES.AUTH.STATUS), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(status ? { status } : {}),
  })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await fetch(getApiUrl(API_ROUTES.AUTH.STATUS), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify(status ? { status } : {}),
      })
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Server error (${res.status})`)
  }

  const data = await res.json()
  if (data.user) {
    setAuthUser(data.user)
    setAuthRole('STUDIO')
  }
  return data
}

export async function getCurrentUser(): Promise<User | null> {
  let token = getAuthToken()
  if (!token) {
    token = await refreshAccessToken()
    if (!token) {
      return null
    }
  } else {
    scheduleSilentRefresh(token)
  }

  try {
    let res = await fetch(getApiUrl(API_ROUTES.AUTH.ME), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.status === 401) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        res = await fetch(getApiUrl(API_ROUTES.AUTH.ME), {
          credentials: 'include',
          headers: { Authorization: `Bearer ${newToken}` },
        })
      }
    }

    if (res.ok) {
      const data = await res.json()
      if (data.user) {
        const currentRole = getAuthRole()
        const effectiveRole = (data.user.role === 'STUDIO' || currentRole === 'STUDIO')
          ? 'STUDIO'
          : (data.user.role === 'ADMIN' ? 'ADMIN' : (data.user.role === 'TEMP_STUDIO' || currentRole === 'TEMP_STUDIO' ? 'TEMP_STUDIO' : (data.user.role || 'TEMP_STUDIO')))
        const userObj: User = { ...data.user, role: effectiveRole }
        setAuthUser(userObj)
        setAuthRole(effectiveRole)
        return userObj
      }
    }

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      clearAllAuth()
      return null
    }

    return getAuthUser<User>()
  } catch (err) {
    // On temporary network disconnection / hot-reload, preserve credentials
    return getAuthUser<User>()
  }
}

export async function fetchStudioOrders(storeId?: string | null): Promise<FittingBooking[]> {
  try {
    const token = getAuthToken()
    const url = getApiUrl(API_ROUTES.ORDERS.BY_STORE(storeId))
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.orders || []
  } catch (err) {
    return []
  }
}

export async function fetchStudioStats(storeId?: string | null): Promise<any> {
  try {
    const token = getAuthToken()
    const url = getApiUrl(API_ROUTES.ORDERS.STUDIO_STATS(storeId))
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.stats
  } catch (err) {
    return null
  }
}

export async function updateOrder(id: string, updates: Partial<FittingBooking>): Promise<FittingBooking | null> {
  try {
    const token = getAuthToken()
    const res = await fetch(getApiUrl(API_ROUTES.ORDERS.BY_ID(id)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(updates),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.order
  } catch (err) {
    return null
  }
}

export async function deleteOrder(id: string): Promise<boolean> {
  try {
    const token = getAuthToken()
    const res = await fetch(getApiUrl(API_ROUTES.ORDERS.BY_ID(id)), {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    return res.ok
  } catch (err) {
    return false
  }
}

export interface PendingDispatchRequest {
  orderId: string
  order: any
  distanceMiles: number
  distance: string
  stage: number
  currentRadius: number
  secondsRemaining: number
  payout: number
  customerName: string
  garmentName: string
  quantity?: number
  serviceName: string
  timeSlot: string
  date: string
}

export async function fetchPendingDispatches(storeId: string): Promise<PendingDispatchRequest[]> {
  try {
    if (!storeId) return []
    const res = await fetch(getApiUrl(API_ROUTES.ORDERS.DISPATCH_PENDING(storeId)), {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.pendingRequests || []
  } catch (err) {
    return []
  }
}

export async function respondToDispatch(
  orderId: string,
  tailorId: string,
  action: 'ACCEPT' | 'SKIP'
): Promise<{ success: boolean; message?: string; code?: string; order?: any }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ORDERS.DISPATCH_RESPOND(orderId)), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tailorId, action }),
    })
    const data = await res.json()
    return data
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to submit response' }
  }
}

// ==========================================
// SUPER ADMIN API METHODS
// ==========================================

function getAdminHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? (localStorage.getItem(ADMIN_TOKEN_KEY) || getAuthToken()) : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchAdminOverview(): Promise<any> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.OVERVIEW), {
      headers: getAdminHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to fetch admin overview')
    return await res.json()
  } catch (err) {
    console.error('fetchAdminOverview error:', err)
    return null
  }
}

export async function fetchAdminCustomers(search?: string, status?: string, role: string = 'CUSTOMER'): Promise<any[]> {
  try {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (status && status !== 'ALL') params.append('status', status)
    if (role && role !== 'ALL') params.append('role', role)
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.CUSTOMERS(params.toString())), {
      headers: getAdminHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to fetch customers')
    const data = await res.json()
    return data.customers || []
  } catch (err) {
    console.error('fetchAdminCustomers error:', err)
    return []
  }
}

export async function createAdminCustomer(data: any): Promise<{ success: boolean; customer?: any; error?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.CUSTOMERS()), {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(data),
    })
    const resData = await res.json()
    if (!res.ok) return { success: false, error: resData.error || 'Failed to create customer' }
    return { success: true, customer: resData.customer }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateAdminCustomer(id: string, updates: any): Promise<{ success: boolean; customer?: any; error?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.CUSTOMER_BY_ID(id)), {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Failed to update customer' }
    return { success: true, customer: data.customer }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deleteAdminCustomer(id: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.CUSTOMER_BY_ID(id)), {
      method: 'DELETE',
      headers: getAdminHeaders(),
    })
    return res.ok
  } catch (err) {
    return false
  }
}

export async function fetchAdminStudios(search?: string, area?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (area && area !== 'ALL') params.append('area', area)
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.STUDIOS(params.toString())), {
      headers: getAdminHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to fetch studios')
    const data = await res.json()
    return data.studios || []
  } catch (err) {
    console.error('fetchAdminStudios error:', err)
    return []
  }
}

export async function createAdminStudio(studioData: any): Promise<{ success: boolean; studio?: any; error?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.STUDIOS()), {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(studioData),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Failed to create studio' }
    return { success: true, studio: data.studio }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateAdminStudio(id: string, updates: any): Promise<{ success: boolean; studio?: any; error?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.STUDIO_BY_ID(id)), {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Failed to update studio' }
    return { success: true, studio: data.studio }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deleteAdminStudio(id: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.STUDIO_BY_ID(id)), {
      method: 'DELETE',
      headers: getAdminHeaders(),
    })
    return res.ok
  } catch (err) {
    return false
  }
}

export async function fetchAdminOrders(search?: string, status?: string, storeId?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (status && status !== 'ALL') params.append('status', status)
    if (storeId && storeId !== 'ALL') params.append('storeId', storeId)
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.ORDERS(params.toString())), {
      headers: getAdminHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to fetch orders')
    const data = await res.json()
    return data.orders || []
  } catch (err) {
    console.error('fetchAdminOrders error:', err)
    return []
  }
}

export async function updateAdminOrder(id: string, updates: any): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.ORDER_BY_ID(id)), {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error || 'Failed to update order' }
    return { success: true, order: data.order }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function searchAdminGlobal(q: string): Promise<{ customers: any[]; studios: any[]; orders: any[] }> {
  try {
    if (!q || !q.trim()) return { customers: [], studios: [], orders: [] }
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.SEARCH(q)), {
      headers: getAdminHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) return { customers: [], studios: [], orders: [] }
    const data = await res.json()
    return data.results || { customers: [], studios: [], orders: [] }
  } catch (err) {
    return { customers: [], studios: [], orders: [] }
  }
}

// -------------------------------------------------------------
// SUPER ADMIN AUTH & SESSION HELPERS
// -------------------------------------------------------------
const ADMIN_TOKEN_KEY = 'tg_super_admin_token'
const ADMIN_USER_KEY = 'tg_super_admin_user'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token)
  } catch {}
}

export function removeAdminToken(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
}

export function getAdminUser(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAdminUser(user: any): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user))
  } catch {}
}

export function removeAdminUser(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ADMIN_USER_KEY)
  } catch {}
}

export async function loginSuperAdmin(idOrEmail: string, password: string): Promise<{
  success: boolean
  token?: string
  user?: any
  error?: string
}> {
  try {
    const trimmedIdentifier = idOrEmail.trim()
    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.LOGIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedIdentifier, id: trimmedIdentifier, password }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Authentication failed' }
    }

    setAdminToken(data.token)
    setAdminUser(data.user)

    // Synchronize unified auth tokens & cookies so proxy recognizes Admin role across routes
    setAuthToken(data.token)
    setAuthRole('ADMIN')
    setAuthUser(data.user)

    return { success: true, token: data.token, user: data.user }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error during login' }
  }
}

export async function checkSuperAdminSession(): Promise<any | null> {
  const token = getAdminToken()
  if (!token) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)

    const res = await fetch(getApiUrl(API_ROUTES.ADMIN.ME), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      if (data.user) {
        setAdminUser(data.user)
        setAuthRole('ADMIN')
        setAuthUser(data.user)
        return data.user
      }
    }
    // Token is invalid/expired only if the token in storage hasn't been replaced
    if (getAdminToken() === token) {
      removeAdminToken()
      removeAdminUser()
    }
    return null
  } catch {
    // If timeout or network error, only clear if the token hasn't changed
    if (getAdminToken() === token) {
      removeAdminToken()
      removeAdminUser()
    }
    return null
  }
}

export function logoutSuperAdmin(): void {
  removeAdminToken()
  removeAdminUser()
  removeAuthToken()
  removeAuthRole()
  removeAuthUser()
}

// Check if a user with given phone exists in the backend
export async function checkPhoneExists(
  phone: string,
  role: string = 'STUDIO'
): Promise<{ exists: boolean; user?: any; error?: string; roleMismatch?: boolean; phone?: string }> {
  try {
    const res = await fetch(getApiUrl(API_ROUTES.AUTH.CHECK_PHONE(phone, role)))
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { exists: false, error: err.error }
    }
    return await res.json()
  } catch (err) {
    return { exists: false }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDIO PRICE CATALOG API HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface StudioCatalogItemData {
  id?: string
  studioId?: string
  categoryId: string
  categoryName: string
  serviceId?: string | null
  name: string
  description?: string | null
  price: number
  currency?: string
  currencySymbol?: string
  partnerPayout?: number | null
  turnaroundDays: number
  avgTurnaround?: string
  enabled: boolean
  isCustom?: boolean
}

export interface BaseServiceCategory {
  id: string
  name: string
  tagline?: string
  startingPrice: number
  avgTurnaround: string
  services: {
    id: string
    name: string
    description?: string
    customerPrice: number
    partnerPayout: number
    turnaroundDays: number
    popular?: boolean
  }[]
}

export interface StudioCatalogResponse {
  success: boolean
  studioId?: string
  hasFilledCatalog: boolean
  currency?: string
  currencySymbol?: string
  items: StudioCatalogItemData[]
  baseCategories: BaseServiceCategory[]
}

export async function fetchStudioCatalog(studioId?: string): Promise<StudioCatalogResponse> {
  const token = getAuthToken()
  const validStudioId = studioId && studioId !== 'undefined' && studioId !== 'null' ? studioId.trim() : ''
  const q = validStudioId ? `?studioId=${encodeURIComponent(validStudioId)}` : ''
  try {
    const res = await fetch(getApiUrl(API_ROUTES.STUDIO.CATALOG(q)), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to fetch studio catalog')
    }
    return await res.json()
  } catch (err: any) {
    console.error('fetchStudioCatalog error:', err)
    return {
      success: false,
      studioId: validStudioId,
      hasFilledCatalog: false,
      items: [],
      baseCategories: [],
    }
  }
}

export async function saveStudioCatalog(params: {
  studioId?: string
  currency?: string
  currencySymbol?: string
  items: StudioCatalogItemData[]
}): Promise<{
  success: boolean
  message: string
  count: number
  hasFilledCatalog: boolean
  currency?: string
  currencySymbol?: string
  items: StudioCatalogItemData[]
}> {
  const token = getAuthToken()
  try {
    const res = await fetch(getApiUrl(API_ROUTES.STUDIO.CATALOG()), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save price catalog')
    }
    return await res.json()
  } catch (err: any) {
    console.error('saveStudioCatalog error:', err)
    throw err
  }
}

export async function saveStudioCatalogItem(params: {
  studioId?: string
  item: StudioCatalogItemData
}): Promise<{ success: boolean; item: StudioCatalogItemData }> {
  const token = getAuthToken()
  try {
    const res = await fetch(getApiUrl(API_ROUTES.STUDIO.CATALOG_ITEM), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save catalog item')
    }
    return await res.json()
  } catch (err: any) {
    console.error('saveStudioCatalogItem error:', err)
    throw err
  }
}

export async function deleteStudioCatalogItem(id: string, studioId?: string): Promise<{ success: boolean }> {
  const token = getAuthToken()
  const validStudioId = studioId && studioId !== 'undefined' && studioId !== 'null' ? studioId.trim() : ''
  const q = validStudioId ? `?studioId=${encodeURIComponent(validStudioId)}` : ''
  try {
    const res = await fetch(getApiUrl(API_ROUTES.STUDIO.CATALOG_ITEM_BY_ID(id, q)), {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to delete catalog item')
    }
    return await res.json()
  } catch (err: any) {
    console.error('deleteStudioCatalogItem error:', err)
    throw err
  }
}

// ==========================================
// STUDIO VERIFICATION
// ==========================================

export interface StudioVerificationState {
  verificationStatus: VerificationStatus
  rejectionReason: string | null
  submittedAt: string | null
}

export async function fetchStudioVerification(): Promise<StudioVerificationState | null> {
  const token = getAuthToken()
  try {
    const res = await fetch(getApiUrl(API_ROUTES.STUDIO.VERIFICATION), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      verificationStatus: data.verificationStatus,
      rejectionReason: data.rejectionReason || null,
      submittedAt: data.submittedAt || null,
    }
  } catch (err) {
    console.error('fetchStudioVerification error:', err)
    return null
  }
}

/**
 * Upload the shop front photo, interior photo and machines video in one multipart request.
 * Uses XHR (not fetch) so the caller gets upload progress for the large video.
 */
export function submitStudioVerification(
  files: { shopFrontImage: File; interiorImage: File; machinesVideo: File },
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; verificationStatus?: VerificationStatus; error?: string }> {
  return new Promise((resolve) => {
    const form = new FormData()
    form.append('shopFrontImage', files.shopFrontImage)
    form.append('interiorImage', files.interiorImage)
    form.append('machinesVideo', files.machinesVideo)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', getApiUrl(API_ROUTES.STUDIO.VERIFICATION))
    xhr.withCredentials = true
    const token = getAuthToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data: any = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true, verificationStatus: data.verificationStatus })
      } else {
        resolve({ success: false, error: data.error || 'Upload failed. Please try again.', verificationStatus: data.verificationStatus })
      }
    }
    xhr.onerror = () => resolve({ success: false, error: 'Network error while uploading. Please check your connection.' })
    xhr.send(form)
  })
}
