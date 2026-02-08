import { useEffect, useState } from 'react'
import './Settings.css'

const API_BASE = '/api'

function Settings() {
  const [logo, setLogo] = useState('/images/logo.png')
  const [logoTitle, setLogoTitle] = useState('Christ Embassy')
  const [logoSubtitle, setLogoSubtitle] = useState('Church Cell Data')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/settings/logo`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.logo) setLogo(data.logo)
      })
      .catch(() => {})
  }, [])

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const logoData = reader.result
      setLogo(logoData)
      const token = localStorage.getItem('token')
      if (!token) return
      await fetch(`${API_BASE}/settings/logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ logo: logoData })
      })
      window.dispatchEvent(new Event('logo-updated'))
    }
    reader.readAsDataURL(file)
  }

  const saveLogoText = () => {
    localStorage.setItem('logoTitle', logoTitle)
    localStorage.setItem('logoSubtitle', logoSubtitle)
    window.dispatchEvent(new Event('logo-updated'))
  }

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="settings-card">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Logo Upload</h2>
          </div>
          <div className="file-upload">
            <label htmlFor="logoUpload" className="file-upload-label">
              <i className="fas fa-upload"></i> Upload Church Logo
            </label>
            <input type="file" id="logoUpload" className="file-upload-input" accept="image/*" onChange={handleLogoUpload} />
          </div>
          <div className="current-logo">
            <p>Current Logo:</p>
            <div id="currentLogoPreview">
              <img src={logo} alt="Current logo" style={{ maxWidth: '120px' }} />
            </div>
          </div>
        </div>

        <div className="settings-card logo-text-settings">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Logo Text Settings</h2>
          </div>
          <div className="form-group">
            <label htmlFor="logoTitle">Church Name</label>
            <input
              type="text"
              id="logoTitle"
              className="form-control"
              value={logoTitle}
              onChange={(e) => setLogoTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="logoSubtitle">Church Subtitle</label>
            <input
              type="text"
              id="logoSubtitle"
              className="form-control"
              value={logoSubtitle}
              onChange={(e) => setLogoSubtitle(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-success" type="button" onClick={saveLogoText}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
