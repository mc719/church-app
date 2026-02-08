import { useEffect, useState } from 'react'
import './Birthdays.css'

const API_BASE = '/api'

function Birthdays() {
  const [birthdays, setBirthdays] = useState([])
  const [cells, setCells] = useState([])
  const [members, setMembers] = useState([])
  const [editingBirthday, setEditingBirthday] = useState(null)
  const [deletingBirthday, setDeletingBirthday] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    memberId: '',
    day: '',
    month: ''
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/birthdays/summary`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/cells`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/members`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([birthdayData, cellsData, membersData]) => {
        setBirthdays(Array.isArray(birthdayData) ? birthdayData : (birthdayData?.members || []))
        setCells(Array.isArray(cellsData) ? cellsData : [])
        setMembers(Array.isArray(membersData) ? membersData : [])
      })
      .catch(() => {
        setBirthdays([])
        setCells([])
        setMembers([])
      })
  }, [])

  const getCellName = (cellId) => {
    if (!cellId) return '-'
    const match = cells.find((cell) => String(cell.id) === String(cellId))
    return match ? match.name : cellId
  }

  const formatMonthDay = (value) => {
    if (!value) return ''
    const parts = String(value).split('-')
    if (parts.length !== 2) return value
    const month = Number(parts[0])
    const day = Number(parts[1])
    if (!month || !day) return value
    const date = new Date(2024, month - 1, day)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const handleDelete = async () => {
    if (!deletingBirthday) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/birthdays/${deletingBirthday.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setBirthdays((prev) => prev.filter((item) => String(item.id) !== String(deletingBirthday.id)))
    setDeletingBirthday(null)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editingBirthday) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/birthdays/${editingBirthday.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        birthday: editingBirthday.dateOfBirth
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setBirthdays((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)))
    setEditingBirthday(null)
  }

  const handleAdd = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    if (!addForm.memberId || !addForm.day || !addForm.month) return
    const dobDay = String(addForm.day).padStart(2, '0')
    const dobMonth = String(addForm.month).padStart(2, '0')
    const dateOfBirth = `${dobMonth}-${dobDay}`
    const res = await fetch(`${API_BASE}/members/${addForm.memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        dateOfBirth,
        dobMonth,
        dobDay
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    const refreshed = await fetch(`${API_BASE}/birthdays/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => (r.ok ? r.json() : []))
    setBirthdays(Array.isArray(refreshed) ? refreshed : (refreshed?.members || []))
    setAddForm({ memberId: '', day: '', month: '' })
    setShowAdd(false)
    setMembers((prev) => prev.map((m) => (String(m.id) === String(updated.id) ? updated : m)))
  }

  return (
    <div className="birthdays-page">
      <div className="page-actions" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-success" type="button" onClick={() => setShowAdd(true)}>
          <i className="fas fa-plus"></i> Add Birthday
        </button>
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Cell</th>
              <th>Birthday</th>
              <th>Mobile</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {birthdays.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No birthdays found.
                </td>
              </tr>
            )}
            {birthdays.map((item) => (
              <tr key={`${item.id}-${item.dateOfBirth}`}>
                <td data-label="Name">{item.name || '-'}</td>
                <td data-label="Cell">{item.cell || getCellName(item.cellId)}</td>
                <td data-label="Birthday">{formatMonthDay(item.dateOfBirth) || '-'}</td>
                <td data-label="Mobile">
                  {item.mobile ? <a href={`tel:${item.mobile}`}>{item.mobile}</a> : '-'}
                </td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button className="action-btn edit-btn" type="button" onClick={() => setEditingBirthday({ ...item })}>
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button className="action-btn delete-btn" type="button" onClick={() => setDeletingBirthday(item)}>
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingBirthday && (
        <div className="modal-overlay active" onClick={() => setEditingBirthday(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Birthday</h3>
              <button className="close-modal" type="button" onClick={() => setEditingBirthday(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Birthday</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <select
                      className="form-control"
                      value={editingBirthday.dateOfBirth ? String(Number(editingBirthday.dateOfBirth.split('-')[1] || '')) : ''}
                      onChange={(e) => {
                        const month = editingBirthday.dateOfBirth?.split('-')[0] || ''
                        const day = e.target.value
                        const dob = month && day ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
                        setEditingBirthday({ ...editingBirthday, dateOfBirth: dob })
                      }}
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }).map((_, idx) => (
                        <option key={`edit-day-${idx + 1}`} value={idx + 1}>{idx + 1}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      value={editingBirthday.dateOfBirth ? String(Number(editingBirthday.dateOfBirth.split('-')[0] || '')) : ''}
                      onChange={(e) => {
                        const day = editingBirthday.dateOfBirth?.split('-')[1] || ''
                        const month = e.target.value
                        const dob = month && day ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
                        setEditingBirthday({ ...editingBirthday, dateOfBirth: dob })
                      }}
                    >
                      <option value="">Month</option>
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <option key={`edit-month-${idx + 1}`} value={idx + 1}>{idx + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingBirthday(null)}>
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

      {showAdd && (
        <div className="modal-overlay active" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Birthday</h3>
              <button className="close-modal" type="button" onClick={() => setShowAdd(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAdd}>
                <div className="form-group">
                  <label>Member</label>
                  <select
                    className="form-control"
                    value={addForm.memberId}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, memberId: e.target.value }))}
                    required
                  >
                    <option value="">Select Member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.full_name} {member.email ? `(${member.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Birthday</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <select
                      className="form-control"
                      value={addForm.day}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, day: e.target.value }))}
                      required
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }).map((_, idx) => (
                        <option key={`day-${idx + 1}`} value={idx + 1}>{idx + 1}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      value={addForm.month}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, month: e.target.value }))}
                      required
                    >
                      <option value="">Month</option>
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <option key={`month-${idx + 1}`} value={idx + 1}>{idx + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAdd(false)}>
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

      {deletingBirthday && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingBirthday(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">Delete this birthday?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingBirthday(null)}>
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

export default Birthdays
