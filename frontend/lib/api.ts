import { type User, type FittingBooking, type StoreOption, type GarmentCategory } from '../components/data'
import {
  getAuthToken,
  setAuthToken,
  getRefreshToken,
  setRefreshToken,
  getAuthUser,
  setAuthUser,
  setAuthRole,
  clearAllAuth,
  clearUnnecessaryDataOnLogin,
  decodeJwtPayload,
} from './cookies'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export function syncAuthCookies(token?: string | null, role?: string | null) {
  if (token) setAuthToken(token)
  if (role) setAuthRole(role)
}

export function clearAuthCookies() {
  clearAllAuth()
}

export function getAuthHeader(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

export async function refreshAccessToken(providedRefreshToken?: string): Promise<string | null> {
  const refreshToken = providedRefreshToken || getRefreshToken()
  if (!refreshToken) {
    return null
  }

  if (providedRefreshToken) {
    setRefreshToken(providedRefreshToken)
  }

  if (isRefreshing && refreshPromise && !providedRefreshToken) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (res.status === 401 || res.status === 403) {
        // Explicitly rejected by auth server (token expired / revoked)
        clearAllAuth()
        return null
      }

      if (!res.ok) {
        // Server temporary 5xx or rate limit - do NOT clear credentials
        return null
      }

      const data = await res.json()
      const newAt = data.accessToken || data.token
      if (newAt) {
        setAuthToken(newAt)
        if (data.refreshToken) setRefreshToken(data.refreshToken)
        if (data.user) {
          setAuthUser(data.user)
          if (data.user.role) setAuthRole(data.user.role)
        }
        return newAt
      }

      return null
    } catch (err) {
      console.warn('[AUTH] Notice refreshing access token:', err)
      return null
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function getValidAccessToken(): Promise<string | null> {
  let token = getAuthToken()
  if (token) return token

  // Access token expired in cookie, attempt refresh with 15-day refresh token
  const refreshToken = getRefreshToken()
  if (refreshToken) {
    token = await refreshAccessToken()
    if (token) return token
  }

  return null
}

export async function fetchWithAutoRefresh(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getValidAccessToken()
  const headers = new Headers(options.headers || {})

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res = await fetch(url, { credentials: 'include', ...options, headers })

  // If 401 Unauthorized, attempt token refresh once and retry request
  if (res.status === 401 && getRefreshToken()) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(url, { credentials: 'include', ...options, headers })
    }
  }

  return res
}

export async function logoutUser(): Promise<void> {
  try {
    const token = getAuthToken()
    const refreshToken = getRefreshToken()
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
    })
  } catch (err) {
    console.warn('Backend logout request notice:', err)
  } finally {
    clearAllAuth()
  }
}

export const STUDIO_BASE_URL =
  process.env.NEXT_PUBLIC_STUDIO_URL ||
  process.env.STUDIO_URL ||
  ''

export function getStudioUrl(path: string = '', tokenOrCodeOrRt?: string | null): string {
  const base = STUDIO_BASE_URL.replace(/\/$/, '')
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  const url = `${base}${cleanPath}`
  
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

export async function exchangeAuthCode(code: string): Promise<{
  success: boolean
  token: string
  accessToken?: string
  refreshToken?: string
  user: User
  role: string
}> {
  try {
    const res = await fetch(`${API_BASE}/auth/oauth/exchange`, {
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
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.role || data.user.role || 'CUSTOMER')
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

// Send OTP to phone number
export async function sendOtp(phone: string, forceResend: boolean = false): Promise<{ success: boolean; message: string; phone?: string; cooldown?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
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

// Verify OTP and sign in / register
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
  try {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Invalid verification code')
    }

    const data = await res.json()
    if (data.user) {
      data.user.role = data.user.role ?? params.role ?? 'CUSTOMER'
    }
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.user.role)
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

// Link phone number to existing authenticated user
export async function linkPhone(params: {
  phone: string
  otp?: string
  userId?: string
}): Promise<{ success: boolean; user: User; token: string; accessToken?: string; refreshToken?: string; authCode?: string; hasPhone: boolean }> {
  const token = getAuthToken()
  try {
    const res = await fetch(`${API_BASE}/auth/link-phone`, {
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
    if (data.user) {
      data.user.role = data.user.role ?? 'CUSTOMER'
    }
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
    }
    if (data.user) {
      setAuthUser(data.user)
      setAuthRole(data.user.role)
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
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Google authentication failed')
    }

    const data = await res.json()
    if (data.user) {
      data.user.role = data.user.role ?? params.role ?? 'CUSTOMER'
    }
    const at = data.accessToken || data.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.user.role)
      }
    }
    return data
  } catch (err: any) {
    throw err
  }
}

export async function checkEmailExists(email: string, role: string = 'STUDIO'): Promise<{ exists: boolean; error?: string; user?: User }> {
  try {
    const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`)
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
}): Promise<{ token: string; accessToken?: string; refreshToken?: string; authCode?: string; user: User; needsPhone?: boolean }> {
  try {
    const token = getAuthToken()
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Sign up failed')
    }

    const result = await res.json()
    if (result.user) {
      result.user.role = result.user.role ?? data.role ?? 'CUSTOMER'
    }
    const at = result.accessToken || result.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (result.refreshToken) setRefreshToken(result.refreshToken)
      if (result.user) {
        setAuthUser(result.user)
        setAuthRole(result.user.role)
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
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Login failed')
    }

    const result = await res.json()
    if (result.user) {
      result.user.role = result.user.role ?? data.role ?? 'CUSTOMER'
    }
    const at = result.accessToken || result.token
    if (at) {
      clearUnnecessaryDataOnLogin()
      setAuthToken(at)
      if (result.refreshToken) setRefreshToken(result.refreshToken)
      if (result.user) {
        setAuthUser(result.user)
        setAuthRole(result.user.role)
      }
    }
    return result
  } catch (err: any) {
    throw err
  }
}

export async function updateUserProfile(updates: Partial<User>): Promise<{ success: boolean; user: User; token?: string; accessToken?: string; refreshToken?: string }> {
  const res = await fetchWithAutoRefresh(`${API_BASE}/auth/update-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })

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
    if (data.user.role) setAuthRole(data.user.role)
  }
  return data
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getValidAccessToken()
  if (!token) {
    return null
  }

  try {
    const res = await fetchWithAutoRefresh(`${API_BASE}/auth/me`)

    if (res.ok) {
      const data = await res.json()
      if (data.user) {
        setAuthUser(data.user)
        setAuthRole(data.user.role || 'CUSTOMER')
        return data.user
      }
    }

    if (res.status === 401 || res.status === 403) {
      clearAllAuth()
      return null
    }

    // On non-401 errors (e.g. server temporary 500 or offline), fallback to cached user
    return getAuthUser<User>()
  } catch (err) {
    return getAuthUser<User>()
  }
}

export async function fetchOrders(query?: string, userId?: string): Promise<FittingBooking[]> {
  try {
    const params = new URLSearchParams()
    if (query) params.append('contact', query)
    if (userId) params.append('userId', userId)
    const url = params.toString() ? `${API_BASE}/orders?${params.toString()}` : `${API_BASE}/orders`
    const res = await fetchWithAutoRefresh(url, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.orders || []
  } catch (err) {
    return []
  }
}

export async function fetchStudioOrders(storeId?: string | null): Promise<FittingBooking[]> {
  try {
    const url = storeId ? `${API_BASE}/orders?storeId=${encodeURIComponent(storeId)}` : `${API_BASE}/orders`
    const res = await fetchWithAutoRefresh(url, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.orders || []
  } catch (err) {
    return []
  }
}

export async function fetchOrderById(id: string): Promise<FittingBooking | null> {
  try {
    const res = await fetchWithAutoRefresh(`${API_BASE}/orders/${encodeURIComponent(id)}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.order || null
  } catch (err) {
    return null
  }
}

export async function fetchStudioStats(storeId?: string | null): Promise<any> {
  try {
    const url = storeId ? `${API_BASE}/orders/studio/stats?storeId=${encodeURIComponent(storeId)}` : `${API_BASE}/orders/studio/stats`
    const res = await fetchWithAutoRefresh(url, {
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetchWithAutoRefresh(`${API_BASE}/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetchWithAutoRefresh(`${API_BASE}/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch (err) {
    return false
  }
}

export async function createOrder(orderData: any): Promise<{ success: boolean; order?: FittingBooking; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Failed to place order')
    }

    return await res.json()
  } catch (err: any) {
    console.error('Create order error:', err)
    throw err
  }
}

export async function sendOrderPinEmail(orderId: string, email?: string): Promise<{ success: boolean; message?: string; email?: string; error?: string }> {
  try {
    const cleanId = orderId ? encodeURIComponent(orderId.replace(/^#/, '').trim()) : ''
    const res = await fetchWithAutoRefresh(`${API_BASE}/orders/${cleanId}/send-otp-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })
    return await res.json()
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to send PIN email' }
  }
}

export async function fetchStores(search?: string): Promise<StoreOption[]> {
  try {
    const url = search ? `${API_BASE}/stores?search=${encodeURIComponent(search)}` : `${API_BASE}/stores`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch stores')
    const data = await res.json()
    if (Array.isArray(data.stores)) {
      return data.stores
    }
    return []
  } catch (err) {
    console.warn('Failed to fetch stores from backend database:', err)
    return []
  }
}

export async function fetchServices(): Promise<GarmentCategory[]> {
  try {
    const res = await fetch(`${API_BASE}/services`)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.services)) {
        return data.services
      }
    }
  } catch (err) {
    console.warn('Failed to fetch services from backend database:', err)
  }
  return []
}

export interface DispatchSessionStatus {
  orderId: string
  status: 'SEARCHING' | 'ASSIGNED' | 'EXHAUSTED' | 'ZERO_TAILORS' | 'CANCELLED' | 'SCHEDULED' | 'NOT_FOUND'
  stage: number
  currentRadius: number
  stageSecondsRemaining: number
  totalSecondsElapsed: number
  hardTimeoutSec: number
  totalEligibleCount: number
  contactedCount: number
  declinedCount: number
  acceptedTailorId?: string | null
  acceptedTailor?: any
  order?: any
  message?: string
}

export async function startOrderDispatch(orderData: any): Promise<{
  success: boolean
  order?: any
  dispatch?: DispatchSessionStatus
  error?: string
}> {
  try {
    const res = await fetch(`${API_BASE}/orders/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'Failed to start dispatch session')
    }

    return await res.json()
  } catch (err: any) {
    console.error('Start order dispatch error:', err)
    throw err
  }
}

export async function fetchDispatchStatus(orderId: string): Promise<DispatchSessionStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/dispatch/status`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.dispatch || null
  } catch (err) {
    return null
  }
}

export async function retryOrderDispatch(
  orderId: string,
  customerLat?: number,
  customerLng?: number
): Promise<{ success: boolean; dispatch?: DispatchSessionStatus }> {
  try {
    const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/dispatch/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerLat, customerLng }),
    })
    return await res.json()
  } catch (err) {
    return { success: false }
  }
}

export async function cancelOrderDispatch(orderId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/dispatch/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    return await res.json()
  } catch (err) {
    return { success: false }
  }
}

export async function scheduleOrder(
  orderId: string,
  date: string,
  timeSlot: string
): Promise<{ success: boolean; order?: any }> {
  try {
    const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/dispatch/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, timeSlot }),
    })
    return await res.json()
  } catch (err) {
    return { success: false }
  }
}

export async function fetchNearbyTailors(
  lat: number,
  lng: number,
  radiusMiles: number = 8.0,
  query: string = ''
): Promise<{ success: boolean; tailors: StoreOption[]; count: number }> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radiusMiles: radiusMiles.toString(),
      ...(query ? { query } : {}),
    })
    const res = await fetch(`${API_BASE}/tailors/nearby?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      return { success: false, tailors: [], count: 0 }
    }
    const data = await res.json()
    return {
      success: true,
      tailors: Array.isArray(data.tailors) ? data.tailors : [],
      count: data.count || (data.tailors ? data.tailors.length : 0),
    }
  } catch (err) {
    console.warn('Error fetching nearby tailors from backend:', err)
    return { success: false, tailors: [], count: 0 }
  }
}

// Check if a user with given phone exists in the backend
export async function checkPhoneExists(
  phone: string,
  role: string = 'CUSTOMER'
): Promise<{ exists: boolean; user?: any; error?: string; roleMismatch?: boolean; phone?: string }> {
  try {
    const res = await fetch(`${API_BASE}/auth/check-phone?phone=${encodeURIComponent(phone)}&role=${encodeURIComponent(role)}`)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { exists: false, error: err.error }
    }
    return await res.json()
  } catch (err) {
    return { exists: false }
  }
}

// Subscribe an email to newsletter offers & updates
export async function subscribeNewsletter(
  email: string,
  source: string = 'footer'
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to subscribe. Please try again.' }
    }
    return { success: true, message: data.message || 'Subscribed successfully!' }
  } catch (err) {
    console.error('Error subscribing to newsletter:', err)
    return { success: false, error: 'Network error. Please try again later.' }
  }
}


