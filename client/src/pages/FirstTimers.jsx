import { useEffect, useMemo, useState } from 'react'
import './FirstTimers.css'

const API_BASE = '/api'

function FirstTimers() {
  const [firstTimers, setFirstTimers] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [cells, setCells] = useState([])
  const [departments, setDepartments] = useState([])
  const [search, setSearch] = useState('')
  const [listTab, setListTab] = useState('active')
  const [selectedFirstTimer, setSelectedFirstTimer] = useState(null)
  const [detailTab, setDetailTab] = useState('details')
  const [decidingFirstTimer, setDecidingFirstTimer] = useState(null)
  const [decisionForm, setDecisionForm] = useState({ cellId: '', departmentId: '' })
  const [deletingFirstTimer, setDeletingFirstTimer] = useState(null)
  const [editingFollowUp, setEditingFollowUp] = useState(null)
  const [deletingFollowUp, setDeletingFollowUp] = useState(null)
  const [showAddFollowUp, setShowAddFollowUp] = useState(false)
  const [showAddFirstTimer, setShowAddFirstTimer] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [inlineEdits, setInlineEdits] = useState({})
  const [addForm, setAddForm] = useState({
    title: '',
    name: '',
    surname: '',
    gender: '',
    mobile: '',
    email: '',
    photoData: '',
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
      fetch(`${API_BASE}/first-timers?includeArchived=true`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/follow-ups`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/cells`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/departments`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([firstTimersData, followUpsData, cellsData, departmentsData]) => {
        setFirstTimers(Array.isArray(firstTimersData) ? firstTimersData : [])
        setFollowUps(Array.isArray(followUpsData) ? followUpsData : [])
        setCells(Array.isArray(cellsData) ? cellsData : [])
        setDepartments(Array.isArray(departmentsData) ? departmentsData : [])
      })
      .catch(() => {
        setFirstTimers([])
        setFollowUps([])
        setCells([])
        setDepartments([])
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

  const filteredFirstTimers = useMemo(() => {
    const term = search.trim().toLowerCase()
    const scopedList = firstTimers.filter((item) =>
      listTab === 'archive'
        ? !!item.archived
        : (!item.archived && !item.inFoundationSchool)
    )
    if (!term) return scopedList
    return scopedList.filter((item) => {
      const values = [
        item.title,
        item.name,
        item.surname,
        item.mobile,
        item.email,
        item.status,
        item.gender,
        item.cellName,
        item.invitedBy
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return values.includes(term)
    })
  }, [firstTimers, search, listTab])

  const filteredFollowUps = useMemo(() => {
    if (!selectedFirstTimer?.id) return []
    return followUps.filter(
      (item) => String(item.firstTimerId || item.first_timer_id) === String(selectedFirstTimer.id)
    )
  }, [followUps, selectedFirstTimer])

  useEffect(() => {
    if (!filteredFirstTimers.length) {
      setSelectedFirstTimer(null)
      return
    }
    if (selectedFirstTimer && filteredFirstTimers.some((item) => String(item.id) === String(selectedFirstTimer.id))) {
      return
    }
    setSelectedFirstTimer({ ...filteredFirstTimers[0] })
    setDetailTab('details')
  }, [filteredFirstTimers, selectedFirstTimer])

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

  const applyDecision = async (action) => {
    if (!decidingFirstTimer) return
    const token = localStorage.getItem('token')
    if (!token) return
    const payload = { action }
    if (action === 'assignCell') payload.cellId = decisionForm.cellId || null
    if (action === 'assignDepartment') payload.departmentId = decisionForm.departmentId || null
    const res = await fetch(`${API_BASE}/first-timers/${decidingFirstTimer.id}/decision`, {
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
    if (selectedFirstTimer && String(selectedFirstTimer.id) === String(updated.id)) {
      setSelectedFirstTimer(updated)
    }
    if (action === 'archive' || action === 'unarchive') {
      setListTab(action === 'archive' ? 'archive' : 'active')
    }
    setDecidingFirstTimer(null)
    setDecisionForm({ cellId: '', departmentId: '' })
  }

  const handleInlineSave = async (item) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const updates = inlineEdits[item.id] || {}
    const normalizeNullable = (value) => {
      if (value === undefined || value === null) return null
      if (typeof value === 'string' && !value.trim()) return null
      return value
    }
    const payload = {
      title: updates.title ?? item.title ?? '',
      photoData: updates.photoData ?? item.photoData ?? '',
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
      cellId: normalizeNullable(updates.cellId ?? item.cellId ?? null),
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
    setSelectedFirstTimer(updated)
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
    const resolvedFirstTimerId = followUpForm.firstTimerId || selectedFirstTimer?.id
    if (!resolvedFirstTimerId) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/follow-ups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstTimerId: resolvedFirstTimerId,
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
          title: addForm.title,
          name: addForm.name,
          surname: addForm.surname,
          gender: addForm.gender,
          mobile: addForm.mobile,
          email: addForm.email,
          photoData: addForm.photoData,
          status: addForm.status
        })
      })
    if (!res.ok) return
    const created = await res.json()
    setFirstTimers((prev) => [created, ...prev])
      setAddForm({
        title: '',
        name: '',
        surname: '',
        gender: '',
        mobile: '',
        email: '',
        photoData: '',
        status: ''
      })
    setShowAddFirstTimer(false)
  }

  const handleAddPhotoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    compressImage(file).then((dataUrl) => {
      setAddForm((prev) => ({ ...prev, photoData: dataUrl }))
    })
  }

  const handleDetailPhotoUpload = (event) => {
    if (!selectedFirstTimer) return
    const file = event.target.files?.[0]
    if (!file) return
    compressImage(file).then((dataUrl) => {
      updateInline(selectedFirstTimer.id, 'photoData', dataUrl)
    })
  }

  // Keep photo payloads small enough for JSON transport and faster render.
  const compressImage = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('Failed to process image'))
        img.onload = () => {
          const maxSize = 640
          const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
          const width = Math.max(1, Math.round(img.width * ratio))
          const height = Math.max(1, Math.round(img.height * ratio))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Failed to create image context'))
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.78))
        }
        img.src = String(reader.result || '')
      }
      reader.readAsDataURL(file)
    }).catch(() => '')

  return (
    <div className="first-timers-page">
      <div className="first-timers-layout">
        <div className="first-timers-list-panel">
          <div className="first-timers-list-header">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search first-timers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="cell-tabs">
              <button
                className={`cell-tab-btn${listTab === 'active' ? ' active' : ''}`}
                type="button"
                onClick={() => setListTab('active')}
              >
                First-Timers
              </button>
              <button
                className={`cell-tab-btn${listTab === 'archive' ? ' active' : ''}`}
                type="button"
                onClick={() => setListTab('archive')}
              >
                Archive
              </button>
            </div>
            <button className="btn btn-success" type="button" onClick={() => setShowAddFirstTimer(true)}>
              <i className="fas fa-user-plus"></i> Add New First-Timer
            </button>
          </div>
          <div className="first-timers-list">
            {filteredFirstTimers.length === 0 && <div className="dashboard-note">No first-timers found.</div>}
            {filteredFirstTimers.map((item) => {
              const isActive = selectedFirstTimer && String(selectedFirstTimer.id) === String(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`first-timer-row${isActive ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedFirstTimer({ ...item })
                    setDetailTab('details')
                  }}
                >
                  <div className="first-timer-row-left">
                    <div className="first-timer-avatar">
                      {((selectedFirstTimer && String(selectedFirstTimer.id) === String(item.id) && inlineEdits[item.id]?.photoData) || item.photoData) ? (
                        <img
                          src={(selectedFirstTimer && String(selectedFirstTimer.id) === String(item.id) && inlineEdits[item.id]?.photoData) || item.photoData}
                          alt={item.name || 'First-timer'}
                        />
                      ) : (
                        <i className="fas fa-user"></i>
                      )}
                    </div>
                    <div className="first-timer-row-info">
                      <div className="first-timer-row-name">
                        {item.title ? `${item.title} ` : ''}
                        {item.name || 'First-timer'} {item.surname || ''}
                      </div>
                      <div className="first-timer-row-meta">
                        <span>{item.status || 'Pending'}</span>
                        <span>•</span>
                        <span>{item.mobile || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                    <span className="first-timer-row-tag">{item.gender || '-'}</span>
                    <button
                      type="button"
                      className="action-btn edit-btn"
                      onClick={() => {
                        setDecidingFirstTimer(item)
                        setDecisionForm({
                          cellId: item.cellId || '',
                          departmentId: item.departmentId || ''
                        })
                      }}
                    >
                      Decide
                    </button>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="first-timers-detail-panel">
          {listTab === 'archive' ? (
            <div className="table-container">
              <table className="mobile-grid-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFirstTimers.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '32px' }}>No archived first-timers.</td>
                    </tr>
                  )}
                  {filteredFirstTimers.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Name">{item.title ? `${item.title} ` : ''}{item.name || ''} {item.surname || ''}</td>
                      <td data-label="Mobile">{item.mobile || '-'}</td>
                      <td data-label="Status">{item.status || '-'}</td>
                      <td data-label="Actions">
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="action-btn edit-btn"
                            onClick={() => {
                              setListTab('active')
                              setSelectedFirstTimer({ ...item, archived: false })
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => {
                              setDecidingFirstTimer(item)
                              setDecisionForm({
                                cellId: item.cellId || '',
                                departmentId: item.departmentId || ''
                              })
                            }}
                          >
                            Unarchive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <>
          {!selectedFirstTimer && <div className="dashboard-note">Select a first-timer to view details.</div>}
          {selectedFirstTimer && (
            <>
              <div className="first-timer-detail-header">
                <div>
                  <h2>
                    {selectedFirstTimer.title ? `${selectedFirstTimer.title} ` : ''}
                    {selectedFirstTimer.name || 'First-timer'} {selectedFirstTimer.surname || ''}
                  </h2>
                  <div className="member-detail-meta">
                    <span>{selectedFirstTimer.status || 'Pending'}</span>
                    <span>•</span>
                    <span>{selectedFirstTimer.email || '-'}</span>
                  </div>
                </div>
                <div className="member-detail-actions">
                  <button
                    className="btn ghost-btn"
                    type="button"
                    onClick={() => {
                      setDecidingFirstTimer(selectedFirstTimer)
                      setDecisionForm({
                        cellId: selectedFirstTimer.cellId || '',
                        departmentId: selectedFirstTimer.departmentId || ''
                      })
                    }}
                  >
                    <i className="fas fa-check-circle"></i> Decide
                  </button>
                  <button className="btn ghost-btn" type="button" onClick={() => handleInlineSave(selectedFirstTimer)}>
                    <i className="fas fa-save"></i> Save
                  </button>
                  <button
                    className="btn ghost-btn danger"
                    type="button"
                    onClick={() => setDeletingFirstTimer(selectedFirstTimer)}
                  >
                    <i className="fas fa-trash"></i> Delete
                  </button>
                </div>
              </div>

              <div className="cell-tabs first-timer-tabs">
                <button
                  className={`cell-tab-btn${detailTab === 'details' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('details')}
                >
                  Details
                </button>
                <button
                  className={`cell-tab-btn${detailTab === 'followups' ? ' active' : ''}`}
                  type="button"
                  onClick={() => setDetailTab('followups')}
                >
                  Follow-up Records
                </button>
                {detailTab === 'followups' && (
                  <div className="cell-tabs-actions">
                    <button className="btn btn-success" type="button" onClick={() => setShowAddFollowUp(true)}>
                      <i className="fas fa-plus"></i> Add Record
                    </button>
                  </div>
                )}
              </div>

              {detailTab === 'details' && (
                <div className="detail-grid first-timer-detail-grid">
                  <div className="detail-row">
                    <span>Photo</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="first-timer-avatar">
                        {(inlineEdits[selectedFirstTimer.id]?.photoData || selectedFirstTimer.photoData) ? (
                          <img
                            src={inlineEdits[selectedFirstTimer.id]?.photoData || selectedFirstTimer.photoData}
                            alt={selectedFirstTimer.name || 'First-timer'}
                            onClick={() =>
                              setPhotoPreview(
                                inlineEdits[selectedFirstTimer.id]?.photoData || selectedFirstTimer.photoData
                              )
                            }
                          />
                        ) : (
                          <i className="fas fa-user"></i>
                        )}
                      </div>
                      <input type="file" accept="image/*" onChange={handleDetailPhotoUpload} />
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>Title</span>
                    <select
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.title ?? selectedFirstTimer.title ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'title', e.target.value)}
                    >
                      <option value="">Select</option>
                      <option value="Brother">Brother</option>
                      <option value="Sister">Sister</option>
                      <option value="Dcn">Dcn</option>
                      <option value="Dcns">Dcns</option>
                      <option value="Pastor">Pastor</option>
                    </select>
                  </div>
                  <div className="detail-row">
                    <span>Name</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.name ?? selectedFirstTimer.name ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'name', e.target.value)}
                    />
                  </div>
                  <div className="detail-row">
                    <span>Surname</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.surname ?? selectedFirstTimer.surname ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'surname', e.target.value)}
                    />
                  </div>
                  <div className="detail-row">
                    <span>Mobile</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.mobile ?? selectedFirstTimer.mobile ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'mobile', e.target.value)}
                    />
                  </div>
                  <div className="detail-row">
                    <span>Email</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.email ?? selectedFirstTimer.email ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'email', e.target.value)}
                    />
                  </div>
                  <div className="detail-row">
                    <span>Gender</span>
                    <select
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.gender ?? selectedFirstTimer.gender ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'gender', e.target.value)}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="detail-row">
                    <span>Status</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.status ?? selectedFirstTimer.status ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'status', e.target.value)}
                    />
                  </div>
                  <div className="detail-row">
                    <span>Date Joined</span>
                    <strong>{formatDate(selectedFirstTimer.joined_date || selectedFirstTimer.created_at)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Invited By</span>
                    <input
                      className="form-control inline-input"
                      value={inlineEdits[selectedFirstTimer.id]?.invitedBy ?? selectedFirstTimer.invitedBy ?? ''}
                      onChange={(e) => updateInline(selectedFirstTimer.id, 'invitedBy', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {detailTab === 'followups' && (
                <div className="table-container">
                  <table className="mobile-grid-table" id="followUpsTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Comment</th>
                        <th>Visitation Arranged</th>
                        <th>Visitation Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFollowUps.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                            No follow-up records found.
                          </td>
                        </tr>
                      )}
                      {filteredFollowUps.map((item) => (
                        <tr key={item.id}>
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
              )}
            </>
          )}
          </>
          )}
        </div>
      </div>


      {decidingFirstTimer && (
        <div className="modal-overlay active" onClick={() => setDecidingFirstTimer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Decide: {decidingFirstTimer.name || 'First-Timer'}</h3>
              <button className="close-modal" type="button" onClick={() => setDecidingFirstTimer(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Archive</label>
                <button className="btn btn-warning" type="button" onClick={() => applyDecision('archive')}>
                  Archive
                </button>
              </div>
              <div className="form-group">
                <label>Assign Cell</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="form-control"
                    value={decisionForm.cellId}
                    onChange={(e) => setDecisionForm((prev) => ({ ...prev, cellId: e.target.value }))}
                    disabled={String(decidingFirstTimer.source || '').toLowerCase() === 'cell'}
                  >
                    <option value="">Select cell</option>
                    {cells.map((cell) => (
                      <option key={cell.id} value={cell.id}>{cell.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!decisionForm.cellId || String(decidingFirstTimer.source || '').toLowerCase() === 'cell'}
                    onClick={() => applyDecision('assignCell')}
                  >
                    Assign
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Assign Department</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="form-control"
                    value={decisionForm.departmentId}
                    onChange={(e) => setDecisionForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                  >
                    <option value="">Select department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!decisionForm.departmentId}
                    onClick={() => applyDecision('assignDepartment')}
                  >
                    Assign
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Assign Foundation School</label>
                <button className="btn btn-success" type="button" onClick={() => applyDecision('assignFoundationSchool')}>
                  Move to Foundation School
                </button>
              </div>
              {decidingFirstTimer.archived && (
                <div className="form-group">
                  <label>Restore</label>
                  <button className="btn" type="button" onClick={() => applyDecision('unarchive')}>
                    Unarchive
                  </button>
                </div>
              )}
            </div>
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
                  <label>Photo</label>
                  <input type="file" accept="image/*" onChange={handleAddPhotoUpload} />
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={addForm.title}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, title: e.target.value }))}
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
                  <select
                    className="form-control"
                    value={addForm.gender}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, gender: e.target.value }))}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
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
                  <label>Photo URL</label>
                  <input
                    className="form-control"
                    value={addForm.photoData}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, photoData: e.target.value }))}
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
                      value={followUpForm.firstTimerId || selectedFirstTimer?.id || ''}
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

        {photoPreview && (
          <div className="modal-overlay active" onClick={() => setPhotoPreview(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Photo Preview</h3>
                <button className="close-modal" type="button" onClick={() => setPhotoPreview(null)}>
                  &times;
                </button>
              </div>
              <div className="modal-body" style={{ textAlign: 'center' }}>
                <img
                  src={photoPreview}
                  alt="First-timer"
                  style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '12px' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

export default FirstTimers
