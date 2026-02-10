import { useEffect, useState } from 'react'
import './Profile.css'

const API_BASE = '/api'

function Profile() {
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/profile/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
  }, [])

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
            {profile.photo ? (
              <img src={profile.photo} alt="Profile" className="profile-photo-xl" />
            ) : (
              <div className="profile-photo-xl profile-photo-placeholder">
                <i className="fas fa-user"></i>
              </div>
            )}
          </div>
          <div className="profile-hero-text">
            <h2>{profile.full_name || 'Member'}</h2>
            <p>{profile.title || 'Member'} · {profile.role || 'Member'}</p>
            <div className="profile-badges">
              <span className="badge badge-primary">{profile.role || 'Member'}</span>
              <span className="badge badge-success">{profile.cell_name || 'No Cell'}</span>
              <span className="badge badge-purple">{profile.department_name || 'No Department'}</span>
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
            <strong>{profile.cell_name || '-'}</strong>
          </div>
          <div className="stat-card">
            <span>Department</span>
            <strong>{profile.department_name || '-'}</strong>
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
                    value={profile.photo || ''}
                    onChange={(e) => setProfile({ ...profile, photo: e.target.value })}
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
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.mobile || ''}
                  onChange={(e) => setProfile({ ...profile, mobile: e.target.value })}
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
                    value={profile.dob_day || ''}
                    onChange={(e) => setProfile({ ...profile, dob_day: e.target.value })}
                    disabled={!editing}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Month"
                    value={profile.dob_month || ''}
                    onChange={(e) => setProfile({ ...profile, dob_month: e.target.value })}
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
                  value={profile.role || ''}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cell_name || ''}
                  onChange={(e) => setProfile({ ...profile, cell_name: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Venue</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cell_venue || ''}
                  onChange={(e) => setProfile({ ...profile, cell_venue: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Leader</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cell_leader || ''}
                  onChange={(e) => setProfile({ ...profile, cell_leader: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Cell Leader Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.cell_leader_mobile || ''}
                  onChange={(e) => setProfile({ ...profile, cell_leader_mobile: e.target.value })}
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
                  value={profile.department_name || ''}
                  onChange={(e) => setProfile({ ...profile, department_name: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>Department Head / HOD</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.hod_name || ''}
                  onChange={(e) => setProfile({ ...profile, hod_name: e.target.value })}
                  disabled={!editing}
                />
              </div>
              <div className="form-group">
                <label>HOD Mobile</label>
                <input
                  type="text"
                  className="form-control"
                  value={profile.hod_mobile || ''}
                  onChange={(e) => setProfile({ ...profile, hod_mobile: e.target.value })}
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
