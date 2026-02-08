import { useEffect, useMemo, useState } from 'react'
import './Members.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function Members() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editingMember, setEditingMember] = useState(null)
  const [deletingMember, setDeletingMember] = useState(null)

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
              <th>Cell Venue</th>
              <th>Cell Day</th>
              <th>Cell Time</th>
              <th>Joined Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageMembers.length === 0 && (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No members found.
                </td>
              </tr>
            )}
            {pageMembers.map((member) => (
              <tr key={member.id}>
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
                <td data-label="Cell Venue">{member.cellVenue || '-'}</td>
                <td data-label="Cell Day">{member.cellDay || '-'}</td>
                <td data-label="Cell Time">{member.cellTime || '-'}</td>
                <td data-label="Joined Date">{formatDate(member.joinedDate || member.createdAt)}</td>
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
