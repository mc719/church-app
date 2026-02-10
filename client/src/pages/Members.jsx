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
    setEditingMember(null)
  }

  return (
    <div className="members-page">
      <div className="page-actions" style={{ justifyContent: 'flex-end', marginBottom: '16px', marginTop: '12px' }}>
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
      </div>

      <div className="table-container members-table-container">
        <table id="allMembersTable" className="mobile-grid-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Cell Name</th>
              <th>Cell Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageMembers.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No members found.
                </td>
              </tr>
            )}
            {pageMembers.map((member) => (
              <tr
                key={member.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedMember({ ...member })
                  setDetailTab('details')
                }}
              >
                <td data-label="Title">{member.title || '-'}</td>
                <td data-label="Name">{member.name || '-'}</td>
                <td data-label="Gender">{member.gender || '-'}</td>
                <td data-label="Mobile">
                  {member.mobile ? (
                    <a href={`tel:${member.mobile}`}>{member.mobile}</a>
                  ) : (
                    '-'
                  )}
                </td>
                <td data-label="Email">
                  {member.email ? (
                    <a href={`mailto:${member.email}`}>{member.email}</a>
                  ) : (
                    '-'
                  )}
                </td>
                <td data-label="Cell Name">{member.cellName || '-'}</td>
                <td data-label="Cell Role">{member.role || '-'}</td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button
                      className="action-btn edit-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setEditingMember({ ...member })
                      }}
                    >
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button
                      className="action-btn delete-btn"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeletingMember(member)
                      }}
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

      <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--gray-color)' }}>
        Showing <span id="membersCount">{filtered.length}</span> members
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

      {selectedMember && (
        <div className="modal-overlay active" onClick={() => setSelectedMember(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Member Details</h3>
              <button className="close-modal" type="button" onClick={() => setSelectedMember(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
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
                <div className="table-container">
                  <table className="mobile-grid-table">
                    <tbody>
                      <tr><td data-label="Title">{selectedMember.title || '-'}</td></tr>
                      <tr><td data-label="Name">{selectedMember.name || '-'}</td></tr>
                      <tr><td data-label="Mobile">{selectedMember.mobile || '-'}</td></tr>
                      <tr><td data-label="Email">{selectedMember.email || '-'}</td></tr>
                      <tr><td data-label="Gender">{selectedMember.gender || '-'}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}

              {detailTab === 'cell' && (
                <div className="table-container">
                  <table className="mobile-grid-table">
                    <tbody>
                      <tr><td data-label="Cell Name">{selectedMember.cellName || '-'}</td></tr>
                      <tr><td data-label="Cell Role">{selectedMember.role || '-'}</td></tr>
                      <tr><td data-label="Cell Venue">{selectedMember.cellVenue || '-'}</td></tr>
                      <tr><td data-label="Cell Day">{selectedMember.cellDay || '-'}</td></tr>
                      <tr><td data-label="Cell Time">{selectedMember.cellTime || '-'}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}

              {detailTab === 'dept' && (
                <div className="table-container">
                  <table className="mobile-grid-table">
                    <tbody>
                      {(() => {
                        const deptId = selectedMember.departmentId ? String(selectedMember.departmentId) : ''
                        const dept = deptId ? departmentLookup.get(deptId) : null
                        const name = selectedMember.departmentName || dept?.name || '-'
                        const hod = selectedMember.departmentHead || dept?.hodName || '-'
                        const hodMobile = selectedMember.departmentHeadMobile || dept?.hodMobile || '-'
                        return (
                          <>
                            <tr><td data-label="Department">{name || '-'}</td></tr>
                            <tr><td data-label="HOD">{hod || '-'}</td></tr>
                            <tr><td data-label="HOD Mobile">{hodMobile || '-'}</td></tr>
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {detailTab === 'attendance' && (
                <div className="table-container">
                  {attendanceLoading ? (
                    <div style={{ color: 'var(--gray-color)' }}>Loading attendance...</div>
                  ) : (
                    <table className="mobile-grid-table">
                      <tbody>
                        <tr><td data-label="Present">{attendanceSummary?.present ?? 0}</td></tr>
                        <tr><td data-label="Absent">{attendanceSummary?.absent ?? 0}</td></tr>
                        <tr><td data-label="Total">{attendanceSummary?.total ?? 0}</td></tr>
                        {attendanceRecords.length === 0 && (
                          <tr><td data-label="Records">No attendance records yet.</td></tr>
                        )}
                        {attendanceRecords.slice(0, 5).map((record) => (
                          <tr key={record.reportId}>
                            <td data-label="Record">
                              {(record.reportDate ? new Date(record.reportDate).toLocaleDateString() : 'Report')}
                              {' - '}
                              {record.present ? 'Present' : 'Absent'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
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
