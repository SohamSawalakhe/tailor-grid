/**
 * Centralized API Routes Configuration for Raffu Admin Portal
 * Completely removes hardcoded route strings from API requests.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

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
    CHECK_PHONE: (phone: string, role: string = 'CUSTOMER') =>
      `/auth/check-phone?phone=${encodeURIComponent(phone)}&role=${encodeURIComponent(role)}`,
    SIGNUP: '/auth/signup',
    LOGIN: '/auth/login',
    UPDATE_PROFILE: '/auth/update-profile',
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
    INQUIRIES: (params?: string) => params ? `/admin/inquiries?${params}` : '/admin/inquiries',
    INQUIRY_BY_ID: (id: string) => `/admin/inquiries/${encodeURIComponent(id)}`,
    VERIFICATIONS: (params?: string) => params ? `/admin/verifications?${params}` : '/admin/verifications',
    VERIFICATIONS_COUNT: '/admin/verifications/count',
    VERIFICATION_BY_ID: (id: string) => `/admin/verifications/${encodeURIComponent(id)}`,
    VERIFICATION_REVIEW: (id: string, action: 'approve' | 'reject') =>
      `/admin/verifications/${encodeURIComponent(id)}/${action}`,
  },
} as const

export function getApiUrl(endpointOrPath: string): string {
  const cleanPath = endpointOrPath.startsWith('/') ? endpointOrPath : `/${endpointOrPath}`
  return API_BASE ? `${API_BASE}${cleanPath}` : cleanPath
}
