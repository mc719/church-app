import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Departments.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function Departments() {
  const location = useLocation()
  const navigate = useNavigate()
  const [departments, setDepartments] = useState([])
  const [members, setMembers] = useState([])
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [form, setForm] = useState({ name: '', hodTitle: '', hodName: '', hodMobile: '' })
  const [error, setError] = useState('')
  const [activeDepartmentId, setActiveDepartmentId] = useState('')
  const [activeTab, setActiveTab] = useState('members')
  const [showAssignMember, setShowAssignMember] = useState(false)
  const [assignMemberId, setAssignMemberId] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignForm, setAssignForm] = useState({
    title: '',
    name: '',
    role: '',
    gender: '',
    mobile: '',
    email: ''
  })
  const [editingMember, setEditingMember] = useState(null)
  const [deletingMember, setDeletingMember] = useState(null)

  const loadDepartments = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/departments`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return setDepartments([])
      const data = await res.json()
      setDepartments(Array.isArray(data) ? data : [])
    } catch {
      setDepartments([])
    }
  }

  useEffect(() => {
    loadDepartments()
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMembers(Array.isArray(data) ? data : []))
      .catch(() => setMembers([]))
  }, [])

  const departmentIdFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const id = params.get('departmentId')
    return id ? String(id) : ''
  }, [location.search])

  const addFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('add') === '1'
  }, [location.search])

  const clearDeepLink = () => {
    if (!departmentIdFromUrl && !addFromUrl) return
    navigate('/departments', { replace: true })
  }

  useEffect(() => {
    if (!departmentIdFromUrl) return
    const target = departments.find((dept) => String(dept.id) === departmentIdFromUrl)
    if (target) {
      setActiveDepartmentId(String(target.id))
    }
  }, [departmentIdFromUrl, departments])

  useEffect(() => {
    if (!addFromUrl) return
    resetForm()
    setShowAdd(true)
  }, [addFromUrl])

  useEffect(() => {
    if (!departments.length) return
    if (activeDepartmentId && departments.some((dept) => String(dept.id) === String(activeDepartmentId))) return
    setActiveDepartmentId(String(departments[0].id))
  }, [departments, activeDepartmentId])

  const resetForm = () => {
    setForm({ name: '', hodTitle: '', hodName: '', hodMobile: '' })
    setError('')
  }

  const handleAdd = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    setError('')
    const res = await fetch(`${API_BASE}/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form)
    })
    if (!res.ok) {
      setError('Failed to add department')
      return
    }
    const created = await res.json()
    setDepartments((prev) => [created, ...prev])
    window.dispatchEvent(new Event('departments-updated'))
    resetForm()
    setShowAdd(false)
    clearDeepLink()
  }

  const handleUpdate = async (event) => {
    event.preventDefault()
    if (!editingDepartment) return
    const token = localStorage.getItem('token')
    if (!token) return
    setError('')
    const res = await fetch(`${API_BASE}/departments/${editingDepartment.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: editingDepartment.name,
        hodTitle: editingDepartment.hodTitle,
        hodName: editingDepartment.hodName,
        hodMobile: editingDepartment.hodMobile
      })
    })
    if (!res.ok) {
      setError('Failed to update department')
      return
    }
    const updated = await res.json()
    setDepartments((prev) => prev.map((dept) => (String(dept.id) === String(updated.id) ? updated : dept)))
    window.dispatchEvent(new Event('departments-updated'))
    setEditingDepartment(null)
    clearDeepLink()
  }

  const handleAssignMember = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    if (!activeDepartmentId) return
    if (assignMemberId) {
      const res = await fetch(`${API_BASE}/members/${assignMemberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ departmentId: activeDepartmentId })
      })
      if (!res.ok) return
      const updated = await res.json()
      setMembers((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)))
    } else if (showAssignForm && assignForm.name.trim()) {
      const res = await fetch(`${API_BASE}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          departmentId: activeDepartmentId,
          title: assignForm.title,
          name: assignForm.name,
          gender: assignForm.gender,
          mobile: assignForm.mobile,
          email: assignForm.email,
          role: assignForm.role
        })
      })
      if (!res.ok) return
      const created = await res.json()
      setMembers((prev) => [created, ...prev])
    } else {
      return
    }

    setAssignMemberId('')
    setAssignSearch('')
    setShowAssignForm(false)
    setAssignForm({ title: '', name: '', role: '', gender: '', mobile: '', email: '' })
    setShowAssignMember(false)
  }

  const handleMemberSave = async (event) => {
    event.preventDefault()
    if (!editingMember) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/members/${editingMember.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: editingMember.title,
        name: editingMember.name,
        gender: editingMember.gender,
        mobile: editingMember.mobile,
        email: editingMember.email,
        role: editingMember.role,
        departmentId: activeDepartmentId
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setMembers((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)))
    setEditingMember(null)
  }

  const handleMemberDelete = async () => {
    if (!deletingMember) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/members/${deletingMember.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setMembers((prev) => prev.filter((item) => String(item.id) !== String(deletingMember.id)))
    setDeletingMember(null)
  }

  const activeDepartment = useMemo(
    () => departments.find((dept) => String(dept.id) === String(activeDepartmentId)),
    [departments, activeDepartmentId]
  )

  const departmentMembers = useMemo(
    () => members.filter((member) => String(member.departmentId || member.department_id || '') === String(activeDepartmentId)),
    [members, activeDepartmentId]
  )

  const departmentStats = useMemo(() => {
    const totalMembers = departmentMembers.length
    const updatedAt = activeDepartment?.updatedAt || activeDepartment?.updated_at || activeDepartment?.createdAt || activeDepartment?.created_at
    const statusKey = totalMembers ? 'active' : 'inactive'
    const statusLabel = totalMembers ? 'Active' : 'Needs Members'
    return { totalMembers, updatedAt, statusKey, statusLabel }
  }, [departmentMembers, activeDepartment])

  const memberSearchMatches = useMemo(() => {
    const term = assignSearch.trim().toLowerCase()
    if (!term) return []
    return members.filter((member) => {
      const name = String(member.name || '').toLowerCase()
      return name.includes(term)
    })
  }, [assignSearch, members])

  const totalPages = Math.max(1, Math.ceil(departmentMembers.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageMembers = departmentMembers.slice(startIndex, startIndex + PAGE_SIZE)

  const getDepartmentRole = (member) => {
    if (!activeDepartment) return 'Member'
    const hodName = String(activeDepartment.hodName || '').trim().toLowerCase()
    const memberName = String(member.name || '').trim().toLowerCase()
    if (hodName && memberName && hodName === memberName) return 'HOD'
    return member.departmentRole || 'Member'
  }

  useEffect(() => {
    if (!activeDepartment) return
    try {
      const meta = JSON.parse(localStorage.getItem('pageMeta') || '{}')
      const updated = {
        ...meta,
        '/departments': {
          ...(meta['/departments'] || {}),
          label: activeDepartment.name || 'Department'
        }
      }
      localStorage.setItem('pageMeta', JSON.stringify(updated))
      window.dispatchEvent(new Event('page-meta-updated'))
    } catch {}
  }, [activeDepartment])

  return (
    <div className="departments-page">
      {error && <div className="inline-error">{error}</div>}

      {!activeDepartment && (
        <div className="dashboard-note" style={{ marginTop: '16px' }}>
          Select a department to view details.
        </div>
      )}

      {activeDepartment && (
        <div className="department-details">
          <div className="department-hero">
            <div className="department-hero-main">
              <div className="department-hero-title">
                <h1>{activeDepartment.name || 'Department'}</h1>
                <span className={`status-pill status-${departmentStats.statusKey}`}>{departmentStats.statusLabel}</span>
              </div>
              <div className="department-hero-meta">
                <span><i className="fas fa-user-tie"></i> {activeDepartment.hodName || 'No HOD'}</span>
                <span><i className="fas fa-phone"></i> {activeDepartment.hodMobile || '-'}</span>
                <span><i className="fas fa-calendar"></i> {departmentStats.updatedAt ? new Date(departmentStats.updatedAt).toLocaleDateString() : '-'}</span>
              </div>
            </div>
            <div className="department-hero-actions">
              <button className="btn ghost-btn" type="button" onClick={() => setEditingDepartment({ ...activeDepartment })}>
                <i className="fas fa-edit"></i> Edit
              </button>
            </div>
          </div>

          <div className="department-stats-row">
            <div className="department-stat-card">
              <div className="department-stat-icon"><i className="fas fa-users"></i></div>
              <div>
                <div className="department-stat-label">Members</div>
                <div className="department-stat-value">{departmentStats.totalMembers}</div>
              </div>
            </div>
            <div className="department-stat-card">
              <div className="department-stat-icon"><i className="fas fa-user-tie"></i></div>
              <div>
                <div className="department-stat-label">HOD</div>
                <div className="department-stat-value">{activeDepartment.hodName || '-'}</div>
              </div>
            </div>
            <div className="department-stat-card">
              <div className="department-stat-icon"><i className="fas fa-clock"></i></div>
              <div>
                <div className="department-stat-label">Updated</div>
                <div className="department-stat-value">{departmentStats.updatedAt ? new Date(departmentStats.updatedAt).toLocaleDateString() : '-'}</div>
              </div>
            </div>
          </div>

          <div className="cell-summary-card">
            <div className="cell-summary-grid">
              <div>
                <div className="cell-summary-label">Department Name</div>
                <div className="cell-summary-value">{activeDepartment.name || '-'}</div>
              </div>
              <div>
                <div className="cell-summary-label">HOD</div>
                <div className="cell-summary-value">
                  {activeDepartment.hodTitle ? `${activeDepartment.hodTitle} ` : ''}{activeDepartment.hodName || '-'}
                </div>
              </div>
              <div>
                <div className="cell-summary-label">HOD Mobile</div>
                <div className="cell-summary-value">{activeDepartment.hodMobile || '-'}</div>
              </div>
            </div>
            <div className="cell-summary-description">
              <div className="cell-summary-label">Description</div>
              <div className="cell-summary-value">{activeDepartment.description || '-'}</div>
            </div>
          </div>

          <div className="cell-tabs" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="cell-tabs-group">
              <button
                className={`cell-tab-btn${activeTab === 'members' ? ' active' : ''}`}
                type="button"
                onClick={() => setActiveTab('members')}
              >
                Members List
              </button>
            </div>
            {activeTab === 'members' && (
              <div className="cell-tabs-actions">
                <button className="btn btn-success" type="button" onClick={() => setShowAssignMember(true)}>
                  <i className="fas fa-user-plus"></i> Add Member
                </button>
              </div>
            )}
          </div>

          {activeTab === 'members' && (
            <div className="table-container" style={{ marginTop: '16px' }}>
              <table className="mobile-grid-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Gender</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageMembers.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--gray-color)' }}>
                        No members assigned to this department.
                      </td>
                    </tr>
                  )}
                  {pageMembers.map((member) => (
                    <tr key={member.id}>
                      <td data-label="Title">{member.title || '-'}</td>
                      <td data-label="Name">{member.name || '-'}</td>
                      <td data-label="Role">{getDepartmentRole(member)}</td>
                      <td data-label="Gender">{member.gender || '-'}</td>
                      <td data-label="Mobile">{member.mobile ? <a href={`tel:${member.mobile}`}>{member.mobile}</a> : '-'}</td>
                      <td data-label="Email">{member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : '-'}</td>
                      <td data-label="Actions">
                        <div className="action-buttons">
                          <button
                            className="action-btn edit-btn"
                            type="button"
                            onClick={() => setEditingMember({ ...member })}
                          >
                            <i className="fas fa-edit"></i> Edit
                          </button>
                          <button
                            className="action-btn delete-btn"
                            type="button"
                            onClick={() => setDeletingMember(member)}
                          >
                            <i className="fas fa-trash"></i> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'members' && (
            <div className="table-pagination">
              <button
                className="btn"
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Prev
              </button>
              <span className="pagination-label">Page {currentPage} of {totalPages}</span>
              <button
                className="btn"
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay active" onClick={() => { setShowAdd(false); clearDeepLink() }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Department</h3>
              <button className="close-modal" type="button" onClick={() => { setShowAdd(false); clearDeepLink() }}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAdd}>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={form.hodTitle}
                    onChange={(e) => setForm((prev) => ({ ...prev, hodTitle: e.target.value }))}
                  >
                    <option value="">Select Title</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Dcn">Dcn</option>
                    <option value="Dcns">Dcns</option>
                    <option value="Pastor">Pastor</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>HOD Name</label>
                  <input
                    className="form-control"
                    value={form.hodName}
                    onChange={(e) => setForm((prev) => ({ ...prev, hodName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>HOD Mobile</label>
                  <input
                    className="form-control"
                    value={form.hodMobile}
                    onChange={(e) => setForm((prev) => ({ ...prev, hodMobile: e.target.value }))}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => { setShowAdd(false); clearDeepLink() }}>
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

      {editingDepartment && (
        <div className="modal-overlay active" onClick={() => setEditingDepartment(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Department</h3>
                    <button className="close-modal" type="button" onClick={() => { setEditingDepartment(null); clearDeepLink() }}>
                      &times;
                    </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleUpdate}>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={editingDepartment.name || ''}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={editingDepartment.hodTitle || ''}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, hodTitle: e.target.value })}
                  >
                    <option value="">Select Title</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Dcn">Dcn</option>
                    <option value="Dcns">Dcns</option>
                    <option value="Pastor">Pastor</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>HOD Name</label>
                  <input
                    className="form-control"
                    value={editingDepartment.hodName || ''}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, hodName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>HOD Mobile</label>
                  <input
                    className="form-control"
                    value={editingDepartment.hodMobile || ''}
                    onChange={(e) => setEditingDepartment({ ...editingDepartment, hodMobile: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => { setEditingDepartment(null); clearDeepLink() }}>
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

      {showAssignMember && (
        <div className="modal-overlay active" onClick={() => setShowAssignMember(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Member to Department</h3>
              <button className="close-modal" type="button" onClick={() => setShowAssignMember(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAssignMember}>
                <div className="form-group">
                  <label>Member Name</label>
                  <input
                    className="form-control"
                    placeholder="Type member name..."
                    value={assignSearch}
                    onChange={(e) => {
                      const value = e.target.value
                      setAssignSearch(value)
                      setAssignMemberId('')
                      const match = members.find((member) => String(member.name || '').toLowerCase() === value.trim().toLowerCase())
                      if (match) {
                        setAssignMemberId(String(match.id))
                        setShowAssignForm(false)
                        setAssignForm((prev) => ({ ...prev, name: match.name || value }))
                      } else {
                        setShowAssignForm(true)
                        setAssignForm((prev) => ({ ...prev, name: value }))
                      }
                    }}
                  />
                  {memberSearchMatches.length > 0 && (
                    <div className="suggestions-list">
                      {memberSearchMatches.slice(0, 6).map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="suggestion-item"
                          onClick={() => {
                            setAssignSearch(member.name || '')
                            setAssignMemberId(String(member.id))
                            setShowAssignForm(false)
                            setAssignForm((prev) => ({ ...prev, name: member.name || '' }))
                          }}
                        >
                          {member.title ? `${member.title} ` : ''}{member.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {showAssignForm && (
                  <>
                    <div className="form-group">
                      <label>Role</label>
                      <input
                        className="form-control"
                        value={assignForm.role}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, role: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Gender</label>
                      <input
                        className="form-control"
                        value={assignForm.gender}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, gender: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Mobile</label>
                      <input
                        className="form-control"
                        value={assignForm.mobile}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, mobile: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        className="form-control"
                        value={assignForm.email}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAssignMember(false)}>
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

      {editingMember && (
        <div className="modal-overlay active" onClick={() => setEditingMember(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Member</h3>
              <button className="close-modal" type="button" onClick={() => setEditingMember(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleMemberSave}>
                <div className="form-group">
                  <label>Title</label>
                  <input
                    className="form-control"
                    value={editingMember.title || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, title: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={editingMember.name || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <input
                    className="form-control"
                    value={editingMember.gender || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, gender: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Mobile</label>
                  <input
                    className="form-control"
                    value={editingMember.mobile || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, mobile: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    value={editingMember.email || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Cell Role</label>
                  <input
                    className="form-control"
                    value={editingMember.role || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingMember(null)}>
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

      {deletingMember && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingMember(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {deletingMember.name || 'this member'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingMember(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleMemberDelete}>
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

export default Departments
