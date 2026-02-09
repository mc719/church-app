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
window.fetch = async (input, init) => {
  const response = await originalFetch(input, init)
  const url = typeof input === 'string' ? input : input?.url || ''
  if (response.status === 401 && !url.includes('/api/login') && !url.includes('/api/access/verify')) {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('restrictedMenus')
    window.dispatchEvent(new Event('auth-changed'))
    showToast('Session expired. Please log in again.')
    if (!window.location.pathname.endsWith('/app/login')) {
      setTimeout(() => {
        window.location.href = '/app/login'
      }, 800)
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
