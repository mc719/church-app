import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/main.css'
import App from './App.jsx'

const showToast = (message) => {
  let toast = document.getElementById('appToast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'appToast'
    toast.className = 'toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 3000)
}

const originalFetch = window.fetch.bind(window)
let refreshPromise = null

const attemptRefresh = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const res = await originalFetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })
      if (!res.ok) {
        throw new Error('refresh_failed')
      }
      const data = await res.json().catch(() => ({}))
      if (data?.token) {
        localStorage.setItem('token', data.token)
      }
      if (data?.username) {
        localStorage.setItem('username', data.username)
      }
      if (data?.role) {
        localStorage.setItem('role', data.role)
      }
      window.dispatchEvent(new Event('auth-changed'))
      return true
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

window.fetch = async (input, init) => {
  const reqInit = { ...(init || {}), credentials: 'include' }
  const token = localStorage.getItem('token')
  const isApiRequest =
    (typeof input === 'string' && input.startsWith('/api/')) ||
    (typeof input !== 'string' && String(input?.url || '').includes('/api/'))
  if (token && isApiRequest) {
    const headers = new Headers(reqInit.headers || {})
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    reqInit.headers = headers
  }
  let response = await originalFetch(input, reqInit)
  const url = typeof input === 'string' ? input : input?.url || ''
  const method = (reqInit?.method || 'GET').toUpperCase()

  if (!response.ok && method !== 'GET') {
    try {
      const cloned = response.clone()
      const data = await cloned.json()
      if (data?.error) {
        showToast(data.error)
      } else {
        showToast(`Request failed (${response.status})`)
      }
    } catch {
      showToast(`Request failed (${response.status})`)
    }
  }

  if (response.status === 401 && !url.includes('/api/login') && !url.includes('/api/access/verify')) {
    const isAuthRefresh = url.includes('/api/auth/refresh')
    const alreadyRetried = Boolean(reqInit?.__retried)
    if (!isAuthRefresh && !alreadyRetried) {
      try {
        await attemptRefresh()
        const retryInit = { ...reqInit, __retried: true }
        response = await originalFetch(input, retryInit)
      } catch {
        // fall through to forced logout
      }
    }
    if (response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      localStorage.removeItem('restrictedMenus')
      window.dispatchEvent(new Event('auth-changed'))
      showToast('Session expired. Please log in again.')
      if (!window.location.pathname.endsWith('/login')) {
        setTimeout(() => {
          window.location.href = '/login'
        }, 800)
      }
    }
  }
  return response
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
