import { useEffect, useState } from 'react'
import './Notifications.css'

const API_BASE = '/api'

function Notifications() {
  const [activeTab, setActiveTab] = useState('list')
  const [notifications, setNotifications] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [users, setUsers] = useState([])
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [targets, setTargets] = useState([])
  const [activeNotification, setActiveNotification] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [form, setForm] = useState({
    roles: [],
    targets: [],
    title: '',
    message: '',
    type: 'info'
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`${API_BASE}/notifications`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/users`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/members`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/roles`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([notes, usersData, membersData, rolesData]) => {
        setNotifications(Array.isArray(notes) ? notes : [])
        setUsers(Array.isArray(usersData) ? usersData : [])
        setMembers(Array.isArray(membersData) ? membersData : [])
        setRoles(Array.isArray(rolesData) ? rolesData : [])
      })
      .catch(() => {
        setNotifications([])
        setUsers([])
        setMembers([])
        setRoles([])
      })
  }, [])

    useEffect(() => {
    const roleTargets = []
    const roles = form.roles || []
    roles.forEach((roleName) => {
      const normalized = String(roleName || '').trim().toLowerCase()
      if (normalized === 'cell leader') {
        members
          .filter((m) => String(m.role || '').trim().toLowerCase() === 'cell leader')
          .forEach((m) => {
            const user = users.find((u) => u.email && m.email && u.email === m.email)
            if (!user) return
            const cellLabel = m.cellName ? ` - ${m.cellName}` : ''
            roleTargets.push({ id: user.id, label: `${m.name}${cellLabel} (Cell Leader)` })
          })
      } else {
        users
          .filter((u) => String(u.role || '').trim().toLowerCase() === normalized)
          .forEach((u) => {
            roleTargets.push({ id: u.id, label: `${u.username} (${roleName})` })
          })
      }
    })
    setTargets(roleTargets)
    setForm((prev) => ({ ...prev, targets: [] }))
  }, [form.roles, users, members])

  const toggleSelectAll = (checked) => {
    if (!checked) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(notifications.map((n) => String(n.id))))
  }

  const toggleSelect = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(String(id))
      else next.delete(String(id))
      return next
    })
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    const token = localStorage.getItem('token')
    if (!token) return
    const ids = Array.from(selected)
    const res = await fetch(`${API_BASE}/notifications`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ids })
    })
    if (!res.ok) return
    setNotifications((prev) => prev.filter((n) => !selected.has(String(n.id))))
    setSelected(new Set())
    setShowDeleteConfirm(false)
  }

  const handleSend = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: form.title,
        message: form.message,
        type: form.type,
        roles: form.roles,
        targetIds: form.targets
      })
    })
    if (!res.ok) return
    await res.json().catch(() => null)
    setForm({ roles: [], targets: [], title: '', message: '', type: 'info' })
    setActiveTab('list')
  }

  const markRead = async (note) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const endpoint = note.readAt || note.read_at ? 'unread' : 'read'
    const res = await fetch(`${API_BASE}/notifications/${note.id}/${endpoint}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setNotifications((prev) =>
      prev.map((n) =>
        String(n.id) === String(note.id)
          ? { ...n, readAt: (note.readAt || note.read_at) ? null : new Date().toISOString() }
          : n
      )
    )
  }

  const openNotification = async (note) => {
    setActiveNotification(note)
    if (note.readAt || note.read_at) return
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/notifications/${note.id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      setNotifications((prev) =>
        prev.map((n) =>
          String(n.id) === String(note.id)
            ? { ...n, readAt: new Date().toISOString() }
            : n
        )
      )
    } catch {}
  }

  const closeNotification = () => {
    setActiveNotification(null)
  }

  return (
    <div className="notifications-page">
      <div className="cell-tabs">
        <button
          className={`cell-tab-btn${activeTab === 'list' ? ' active' : ''}`}
          onClick={() => setActiveTab('list')}
          type="button"
        >
          All Notifications
        </button>
        <button
          className={`cell-tab-btn${activeTab === 'send' ? ' active' : ''}`}
          onClick={() => setActiveTab('send')}
          type="button"
        >
          Send Notification
        </button>
        <div className="cell-tabs-actions">
          <button className="btn btn-danger" type="button" onClick={() => setShowDeleteConfirm(true)}>
            <i className="fas fa-trash"></i> Delete Selected
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="cell-tab-content active">
          <div className="table-container">
            <table className="mobile-grid-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === notifications.length}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th>Title</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                      No notifications found.
                    </td>
                  </tr>
                )}
                {notifications.map((note) => (
                  <tr key={note.id} onClick={() => openNotification(note)} style={{ cursor: 'pointer' }}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        checked={selected.has(String(note.id))}
                        onChange={(e) => toggleSelect(note.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td data-label="Title">{note.title}</td>
                    <td data-label="Message">{note.message}</td>
                    <td data-label="Status">{note.readAt || note.read_at ? 'Read' : 'Unread'}</td>
                    <td data-label="Created">{note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}</td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button
                          className="action-btn edit-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            markRead(note)
                          }}
                        >
                          {note.readAt || note.read_at ? 'Mark Unread' : 'Mark Read'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'send' && (
        <div className="cell-tab-content active">
          <div className="table-container" style={{ padding: '24px' }}>
            <form onSubmit={handleSend}>
              <div className="form-group">
                <label>Send To (Roles) *</label>
                <select
                  className="form-control"
                  multiple
                  value={form.roles}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      roles: Array.from(e.target.selectedOptions).map((o) => o.value)
                    }))
                  }
                  required
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Target *</label>
                <select
                  className="form-control"
                  multiple
                  value={form.targets}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      targets: Array.from(e.target.selectedOptions).map((o) => o.value)
                    }))
                  }
                  required
                >
                  {targets.length === 0 && <option value="" disabled>No targets</option>}
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>{target.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Message *</label>
                <textarea
                  className="form-control"
                  rows="4"
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  className="form-control"
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-success">
                  <i className="fas fa-paper-plane"></i> Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeNotification && (
        <div className="modal-overlay active" onClick={closeNotification}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{activeNotification.title || 'Notification'}</h3>
              <button className="close-modal" type="button" onClick={closeNotification}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {activeNotification.message || ''}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {selected.size} selected notification{selected.size === 1 ? '' : 's'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleDeleteSelected}>
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

export default Notifications


