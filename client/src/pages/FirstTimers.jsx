import { useEffect, useState } from 'react'
import './FirstTimers.css'

const API_BASE = '/api'

function FirstTimers() {
  const [activeTab, setActiveTab] = useState('list')
  const [firstTimers, setFirstTimers] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [deletingFirstTimer, setDeletingFirstTimer] = useState(null)
  const [editingFollowUp, setEditingFollowUp] = useState(null)
  const [deletingFollowUp, setDeletingFollowUp] = useState(null)
  const [showAddFollowUp, setShowAddFollowUp] = useState(false)
  const [showAddFirstTimer, setShowAddFirstTimer] = useState(false)
  const [inlineEdits, setInlineEdits] = useState({})
  const [addForm, setAddForm] = useState({
    name: '',
    surname: '',
    gender: '',
    mobile: '',
    email: '',
    status: ''
  })
  const [followUpForm, setFollowUpForm] = useState({
    firstTimerId: '',
    date: '',
    time: '',
    comment: '',
    visitationArranged: false,
    visitationDate: ''
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/first-timers`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/follow-ups`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([firstTimersData, followUpsData]) => {
        setFirstTimers(Array.isArray(firstTimersData) ? firstTimersData : [])
        setFollowUps(Array.isArray(followUpsData) ? followUpsData : [])
      })
      .catch(() => {
        setFirstTimers([])
        setFollowUps([])
      })
  }, [])

  const formatDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleDateString()
  }

  const formatTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleDeleteFirstTimer = async () => {
    if (!deletingFirstTimer) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/first-timers/${deletingFirstTimer.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setFirstTimers((prev) => prev.filter((item) => String(item.id) !== String(deletingFirstTimer.id)))
    setDeletingFirstTimer(null)
  }

  const handleInlineSave = async (item) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const updates = inlineEdits[item.id] || {}
    const payload = {
      name: updates.name ?? item.name ?? item.full_name ?? '',
      surname: updates.surname ?? item.surname ?? '',
      gender: updates.gender ?? item.gender ?? '',
      mobile: updates.mobile ?? item.mobile ?? '',
      email: updates.email ?? item.email ?? '',
      address: updates.address ?? item.address ?? '',
      postcode: updates.postcode ?? item.postcode ?? '',
      birthday: updates.birthday ?? item.birthday ?? '',
      ageGroup: updates.ageGroup ?? item.ageGroup ?? '',
      maritalStatus: updates.maritalStatus ?? item.maritalStatus ?? '',
      bornAgain: updates.bornAgain ?? item.bornAgain ?? '',
      speakTongues: updates.speakTongues ?? item.speakTongues ?? '',
      findOut: updates.findOut ?? item.findOut ?? [],
      contactPref: updates.contactPref ?? item.contactPref ?? [],
      visit: updates.visit ?? item.visit ?? '',
      visitWhen: updates.visitWhen ?? item.visitWhen ?? '',
      prayerRequests: updates.prayerRequests ?? item.prayerRequests ?? [],
      dateJoined: updates.dateJoined ?? item.dateJoined ?? item.joined_date ?? '',
      status: updates.status ?? item.status ?? '',
      foundationSchool: updates.foundationSchool ?? item.foundationSchool ?? '',
      cellId: updates.cellId ?? item.cellId ?? '',
      invitedBy: updates.invitedBy ?? item.invitedBy ?? ''
    }
    const res = await fetch(`${API_BASE}/first-timers/${item.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) return
    const updated = await res.json()
    setFirstTimers((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)))
    setInlineEdits((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
  }

  const updateInline = (id, field, value) => {
    setInlineEdits((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }))
  }

  const handleDeleteFollowUp = async () => {
    if (!deletingFollowUp) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/follow-ups/${deletingFollowUp.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setFollowUps((prev) => prev.filter((item) => String(item.id) !== String(deletingFollowUp.id)))
    setDeletingFollowUp(null)
  }

  const handleSaveFollowUp = async (event) => {
    event.preventDefault()
    if (!editingFollowUp) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/follow-ups/${editingFollowUp.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstTimerId: editingFollowUp.firstTimerId,
        date: editingFollowUp.date,
        time: editingFollowUp.time,
        comment: editingFollowUp.comment,
        visitationArranged: editingFollowUp.visitationArranged,
        visitationDate: editingFollowUp.visitationDate
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setFollowUps((prev) => prev.map((item) => (String(item.id) === String(updated.id) ? updated : item)))
    setEditingFollowUp(null)
  }

  const handleAddFollowUp = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/follow-ups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstTimerId: followUpForm.firstTimerId,
        date: followUpForm.date,
        time: followUpForm.time,
        comment: followUpForm.comment,
        visitationArranged: followUpForm.visitationArranged,
        visitationDate: followUpForm.visitationDate
      })
    })
    if (!res.ok) return
    const created = await res.json()
    setFollowUps((prev) => [created, ...prev])
    setFollowUpForm({
      firstTimerId: '',
      date: '',
      time: '',
      comment: '',
      visitationArranged: false,
      visitationDate: ''
    })
    setShowAddFollowUp(false)
  }

  const handleAddFirstTimer = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/first-timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: addForm.name,
        surname: addForm.surname,
        gender: addForm.gender,
        mobile: addForm.mobile,
        email: addForm.email,
        status: addForm.status
      })
    })
    if (!res.ok) return
    const created = await res.json()
    setFirstTimers((prev) => [created, ...prev])
    setAddForm({
      name: '',
      surname: '',
      gender: '',
      mobile: '',
      email: '',
      status: ''
    })
    setShowAddFirstTimer(false)
  }

  return (
    <div className="first-timers-page">
      <div className="cell-tabs" id="firstTimersTabs">
        <button
          className={`cell-tab-btn${activeTab === 'list' ? ' active' : ''}`}
          onClick={() => setActiveTab('list')}
          type="button"
        >
          First-Timers List
        </button>
        <button
          className={`cell-tab-btn${activeTab === 'followups' ? ' active' : ''}`}
          onClick={() => setActiveTab('followups')}
          type="button"
        >
          Follow-up Records
        </button>
        <div className="cell-tabs-actions">
          <button className="btn btn-success" type="button" onClick={() => setShowAddFirstTimer(true)}>
            <i className="fas fa-user-plus"></i> Add New First-Timer
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="cell-tab-content active">
          <div className="table-container">
            <table className="mobile-grid-table" id="firstTimersTable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Date Joined</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {firstTimers.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                      No first-timers found.
                    </td>
                  </tr>
                )}
                {firstTimers.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Name">
                      <input
                        className="form-control"
                        value={inlineEdits[item.id]?.name ?? item.name ?? item.full_name ?? ''}
                        onChange={(e) => updateInline(item.id, 'name', e.target.value)}
                      />
                    </td>
                    <td data-label="Mobile">
                      <input
                        className="form-control"
                        value={inlineEdits[item.id]?.mobile ?? item.mobile ?? ''}
                        onChange={(e) => updateInline(item.id, 'mobile', e.target.value)}
                      />
                    </td>
                    <td data-label="Date Joined">{formatDate(item.joined_date || item.created_at)}</td>
                    <td data-label="Status">
                      <input
                        className="form-control"
                        value={inlineEdits[item.id]?.status ?? item.status ?? ''}
                        onChange={(e) => updateInline(item.id, 'status', e.target.value)}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" type="button" onClick={() => handleInlineSave(item)}>
                          <i className="fas fa-save"></i> Save
                        </button>
                        <button
                          className="action-btn delete-btn"
                          type="button"
                          onClick={() => setDeletingFirstTimer(item)}
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
        </div>
      )}

      {activeTab === 'followups' && (
        <div className="cell-tab-content active">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Follow-up Records</h2>
            <div className="page-actions">
              <button className="btn btn-success" type="button" onClick={() => setShowAddFollowUp(true)}>
                <i className="fas fa-plus"></i> Add Record
              </button>
            </div>
          </div>
          <div className="table-container">
            <table className="mobile-grid-table" id="followUpsTable">
              <thead>
                <tr>
                  <th>First-Timer</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Comment</th>
                  <th>Visitation Arranged</th>
                  <th>Visitation Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {followUps.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                      No follow-up records found.
                    </td>
                  </tr>
                )}
                {followUps.map((item) => (
                  <tr key={item.id}>
                    <td data-label="First-Timer">{item.first_timer_name || item.firstTimerName || '-'}</td>
                    <td data-label="Date">{formatDate(item.follow_up_date || item.date)}</td>
                    <td data-label="Time">{formatTime(item.follow_up_date || item.date)}</td>
                    <td data-label="Comment">{item.comment || '-'}</td>
                    <td data-label="Visitation Arranged">{item.visitation_arranged ? 'Yes' : 'No'}</td>
                    <td data-label="Visitation Date">{formatDate(item.visitation_date)}</td>
                    <td data-label="Actions">
                      <div className="action-buttons">
                        <button className="action-btn edit-btn" type="button" onClick={() => setEditingFollowUp({ ...item })}>
                          <i className="fas fa-edit"></i> Edit
                        </button>
                        <button className="action-btn delete-btn" type="button" onClick={() => setDeletingFollowUp(item)}>
                          <i className="fas fa-trash"></i> Delete
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


      {showAddFirstTimer && (
        <div className="modal-overlay active" onClick={() => setShowAddFirstTimer(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add First-Timer</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddFirstTimer(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddFirstTimer}>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={addForm.name}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Surname</label>
                  <input
                    className="form-control"
                    value={addForm.surname}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, surname: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <input
                    className="form-control"
                    value={addForm.gender}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, gender: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Mobile</label>
                  <input
                    className="form-control"
                    value={addForm.mobile}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    value={addForm.email}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <input
                    className="form-control"
                    value={addForm.status}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value }))}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAddFirstTimer(false)}>
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

      {deletingFirstTimer && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingFirstTimer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {deletingFirstTimer.name || 'this first-timer'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingFirstTimer(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleDeleteFirstTimer}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingFollowUp && (
        <div className="modal-overlay active" onClick={() => setEditingFollowUp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Follow-up</h3>
              <button className="close-modal" type="button" onClick={() => setEditingFollowUp(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSaveFollowUp}>
                <div className="form-group">
                  <label>First-Timer ID</label>
                  <input
                    className="form-control"
                    value={editingFollowUp.firstTimerId || ''}
                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, firstTimerId: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editingFollowUp.date || ''}
                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={editingFollowUp.time || ''}
                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Comment</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={editingFollowUp.comment || ''}
                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, comment: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Visitation Arranged</label>
                  <select
                    className="form-control"
                    value={editingFollowUp.visitationArranged ? 'yes' : 'no'}
                    onChange={(e) =>
                      setEditingFollowUp({ ...editingFollowUp, visitationArranged: e.target.value === 'yes' })
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Visitation Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editingFollowUp.visitationDate || ''}
                    onChange={(e) => setEditingFollowUp({ ...editingFollowUp, visitationDate: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingFollowUp(null)}>
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

      {deletingFollowUp && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingFollowUp(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">Delete this follow-up?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingFollowUp(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleDeleteFollowUp}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddFollowUp && (
        <div className="modal-overlay active" onClick={() => setShowAddFollowUp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Follow-up</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddFollowUp(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddFollowUp}>
                <div className="form-group">
                  <label>First-Timer</label>
                  <select
                    className="form-control"
                    value={followUpForm.firstTimerId}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, firstTimerId: e.target.value })}
                  >
                    <option value="">Select</option>
                    {firstTimers.map((ft) => (
                      <option key={ft.id} value={ft.id}>
                        {ft.name} {ft.surname || ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={followUpForm.date}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={followUpForm.time}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Comment</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={followUpForm.comment}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, comment: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Visitation Arranged</label>
                  <select
                    className="form-control"
                    value={followUpForm.visitationArranged ? 'yes' : 'no'}
                    onChange={(e) =>
                      setFollowUpForm({ ...followUpForm, visitationArranged: e.target.value === 'yes' })
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Visitation Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={followUpForm.visitationDate}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, visitationDate: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAddFollowUp(false)}>
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

export default FirstTimers
