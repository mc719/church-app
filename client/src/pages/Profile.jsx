import { useEffect, useState } from 'react'
import './Profile.css'

const API_BASE = '/api'

function Profile() {
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)

  const photoSrc = profile?.photoData || profile?.photo || ''
  const displayName = profile?.fullName || profile?.full_name || 'Member'
  const displayRole = profile?.roleTitle || profile?.role || 'Member'
  const displayCell = profile?.cellName || profile?.cell_name || ''
  const displayDepartment = profile?.departmentName || profile?.department_name || ''

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
  }, [])

  const setDobPart = (field, value) => {
    const next = { ...(profile || {}), [field]: value }
    const month = String(next.dobMonth || '').padStart(2, '0')
    const day = String(next.dobDay || '').padStart(2, '0')
    next.dateOfBirth = month && day ? `${month}-${day}` : null
    setProfile(next)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!profile) return
    const token = localStorage.getItem('token')
    if (!token) return
    const response = await fetch(`${API_BASE}/profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(profile)
    })
    if (!response.ok) return
    const updated = await response.json()
    setProfile(updated)
    setEditing(false)
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <div className="dashboard-note">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-hero-bg"></div>
        <div className="profile-hero-content">
          <div className="profile-avatar">
            {photoSrc ? (
              <img src={photoSrc} alt="Profile" className="profile-photo-xl" />
            ) : (
              <div className="profile-photo-xl profile-photo-placeholder">
                <i className="fas fa-user"></i>
              </div>
            )}
          </div>
          <div className="profile-hero-text">
            <h2>{displayName}</h2>
            <p>{profile.title || 'Member'} · {displayRole}</p>
            <div className="profile-badges">
              <span className="badge badge-primary">{displayRole}</span>
              <span className="badge badge-success">{displayCell || 'No Cell'}</span>
              <span className="badge badge-purple">{displayDepartment || 'No Department'}</span>
            </div>
          </div>
          <div className="profile-hero-actions">
            <button className="btn" type="button" onClick={() => setEditing((prev) => !prev)}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      <form className={`profile-form ${editing ? 'edit-mode' : 'view-mode'}`} onSubmit={handleSave}>
        <div className="profile-stats">
          <div className="stat-card">
            <span>Cell</span>
            <strong>{displayCell || '-'}</strong>
          </div>
          <div className="stat-card">
            <span>Department</span>
            <strong>{displayDepartment || '-'}</strong>
          </div>
          <div className="stat-card">
            <span>Email</span>
            <strong>{profile.email || '-'}</strong>
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-card profile-section card-personal">
            <div className="card-header">
              <h3>Personal Information</h3>
              {editing && (
                <div className="form-group inline-field">
                  <label>Photo URL</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Photo URL"
                    value={profile.photoData || ''}
                    onChange={(e) => setProfile({ ...profile, photoData: e.target.value })}
                  />
                </div>
              )}
            </div>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.title || ''}
                  onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.fullName || ''}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Date of Birth</label>
                <div className="profile-dob-row">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Day"
                    value={profile.dobDay || ''}
                    onChange={(e) => setDobPart('dobDay', e.target.value)}
                    disabled={!editing}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Month"
                    value={profile.dobMonth || ''}
                    onChange={(e) => setDobPart('dobMonth', e.target.value)}
                    disabled={!editing}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.address || ''}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Postcode</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.postcode || ''}
                  onChange={(e) => setProfile({ ...profile, postcode: e.target.value })}
                  disabled={!editing}
                />
              </div>
            </div>

            <div className="profile-card profile-section card-cell">
              <h3>Cell</h3>
              <div className="form-group">
                <label>Role</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.roleTitle || ''}
                  onChange={(e) => setProfile({ ...profile, roleTitle: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cellName || ''}
                  onChange={(e) => setProfile({ ...profile, cellName: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Venue</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cellVenue || ''}
                  onChange={(e) => setProfile({ ...profile, cellVenue: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Leader</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cellLeader || ''}
                  onChange={(e) => setProfile({ ...profile, cellLeader: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Leader Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cellLeaderMobile || ''}
                  onChange={(e) => setProfile({ ...profile, cellLeaderMobile: e.target.value })}
                  disabled={!editing}
                />
              </div>
            </div>

            <div className="profile-card profile-section card-department">
              <h3>Department</h3>
              <div className="form-group">
                <label>Department Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.departmentName || ''}
                  onChange={(e) => setProfile({ ...profile, departmentName: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Department Head / HOD</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.hodName || ''}
                  onChange={(e) => setProfile({ ...profile, hodName: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>HOD Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.hodMobile || ''}
                  onChange={(e) => setProfile({ ...profile, hodMobile: e.target.value })}
                  disabled={!editing}
                />
              </div>
            </div>
        </div>
        {editing && (
          <div className="profile-actions-bar">
            <button type="submit" className="btn btn-success">
              Save Profile
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

export default Profile

