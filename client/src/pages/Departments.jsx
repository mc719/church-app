import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Departments.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function Departments() {
  const location = useLocation()
  const navigate = useNavigate()
  const [departments, setDepartments] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [deletingDepartment, setDeletingDepartment] = useState(null)
  const [form, setForm] = useState({ name: '', hodName: '', hodMobile: '' })
  const [error, setError] = useState('')

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
      setEditingDepartment({ ...target })
    }
  }, [departmentIdFromUrl, departments])

  useEffect(() => {
    if (!addFromUrl) return
    resetForm()
    setShowAdd(true)
  }, [addFromUrl])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return departments
    return departments.filter((dept) => {
      const values = [dept.name, dept.hodName, dept.hodMobile].filter(Boolean).join(' ').toLowerCase()
      return values.includes(term)
    })
  }, [departments, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageDepartments = filtered.slice(startIndex, startIndex + PAGE_SIZE)

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

  const handleDelete = async () => {
    if (!deletingDepartment) return
    const token = localStorage.getItem('token')
    if (!token) return
    setError('')
    const res = await fetch(`${API_BASE}/departments/${deletingDepartment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      setError('Failed to delete department')
      return
    }
    setDepartments((prev) => prev.filter((dept) => String(dept.id) !== String(deletingDepartment.id)))
    window.dispatchEvent(new Event('departments-updated'))
    setDeletingDepartment(null)
  }

  return (
    <div className="departments-page">
      <div className="page-actions departments-actions">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { resetForm(); setShowAdd(true) }}>
          Add Department
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>HOD</th>
              <th>HOD Mobile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageDepartments.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--gray-color)' }}>
                  No departments found.
                </td>
              </tr>
            )}
            {pageDepartments.map((dept) => (
              <tr key={dept.id}>
                <td data-label="Name">{dept.name || '-'}</td>
                <td data-label="HOD">{dept.hodName || '-'}</td>
                <td data-label="HOD Mobile">
                  {dept.hodMobile ? <a href={`tel:${dept.hodMobile}`}>{dept.hodMobile}</a> : '-'}
                </td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button
                      className="action-btn edit-btn"
                      type="button"
                      onClick={() => setEditingDepartment({ ...dept })}
                    >
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button
                      className="action-btn delete-btn"
                      type="button"
                      onClick={() => setDeletingDepartment(dept)}
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

      {deletingDepartment && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingDepartment(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {deletingDepartment.name || 'this department'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingDepartment(null)}>
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

export default Departments
