import { useEffect, useMemo, useState } from 'react'
import './Sessions.css'

const API_BASE = '/api'
const PAGE_SIZE = 20

function parseUserAgent(ua = '') {
  let browser = 'Unknown'
  let os = 'Unknown'
  let device = 'Desktop'

  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'

  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('Android')) {
    os = 'Android'
    device = 'Mobile'
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS'
    device = 'Mobile'
  } else if (ua.includes('Linux')) os = 'Linux'

  if (ua.includes('Mobile')) device = 'Mobile'
  if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet'
  return { browser, os, device }
}

function deriveLocationFromIp(ip = '') {
  const value = String(ip || '').trim()
  if (!value) return 'Unknown'
  if (value === '::1' || value === '127.0.0.1') return 'Localhost'
  if (
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    value.startsWith('172.16.') ||
    value.startsWith('172.17.') ||
    value.startsWith('172.18.') ||
    value.startsWith('172.19.') ||
    value.startsWith('172.2') ||
    value.startsWith('172.30.') ||
    value.startsWith('172.31.') ||
    value.startsWith('fd') ||
    value.startsWith('fc')
  ) {
    return 'Private Network'
  }
  return 'Public Network'
}

function getRisk(session) {
  const loginAt = new Date(session.loginTime || session.login_time || 0)
  const isActive = !(session.logoutTime || session.logout_time)
  const unknownStack =
    (session.browser || parseUserAgent(session.userAgent || '').browser) === 'Unknown' ||
    (session.os || parseUserAgent(session.userAgent || '').os) === 'Unknown'
  const missingIp = !session.ipAddress || session.ipAddress === '-'
  const oldActive =
    isActive &&
    !Number.isNaN(loginAt.getTime()) &&
    Date.now() - loginAt.getTime() > 24 * 60 * 60 * 1000

  if (oldActive || (isActive && (unknownStack || missingIp))) return 'suspicious'
  if (isActive) return 'active'
  return 'ended'
}

function Sessions() {
  const [sessions, setSessions] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deviceFilter, setDeviceFilter] = useState('all')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_BASE}/sessions`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
  }, [])

  const enriched = useMemo(() => {
    return sessions.map((session) => {
      const parsed = parseUserAgent(session.userAgent || '')
      const status = session.logoutTime || session.logout_time ? 'ended' : 'active'
      const risk = getRisk(session)
      return {
        ...session,
        parsedBrowser: session.browser || parsed.browser,
        parsedOs: session.os || parsed.os,
        parsedDevice: parsed.device,
        location: deriveLocationFromIp(session.ipAddress),
        status,
        risk
      }
    })
  }, [sessions])

  const stats = useMemo(() => {
    return enriched.reduce(
      (acc, session) => {
        acc.total += 1
        if (session.status === 'active') acc.active += 1
        if (session.status === 'ended') acc.ended += 1
        if (session.risk === 'suspicious') acc.suspicious += 1
        return acc
      },
      { total: 0, active: 0, ended: 0, suspicious: 0 }
    )
  }, [enriched])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return enriched.filter((session) => {
      if (statusFilter !== 'all' && session.status !== statusFilter) return false
      if (deviceFilter !== 'all' && session.parsedDevice.toLowerCase() !== deviceFilter) return false
      if (!term) return true
      const values = [
        session.username,
        session.ipAddress,
        session.parsedBrowser,
        session.parsedOs,
        session.timezone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return values.includes(term)
    })
  }, [enriched, search, statusFilter, deviceFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.loginTime || a.login_time || 0).getTime()
      const bTime = new Date(b.loginTime || b.login_time || 0).getTime()
      return bTime - aTime
    })
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const showPagination = sorted.length > 10
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const pageSessions = sorted.slice(startIndex, startIndex + PAGE_SIZE)

  const formatDateTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString()
  }

  const riskLabel = (risk) => {
    if (risk === 'suspicious') return 'Suspicious'
    if (risk === 'active') return 'Normal'
    return 'Normal'
  }

  const handleExport = () => {
    const rows = [
      ['User', 'Start Time', 'Logout Time', 'IP Address', 'Location', 'Browser', 'OS', 'Device', 'Timezone', 'Status', 'Risk'],
      ...sorted.map((session) => [
        session.username || '',
        formatDateTime(session.loginTime || session.login_time),
        formatDateTime(session.logoutTime || session.logout_time),
        session.ipAddress || '',
        session.location || '',
        session.parsedBrowser || '',
        session.parsedOs || '',
        session.parsedDevice || '',
        session.timezone || '',
        session.status === 'active' ? 'Active' : 'Ended',
        riskLabel(session.risk)
      ])
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

  const endSession = async (sessionId) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setSessions((prev) =>
      prev.map((session) =>
        String(session.id) === String(sessionId)
          ? { ...session, logoutTime: new Date().toISOString() }
          : session
      )
    )
  }

  const clearAllSessions = async () => {
    if (!window.confirm('Clear all session records? This cannot be undone.')) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setSessions([])
    setPage(1)
  }

  return (
    <div className="sessions-page">
      <div className="sessions-kpi-grid">
        <div className="sessions-kpi-card">
          <span>Total Sessions</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="sessions-kpi-card active">
          <span>Active</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="sessions-kpi-card ended">
          <span>Ended</span>
          <strong>{stats.ended}</strong>
        </div>
        <div className="sessions-kpi-card suspicious">
          <span>Suspicious</span>
          <strong>{stats.suspicious}</strong>
        </div>
      </div>

      <div className="page-actions sessions-actions">
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
        <select
          className="form-control sessions-filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
        <select
          className="form-control sessions-filter"
          value={deviceFilter}
          onChange={(e) => {
            setDeviceFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">All devices</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
          <option value="tablet">Tablet</option>
        </select>
        <button className="btn" type="button" onClick={handleExport}>
          Export CSV
        </button>
        <button className="btn btn-danger" type="button" onClick={clearAllSessions}>
          Clear All
        </button>
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Start Time</th>
              <th>Last Activity</th>
              <th>Logout Time</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Browser</th>
              <th>OS</th>
              <th>Device</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageSessions.length === 0 && (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-color)' }}>
                  No sessions recorded yet.
                </td>
              </tr>
            )}
            {pageSessions.map((session) => (
              <tr key={session.id}>
                <td data-label="User">{session.username || '-'}</td>
                <td data-label="Start Time">{formatDateTime(session.loginTime || session.login_time)}</td>
                <td data-label="Last Activity">{formatDateTime(session.lastActivity || session.last_activity)}</td>
                <td data-label="Logout Time">{formatDateTime(session.logoutTime || session.logout_time)}</td>
                <td data-label="IP Address">{session.ipAddress || '-'}</td>
                <td data-label="Location">{session.location || '-'}</td>
                <td data-label="Browser">{session.parsedBrowser}</td>
                <td data-label="OS">{session.parsedOs}</td>
                <td data-label="Device">{session.parsedDevice}</td>
                <td data-label="Status">
                  <span className={`status-badge ${session.status === 'active' ? 'status-active' : 'status-ended'}`}>
                    {session.status === 'active' ? 'Active' : 'Ended'}
                  </span>
                </td>
                <td data-label="Risk">
                  <span className={`status-badge ${session.risk === 'suspicious' ? 'status-suspicious' : 'status-normal'}`}>
                    {riskLabel(session.risk)}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    {session.status === 'active' ? (
                      <button
                        className="action-btn delete-btn"
                        type="button"
                        onClick={() => endSession(session.id)}
                      >
                        End
                      </button>
                    ) : (
                      <span className="sessions-ended-label">Closed</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sessions-mobile-list">
        {pageSessions.map((session) => (
          <div key={`mobile-${session.id}`} className="sessions-mobile-card">
            <div className="sessions-mobile-head">
              <strong>{session.username || '-'}</strong>
              <span className={`status-badge ${session.status === 'active' ? 'status-active' : 'status-ended'}`}>
                {session.status === 'active' ? 'Active' : 'Ended'}
              </span>
            </div>
            <div className="sessions-mobile-meta">
              <span>{session.parsedBrowser}</span>
              <span>{session.parsedOs}</span>
              <span>{session.parsedDevice}</span>
            </div>
            <div className="sessions-mobile-time">{formatDateTime(session.loginTime || session.login_time)}</div>
            <div className="sessions-mobile-actions">
              {session.status === 'active' && (
                <button className="btn btn-danger" type="button" onClick={() => endSession(session.id)}>
                  End Session
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showPagination && (
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
      )}
    </div>
  )
}

export default Sessions
