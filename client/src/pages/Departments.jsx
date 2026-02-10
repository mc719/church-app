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
  const [form, setForm] = useState({ name: '', hodName: '', hodMobile: '' })
  const [error, setError] = useState('')
  const [activeDepartmentId, setActiveDepartmentId] = useState('')
  const [activeTab, setActiveTab] = useState('members')
  const [showAssignMember, setShowAssignMember] = useState(false)
  const [assignMemberId, setAssignMemberId] = useState('')

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
    setForm({ name: '', hodName: '', hodMobile: '' })
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
    if (!assignMemberId || !activeDepartmentId) return
    const token = localStorage.getItem('token')
    if (!token) return
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
    setAssignMemberId('')
    setShowAssignMember(false)
  }

  const activeDepartment = useMemo(
    () => departments.find((dept) => String(dept.id) === String(activeDepartmentId)),
    [departments, activeDepartmentId]
  )

  const departmentMembers = useMemo(
    () => members.filter((member) => String(member.departmentId || member.department_id || '') === String(activeDepartmentId)),
    [members, activeDepartmentId]
  )

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
          <div className="page-actions page-actions-below" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn" type="button" onClick={() => setEditingDepartment({ ...activeDepartment })}>
              <i className="fas fa-edit"></i> Edit Department
            </button>
          </div>

          <div className="cell-summary-card">
            <div className="cell-summary-grid">
              <div>
                <div className="cell-summary-label">Department Name</div>
                <div className="cell-summary-value">{activeDepartment.name || '-'}</div>
              </div>
              <div>
                <div className="cell-summary-label">HOD</div>
                <div className="cell-summary-value">{activeDepartment.hodName || '-'}</div>
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
                    <th>Cell</th>
                  </tr>
                </thead>
                <tbody>
                  {pageMembers.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--gray-color)' }}>
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
                      <td data-label="Cell">{member.cellName || '-'}</td>
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
                  <label>Select Member</label>
                  <select
                    className="form-control"
                    value={assignMemberId}
                    onChange={(e) => setAssignMemberId(e.target.value)}
                  >
                    <option value="">Select Member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.title ? `${member.title} ` : ''}{member.name}
                      </option>
                    ))}
                  </select>
                </div>
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
    </div>
  )
}

export default Departments
