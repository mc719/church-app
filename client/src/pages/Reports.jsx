import { useEffect, useMemo, useState } from 'react'
import './Reports.css'

const API_BASE = '/api'
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function Reports() {
  const [reports, setReports] = useState([])
  const [cells, setCells] = useState([])
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [meetingFilter, setMeetingFilter] = useState('all')
  const [editingReport, setEditingReport] = useState(null)
  const [deletingReport, setDeletingReport] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      fetch(`${API_BASE}/reports`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/cells`, { headers }).then((r) => (r.ok ? r.json() : []))
    ])
      .then(([reportsData, cellsData]) => {
        setReports(Array.isArray(reportsData) ? reportsData : [])
        setCells(Array.isArray(cellsData) ? cellsData : [])
      })
      .catch(() => {
        setReports([])
        setCells([])
      })
  }, [])

  const meetingTypes = useMemo(() => {
    const types = new Set()
    reports.forEach((report) => {
      const type = report.meeting_type || report.meetingType
      if (type) types.add(type)
    })
    return Array.from(types)
  }, [reports])

  const years = useMemo(() => {
    const list = new Set()
    reports.forEach((report) => {
      const date = report.date || report.report_date || report.reportDate
      if (!date) return
      const parsed = new Date(date)
      if (!Number.isNaN(parsed.getTime())) {
        list.add(parsed.getFullYear())
      }
    })
    return Array.from(list).sort((a, b) => b - a)
  }, [reports])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return reports.filter((report) => {
      const rawDate = report.date || report.report_date || report.reportDate
      const parsed = rawDate ? new Date(rawDate) : null
      const year = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getFullYear() : null
      const month = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getMonth() : null
      const meetingType = report.meeting_type || report.meetingType || ''

      if (yearFilter !== 'all' && year !== Number(yearFilter)) return false
      if (monthFilter !== 'all' && month !== Number(monthFilter)) return false
      if (meetingFilter !== 'all' && meetingType !== meetingFilter) return false

      if (!term) return true
      const cellName = report.cell_name || report.cellName || ''
      const venue = report.venue || ''
      const description = report.description || report.notes || ''
      const haystack = `${cellName} ${meetingType} ${venue} ${description}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [reports, search, yearFilter, monthFilter, meetingFilter])

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

  const toDateTimeLocal = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const offset = date.getTimezoneOffset()
    const local = new Date(date.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }

  const getCellName = (report) => {
    if (report.cell_name || report.cellName) return report.cell_name || report.cellName
    const match = cells.find((cell) => String(cell.id) === String(report.cellId || report.cell_id))
    return match ? match.name : '-'
  }

  const handleDelete = async () => {
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

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editingReport) return
    const token = localStorage.getItem('token')
    if (!token) return
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
        description: editingReport.description
      })
    })
    if (!res.ok) return
    const updated = await res.json()
    setReports((prev) => prev.map((r) => (String(r.id) === String(updated.id) ? updated : r)))
    setEditingReport(null)
  }

  return (
    <div className="reports-page">
      <div className="page-actions" style={{ justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginTop: '12px' }}>
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
            {meetingTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>Cell</th>
              <th>Date</th>
              <th>Time</th>
              <th>Venue</th>
              <th>Meeting Type</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No reports found.
                </td>
              </tr>
            )}
            {filtered.map((report) => (
              <tr key={report.id}>
                <td data-label="Cell">{getCellName(report)}</td>
                <td data-label="Date">{formatDate(report.date || report.report_date || report.reportDate)}</td>
                <td data-label="Time">{formatTime(report.date || report.report_date || report.reportDate)}</td>
                <td data-label="Venue">{report.venue || '-'}</td>
                <td data-label="Meeting Type">{report.meeting_type || report.meetingType || '-'}</td>
                <td data-label="Description">{report.description || report.notes || '-'}</td>
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
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Cell</label>
                  <input className="form-control" value={getCellName(editingReport)} disabled />
                </div>
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
                  <input
                    className="form-control"
                    value={editingReport.meetingType || editingReport.meeting_type || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, meetingType: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={editingReport.description || ''}
                    onChange={(e) => setEditingReport({ ...editingReport, description: e.target.value })}
                  />
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

export default Reports
