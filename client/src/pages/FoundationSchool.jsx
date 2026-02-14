import { useEffect, useMemo, useState } from 'react'
import './FoundationSchool.css'

const CLASS_OPTIONS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Exam']
const EXAM_OPTIONS = ['Not Started', 'In Progress', 'Passed', 'Resit']
const TRACKABLE_CLASSES = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7']

function normalizeTracking(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const sourceClasses = source.classes && typeof source.classes === 'object' ? source.classes : {}
  const classes = {}
  TRACKABLE_CLASSES.forEach((name) => {
    const row = sourceClasses[name] && typeof sourceClasses[name] === 'object' ? sourceClasses[name] : {}
    classes[name] = {
      completed: !!row.completed,
      date: row.date || ''
    }
  })
  return {
    classes,
    notes: source.notes || '',
    updatedAt: source.updatedAt || ''
  }
}

function FoundationSchool() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('students')
  const [editRows, setEditRows] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [tracker, setTracker] = useState(() => normalizeTracking({}))

  const loadData = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch('/api/first-timers?includeArchived=true&foundationSchool=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    const normalized = (Array.isArray(data) ? data.filter((x) => !x.archived) : []).map((item) => ({
      ...item,
      foundationTracking: normalizeTracking(item.foundationTracking)
    }))
    setItems(normalized)
    if (!selectedId && normalized.length) {
      setSelectedId(String(normalized[0].id))
      setTracker(normalized[0].foundationTracking)
    }
  }

  useEffect(() => {
    loadData().catch(() => setItems([]))
  }, [])

  const classCounts = useMemo(() => {
    const counts = new Map(CLASS_OPTIONS.map((name) => [name, 0]))
    items.forEach((item) => {
      const tracking = normalizeTracking(item.foundationTracking)
      TRACKABLE_CLASSES.forEach((className) => {
        const classRow = tracking.classes[className]
        if (classRow?.completed || classRow?.date) {
          counts.set(className, (counts.get(className) || 0) + 1)
        }
      })
      const examStarted =
        String(item.examStatus || '').toLowerCase() !== 'not started' ||
        String(item.foundationClass || '').toLowerCase() === 'exam' ||
        !!item.isGraduate
      if (examStarted) {
        counts.set('Exam', (counts.get('Exam') || 0) + 1)
      }
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

  const selectedItem = useMemo(
    () => filtered.find((item) => String(item.id) === String(selectedId)) || filtered[0] || null,
    [filtered, selectedId]
  )

  useEffect(() => {
    if (!selectedItem) return
    setSelectedId(String(selectedItem.id))
    setTracker(normalizeTracking(selectedItem.foundationTracking))
  }, [selectedItem?.id])

  const updateRow = (id, field, value) => {
    setEditRows((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }))
  }

  const saveRow = async (item, trackingValue = null) => {
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
      foundationSchool: 'Yes',
      foundationTracking: trackingValue ?? normalizeTracking(item.foundationTracking)
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
    const normalizedUpdated = { ...updated, foundationTracking: normalizeTracking(updated.foundationTracking) }
    setItems((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...normalizedUpdated } : x)))
    setEditRows((prev) => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    if (String(selectedId) === String(item.id)) {
      setTracker(normalizeTracking(normalizedUpdated.foundationTracking))
    }
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
    setItems((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)))
  }

  const saveSelectedTracking = async () => {
    if (!selectedItem) return
    const nextTracking = {
      ...tracker,
      updatedAt: new Date().toISOString()
    }
    await saveRow(selectedItem, nextTracking)
  }

  const setClassTracking = (className, field, value) => {
    setTracker((prev) => ({
      ...prev,
      classes: {
        ...prev.classes,
        [className]: {
          ...(prev.classes[className] || {}),
          [field]: value
        }
      }
    }))
  }

  const nameLabel = (item) => `${item.title ? `${item.title} ` : ''}${item.name || ''} ${item.surname || ''}`.trim()

  return (
    <div className="foundation-page">
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

      <div className="foundation-tracker-layout">
        <div className="foundation-student-list">
          {filtered.length === 0 && (
            <div className="dashboard-note">No records found.</div>
          )}
          {filtered.map((item) => {
            const isActive = String(item.id) === String(selectedItem?.id)
            return (
              <button
                key={item.id}
                type="button"
                className={`foundation-student-card${isActive ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(String(item.id))
                  setTracker(normalizeTracking(item.foundationTracking))
                }}
              >
                <div className="foundation-student-name">{nameLabel(item)}</div>
                <div className="foundation-student-meta">
                  <span>{item.foundationClass || 'Class 1'}</span>
                  <span>{item.examStatus || 'Not Started'}</span>
                  <span>{item.isGraduate ? 'Graduate' : 'Student'}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="foundation-detail-panel">
          {!selectedItem && <div className="dashboard-note">Select a student to view and track progress.</div>}
          {selectedItem && (
            <>
              <div className="foundation-detail-header">
                <div>
                  <h3>{nameLabel(selectedItem)}</h3>
                  <p>{selectedItem.mobile || '-'} {selectedItem.cellName ? `| ${selectedItem.cellName}` : ''}</p>
                </div>
                <div className="action-buttons">
                  <button type="button" className="action-btn edit-btn" onClick={() => saveRow(selectedItem)}>
                    Save Main
                  </button>
                  <button
                    type="button"
                    className={`action-btn ${selectedItem.isGraduate ? 'delete-btn' : 'edit-btn'}`}
                    onClick={() => toggleGraduate(selectedItem, !selectedItem.isGraduate)}
                  >
                    {selectedItem.isGraduate ? 'Ungraduate' : 'Graduate'}
                  </button>
                </div>
              </div>

              <div className="foundation-main-grid">
                <div className="form-group">
                  <label>Current Class</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.foundationClass ?? selectedItem.foundationClass) || 'Class 1'}
                    onChange={(e) => updateRow(selectedItem.id, 'foundationClass', e.target.value)}
                  >
                    {CLASS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Exam Status</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.examStatus ?? selectedItem.examStatus) || 'Not Started'}
                    onChange={(e) => updateRow(selectedItem.id, 'examStatus', e.target.value)}
                  >
                    {EXAM_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Graduation Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={(editRows[selectedItem.id]?.graduationDate ?? selectedItem.graduationDate) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'graduationDate', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Graduated Year</label>
                  <input
                    className="form-control"
                    value={(editRows[selectedItem.id]?.graduatedYear ?? selectedItem.graduatedYear) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'graduatedYear', e.target.value)}
                  />
                </div>
              </div>

              <div className="foundation-tracker-card">
                <div className="section-header" style={{ marginTop: 0 }}>
                  <h3>Individual Class Tracking</h3>
                  <button type="button" className="btn btn-success" onClick={saveSelectedTracking}>
                    Save Tracking
                  </button>
                </div>
                <div className="table-container">
                  <table className="mobile-grid-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Completed</th>
                        <th>Completion Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRACKABLE_CLASSES.map((className) => (
                        <tr key={className}>
                          <td data-label="Class">{className}</td>
                          <td data-label="Completed">
                            <input
                              type="checkbox"
                              checked={!!tracker.classes[className]?.completed}
                              onChange={(e) => setClassTracking(className, 'completed', e.target.checked)}
                            />
                          </td>
                          <td data-label="Completion Date">
                            <input
                              type="date"
                              className="form-control inline-input"
                              value={tracker.classes[className]?.date || ''}
                              onChange={(e) => setClassTracking(className, 'date', e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-group">
                  <label>Tracking Notes</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={tracker.notes || ''}
                    onChange={(e) => setTracker((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
                <small className="foundation-updated-at">
                  Last tracking update: {tracker.updatedAt ? new Date(tracker.updatedAt).toLocaleString() : 'Not set'}
                </small>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default FoundationSchool
