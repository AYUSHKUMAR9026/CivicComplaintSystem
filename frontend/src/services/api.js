import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Evidence paths are stored as /uploads/... by the backend. Use the backend
// origin when the frontend and API are deployed on separate hosts.
export function resolveAssetUrl(path) {
  if (!path) return ''
  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin
  return new URL(path.startsWith('/') ? path : `/${path}`, apiOrigin).href
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Request interceptor to add auth token and clean empty query params
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // Clean empty query parameters to prevent 422 errors on optional fields
    if (config.params && typeof config.params === 'object') {
      const cleanParams = {}
      for (const [key, value] of Object.entries(config.params)) {
        if (value !== '' && value !== null && value !== undefined) {
          cleanParams[key] = value
        }
      }
      config.params = cleanParams
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle token refresh and normalize error messages
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Normalize FastAPI / Pydantic V2 error detail so it is never an unformatted object or array
    if (error.response?.data?.detail !== undefined) {
      const detail = error.response.data.detail
      if (Array.isArray(detail)) {
        const formatted = detail
          .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object') {
              const field = item.loc ? item.loc[item.loc.length - 1] : ''
              const prefix = field && field !== 'body' && field !== 'query' ? `${field}: ` : ''
              return `${prefix}${item.msg || JSON.stringify(item)}`
            }
            return String(item)
          })
          .filter(Boolean)
          .join(', ')
        error.normalizedMessage = formatted || 'Validation error'
      } else if (typeof detail === 'object' && detail !== null) {
        error.normalizedMessage = detail.msg || detail.message || JSON.stringify(detail)
      } else if (typeof detail === 'string') {
        error.normalizedMessage = detail
      }
    } else if (error.message) {
      error.normalizedMessage = error.message
    }

    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, null, {
            headers: { Authorization: `Bearer ${refreshToken}` }
          })
          
          const { access_token, refresh_token } = response.data
          localStorage.setItem('access_token', access_token)
          localStorage.setItem('refresh_token', refresh_token)
          
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

export default api

// API endpoints
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  refresh: (refreshToken) => api.post('/auth/refresh', null, {
    headers: { Authorization: `Bearer ${refreshToken}` }
  }),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  logout: () => api.post('/auth/logout'),
}

export const complaintAPI = {
  create: (formData) => api.post('/complaints', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  list: (params) => api.get('/complaints', { params }),
  listPublic: (params) => api.get('/complaints/public', { params }),
  get: (id) => api.get(`/complaints/${id}`),
  update: (id, data) => api.put(`/complaints/${id}`, data),
  upvote: (id) => api.post(`/complaints/${id}/upvote`),
  removeUpvote: (id) => api.delete(`/complaints/${id}/upvote`),
  categories: () => api.get('/complaints/categories'),
  searchLocations: (query) => api.get('/complaints/locations/search', { params: { q: query, limit: 10 } }),
  getApplicant: (id) => api.get(`/complaints/${id}/applicant`),
  delete: (id) => api.delete(`/complaints/${id}`),
}

export const detectAPI = {
  health: () => api.get('/detect/health'),
  scan: (file, confidence = 0.4) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('confidence', String(confidence))
    return api.post('/detect/scan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },
  road: (file, confidence = 0.4) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('confidence', String(confidence))
    // Hosted inference can cold start; allow more than the 30s client default.
    return api.post('/detect/road', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },
}

export const geocodeAPI = {
  search: (query, limit = 5) => api.get('/geocode/search', { params: { q: query, limit } }),
  reverse: (lat, lon) => api.get('/geocode/reverse', { params: { lat, lon } }),
}

export const priorityAPI = {
  calculate: (data) => api.post('/priority/calculate', data),
  recalculate: (id) => api.post(`/priority/recalculate/${id}`),
  recalculateAll: () => api.post('/priority/recalculate-all'),
  topComplaints: (limit = 20) => api.get('/priority/queue/top', { params: { limit } }),
  queueStats: () => api.get('/priority/queue/stats'),
}

export const adminAPI = {
  stats: () => api.get('/admin/dashboard/stats'),
  complaints: (params) => api.get('/admin/complaints', { params }),
  complaintDetail: (id) => api.get(`/admin/complaints/${id}`),
  applicantDetail: (id) => api.get(`/admin/complaints/${id}/applicant`),
  deleteComplaint: (id) => api.delete(`/admin/complaints/${id}`),
  updateAssessment: (id, data) => api.put(`/admin/complaints/${id}/assessment`, data),
  reassess: (id) => api.post(`/admin/complaints/${id}/reassess`),
  assign: (id, departmentId) => api.put(`/admin/complaints/${id}/assign`, null, { params: { department_id: departmentId } }),
  resolve: (id, notes) => api.put(`/admin/complaints/${id}/resolve`, null, { params: { resolution_notes: notes } }),
  undo: (id) => api.post(`/admin/complaints/${id}/undo`),
  categories: () => api.get('/admin/categories'),
  createCategory: (data) => api.post('/admin/categories', data),
  updateCategory: (id, data) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/admin/categories/${id}`),
  departments: () => api.get('/admin/departments'),
  createDepartment: (data) => api.post('/admin/departments', data),
  reports: {
    resolutionTrend: (days = 30) => api.get('/admin/reports/resolution-time-trend', { params: { days } }),
    byCategory: () => api.get('/admin/reports/complaints-by-category'),
    byDepartment: () => api.get('/admin/reports/complaints-by-department'),
    priorityDistribution: () => api.get('/admin/reports/priority-distribution'),
  },
  clusters: {
    list: () => api.get('/admin/clusters'),
    autoGroup: (radiusKm = 1.0) => api.post('/admin/clusters/auto-group', { radius_km: radiusKm }),
  },
}

export const notificationAPI = {
  list: (unreadOnly = false, limit = 50) => api.get('/notifications', { params: { unread_only: unreadOnly, limit } }),
  get: (id) => api.get(`/notifications/${id}`),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  send: (data) => api.post('/notifications/send', data),
  broadcast: (data) => api.post('/notifications/broadcast', data),
}
