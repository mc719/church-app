import { useEffect, useState } from 'react'

const API_BASE = '/api'

function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoSrc, setLogoSrc] = useState(() => localStorage.getItem('logoImage') || '')
  const [logoTitle, setLogoTitle] = useState('Christ Embassy')
  const [logoSubtitle, setLogoSubtitle] = useState('Church Cell Data')

  useEffect(() => {
    const applyLogoText = () => {
      setLogoTitle(localStorage.getItem('logoTitle') || 'Christ Embassy')
      setLogoSubtitle(localStorage.getItem('logoSubtitle') || 'Church Cell Data')
    }

    const fetchLogo = async () => {
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const res = await fetch(`${API_BASE}/settings/logo`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) return
        const data = await res.json()
        if (data?.logo) {
          setLogoSrc(data.logo)
          localStorage.setItem('logoImage', data.logo)
        }
      } catch {}
    }

    applyLogoText()
    fetchLogo()

    const handleLogoUpdate = () => {
      applyLogoText()
      fetchLogo()
    }

    window.addEventListener('logo-updated', handleLogoUpdate)
    return () => window.removeEventListener('logo-updated', handleLogoUpdate)
  }, [])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password
        })
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Login failed')
      }
      const data = await response.json()
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.username)
      localStorage.setItem('role', data.role)
      localStorage.setItem('restrictedMenus', JSON.stringify(data.restrictedMenus || []))
      window.dispatchEvent(new Event('auth-changed'))
      window.location.href = '/app'
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-modal active">
        <div className="login-container">
        <div className="login-logo">
          <img src={logoSrc} alt="Logo" />
        </div>
        <div className="login-header">
          <h2 id="loginTitle">Welcome to {logoTitle}</h2>
          <p id="loginSubtitle">{logoSubtitle}</p>
        </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                className="form-control"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
