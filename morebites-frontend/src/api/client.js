import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mb_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (typeof config.headers?.delete === 'function') {
      config.headers.delete('Content-Type')
    } else {
      delete config.headers['Content-Type']
      delete config.headers['content-type']
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mb_token')
      localStorage.removeItem('mb_user')
      if (!window.location.pathname.includes('login')) {
        window.dispatchEvent(new Event('mb:logout'))
      }
    }
    return Promise.reject(error)
  },
)

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('mb_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem('mb_token', token)
  localStorage.setItem('mb_user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('mb_token')
  localStorage.removeItem('mb_user')
}

export function hasToken() {
  return Boolean(localStorage.getItem('mb_token'))
}

export const authApi = {
  login: (email, password) => api.post('/login', { email, password }),
  me: () => api.get('/me'),
  logout: () => api.post('/logout'),
}

export const dashboardApi = {
  get: (period = 'Daily') => api.get('/dashboard', { params: { period } }),
}

export const ordersApi = {
  list: (params) => api.get('/orders', { params }),
  create: (payload) => api.post('/orders', payload),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  menuOptions: () => api.get('/orders/menu-options'),
}

export function mediaUrl(path) {
  if (!path) return ''
  if (/^(https?:|blob:|data:)/i.test(path)) return path
  const origin = API_URL.replace(/\/api\/?$/, '')
  return `${origin}/${String(path).replace(/^\//, '')}`
}

function toMenuFormData(payload) {
  const form = new FormData()
  form.append('name', payload.name || '')
  form.append('description', payload.description || '')
  form.append('category', payload.category || '')
  form.append('has_sizes', payload.has_sizes ? '1' : '0')
  form.append('price', String(payload.price ?? 0))
  form.append('sizes', JSON.stringify(payload.sizes || []))
  form.append('ingredients', JSON.stringify(payload.ingredients || []))
  if (payload.imageFile instanceof File) {
    form.append('image', payload.imageFile)
  } else if (payload.image && !String(payload.image).startsWith('blob:')) {
    form.append('image', payload.image)
  }
  return form
}

export const menuApi = {
  list: (params) => api.get('/menu', { params }),
  create: (payload) => api.post('/menu', toMenuFormData(payload)),
  update: (id, payload) => api.post(`/menu/${id}`, toMenuFormData(payload)),
  toggleAvailability: (id) => api.patch(`/menu/${id}/availability`),
  archive: (id) => api.patch(`/menu/${id}/archive`),
  restore: (id) => api.patch(`/menu/${id}/restore`),
}

export const inventoryApi = {
  list: (params) => api.get('/inventory', { params }),
  create: (payload) => api.post('/inventory', payload),
  update: (id, payload) => api.put(`/inventory/${id}`, payload),
  restock: (id, quantity) => api.post(`/inventory/${id}/restock`, { quantity }),
  remove: (id) => api.delete(`/inventory/${id}`),
  logs: (params) => api.get('/inventory/logs', { params }),
}

export const expiringStockApi = {
  list: () => api.get('/inventory/expiring'),
  markWaste: (id, notes) => api.post(`/inventory/${id}/expiring/waste`, { notes }),
  setKitchenPriority: (id, notes) => api.post(`/inventory/${id}/expiring/kitchen-priority`, { notes }),
  setPromo: (id, payload) => api.post(`/inventory/${id}/expiring/promo`, payload),
  resolve: (id, notes) => api.post(`/inventory/${id}/expiring/resolve`, { notes }),
}

export const dispatchApi = {
  get: () => api.get('/dispatch'),
  assign: (orderId, rider_name) => api.post(`/dispatch/${orderId}/assign`, { rider_name }),
  fleet: () => api.get('/dispatch/fleet'),
}

export const trackingApi = {
  show: (orderId) => api.get(`/orders/${orderId}/tracking`),
}

export const deliveryRatesApi = {
  list: () => api.get('/delivery-rates'),
  quote: (km) => api.get('/delivery-rates/quote', { params: { km } }),
  create: (payload) => api.post('/delivery-rates', payload),
  update: (id, payload) => api.put(`/delivery-rates/${id}`, payload),
  remove: (id) => api.delete(`/delivery-rates/${id}`),
}

export const reportsApi = {
  get: (params) => api.get('/reports', { params }),
  generate: (payload) => api.post('/reports/generate', payload),
  delete: (id) => api.delete(`/reports/${id}`),
}

export const customersApi = {
  list: (params) => api.get('/customers', { params }),
  show: (id) => api.get(`/customers/${id}`),
}

export const accountsApi = {
  list: () => api.get('/accounts'),
  createAdmin: (payload) => api.post('/accounts/admins', payload),
  createDriver: (payload) => api.post('/accounts/drivers', payload),
  createCashier: (payload) => api.post('/accounts/cashiers', payload),
  update: (id, payload) => api.put(`/accounts/${id}`, payload),
  updateRoleAccess: (id, role_access) => api.patch(`/accounts/${id}/role-access`, { role_access }),
  block: (id, reason) => api.post(`/accounts/${id}/block`, { reason }),
}

export const archiveApi = {
  list: () => api.get('/archive'),
  restore: (id) => api.post(`/archive/${id}/restore`),
  destroy: (id) => api.delete(`/archive/${id}`),
}

export const driversApi = {
  list: (params) => api.get('/drivers', { params }),
  show: (id) => api.get(`/drivers/${id}`),
  suspend: (id) => api.post(`/drivers/${id}/suspend`),
}

export const blacklistApi = {
  list: (params) => api.get('/blacklist', { params }),
  show: (id) => api.get(`/blacklist/${id}`),
  updateNotes: (id, notes) => api.patch(`/blacklist/${id}/notes`, { notes }),
}

export default api
