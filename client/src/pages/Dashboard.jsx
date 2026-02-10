import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

const API_BASE = '/api'

function Dashboard({ onAddCell }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    members: 0,
    cells: 0,
    activeCells: 0,
    inactiveCells: 0
  })
  const [members, setMembers] = useState([])
  const [cells, setCells] = useState([])
  const [recentReports, setRecentReports] = useState([])
  const [birthdaySummary, setBirthdaySummary] = useState([])
  const [birthdayModal, setBirthdayModal] = useState({ open: false, title: '', list: [] })
  const [calendarDate, setCalendarDate] = useState(() => new Date())
  const [editingCell, setEditingCell] = useState(null)
  const [deletingCell, setDeletingCell] = useState(null)
  const [showAddBirthday, setShowAddBirthday] = useState(false)
  const [birthdayForm, setBirthdayForm] = useState({ memberId: '', day: '', month: '' })
  const [showAddDepartment, setShowAddDepartment] = useState(false)
  const [departmentForm, setDepartmentForm] = useState({ name: '', hodName: '', hodMobile: '' })
  const [departmentError, setDepartmentError] = useState('')
  const genderChartRef = useRef(null)
  const rolesChartRef = useRef(null)
  const genderChartInstance = useRef(null)
  const rolesChartInstance = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/members`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/cells`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/reports`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/birthdays/summary`, { headers }).then(r => r.ok ? r.json() : [])
    ]).then(([members, cellsData, reports, birthdays]) => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const memberCountByCell = (members || []).reduce((acc, member) => {
        const cellKey = String(member.cellId ?? member.cell_id ?? '')
        if (!cellKey) return acc
        acc[cellKey] = (acc[cellKey] || 0) + 1
        return acc
      }, {})

      const activeCellIds = new Set(
        (reports || [])
          .filter((report) => {
            const rawDate = report.date || report.report_date || report.reportDate
            const parsed = rawDate ? new Date(rawDate) : null
            return parsed && !Number.isNaN(parsed.getTime()) && parsed >= thirtyDaysAgo
          })
          .map((report) => String(report.cellId || report.cell_id))
      )

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthReportCountByCell = (reports || []).reduce((acc, report) => {
        const rawDate = report.date || report.report_date || report.reportDate
        const parsed = rawDate ? new Date(rawDate) : null
        if (!parsed || Number.isNaN(parsed.getTime()) || parsed < monthStart) return acc
        const cellKey = String(report.cellId || report.cell_id || '')
        if (!cellKey) return acc
        acc[cellKey] = (acc[cellKey] || 0) + 1
        return acc
      }, {})

      const { activeCount, inactiveCount } = cellsData.reduce(
        (acc, cell) => {
          const isActive = activeCellIds.has(String(cell.id))
          if (isActive) acc.activeCount += 1
          else acc.inactiveCount += 1
          return acc
        },
        { activeCount: 0, inactiveCount: 0 }
      )

      setStats({
        members: members.length || 0,
        cells: cellsData.length || 0,
        activeCells: activeCount,
        inactiveCells: inactiveCount
      })
      setMembers(members)
      const cellsById = cellsData.reduce((acc, cell) => {
        acc[String(cell.id)] = cell
        return acc
      }, {})

      const statusForCount = (count) => {
        if (count >= 4) return { label: 'Active', className: 'status-active' }
        if (count <= 2) return { label: 'Inactive', className: 'status-inactive' }
        return { label: 'Making Progress', className: 'status-progress' }
      }

      setCells(cellsData.map((cell) => {
        const count = monthReportCountByCell[String(cell.id)] || 0
        const status = statusForCount(count)
        return {
          ...cell,
          member_count: memberCountByCell[String(cell.id)] || 0,
          computedStatus: status.label,
          statusClass: status.className,
          reportsThisMonth: count
        }
      }))

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const recent = (reports || []).filter(report => {
        const reportDate = report.date ? new Date(report.date) : new Date(report.report_date || report.reportDate || 0)
        return reportDate >= sevenDaysAgo
      }).map((report) => {
        const attendees = Array.isArray(report.attendees) ? report.attendees : []
        const present = attendees.filter((item) => item?.present).length
        const absent = attendees.filter((item) => item && item.present === false).length
        const cellId = String(report.cellId || report.cell_id || '')
        return {
          ...report,
          cellName: report.cell_name || report.cellName || cellsById[cellId]?.name || 'Cell Report',
          presentCount: present,
          absentCount: absent
        }
      })
      setRecentReports(recent)
      const summary = Array.isArray(birthdays) ? birthdays : (birthdays?.members || [])
      setBirthdaySummary(summary)
    }).catch(() => {
      setStats({ members: 0, cells: 0, activeCells: 0, inactiveCells: 0 })
      setCells([])
      setRecentReports([])
      setBirthdaySummary([])
    })
  }, [])

  const parseMonthDay = (value) => {
    if (!value) return null
    const parts = String(value).split('-')
    if (parts.length !== 2) return null
    const month = Number(parts[0])
    const day = Number(parts[1])
    if (!month || !day) return null
    return { month, day }
  }

  const formatMonthDay = (value, fallbackDay) => {
    const parsed = parseMonthDay(value)
    if (!parsed) return fallbackDay ? String(fallbackDay) : ''
    const date = new Date(2024, parsed.month - 1, parsed.day)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  const openBirthdayModal = (day, month, list) => {
    const dateLabel = new Date(new Date().getFullYear(), month, day).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short'
    })
    setBirthdayModal({
      open: true,
      title: `Birthdays on ${dateLabel}`,
      list
    })
  }

  const closeBirthdayModal = () => {
    setBirthdayModal({ open: false, title: '', list: [] })
  }

  const handleAddBirthday = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    if (!birthdayForm.memberId || !birthdayForm.day || !birthdayForm.month) return
    const dobDay = String(birthdayForm.day).padStart(2, '0')
    const dobMonth = String(birthdayForm.month).padStart(2, '0')
    const dateOfBirth = `${dobMonth}-${dobDay}`
    const res = await fetch(`${API_BASE}/members/${birthdayForm.memberId}`, {
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
    const refreshed = await fetch(`${API_BASE}/birthdays/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => (r.ok ? r.json() : []))
    const summary = Array.isArray(refreshed) ? refreshed : (refreshed?.members || [])
    setBirthdaySummary(summary)
    setBirthdayForm({ memberId: '', day: '', month: '' })
    setShowAddBirthday(false)
  }

  const handleAddDepartment = async (event) => {
    event.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return
    setDepartmentError('')
    const res = await fetch(`${API_BASE}/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: departmentForm.name,
        hodName: departmentForm.hodName,
        hodMobile: departmentForm.hodMobile
      })
    })
    if (!res.ok) {
      setDepartmentError('Failed to add department')
      return
    }
    window.dispatchEvent(new Event('departments-updated'))
    setDepartmentForm({ name: '', hodName: '', hodMobile: '' })
    setShowAddDepartment(false)
  }

  const handleCellDelete = async () => {
    if (!deletingCell) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/cells/${deletingCell.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setCells((prev) => prev.filter((cell) => String(cell.id) !== String(deletingCell.id)))
    setDeletingCell(null)
  }

  const handleCellSave = async (event) => {
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
    setCells((prev) => prev.map((cell) => (String(cell.id) === String(updated.id) ? updated : cell)))
    setEditingCell(null)
  }

  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth()
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
  const startDay = firstDay.getDay()
  const totalDays = lastDay.getDate()
  const monthLabel = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const birthdaysByDay = (Array.isArray(birthdaySummary) ? birthdaySummary : []).reduce((acc, member) => {
    const parsed = parseMonthDay(member.dateOfBirth)
    if (!parsed || parsed.month - 1 !== calendarMonth) return acc
    if (!acc[parsed.day]) acc[parsed.day] = []
    acc[parsed.day].push(member)
    return acc
  }, {})

  useEffect(() => {
    if (!members.length || typeof Chart === 'undefined') return

    const cellMembershipCounts = members.reduce((acc, member) => {
      const hasCell = Boolean(member.cellId || member.cell_id)
      if (hasCell) acc.inCell += 1
      else acc.unassigned += 1
      return acc
    }, { inCell: 0, unassigned: 0 })

    const membersInDepartment = members.reduce((acc, member) => {
      if (member.departmentId || member.department_id) acc.inDepartment += 1
      return acc
    }, { inDepartment: 0 })

    const genderLabels = ['Members in Cells', 'Unassigned Members']
    const genderValues = [cellMembershipCounts.inCell, cellMembershipCounts.unassigned]
    const roleLabels = ['Members in Departments', 'Other Members']
    const roleValues = [membersInDepartment.inDepartment, Math.max(0, members.length - membersInDepartment.inDepartment)]
    const roleColors = ['#3b82f6', '#94a3b8']

    if (genderChartInstance.current) {
      genderChartInstance.current.data.labels = genderLabels
      genderChartInstance.current.data.datasets[0].data = genderValues
      genderChartInstance.current.update()
    } else if (genderChartRef.current) {
      genderChartInstance.current = new Chart(genderChartRef.current, {
        type: 'pie',
        data: {
          labels: genderLabels,
          datasets: [{
            data: genderValues,
            backgroundColor: ['#22c55e', '#f97316'],
            radius: '70%'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      })
    }

    if (rolesChartInstance.current) {
      rolesChartInstance.current.data.labels = roleLabels
      rolesChartInstance.current.data.datasets[0].data = roleValues
      rolesChartInstance.current.data.datasets[0].backgroundColor = roleColors
      rolesChartInstance.current.update()
    } else if (rolesChartRef.current) {
      rolesChartInstance.current = new Chart(rolesChartRef.current, {
        type: 'doughnut',
        data: {
          labels: roleLabels,
          datasets: [{ data: roleValues, backgroundColor: roleColors, radius: '70%' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      })
    }

    return () => {
      if (genderChartInstance.current) {
        genderChartInstance.current.destroy()
        genderChartInstance.current = null
      }
      if (rolesChartInstance.current) {
        rolesChartInstance.current.destroy()
        rolesChartInstance.current = null
      }
    }
  }, [members])

  const formatDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString()
  }

  return (
    <div className="dashboard-page">
      <div className="stats-container" id="statsContainer">
        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-users"></i>
          </div>
          <div className="stat-title">Total Members</div>
          <div className="stat-value">{stats.members}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-layer-group"></i>
          </div>
          <div className="stat-title">Total Cells</div>
          <div className="stat-value">{stats.cells}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <i className="fas fa-check-circle"></i>
          </div>
          <div className="stat-title">Active Cells</div>
          <div className="stat-value">{stats.activeCells}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon inactive">
            <i className="fas fa-times-circle"></i>
          </div>
          <div className="stat-title">Inactive Cells</div>
          <div className="stat-value">{stats.inactiveCells}</div>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Members in Cells</h2>
          </div>
          <canvas ref={genderChartRef} height="200"></canvas>
        </div>
        <div className="chart-card">
          <div className="section-header" style={{ marginTop: 0 }}>
            <h2>Member Roles</h2>
          </div>
          <canvas ref={rolesChartRef} height="200"></canvas>
        </div>
      </div>

      <div className="birthday-section">
        <div className="section-header" style={{ marginTop: 0 }}>
          <h2>Birthdays Calendar</h2>
        </div>
        <div className="birthday-calendar" id="birthdayCalendar">
          <div className="calendar-header">
            <button
              className="calendar-nav-btn"
              type="button"
              onClick={() => setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <div className="calendar-title">{monthLabel}</div>
            <button
              className="calendar-nav-btn"
              type="button"
              onClick={() => setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
          <div className="calendar-grid">
            {weekdays.map((day) => (
              <div key={day} className="calendar-weekday">{day}</div>
            ))}
            {Array.from({ length: startDay }).map((_, idx) => (
              <div key={`blank-${idx}`} className="calendar-cell muted"></div>
            ))}
            {Array.from({ length: totalDays }).map((_, idx) => {
              const day = idx + 1
              const list = birthdaysByDay[day] || []
              const hasBirthday = list.length > 0
              return (
                <button
                  key={`day-${day}`}
                  className={`calendar-cell${hasBirthday ? ' has-birthday' : ''}`}
                  type="button"
                  onClick={() => {
                    if (hasBirthday) {
                      openBirthdayModal(day, calendarMonth, list)
                    } else {
                      setShowAddBirthday(true)
                    }
                  }}
                >
                  <span className="calendar-day">{day}</span>
                  {hasBirthday && <span className="calendar-dot"></span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="section-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>All Cell Groups</h2>
        <div className="page-actions">
          <button
            className="btn btn-success"
            type="button"
            onClick={() => {
              setDepartmentForm({ name: '', hodName: '', hodMobile: '' })
              setDepartmentError('')
              setShowAddDepartment(true)
            }}
          >
            <i className="fas fa-plus"></i> Add Department
          </button>
          <button
            className="btn btn-success"
            type="button"
            onClick={() => (onAddCell ? onAddCell() : window.dispatchEvent(new Event('open-add-cell')))}
          >
            <i className="fas fa-plus"></i> Add New Cell
          </button>
        </div>
      </div>

      {showAddDepartment && (
        <div className="modal-overlay active" onClick={() => setShowAddDepartment(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Department</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddDepartment(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {departmentError && (
                <div className="inline-error" style={{ marginBottom: '12px' }}>{departmentError}</div>
              )}
              <form onSubmit={handleAddDepartment}>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={departmentForm.name}
                    onChange={(e) => setDepartmentForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>HOD Name</label>
                  <input
                    className="form-control"
                    value={departmentForm.hodName}
                    onChange={(e) => setDepartmentForm((prev) => ({ ...prev, hodName: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>HOD Mobile</label>
                  <input
                    className="form-control"
                    value={departmentForm.hodMobile}
                    onChange={(e) => setDepartmentForm((prev) => ({ ...prev, hodMobile: e.target.value }))}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setShowAddDepartment(false)}>
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

      <div className="table-container">
        <table id="cellsTable" className="full-table-mobile">
          <thead>
            <tr>
              <th>Cell Name</th>
              <th>Meeting Venue</th>
              <th>Members</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="cellsTableBody">
            {cells.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  Cells will load here.
                </td>
              </tr>
            )}
            {cells.map(cell => (
              <tr key={cell.id} className={cell.statusClass || ''}>
                <td>{cell.name}</td>
                <td>{cell.venue || '-'}</td>
                <td>{cell.member_count || cell.membersCount || '-'}</td>
                <td>{cell.computedStatus || 'Inactive'}</td>
                <td>
                  <div className="action-buttons">
                    <button className="action-btn edit-btn" type="button" onClick={() => setEditingCell({ ...cell })}>
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button className="action-btn delete-btn" type="button" onClick={() => setDeletingCell(cell)}>
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination" id="cellsPagination"></div>

      <div className="section-header">
        <h2>Recent Reports (Last 7 Days)</h2>
      </div>

      <div className="reports-grid" id="recentReports">
        {recentReports.length === 0 && (
          <div className="dashboard-note">
            Recent reports will show here once available.
          </div>
        )}
        {recentReports.map(report => (
          <div className="report-card" key={report.id}>
            <div className="report-header">
              <div>
                <div className="report-title">{report.cellName || report.cell_name || 'Cell Report'}</div>
                <div className="report-date">{formatDate(report.date || report.report_date || report.reportDate)}</div>
              </div>
            </div>
            <div className="report-body">
              <div><strong>Venue:</strong> {report.venue || '-'}</div>
              <div><strong>Meeting Type:</strong> {report.meeting_type || report.meetingType || '-'}</div>
              <div><strong>P:</strong> {report.presentCount ?? 0} &nbsp; <strong>A:</strong> {report.absentCount ?? 0}</div>
            </div>
          </div>
        ))}
      </div>

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
              <form onSubmit={handleCellSave}>
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
              <p className="confirmation-text">Delete {deletingCell.name || 'this cell'}?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingCell(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" type="button" onClick={handleCellDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {birthdayModal.open && (
        <div className="modal-overlay active" onClick={closeBirthdayModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{birthdayModal.title}</h3>
              <button className="close-modal" type="button" onClick={closeBirthdayModal}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {birthdayModal.list.length === 0 ? (
                <div className="dashboard-note">No birthdays.</div>
              ) : (
                <div className="table-container">
                  <table className="mobile-grid-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cell</th>
                        <th>Birthday</th>
                        <th>Mobile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {birthdayModal.list.map((member) => {
                        const cell = cells.find((c) => String(c.id) === String(member.cellId))
                        return (
                          <tr key={`birthday-${member.id}`}>
                            <td data-label="Name">{member.name || ''}</td>
                            <td data-label="Cell">{cell ? cell.name : ''}</td>
                            <td data-label="Birthday">{formatMonthDay(member.dateOfBirth)}</td>
                            <td data-label="Mobile">
                              {member.mobile ? <a href={`tel:${member.mobile}`}>{member.mobile}</a> : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddBirthday && (
        <div className="modal-overlay active" onClick={() => setShowAddBirthday(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Birthday</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddBirthday(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddBirthday}>
                <div className="form-group">
                  <label>Member</label>
                  <select
                    className="form-control"
                    value={birthdayForm.memberId}
                    onChange={(e) => setBirthdayForm((prev) => ({ ...prev, memberId: e.target.value }))}
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
                      value={birthdayForm.day}
                      onChange={(e) => setBirthdayForm((prev) => ({ ...prev, day: e.target.value }))}
                      required
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }).map((_, idx) => (
                        <option key={`day-${idx + 1}`} value={idx + 1}>{idx + 1}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      value={birthdayForm.month}
                      onChange={(e) => setBirthdayForm((prev) => ({ ...prev, month: e.target.value }))}
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
                  <button className="btn" type="button" onClick={() => setShowAddBirthday(false)}>
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

export default Dashboard
