/**
 * Centralized API Routes Configuration for Raffu Studio Portal
 * Completely removes hardcoded route strings from API requests.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : '')
).replace(/\/$/, '')

export const API_ROUTES = {
  AUTH: {
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    OAUTH_EXCHANGE: '/auth/oauth/exchange',
    SEND_OTP: '/auth/send-otp',
    VERIFY_OTP: '/auth/verify-otp',
    LINK_PHONE: '/auth/link-phone',
    GOOGLE: '/auth/google',
    CHECK_EMAIL: (email: string, role: string = 'STUDIO') =>
      `/auth/check-email?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`,
    CHECK_PHONE: (phone: string, role: string = 'STUDIO') =>
      `/auth/check-phone?phone=${encodeURIComponent(phone)}&role=${encodeURIComponent(role)}`,
    SIGNUP: '/auth/signup',
    LOGIN: '/auth/login',
    UPDATE_PROFILE: '/auth/update-profile',
    STATUS: '/auth/status',
    ME: '/auth/me',
  },
  ORDERS: {
    BASE: '/orders',
    BY_ID: (id: string) => `/orders/${encodeURIComponent(id)}`,
    STUDIO_STATS: (storeId?: string | null) =>
      storeId ? `/orders/studio/stats?storeId=${encodeURIComponent(storeId)}` : '/orders/studio/stats',
    BY_STORE: (storeId?: string | null) =>
      storeId ? `/orders?storeId=${encodeURIComponent(storeId)}` : '/orders',
    DISPATCH_PENDING: (storeId?: string | null) =>
      storeId ? `/orders/dispatch/pending?storeId=${encodeURIComponent(storeId)}` : '/orders/dispatch/pending',
    DISPATCH_RESPOND: (orderId: string) =>
      `/orders/${encodeURIComponent(orderId)}/dispatch/respond`,
  },
  STUDIO: {
    CATALOG: (query: string = '') => `/studio/catalog${query}`,
    CATALOG_ITEM: '/studio/catalog/item',
    CATALOG_ITEM_BY_ID: (id: string, query: string = '') =>
      `/studio/catalog/item/${encodeURIComponent(id)}${query}`,
    VERIFICATION: '/studio/verification',
  },
  ADMIN: {
    LOGIN: '/admin/login',
    ME: '/admin/me',
    OVERVIEW: '/admin/overview',
    CUSTOMERS: (params?: string) => params ? `/admin/customers?${params}` : '/admin/customers',
    CUSTOMER_BY_ID: (id: string) => `/admin/customers/${encodeURIComponent(id)}`,
    STUDIOS: (params?: string) => params ? `/admin/studios?${params}` : '/admin/studios',
    STUDIO_BY_ID: (id: string) => `/admin/studios/${encodeURIComponent(id)}`,
    ORDERS: (params?: string) => params ? `/admin/orders?${params}` : '/admin/orders',
    ORDER_BY_ID: (id: string) => `/admin/orders/${encodeURIComponent(id)}`,
    SEARCH: (q: string) => `/admin/search?q=${encodeURIComponent(q.trim())}`,
  },
  PUSH: {
    VAPID_KEY: '/push/vapid-key',
    SUBSCRIBE: '/push/subscribe',
    UNSUBSCRIBE: '/push/unsubscribe',
    TEST: '/push/test',
  },
} as const

export function getApiUrl(endpointOrPath: string): string {
  const cleanPath = endpointOrPath.startsWith('/') ? endpointOrPath : `/${endpointOrPath}`
  const base =
    API_BASE ||
    (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5000/api'
      : '')
  return base ? `${base}${cleanPath}` : cleanPath
}
