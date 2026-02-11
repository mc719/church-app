import { useEffect, useMemo, useState } from 'react'
import './Members.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function Members() {
  const [members, setMembers] = useState([])
  const [departments, setDepartments] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editingMember, setEditingMember] = useState(null)
  const [deletingMember, setDeletingMember] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)
  const [detailTab, setDetailTab] = useState('details')
  const [attendanceSummary, setAttendanceSummary] = useState(null)
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/members`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setMembers(Array.isArray(data) ? data : [])
      })
      .catch(() => setMembers([]))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/departments`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    if (!selectedMember?.id) return
    const token = localStorage.getItem('token')
    if (!token) return
    setAttendanceLoading(true)
    fetch(`${API_BASE}/members/${selectedMember.id}/attendance`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAttendanceSummary(data || null)
        setAttendanceRecords(Array.isArray(data?.records) ? data.records : [])
      })
      .catch(() => {
        setAttendanceSummary(null)
        setAttendanceRecords([])
      })
      .finally(() => setAttendanceLoading(false))
  }, [selectedMember?.id])

  const departmentLookup = useMemo(() => {
    const map = new Map()
    departments.forEach((dept) => {
      map.set(String(dept.id), dept)
    })
    return map
  }, [departments])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return members
    return members.filter((member) => {
      const values = [
        member.title,
        member.name,
        member.gender,
        member.mobile,
        member.email,
        member.role,
        member.cellName,
        member.cellVenue,
        member.cellDay,
        member.cellTime
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return values.includes(term)
    })
  }, [members, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageMembers = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  const formatDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleDateString()
  }

  const handleDelete = async () => {
    if (!deletingMember) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/members/${deletingMember.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setMembers((prev) => prev.filter((m) => String(m.id) !== String(deletingMember.id)))
    setDeletingMember(null)
  }

  const handleSave = async (event) => {
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
        isFirstTimer: editingMember.isFirstTimer,
        departmentId: editingMember.departmentId || null,
        dobMonth: editingMember.dobMonth,
        dobDay: editingMember.dobDay
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setMembers((prev) => prev.map((m) => (String(m.id) === String(updated.id) ? updated : m)))
    setSelectedMember((prev) =>
      prev && String(prev.id) === String(updated.id) ? { ...prev, ...updated } : prev
    )
    setEditingMember(null)
  }

  useEffect(() => {
    if (!pageMembers.length) return
    if (selectedMember && pageMembers.some((m) => String(m.id) === String(selectedMember.id))) return
    setSelectedMember({ ...pageMembers[0] })
    setDetailTab('details')
  }, [pageMembers, selectedMember])

  return (
    <div className="members-page">
      <div className="members-layout">
        <div className="members-list-panel">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="members-list">
            {pageMembers.length === 0 && (
              <div className="dashboard-note">No members found.</div>
            )}
            {pageMembers.map((member) => {
              const isActive = selectedMember && String(selectedMember.id) === String(member.id)
              return (
                <button
                  key={member.id}
                  type="button"
                  className={`member-row${isActive ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedMember({ ...member })
                    setDetailTab('details')
                  }}
                >
                  <div className="member-row-main">
                    <div className="member-row-name">
                      {member.title ? `${member.title} ` : ''}{member.name || 'Member'}
                    </div>
                    <div className="member-row-meta">
                      <span>{member.role || 'Member'}</span>
                      <span>•</span>
                      <span>{member.cellName || 'No Cell'}</span>
                    </div>
                  </div>
                  <div className="member-row-actions">
                    <span className="member-row-tag">{member.gender || '-'}</span>
                  </div>
                </button>
              )
            })}
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
          <div className="members-count">
            Showing <span id="membersCount">{filtered.length}</span> members
          </div>
        </div>

        <div className="members-detail-panel">
          {!selectedMember && (
            <div className="dashboard-note">Select a member to view details.</div>
          )}
          {selectedMember && (
            <div className="member-detail-card">
              <div className="member-detail-header">
                <div>
                  <h2>
                    {selectedMember.title ? `${selectedMember.title} ` : ''}
                    {selectedMember.name || 'Member'}
                  </h2>
                  <div className="member-detail-meta">
                    <span>{selectedMember.role || 'Member'}</span>
                    <span>•</span>
                    <span>{selectedMember.cellName || 'No Cell'}</span>
                  </div>
                </div>
                <div className="member-detail-actions">
                  <button
                    className="btn ghost-btn"
                    type="button"
                    onClick={() => setEditingMember({ ...selectedMember })}
                  >
                    <i className="fas fa-edit"></i> Edit
                  </button>
                  <button
                    className="btn ghost-btn danger"
                    type="button"
                    onClick={() => setDeletingMember(selectedMember)}
                  >
                    <i className="fas fa-trash"></i> Delete
                  </button>
                </div>
              </div>

              <div className="cell-tabs" style={{ marginBottom: '12px' }}>
                <button
                  className={`cell-tab-btn${detailTab === 'details' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('details')}
                >
                  Details
                </button>
                <button
                  className={`cell-tab-btn${detailTab === 'cell' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('cell')}
                >
                  Cell Info
                </button>
                <button
                  className={`cell-tab-btn${detailTab === 'dept' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('dept')}
                >
                  Dept.
                </button>
                <button
                  className={`cell-tab-btn${detailTab === 'attendance' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('attendance')}
                >
                  Attendance
                </button>
              </div>

              {detailTab === 'details' && (
                <div className="detail-grid">
                  <div className="detail-row"><span>Title</span><strong>{selectedMember.title || '-'}</strong></div>
                  <div className="detail-row"><span>Name</span><strong>{selectedMember.name || '-'}</strong></div>
                  <div className="detail-row"><span>Mobile</span><strong>{selectedMember.mobile || '-'}</strong></div>
                  <div className="detail-row"><span>Email</span><strong>{selectedMember.email || '-'}</strong></div>
                  <div className="detail-row"><span>Gender</span><strong>{selectedMember.gender || '-'}</strong></div>
                </div>
              )}

              {detailTab === 'cell' && (
                <div className="detail-grid">
                  <div className="detail-row"><span>Cell Name</span><strong>{selectedMember.cellName || '-'}</strong></div>
                  <div className="detail-row"><span>Cell Role</span><strong>{selectedMember.role || '-'}</strong></div>
                  <div className="detail-row"><span>Cell Venue</span><strong>{selectedMember.cellVenue || '-'}</strong></div>
                  <div className="detail-row"><span>Cell Day</span><strong>{selectedMember.cellDay || '-'}</strong></div>
                  <div className="detail-row"><span>Cell Time</span><strong>{selectedMember.cellTime || '-'}</strong></div>
                </div>
              )}

              {detailTab === 'dept' && (
                <div className="detail-grid">
                  <div className="detail-row"><span>Department</span><strong>{departmentLookup.get(String(selectedMember.departmentId || selectedMember.department_id))?.name || '-'}</strong></div>
                </div>
              )}

              {detailTab === 'attendance' && (
                <div className="detail-grid">
                  {attendanceLoading && <div className="dashboard-note">Loading attendance...</div>}
                  {!attendanceLoading && (
                    <>
                      <div className="detail-row"><span>Present</span><strong>{attendanceSummary?.present ?? 0}</strong></div>
                      <div className="detail-row"><span>Absent</span><strong>{attendanceSummary?.absent ?? 0}</strong></div>
                      <div className="detail-row"><span>Total Reports</span><strong>{attendanceSummary?.records?.length ?? 0}</strong></div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={editingMember.title || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, title: e.target.value })}
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
                <div className="form-group">
                  <label>Department</label>
                  <select
                    className="form-control"
                    value={editingMember.departmentId || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, departmentId: e.target.value })}
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>First-Timer?</label>
                  <select
                    className="form-control"
                    value={editingMember.isFirstTimer ? 'yes' : 'no'}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, isFirstTimer: e.target.value === 'yes' })
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      className="form-control"
                      placeholder="Day"
                      value={editingMember.dobDay || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, dobDay: e.target.value })}
                    />
                    <input
                      className="form-control"
                      placeholder="Month"
                      value={editingMember.dobMonth || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, dobMonth: e.target.value })}
                    />
                  </div>
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

export default Members
