import { useEffect, useMemo, useState } from 'react'
import './Sessions.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function Sessions() {
  const [sessions, setSessions] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/sessions`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sessions
    return sessions.filter((session) => {
      const values = [
        session.username,
        session.ipAddress,
        session.browser,
        session.os,
        session.timezone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return values.includes(term)
    })
  }, [sessions, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.loginTime || a.login_time || 0).getTime()
      const bTime = new Date(b.loginTime || b.login_time || 0).getTime()
      return bTime - aTime
    })
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageSessions = sorted.slice(startIndex, startIndex + PAGE_SIZE)

  const formatDateTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString()
  }

  const parseUserAgent = (ua = '') => {
    let browser = 'Unknown'
    let os = 'Unknown'
    let device = 'Desktop'

    if (ua.includes('Edg/')) browser = 'Edge'
    else if (ua.includes('Chrome/')) browser = 'Chrome'
    else if (ua.includes('Firefox/')) browser = 'Firefox'
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'

    if (ua.includes('Windows')) os = 'Windows'
    else if (ua.includes('Mac OS X')) os = 'macOS'
    else if (ua.includes('Android')) { os = 'Android'; device = 'Mobile' }
    else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; device = 'Mobile' }
    else if (ua.includes('Linux')) os = 'Linux'

    if (ua.includes('Mobile')) device = 'Mobile'
    if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet'
    return { browser, os, device }
  }

  const handleExport = () => {
    const rows = [
      ['User', 'Start Time', 'Logout Time', 'IP Address', 'Browser', 'OS', 'Device', 'Timezone', 'Status'],
      ...sorted.map((session) => {
        const ua = parseUserAgent(session.userAgent || '')
        return [
          session.username || '',
          formatDateTime(session.loginTime || session.login_time),
          formatDateTime(session.logoutTime || session.logout_time),
          session.ipAddress || '',
          session.browser || ua.browser,
          session.os || ua.os,
          ua.device,
          session.timezone || '',
          session.logoutTime ? 'Ended' : 'Active'
        ]
      })
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sessions.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="sessions-page">
      <div className="page-actions" style={{ justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <button className="btn" type="button" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Start Time</th>
              <th>Logout Time</th>
              <th>IP Address</th>
              <th>Browser</th>
              <th>OS</th>
              <th>Device</th>
              <th>Timezone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageSessions.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No sessions recorded yet.
                </td>
              </tr>
            )}
            {pageSessions.map((session) => (
              <tr key={session.id}>
                {(() => {
                  const ua = parseUserAgent(session.userAgent || '')
                  const status = session.logoutTime ? 'Ended' : 'Active'
                  return (
                    <>
                      <td data-label="User">{session.username || '-'}</td>
                      <td data-label="Start Time">{formatDateTime(session.loginTime || session.login_time)}</td>
                      <td data-label="Logout Time">{formatDateTime(session.logoutTime || session.logout_time)}</td>
                      <td data-label="IP Address">{session.ipAddress || '-'}</td>
                      <td data-label="Browser">{session.browser || ua.browser}</td>
                      <td data-label="OS">{session.os || ua.os}</td>
                      <td data-label="Device">{ua.device}</td>
                      <td data-label="Timezone">{session.timezone || '-'}</td>
                      <td data-label="Status">
                        <span className={`status-badge ${status === 'Active' ? 'status-active' : 'status-ended'}`}>
                          {status}
                        </span>
                      </td>
                    </>
                  )
                })()}
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
    </div>
  )
}

export default Sessions
