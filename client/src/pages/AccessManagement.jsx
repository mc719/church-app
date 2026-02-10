import { useEffect, useState } from 'react'
import './AccessManagement.css'

const API_BASE = '/api'
const PAGE_SIZE = 20
const MENU_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'members', label: 'Members' },
  { id: 'first-timers', label: 'First-Timers' },
  { id: 'birthdays', label: 'Birthdays' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'page-management', label: 'Page Management' },
  { id: 'access-management', label: 'Access Management' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'settings', label: 'Settings' },
  { id: 'cells', label: 'Cells' },
  { id: 'reports', label: 'Reports' }
]

function AccessManagement() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [page, setPage] = useState(1)
  const [editingUser, setEditingUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [allowedMenus, setAllowedMenus] = useState([])
  const [allowAll, setAllowAll] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    Promise.all([
      fetch(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/roles`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([usersData, rolesData]) => {
        setUsers(Array.isArray(usersData) ? usersData : [])
        setRoles(Array.isArray(rolesData) ? rolesData : [])
      })
      .catch(() => {
        setUsers([])
        setRoles([])
      })
  }, [])

  const toAllowedMenus = (restrictedMenus) => {
    if (!restrictedMenus || restrictedMenus.length === 0) return MENU_OPTIONS.map((m) => m.id)
    const restrictedSet = new Set(restrictedMenus)
    return MENU_OPTIONS.map((m) => m.id).filter((id) => !restrictedSet.has(id))
  }

  const toRestrictedMenus = (allowedIds) => {
    if (allowAll) return []
    const allowedSet = new Set(allowedIds)
    return MENU_OPTIONS.map((m) => m.id).filter((id) => !allowedSet.has(id))
  }

  const openEdit = (user) => {
    const allowed = toAllowedMenus(user.restrictedMenus)
    setAllowAll(user.restrictedMenus?.length === 0)
    setAllowedMenus(allowed)
    setEditingUser({ ...user, password: '' })
  }

  const handleDelete = async () => {
    if (!deletingUser) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/users/${deletingUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setUsers((prev) => prev.filter((u) => String(u.id) !== String(deletingUser.id)))
    setDeletingUser(null)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editingUser) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/users/${editingUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        username: editingUser.username,
        email: editingUser.email,
        password: editingUser.password || undefined,
        role: editingUser.role,
        status: editingUser.status,
        restrictedMenus: toRestrictedMenus(allowedMenus)
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setUsers((prev) => prev.map((u) => (String(u.id) === String(updated.id) ? updated : u)))
    setEditingUser(null)
  }

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageUsers = users.slice(startIndex, startIndex + PAGE_SIZE)

  return (
    <div className="access-page">
      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Password</th>
                <th>Role</th>
                <th>Allowed Menus</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
          </thead>
          <tbody>
            {pageUsers.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No users found.
                </td>
              </tr>
            )}
            {pageUsers.map((user) => (
                <tr key={user.id}>
                  <td data-label="Name">{user.name || '-'}</td>
                  <td data-label="Username">{user.username}</td>
                  <td data-label="Email">
                    {user.email ? <a href={`mailto:${user.email}`}>{user.email}</a> : '-'}
                  </td>
                <td data-label="Password">******</td>
                <td data-label="Role">{user.role}</td>
                <td data-label="Allowed Menus">
                  {user.restrictedMenus && user.restrictedMenus.length
                    ? toAllowedMenus(user.restrictedMenus).map((id) => MENU_OPTIONS.find((m) => m.id === id)?.label || id).join(', ')
                    : 'All'}
                </td>
                <td data-label="Status">{user.status ? 'Active' : 'Inactive'}</td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button className="action-btn edit-btn" type="button" onClick={() => openEdit(user)}>
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button className="action-btn delete-btn" type="button" onClick={() => setDeletingUser(user)}>
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button
          className="btn"
          type="button"
          disabled={currentPage === 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Prev
        </button>
        <span className="pagination-label">
          Page {currentPage} of {totalPages}
        </span>
        <button
          className="btn"
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next
        </button>
      </div>

      {editingUser && (
        <div className="modal-overlay active" onClick={() => setEditingUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit User</h3>
              <button className="close-modal" type="button" onClick={() => setEditingUser(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Username</label>
                  <input
                    className="form-control"
                    value={editingUser.username || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Password (leave blank to keep)</label>
                  <input
                    type="password"
                    className="form-control"
                    value={editingUser.password || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    className="form-control"
                    value={editingUser.role || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    {roles.length === 0 && (
                      <option value="">No roles</option>
                    )}
                    {roles.map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    className="form-control"
                    value={editingUser.status ? 'active' : 'inactive'}
                    onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value === 'active' })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Allowed Menus</label>
                  <div className="allowed-menus">
                    <label className="allowed-menu-item">
                      <input
                        type="checkbox"
                        checked={allowAll}
                        onChange={(e) => {
                          setAllowAll(e.target.checked)
                          if (e.target.checked) {
                            setAllowedMenus(MENU_OPTIONS.map((m) => m.id))
                          }
                        }}
                      />
                      <span>All</span>
                    </label>
                    {!allowAll &&
                      MENU_OPTIONS.map((menu) => (
                        <label className="allowed-menu-item" key={menu.id}>
                          <input
                            type="checkbox"
                            checked={allowedMenus.includes(menu.id)}
                            onChange={(e) => {
                              setAllowedMenus((prev) =>
                                e.target.checked
                                  ? [...prev, menu.id]
                                  : prev.filter((id) => id !== menu.id)
                              )
                            }}
                          />
                          <span>{menu.label}</span>
                        </label>
                      ))}
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingUser(null)}>
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

      {deletingUser && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {deletingUser.username || 'this user'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingUser(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleDelete}>
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

export default AccessManagement
