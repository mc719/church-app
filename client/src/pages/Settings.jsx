import { useEffect, useMemo, useState } from 'react'
import './Settings.css'

const API_BASE = '/api'

function Settings() {
  const [logo, setLogo] = useState('/images/logo.png')
  const [logoTitle, setLogoTitle] = useState('Christ Embassy')
  const [logoSubtitle, setLogoSubtitle] = useState('Church Cell Data')
  const [savedLogoTitle, setSavedLogoTitle] = useState('Christ Embassy')
  const [savedLogoSubtitle, setSavedLogoSubtitle] = useState('Church Cell Data')
  const [roles, setRoles] = useState([])
  const [newRole, setNewRole] = useState('')
  const [editingRole, setEditingRole] = useState(null)
  const [deletingRole, setDeletingRole] = useState(null)

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

    const cachedTitle = localStorage.getItem('logoTitle') || 'Christ Embassy'
    const cachedSubtitle = localStorage.getItem('logoSubtitle') || 'Church Cell Data'
    setLogoTitle(cachedTitle)
    setLogoSubtitle(cachedSubtitle)
    setSavedLogoTitle(cachedTitle)
    setSavedLogoSubtitle(cachedSubtitle)

    fetch(`${API_BASE}/roles`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]))

  }, [])

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const logoData = reader.result
      setLogo(logoData)
      localStorage.setItem('logoImage', logoData)
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(`${API_BASE}/settings/logo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ logo: logoData })
      })
      if (res.ok) {
        showToast('Logo updated')
      }
      window.dispatchEvent(new Event('logo-updated'))
    }
    reader.readAsDataURL(file)
  }

  const saveLogoText = () => {
    localStorage.setItem('logoTitle', logoTitle)
    localStorage.setItem('logoSubtitle', logoSubtitle)
    setSavedLogoTitle(logoTitle)
    setSavedLogoSubtitle(logoSubtitle)
    window.dispatchEvent(new Event('logo-updated'))
    showToast('Branding text saved')
  }

  const handleAddRole = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token || !newRole.trim()) return
    const res = await fetch(`${API_BASE}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: newRole.trim() })
    })
    if (!res.ok) return
    const created = await res.json()
    setRoles((prev) => [...prev, created])
    setNewRole('')
    showToast('Role added')
  }

  const handleUpdateRole = async (event) => {
    event.preventDefault()
    if (!editingRole) return
    const token = localStorage.getItem('token')
    if (!token || !editingRole.name?.trim()) return
    const res = await fetch(`${API_BASE}/roles/${editingRole.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: editingRole.name.trim() })
    })
    if (!res.ok) return
    const updated = await res.json()
    setRoles((prev) => prev.map((role) => (String(role.id) === String(updated.id) ? updated : role)))
    setEditingRole(null)
    showToast('Role updated')
  }

  const handleDeleteRole = async () => {
    if (!deletingRole) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/roles/${deletingRole.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Failed to delete role')
      return
    }
    setRoles((prev) => prev.filter((role) => String(role.id) !== String(deletingRole.id)))
    setDeletingRole(null)
    showToast('Role deleted')
  }

  return (
    <div className="settings-page">
      <div className="settings-quick-actions">
        <button className="btn" type="button" onClick={() => document.getElementById('settings-branding')?.scrollIntoView({ behavior: 'smooth' })}>
          Branding
        </button>
        <button className="btn" type="button" onClick={() => document.getElementById('settings-roles')?.scrollIntoView({ behavior: 'smooth' })}>
          Roles
        </button>
      </div>

      <div className="settings-grid">
        <div className="settings-card" id="settings-branding">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Branding & Appearance</h2>
          </div>
          <div className="file-upload">
            <label htmlFor="logoUpload" className="file-upload-label">
              <i className="fas fa-upload"></i> Upload Church Logo
            </label>
            <input type="file" id="logoUpload" className="file-upload-input" accept="image/*" onChange={handleLogoUpload} />
          </div>
          <div className="settings-preview-card">
            <img src={logo} alt="Current logo" style={{ maxWidth: '72px' }} />
            <div>
              <div className="settings-preview-title">{logoTitle}</div>
              <div className="settings-preview-subtitle">{logoSubtitle}</div>
            </div>
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
              Save Branding
            </button>
          </div>
        </div>

        <div className="settings-card" id="settings-roles">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Roles</h2>
          </div>
          <form onSubmit={handleAddRole} className="form-group settings-role-add">
            <input
              className="form-control"
              placeholder="New role name"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            />
            <button className="btn btn-success" type="submit">
              Add
            </button>
          </form>
          <div className="table-container" style={{ marginTop: '12px' }}>
            <table className="mobile-grid-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 && (
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'center', padding: '24px', color: 'var(--gray-color)' }}>
                      No roles found.
                    </td>
                  </tr>
                )}
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td data-label="Role">{role.name}</td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" type="button" onClick={() => setEditingRole({ ...role })}>
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button className="action-btn delete-btn" type="button" onClick={() => setDeletingRole(role)}>
                          <i className="fas fa-trash"></i> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {editingRole && (
        <div className="modal-overlay active" onClick={() => setEditingRole(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Role</h3>
              <button className="close-modal" type="button" onClick={() => setEditingRole(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleUpdateRole}>
                <div className="form-group">
                  <label>Role Name</label>
                  <input
                    className="form-control"
                    value={editingRole.name || ''}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingRole(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-success" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deletingRole && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingRole(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">Delete role {deletingRole.name}?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingRole(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleDeleteRole}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
