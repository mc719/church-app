import { useEffect, useMemo, useState } from 'react'
import './FoundationSchool.css'

const CLASS_OPTIONS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Exam']
const TRACKING_ROWS = [...CLASS_OPTIONS, 'Graduate']
const EXAM_OPTIONS = ['Not Started', 'In Progress', 'Passed', 'Resit']
const TRACKABLE_CLASSES = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7']
const TITLE_OPTIONS = ['Brother', 'Sister', 'Dcn', 'Dcns', 'Pastor']
const GENDER_OPTIONS = ['Male', 'Female']
const AGE_GROUP_OPTIONS = ['13-19', '20-35', '36-45', '46&above']
const MEMBERSHIP_DURATION_OPTIONS = ['0 - 12months', '1-2 years', '2-3 years', '3year and above']
const GOWN_SIZE_OPTIONS = ['Small', 'Medium', 'Large', 'XLarge', '2XLarge']

function normalizeTracking(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const sourcePresence = source.presence && typeof source.presence === 'object' ? source.presence : {}
  const sourceClasses = source.classes && typeof source.classes === 'object' ? source.classes : {}
  const presence = {}
  TRACKING_ROWS.forEach((name) => {
    const legacy = sourceClasses[name] && typeof sourceClasses[name] === 'object' ? sourceClasses[name] : {}
    presence[name] = typeof sourcePresence[name] === 'boolean' ? sourcePresence[name] : !!legacy.completed
  })
  return {
    presence,
    currentStage: source.currentStage || '',
    membershipDuration: source.membershipDuration || '',
    areInCell: source.areInCell || '',
    gownSize: source.gownSize || '',
    comment: source.comment || '',
    notes: source.notes || '',
    updatedAt: source.updatedAt || ''
  }
}

function FoundationSchool() {
  const [items, setItems] = useState([])
  const [teachers, setTeachers] = useState([])
  const [cells, setCells] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('students')
  const [editRows, setEditRows] = useState({})
  const [selectedId, setSelectedId] = useState('')
  const [tracker, setTracker] = useState(() => normalizeTracking({}))
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [teacherForm, setTeacherForm] = useState({ id: '', title: 'Brother', name: '', mobile: '', email: '', assignedClasses: [] })
  const [deletingTeacherId, setDeletingTeacherId] = useState('')
  const [newStudent, setNewStudent] = useState({
    title: 'Brother',
    name: '',
    surname: '',
    phone: '',
    email: '',
    gender: 'Male',
    ageGroup: AGE_GROUP_OPTIONS[1],
    membershipDuration: MEMBERSHIP_DURATION_OPTIONS[0],
    areInCell: 'No',
    cellId: '',
    gownSize: GOWN_SIZE_OPTIONS[1],
    comment: ''
  })

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

  const loadCells = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch('/api/cells', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    setCells(Array.isArray(data) ? data : [])
  }

  const loadTeachers = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch('/api/foundation-teachers', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    setTeachers(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    loadData().catch(() => setItems([]))
    loadCells().catch(() => setCells([]))
    loadTeachers().catch(() => setTeachers([]))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (tab === 'teachers') return []
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

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return teachers
    return teachers.filter((teacher) =>
      [
        teacher.title,
        teacher.name,
        teacher.mobile,
        teacher.email,
        ...(Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [teachers, search])

  const selectedItem = useMemo(
    () => (tab === 'teachers'
      ? null
      : (filtered.find((item) => String(item.id) === String(selectedId)) || filtered[0] || null)),
    [filtered, selectedId, tab]
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

  const saveRow = async (item, trackingValue = null, forceFields = null) => {
    const token = localStorage.getItem('token')
    if (!token) return
    const row = editRows[item.id] || {}
    const mergedTracking =
      trackingValue ??
      (String(selectedId) === String(item.id) ? tracker : normalizeTracking(item.foundationTracking))
    const payload = {
      title: row.title ?? item.title ?? null,
      name: row.name ?? item.name ?? null,
      surname: row.surname ?? item.surname ?? null,
      mobile: row.mobile ?? item.mobile ?? null,
      email: row.email ?? item.email ?? null,
      gender: row.gender ?? item.gender ?? null,
      ageGroup: row.ageGroup ?? item.ageGroup ?? null,
      cellId: row.areInCell === 'No' ? null : (row.cellId ?? item.cellId ?? null),
      foundationClass: row.foundationClass ?? item.foundationClass ?? 'Class 1',
      examStatus: row.examStatus ?? item.examStatus ?? 'Not Started',
      graduationDate: forceFields?.graduationDate ?? row.graduationDate ?? item.graduationDate ?? null,
      graduatedYear:
        forceFields?.graduatedYear ??
        (row.graduationDate
          ? Number(new Date(row.graduationDate).getFullYear()) || null
          : (row.graduatedYear ?? item.graduatedYear ?? null)),
      isGraduate: forceFields?.isGraduate ?? row.isGraduate ?? item.isGraduate ?? false,
      foundationSchool: 'Yes',
      foundationTracking: mergedTracking
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
      currentStage: (editRows[selectedItem.id]?.foundationClass ?? selectedItem.foundationClass) || tracker.currentStage || 'Class 1',
      updatedAt: new Date().toISOString()
    }
    const graduationDate = (editRows[selectedItem.id]?.graduationDate ?? selectedItem.graduationDate) || null
    const graduationDatePassed = graduationDate ? new Date(graduationDate) <= new Date() : false
    const markedGraduate = !!nextTracking.presence['Graduate']
    const isGraduate = markedGraduate && graduationDatePassed
    const graduatedYear = isGraduate && graduationDate ? Number(new Date(graduationDate).getFullYear()) || null : null
    await saveRow(selectedItem, nextTracking, { graduationDate, isGraduate, graduatedYear })
  }

  const setClassTracking = (className, value) => {
    if (className === 'Graduate') {
      setTracker((prev) => ({
        ...prev,
        presence: { ...prev.presence, Graduate: value }
      }))
      return
    }
    setTracker((prev) => ({
      ...prev,
      currentStage: className,
      presence: TRACKING_ROWS.reduce(
        (acc, stage) => ({ ...acc, [stage]: stage === className ? value : (stage === 'Graduate' ? prev.presence.Graduate : false) }),
        {}
      )
    }))
  }

  const openAddTeacher = () => {
    setTeacherForm({ id: '', title: 'Brother', name: '', mobile: '', email: '', assignedClasses: [] })
    setShowTeacherModal(true)
  }

  const openEditTeacher = (teacher) => {
    setTeacherForm({
      id: String(teacher.id),
      title: teacher.title || 'Brother',
      name: teacher.name || '',
      mobile: teacher.mobile || '',
      email: teacher.email || '',
      assignedClasses: Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : []
    })
    setShowTeacherModal(true)
  }

  const saveTeacher = async () => {
    const token = localStorage.getItem('token')
    if (!token || !teacherForm.name.trim()) return
    const method = teacherForm.id ? 'PUT' : 'POST'
    const url = teacherForm.id ? `/api/foundation-teachers/${teacherForm.id}` : '/api/foundation-teachers'
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: teacherForm.title,
        name: teacherForm.name.trim(),
        mobile: teacherForm.mobile.trim(),
        email: teacherForm.email.trim(),
        assignedClasses: teacherForm.assignedClasses
      })
    })
    if (!res.ok) return
    const saved = await res.json()
    setTeachers((prev) =>
      teacherForm.id ? prev.map((item) => (String(item.id) === String(saved.id) ? saved : item)) : [saved, ...prev]
    )
    setShowTeacherModal(false)
  }

  const deleteTeacher = async () => {
    if (!deletingTeacherId) return
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`/api/foundation-teachers/${deletingTeacherId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return
    setTeachers((prev) => prev.filter((item) => String(item.id) !== String(deletingTeacherId)))
    setDeletingTeacherId('')
  }

  const saveNewStudent = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    if (!newStudent.name.trim()) return
    const payload = {
      title: newStudent.title,
      name: newStudent.name.trim(),
      surname: newStudent.surname.trim() || null,
      mobile: newStudent.phone.trim() || null,
      email: newStudent.email.trim() || null,
      gender: newStudent.gender,
      ageGroup: newStudent.ageGroup,
      foundationSchool: 'Yes',
      foundationClass: 'Class 1',
      examStatus: 'Not Started',
      status: 'amber',
      cellId: newStudent.areInCell === 'Yes' ? (newStudent.cellId || null) : null,
      foundationTracking: {
        ...normalizeTracking({}),
        currentStage: 'Class 1',
        presence: { ...normalizeTracking({}).presence, 'Class 1': true },
        membershipDuration: newStudent.membershipDuration,
        areInCell: newStudent.areInCell,
        gownSize: newStudent.gownSize,
        comment: newStudent.comment || ''
      }
    }
    const res = await fetch('/api/first-timers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) return
    const saved = await res.json()
    const normalizedSaved = { ...saved, foundationTracking: normalizeTracking(saved.foundationTracking) }
    setItems((prev) => [normalizedSaved, ...prev])
    setShowAddModal(false)
    setSelectedId(String(saved.id))
    setTracker(normalizeTracking(saved.foundationTracking))
    setNewStudent({
      title: 'Brother',
      name: '',
      surname: '',
      phone: '',
      email: '',
      gender: 'Male',
      ageGroup: AGE_GROUP_OPTIONS[1],
      membershipDuration: MEMBERSHIP_DURATION_OPTIONS[0],
      areInCell: 'No',
      cellId: '',
      gownSize: GOWN_SIZE_OPTIONS[1],
      comment: ''
    })
  }

  const currentStage = (selectedItem && ((editRows[selectedItem.id]?.foundationClass ?? selectedItem.foundationClass) || tracker.currentStage)) || 'Class 1'
  const currentStageIndex = CLASS_OPTIONS.indexOf(currentStage)
  const nameLabel = (item) => `${item.title ? `${item.title} ` : ''}${item.name || ''} ${item.surname || ''}`.trim()

  return (
    <div className="foundation-page">
      <div className="cell-tabs foundation-tabs mobile-sticky-actions">
        <button className={`cell-tab-btn${tab === 'students' ? ' active' : ''}`} type="button" onClick={() => setTab('students')}>
          Students
        </button>
        <button className={`cell-tab-btn${tab === 'graduates' ? ' active' : ''}`} type="button" onClick={() => setTab('graduates')}>
          Graduates
        </button>
        <button className={`cell-tab-btn${tab === 'teachers' ? ' active' : ''}`} type="button" onClick={() => setTab('teachers')}>
          Teachers
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          onClick={() => (tab === 'teachers' ? openAddTeacher() : setShowAddModal(true))}
        >
          {tab === 'teachers' ? 'Add Teacher' : 'Add New Student'}
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

      {tab === 'teachers' ? (
        <div className="table-container">
          <table className="mobile-grid-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Assigned Classes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '28px' }}>No teachers added yet.</td>
                </tr>
              )}
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td data-label="Name">{`${teacher.title ? `${teacher.title} ` : ''}${teacher.name || ''}`.trim()}</td>
                  <td data-label="Mobile">{teacher.mobile || '-'}</td>
                  <td data-label="Email">{teacher.email || '-'}</td>
                  <td data-label="Assigned Classes">
                    {Array.isArray(teacher.assignedClasses) && teacher.assignedClasses.length
                      ? teacher.assignedClasses.join(', ')
                      : '-'}
                  </td>
                  <td data-label="Actions">
                    <div className="action-buttons">
                      <button type="button" className="action-btn edit-btn" onClick={() => openEditTeacher(teacher)}>
                        Edit
                      </button>
                      <button type="button" className="action-btn delete-btn" onClick={() => setDeletingTeacherId(String(teacher.id))}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
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
                <div className="foundation-student-name">
                  {nameLabel(item)} {item.isGraduate ? <span className="role-pill">Graduate</span> : null}
                </div>
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
                  <h3>{nameLabel(selectedItem)} {selectedItem.isGraduate ? <span className="role-pill">Graduate</span> : null}</h3>
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
                  <label>Title</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.title ?? selectedItem.title) || 'Brother'}
                    onChange={(e) => updateRow(selectedItem.id, 'title', e.target.value)}
                  >
                    {TITLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    className="form-control"
                    value={(editRows[selectedItem.id]?.name ?? selectedItem.name) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Surname</label>
                  <input
                    className="form-control"
                    value={(editRows[selectedItem.id]?.surname ?? selectedItem.surname) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'surname', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    className="form-control"
                    value={(editRows[selectedItem.id]?.mobile ?? selectedItem.mobile) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'mobile', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    className="form-control"
                    value={(editRows[selectedItem.id]?.email ?? selectedItem.email) || ''}
                    onChange={(e) => updateRow(selectedItem.id, 'email', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.gender ?? selectedItem.gender) || 'Male'}
                    onChange={(e) => updateRow(selectedItem.id, 'gender', e.target.value)}
                  >
                    {GENDER_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Age Category</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.ageGroup ?? selectedItem.ageGroup) || AGE_GROUP_OPTIONS[1]}
                    onChange={(e) => updateRow(selectedItem.id, 'ageGroup', e.target.value)}
                  >
                    {AGE_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Membership Duration</label>
                  <select
                    className="form-control"
                    value={tracker.membershipDuration || MEMBERSHIP_DURATION_OPTIONS[0]}
                    onChange={(e) => setTracker((prev) => ({ ...prev, membershipDuration: e.target.value }))}
                  >
                    {MEMBERSHIP_DURATION_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Are you in a cell?</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.areInCell ?? tracker.areInCell) || (selectedItem.cellId ? 'Yes' : 'No')}
                    onChange={(e) => {
                      updateRow(selectedItem.id, 'areInCell', e.target.value)
                      setTracker((prev) => ({ ...prev, areInCell: e.target.value }))
                      if (e.target.value === 'No') updateRow(selectedItem.id, 'cellId', null)
                    }}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                {((editRows[selectedItem.id]?.areInCell ?? tracker.areInCell) || (selectedItem.cellId ? 'Yes' : 'No')) === 'Yes' && (
                  <div className="form-group">
                    <label>Cell Name</label>
                    <select
                      className="form-control"
                      value={(editRows[selectedItem.id]?.cellId ?? selectedItem.cellId) || ''}
                      onChange={(e) => updateRow(selectedItem.id, 'cellId', e.target.value || null)}
                    >
                      <option value="">Select cell</option>
                      {cells.map((cell) => (
                        <option key={cell.id} value={cell.id}>{cell.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Graduation Gown Size</label>
                  <select
                    className="form-control"
                    value={tracker.gownSize || GOWN_SIZE_OPTIONS[1]}
                    onChange={(e) => setTracker((prev) => ({ ...prev, gownSize: e.target.value }))}
                  >
                    {GOWN_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Any Comment?</label>
                  <textarea
                    className="form-control"
                    rows="2"
                    value={tracker.comment || ''}
                    onChange={(e) => setTracker((prev) => ({ ...prev, comment: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Current Class</label>
                  <select
                    className="form-control"
                    value={(editRows[selectedItem.id]?.foundationClass ?? selectedItem.foundationClass) || 'Class 1'}
                    onChange={(e) => {
                      updateRow(selectedItem.id, 'foundationClass', e.target.value)
                      setTracker((prev) => ({ ...prev, currentStage: e.target.value }))
                    }}
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

            </>
          )}
        </div>
      </div>
      )}

      {showTeacherModal && (
        <div className="modal-overlay active" onClick={() => setShowTeacherModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{teacherForm.id ? 'Edit Teacher' : 'Add Teacher'}</h3>
              <button className="close-modal" type="button" onClick={() => setShowTeacherModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Title</label>
                  <select className="form-control" value={teacherForm.title} onChange={(e) => setTeacherForm((prev) => ({ ...prev, title: e.target.value }))}>
                    {TITLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input className="form-control" value={teacherForm.name} onChange={(e) => setTeacherForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Mobile</label>
                  <input className="form-control" value={teacherForm.mobile} onChange={(e) => setTeacherForm((prev) => ({ ...prev, mobile: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-control" value={teacherForm.email} onChange={(e) => setTeacherForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Assigned Classes</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
                    {CLASS_OPTIONS.map((className) => {
                      const checked = teacherForm.assignedClasses.includes(className)
                      return (
                        <label key={className} className="check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setTeacherForm((prev) => ({
                                ...prev,
                                assignedClasses: e.target.checked
                                  ? [...prev.assignedClasses, className]
                                  : prev.assignedClasses.filter((value) => value !== className)
                              }))
                            }
                          />
                          {className}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setShowTeacherModal(false)}>Cancel</button>
              <button className="btn btn-success" type="button" onClick={saveTeacher}>Save</button>
            </div>
          </div>
        </div>
      )}

      {deletingTeacherId && (
        <div className="modal-overlay confirmation-modal active" onClick={() => setDeletingTeacherId('')}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="confirmation-icon">
                <i className="fas fa-trash"></i>
              </div>
              <p className="confirmation-text">Delete this teacher?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setDeletingTeacherId('')}>Cancel</button>
                <button className="btn btn-danger" type="button" onClick={deleteTeacher}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay active" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Student</h3>
              <button className="close-modal" type="button" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Title</label>
                  <select className="form-control" value={newStudent.title} onChange={(e) => setNewStudent((s) => ({ ...s, title: e.target.value }))}>
                    {TITLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input className="form-control" value={newStudent.name} onChange={(e) => setNewStudent((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Surname</label>
                  <input className="form-control" value={newStudent.surname} onChange={(e) => setNewStudent((s) => ({ ...s, surname: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input className="form-control" value={newStudent.phone} onChange={(e) => setNewStudent((s) => ({ ...s, phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-control" value={newStudent.email} onChange={(e) => setNewStudent((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Gender</label>
                  <select className="form-control" value={newStudent.gender} onChange={(e) => setNewStudent((s) => ({ ...s, gender: e.target.value }))}>
                    {GENDER_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Age Category</label>
                  <select className="form-control" value={newStudent.ageGroup} onChange={(e) => setNewStudent((s) => ({ ...s, ageGroup: e.target.value }))}>
                    {AGE_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Membership Duration</label>
                  <select className="form-control" value={newStudent.membershipDuration} onChange={(e) => setNewStudent((s) => ({ ...s, membershipDuration: e.target.value }))}>
                    {MEMBERSHIP_DURATION_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Are you in a cell?</label>
                  <select className="form-control" value={newStudent.areInCell} onChange={(e) => setNewStudent((s) => ({ ...s, areInCell: e.target.value }))}>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
                {newStudent.areInCell === 'Yes' && (
                  <div className="form-group">
                    <label>Cell Name</label>
                    <select className="form-control" value={newStudent.cellId} onChange={(e) => setNewStudent((s) => ({ ...s, cellId: e.target.value }))}>
                      <option value="">Select cell</option>
                      {cells.map((cell) => (
                        <option key={cell.id} value={cell.id}>{cell.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Graduation Gown Size</label>
                  <select className="form-control" value={newStudent.gownSize} onChange={(e) => setNewStudent((s) => ({ ...s, gownSize: e.target.value }))}>
                    {GOWN_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Any Comment?</label>
                  <textarea className="form-control" rows="3" value={newStudent.comment} onChange={(e) => setNewStudent((s) => ({ ...s, comment: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-success" type="button" onClick={saveNewStudent}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FoundationSchool
