import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './Cells.css'

const API_BASE = '/api'
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function Cells() {
  const location = useLocation()
  const navigate = useNavigate()
  const [cells, setCells] = useState([])
  const [reports, setReports] = useState([])
  const [members, setMembers] = useState([])
  const [departments, setDepartments] = useState([])
  const [activeCellId, setActiveCellId] = useState(null)
  const [activeTab, setActiveTab] = useState('members')
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [meetingFilter, setMeetingFilter] = useState('all')
  const [editingCell, setEditingCell] = useState(null)
  const [deletingCell, setDeletingCell] = useState(null)
  const [editingMember, setEditingMember] = useState(null)
  const [deletingMember, setDeletingMember] = useState(null)
  const [editingReport, setEditingReport] = useState(null)
  const [deletingReport, setDeletingReport] = useState(null)
  const [showAddReport, setShowAddReport] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberForm, setMemberForm] = useState({
    title: '',
    name: '',
    gender: '',
    mobile: '',
    email: '',
    role: '',
    departmentId: '',
    dobDay: '',
    dobMonth: ''
  })
  const dobDays = useMemo(() => Array.from({ length: 31 }, (_, i) => String(i + 1)), [])
  const dobMonths = useMemo(() => ([
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ]), [])
  const [reportForm, setReportForm] = useState({
    date: '',
    venue: '',
    meetingType: '',
    description: '',
    attendees: []
  })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const targetId = params.get('cellId')
    if (targetId && String(targetId) !== String(activeCellId)) {
      setActiveCellId(String(targetId))
    }
  }, [location.search, activeCellId])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/cells`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/reports`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/members`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/departments`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([cellsData, reportsData, membersData, departmentsData]) => {
        const safeCells = Array.isArray(cellsData) ? cellsData : []
        setCells(safeCells)
        setReports(Array.isArray(reportsData) ? reportsData : [])
        setMembers(Array.isArray(membersData) ? membersData : [])
        setDepartments(Array.isArray(departmentsData) ? departmentsData : [])
        if (!activeCellId && safeCells.length) {
          setActiveCellId(String(safeCells[0].id))
        }
      })
      .catch(() => {
        setCells([])
        setReports([])
        setMembers([])
        setDepartments([])
      })
  }, [activeCellId])

  const activeCell = useMemo(
    () => cells.find((cell) => String(cell.id) === String(activeCellId)),
    [cells, activeCellId]
  )

  useEffect(() => {
    if (!cells.length) return
    if (activeCell) return
    setActiveCellId(String(cells[0].id))
  }, [cells, activeCell, activeCellId])

  useEffect(() => {
    if (!activeCell) return
    try {
      const meta = JSON.parse(localStorage.getItem('pageMeta') || '{}')
      const updated = {
        ...meta,
        '/cells': {
          ...(meta['/cells'] || {}),
          label: activeCell.name || 'Cell'
        }
      }
      localStorage.setItem('pageMeta', JSON.stringify(updated))
      window.dispatchEvent(new Event('page-meta-updated'))
    } catch {}
  }, [activeCell])

  const cellMembers = useMemo(
    () => members.filter((member) => String(member.cellId || member.cell_id) === String(activeCellId)),
    [members, activeCellId]
  )

  const cellReports = useMemo(
    () => reports.filter((report) => String(report.cellId || report.cell_id) === String(activeCellId)),
    [reports, activeCellId]
  )

  const meetingOptions = useMemo(() => ([
    'Prayer and Planning',
    'Bible Study 1',
    'Bible Study 2',
    'Outreach Meeting'
  ]), [])

  const buildAttendeesList = (currentMembers, existing) => {
    const existingList = Array.isArray(existing) ? existing : []
    const byId = new Map()
    existingList.forEach((item) => {
      if (item && typeof item === 'object') {
        const key = String(item.memberId || item.id || item.name || '')
        if (key) byId.set(key, item)
      } else if (typeof item === 'string') {
        byId.set(item, { name: item, present: true })
      }
    })
    return currentMembers.map((member) => {
      const key = String(member.id)
      const cached = byId.get(key) || byId.get(member.name)
      return {
        memberId: member.id,
        name: member.name,
        present: cached?.present ?? false
      }
    })
  }

  useEffect(() => {
    if (!showAddReport) return
    setReportForm((prev) => ({
      ...prev,
      attendees: buildAttendeesList(cellMembers, prev.attendees)
    }))
  }, [showAddReport, cellMembers])

  const years = useMemo(() => {
    const list = new Set()
    cellReports.forEach((report) => {
      const date = report.date || report.report_date || report.reportDate
      if (!date) return
      const parsed = new Date(date)
      if (!Number.isNaN(parsed.getTime())) list.add(parsed.getFullYear())
    })
    return Array.from(list).sort((a, b) => b - a)
  }, [cellReports])

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase()
    return cellReports.filter((report) => {
      const rawDate = report.date || report.report_date || report.reportDate
      const parsed = rawDate ? new Date(rawDate) : null
      const year = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getFullYear() : null
      const month = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getMonth() : null
      const meetingType = report.meeting_type || report.meetingType || ''

      if (yearFilter !== 'all' && year !== Number(yearFilter)) return false
      if (monthFilter !== 'all' && month !== Number(monthFilter)) return false
      if (meetingFilter !== 'all' && meetingType !== meetingFilter) return false

      if (!term) return true
      const venue = report.venue || ''
      const description = report.description || report.notes || ''
      const haystack = `${meetingType} ${venue} ${description}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [cellReports, search, yearFilter, monthFilter, meetingFilter])

  const formatDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleDateString()
  }

  const toDateTimeLocal = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }

  const handleDelete = async () => {
    if (!deletingCell) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/cells/${deletingCell.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setCells((prev) => prev.filter((c) => String(c.id) !== String(deletingCell.id)))
    if (String(activeCellId) === String(deletingCell.id)) {
      setActiveCellId(null)
    }
    setDeletingCell(null)
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
    setMembers((prev) => prev.filter((m) => String(m.id) !== String(deletingMember.id)))
    setDeletingMember(null)
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: editingMember.title,
        name: editingMember.name,
        gender: editingMember.gender,
        mobile: editingMember.mobile,
        email: editingMember.email,
        role: editingMember.role,
        departmentId: editingMember.departmentId || editingMember.department_id || null,
        dobDay: editingMember.dobDay || editingMember.dob_day || '',
        dobMonth: editingMember.dobMonth || editingMember.dob_month || ''
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setMembers((prev) => prev.map((m) => (String(m.id) === String(updated.id) ? updated : m)))
    setEditingMember(null)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editingCell) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/cells/${editingCell.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: editingCell.name,
        venue: editingCell.venue,
        day: editingCell.day,
        time: editingCell.time,
        description: editingCell.description
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setCells((prev) => prev.map((c) => (String(c.id) === String(updated.id) ? updated : c)))
    setEditingCell(null)
  }

  const handleReportDelete = async () => {
    if (!deletingReport) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/reports/${deletingReport.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setReports((prev) => prev.filter((r) => String(r.id) !== String(deletingReport.id)))
    setDeletingReport(null)
  }

  const handleReportSave = async (event) => {
    event.preventDefault()
    if (!editingReport) return
    const token = localStorage.getItem('token')
    if (!token) {
      alert('Please log in again to save this report.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/reports/${editingReport.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          date: editingReport.date,
          venue: editingReport.venue,
          meetingType: editingReport.meetingType || editingReport.meeting_type,
          description: editingReport.description,
          attendees: editingReport.attendees || []
        })
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save report')
      }
      setReports((prev) => prev.map((r) => (String(r.id) === String(payload.id) ? payload : r)))
      setEditingReport(null)
    } catch (err) {
      alert(err.message || 'Failed to save report')
    }
  }

  const handleAddMember = async (event) => {
    event.preventDefault()
    if (!activeCellId) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        cellId: activeCellId,
        title: memberForm.title,
        name: memberForm.name,
        gender: memberForm.gender,
        mobile: memberForm.mobile,
        email: memberForm.email,
        role: memberForm.role,
        departmentId: memberForm.departmentId || null,
        dobDay: memberForm.dobDay,
        dobMonth: memberForm.dobMonth
      })
    })
    if (!res.ok) return
    const created = await res.json()
    setMembers((prev) => [created, ...prev])
    setMemberForm({ title: '', name: '', gender: '', mobile: '', email: '', role: '', departmentId: '', dobDay: '', dobMonth: '' })
    setShowAddMember(false)
  }

  const handleAddReport = async (event) => {
    event.preventDefault()
    if (!activeCellId) return
    const token = localStorage.getItem('token')
    if (!token) {
      alert('Please log in again to add a report.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cellId: activeCellId,
          date: reportForm.date,
          venue: reportForm.venue,
          meetingType: reportForm.meetingType,
          description: reportForm.description,
          attendees: reportForm.attendees || []
        })
      })
      const created = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(created.error || 'Failed to add report')
      }
      setReports((prev) => [created, ...prev])
      setReportForm({
        date: '',
        venue: '',
        meetingType: '',
        description: '',
        attendees: []
      })
      setShowAddReport(false)
    } catch (err) {
      alert(err.message || 'Failed to add report')
    }
  }

  return (
    <div className="cells-page">
      {!activeCell && (
        <div className="dashboard-note" style={{ marginTop: '20px' }}>
          {cells.length === 0 ? 'No cells found.' : 'Selected cell not found. Loading another cell...'}
        </div>
      )}
      {activeCell && (
        <div className="cell-details">
          <div className="page-actions page-actions-below" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn" type="button" onClick={() => setEditingCell({ ...activeCell })}>
              <i className="fas fa-edit"></i> Edit Cell
            </button>
            <button className="btn btn-danger" type="button" onClick={() => setDeletingCell(activeCell)}>
              <i className="fas fa-trash"></i> Delete Cell
            </button>
          </div>
          <div className="cell-summary-card">
            <div className="cell-summary-grid">
              <div>
                <div className="cell-summary-label">Day of Meeting</div>
                <div className="cell-summary-value">{activeCell.day || '-'}</div>
              </div>
              <div>
                <div className="cell-summary-label">Time</div>
                <div className="cell-summary-value">{activeCell.time || '-'}</div>
              </div>
              <div>
                <div className="cell-summary-label">Venue</div>
                <div className="cell-summary-value">{activeCell.venue || '-'}</div>
              </div>
            </div>
            <div className="cell-summary-description">
              <div className="cell-summary-label">Description</div>
              <div className="cell-summary-value">{activeCell.description || '-'}</div>
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
            <button
              className={`cell-tab-btn${activeTab === 'reports' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('reports')}
            >
              Reports | Cell Data
            </button>
            </div>
            {activeTab === 'members' && (
              <div className="cell-tabs-actions">
                <button className="btn btn-success" type="button" onClick={() => setShowAddMember(true)}>
                  <i className="fas fa-user-plus"></i> Add Member
                </button>
              </div>
            )}
            {activeTab === 'reports' && (
              <div className="cell-tabs-actions">
                <button className="btn btn-success" type="button" onClick={() => setShowAddReport(true)}>
                  <i className="fas fa-plus"></i> Add Report
                </button>
              </div>
            )}
          </div>

          {activeTab === 'members' && (
            <div className="table-container">
              <table className="mobile-grid-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>Mobile</th>
                    <th>Cell Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cellMembers.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                        No members found.
                      </td>
                    </tr>
                  )}
                  {cellMembers.map((member) => (
                    <tr key={member.id}>
                      <td data-label="Title">{member.title || '-'}</td>
                      <td data-label="Name">{member.name || '-'}</td>
                      <td data-label="Gender">{member.gender || '-'}</td>
                      <td data-label="Mobile">{member.mobile || '-'}</td>
                      <td data-label="Cell Role">{member.role || '-'}</td>
                      <td data-label="Actions">
                        <div className="action-buttons">
                          <button className="action-btn edit-btn" type="button" onClick={() => setEditingMember({ ...member })}>
                            <i className="fas fa-edit"></i> Edit
                          </button>
                          <button className="action-btn delete-btn" type="button" onClick={() => setDeletingMember(member)}>
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

          {activeTab === 'reports' && (
            <>
              <div className="page-actions" style={{ justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search reports..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="reports-filters">
                  <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                    <option value="all">All Years</option>
                    {years.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                    <option value="all">All Months</option>
                    {MONTHS.map((month, idx) => (
                      <option key={month} value={idx}>{month}</option>
                    ))}
                  </select>
                  <select value={meetingFilter} onChange={(e) => setMeetingFilter(e.target.value)}>
                    <option value="all">All Meeting Types</option>
                    {meetingOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="table-container">
                <table className="mobile-grid-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Venue</th>
                      <th>Meeting Type</th>
                      <th>Summary</th>
                      <th>Attendance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                          No reports found.
                        </td>
                      </tr>
                    )}
                    {filteredReports.map((report) => (
                      <tr key={report.id}>
                        <td data-label="Date">{formatDate(report.date || report.report_date || report.reportDate)}</td>
                        <td data-label="Venue">{report.venue || '-'}</td>
                        <td data-label="Meeting Type">{report.meeting_type || report.meetingType || '-'}</td>
                        <td data-label="Summary">{report.description || report.notes || '-'}</td>
                        <td data-label="Attendance">
                          {(() => {
                            const attendees = Array.isArray(report.attendees) ? report.attendees : []
                            const present = attendees.filter((item) => item?.present).length
                            const absent = attendees.filter((item) => item && item.present === false).length
                            if (!attendees.length) return '-'
                            return `${present}P / ${absent}A`
                          })()}
                        </td>
                        <td data-label="Actions">
                          <div className="action-buttons">
                            <button className="action-btn edit-btn" type="button" onClick={() => setEditingReport({ ...report })}>
                              <i className="fas fa-edit"></i> Edit
                            </button>
                            <button className="action-btn delete-btn" type="button" onClick={() => setDeletingReport(report)}>
                              <i className="fas fa-trash"></i> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {editingCell && (
        <div className="modal-overlay active" onClick={() => setEditingCell(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Cell</h3>
              <button className="close-modal" type="button" onClick={() => setEditingCell(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Cell Name</label>
                  <input
                    className="form-control"
                    value={editingCell.name || ''}
                    onChange={(e) => setEditingCell({ ...editingCell, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Meeting Venue</label>
                  <input
                    className="form-control"
                    value={editingCell.venue || ''}
                    onChange={(e) => setEditingCell({ ...editingCell, venue: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Meeting Day</label>
                  <input
                    className="form-control"
                    value={editingCell.day || ''}
                    onChange={(e) => setEditingCell({ ...editingCell, day: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Meeting Time</label>
                  <input
                    type="time"
                    className="form-control"
                    value={editingCell.time || ''}
                    onChange={(e) => setEditingCell({ ...editingCell, time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={editingCell.description || ''}
                    onChange={(e) => setEditingCell({ ...editingCell, description: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingCell(null)}>
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

      {deletingCell && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingCell(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete {deletingCell.name || 'this cell'}?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingCell(null)}>
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
                  <select
                    className="form-control"
                    value={editingMember.role || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                  >
                    <option value="">Select Role</option>
                    <option value="Cell Leader">Cell Leader</option>
                    <option value="Assistant Leader">Assistant Leader</option>
                    <option value="BSCT">BSCT</option>
                    <option value="Member">Member</option>
                    <option value="New Member">New Member</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select
                    className="form-control"
                    value={editingMember.departmentId || editingMember.department_id || ''}
                    onChange={(e) => setEditingMember({ ...editingMember, departmentId: e.target.value })}
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select
                      className="form-control"
                      value={editingMember.dobDay || editingMember.dob_day || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, dobDay: e.target.value })}
                    >
                      <option value="">Day</option>
                      {dobDays.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      value={editingMember.dobMonth || editingMember.dob_month || ''}
                      onChange={(e) => setEditingMember({ ...editingMember, dobMonth: e.target.value })}
                    >
                      <option value="">Month</option>
                      {dobMonths.map((month) => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
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
                <button className="btn btn-danger" type="button" onClick={handleMemberDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingReport && (
        <div className="modal-overlay active" onClick={() => setEditingReport(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Report</h3>
              <button className="close-modal" type="button" onClick={() => setEditingReport(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleReportSave}>
                <div className="form-group">
                  <label>Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={toDateTimeLocal(editingReport.date || editingReport.report_date || editingReport.reportDate)}
                    onChange={(e) => setEditingReport({ ...editingReport, date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input
                    className="form-control"
                    value={editingReport.venue || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, venue: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Meeting Type</label>
                  <select
                    className="form-control"
                    value={editingReport.meetingType || editingReport.meeting_type || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, meetingType: e.target.value })}
                  >
                    <option value="">Select Meeting Type</option>
                    {meetingOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Summary</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={editingReport.description || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, description: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Attendees</label>
                  <div className="attendees-list">
                    {buildAttendeesList(cellMembers, editingReport.attendees).map((attendee) => (
                      <label key={attendee.memberId} className="attendee-row">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            (editingReport.attendees || []).find((item) => String(item.memberId) === String(attendee.memberId))?.present
                          )}
                          onChange={(e) => {
                            setEditingReport((prev) => ({
                              ...prev,
                              attendees: buildAttendeesList(cellMembers, prev.attendees).map((item) =>
                                String(item.memberId) === String(attendee.memberId)
                                  ? { ...item, present: e.target.checked }
                                  : item
                              )
                            }))
                          }}
                        />
                        <span>{attendee.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingReport(null)}>
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

      {deletingReport && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingReport(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">
                Delete this report?
              </p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingReport(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleReportDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddReport && (
        <div className="modal-overlay active" onClick={() => setShowAddReport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Report</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddReport(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddReport}>
                <div className="form-group">
                  <label>Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={reportForm.date}
                    onChange={(e) => setReportForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input
                    className="form-control"
                    value={reportForm.venue}
                    onChange={(e) => setReportForm((prev) => ({ ...prev, venue: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Meeting Type</label>
                  <select
                    className="form-control"
                    value={reportForm.meetingType}
                    onChange={(e) => setReportForm((prev) => ({ ...prev, meetingType: e.target.value }))}
                    required
                  >
                    <option value="">Select Meeting Type</option>
                    {meetingOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Summary</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={reportForm.description}
                    onChange={(e) => setReportForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Attendees</label>
                  <div className="attendees-list">
                    {buildAttendeesList(cellMembers, reportForm.attendees).map((attendee) => (
                      <label key={attendee.memberId} className="attendee-row">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            (reportForm.attendees || []).find((item) => String(item.memberId) === String(attendee.memberId))?.present
                          )}
                          onChange={(e) => {
                            setReportForm((prev) => ({
                              ...prev,
                              attendees: buildAttendeesList(cellMembers, prev.attendees).map((item) =>
                                String(item.memberId) === String(attendee.memberId)
                                  ? { ...item, present: e.target.checked }
                                  : item
                              )
                            }))
                          }}
                        />
                        <span>{attendee.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAddReport(false)}>
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

      {showAddMember && (
        <div className="modal-overlay active" onClick={() => setShowAddMember(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Member</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddMember(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddMember}>
                <div className="form-group">
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={memberForm.title}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, title: e.target.value }))}
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
                  <label>Full Name</label>
                  <input
                    className="form-control"
                    value={memberForm.name}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select
                    className="form-control"
                    value={memberForm.gender}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, gender: e.target.value }))}
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
                    value={memberForm.mobile}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, mobile: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    value={memberForm.email}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Cell Role</label>
                  <select
                    className="form-control"
                    value={memberForm.role}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="">Select Role</option>
                    <option value="Cell Leader">Cell Leader</option>
                    <option value="Assistant Leader">Assistant Leader</option>
                    <option value="BSCT">BSCT</option>
                    <option value="Member">Member</option>
                    <option value="New Member">New Member</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select
                    className="form-control"
                    value={memberForm.departmentId}
                    onChange={(e) => setMemberForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <select
                      className="form-control"
                      value={memberForm.dobDay}
                      onChange={(e) => setMemberForm((prev) => ({ ...prev, dobDay: e.target.value }))}
                    >
                      <option value="">Day</option>
                      {dobDays.map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      value={memberForm.dobMonth}
                      onChange={(e) => setMemberForm((prev) => ({ ...prev, dobMonth: e.target.value }))}
                    >
                      <option value="">Month</option>
                      {dobMonths.map((month) => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAddMember(false)}>
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

export default Cells
