import { useEffect, useMemo, useState } from 'react'
import './FoundationSchool.css'

const CLASS_OPTIONS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Exam']
const EXAM_OPTIONS = ['Not Started', 'In Progress', 'Passed', 'Resit']

function FoundationSchool() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('students')
  const [editRows, setEditRows] = useState({})

  const loadData = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch('/api/first-timers?includeArchived=true&foundationSchool=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    setItems(Array.isArray(data) ? data.filter((x) => !x.archived) : [])
  }

  useEffect(() => {
    loadData().catch(() => setItems([]))
  }, [])

  const classCounts = useMemo(() => {
    const counts = new Map(CLASS_OPTIONS.map((name) => [name, 0]))
    items.filter((item) => !item.isGraduate).forEach((item) => {
      const key = CLASS_OPTIONS.includes(item.foundationClass) ? item.foundationClass : 'Class 1'
      counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const source = items.filter((item) => (tab === 'graduates' ? !!item.isGraduate : !item.isGraduate))
    if (!q) return source
    return source.filter((item) =>
      [
        item.title,
        item.name,
        item.surname,
        item.mobile,
        item.email,
        item.cellName,
        item.foundationClass,
        item.examStatus
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [items, search, tab])

  const updateRow = (id, field, value) => {
    setEditRows((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }))
  }

  const saveRow = async (item) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const row = editRows[item.id] || {}
    const payload = {
      foundationClass: row.foundationClass ?? item.foundationClass ?? 'Class 1',
      examStatus: row.examStatus ?? item.examStatus ?? 'Not Started',
      graduationDate: row.graduationDate ?? item.graduationDate ?? null,
      graduatedYear:
        row.graduationDate
          ? Number(new Date(row.graduationDate).getFullYear()) || null
          : (row.graduatedYear ?? item.graduatedYear ?? null),
      isGraduate: row.isGraduate ?? item.isGraduate ?? false,
      foundationSchool: 'Yes'
    }
    const res = await fetch(`/api/first-timers/${item.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) return
    const updated = await res.json()
    setItems((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)))
    setEditRows((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
  }

  const toggleGraduate = async (item, nextState) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const action = nextState ? 'graduate' : 'ungraduate'
    const res = await fetch(`/api/first-timers/${item.id}/decision`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action })
    })
    if (!res.ok) return
    const updated = await res.json()
    setItems((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? updated : x)))
  }

  const nameLabel = (item) => `${item.title ? `${item.title} ` : ''}${item.name || ''} ${item.surname || ''}`.trim()

  return (
    <div className="foundation-page">
      <div className="foundation-hero">
        <h2>Foundation School</h2>
        <p>Track classes, exam progress, and graduations.</p>
      </div>

      <div className="foundation-class-grid">
        {CLASS_OPTIONS.map((cls) => (
          <div key={cls} className="foundation-class-card">
            <div className="foundation-class-name">{cls}</div>
            <div className="foundation-class-count">{classCounts.get(cls) || 0} Students</div>
          </div>
        ))}
      </div>

      <div className="cell-tabs foundation-tabs mobile-sticky-actions">
        <button className={`cell-tab-btn${tab === 'students' ? ' active' : ''}`} type="button" onClick={() => setTab('students')}>
          Students
        </button>
        <button className={`cell-tab-btn${tab === 'graduates' ? ' active' : ''}`} type="button" onClick={() => setTab('graduates')}>
          Graduates
        </button>
      </div>

      <div className="search-box" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder={`Search ${tab}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Exam</th>
              <th>Graduation Date</th>
              <th>Year</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px' }}>
                  No records found.
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const row = editRows[item.id] || {}
              const isGraduate = row.isGraduate ?? item.isGraduate
              const graduatedYear = row.graduatedYear ?? item.graduatedYear
              return (
                <tr key={item.id}>
                  <td data-label="Student">{nameLabel(item)}</td>
                  <td data-label="Class">
                    <select
                      className="form-control inline-input"
                      value={row.foundationClass ?? item.foundationClass ?? 'Class 1'}
                      onChange={(e) => updateRow(item.id, 'foundationClass', e.target.value)}
                    >
                      {CLASS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Exam">
                    <select
                      className="form-control inline-input"
                      value={row.examStatus ?? item.examStatus ?? 'Not Started'}
                      onChange={(e) => updateRow(item.id, 'examStatus', e.target.value)}
                    >
                      {EXAM_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Graduation Date">
                    <input
                      type="date"
                      className="form-control inline-input"
                      value={row.graduationDate ?? item.graduationDate ?? ''}
                      onChange={(e) => updateRow(item.id, 'graduationDate', e.target.value)}
                    />
                  </td>
                  <td data-label="Year">{graduatedYear || '-'}</td>
                  <td data-label="Status">
                    {isGraduate ? (
                      <span className="graduate-badge">Graduate</span>
                    ) : (
                      <span className="student-badge">Student</span>
                    )}
                  </td>
                  <td data-label="Actions">
                    <div className="action-buttons">
                      <button type="button" className="action-btn edit-btn" onClick={() => saveRow(item)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className={`action-btn ${isGraduate ? 'delete-btn' : 'edit-btn'}`}
                        onClick={() => toggleGraduate(item, !isGraduate)}
                      >
                        {isGraduate ? 'Ungraduate' : 'Graduate'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default FoundationSchool
