import { useEffect, useMemo, useState } from 'react'
import './NewCellForm.css'

const DEFAULT_LOGO_URL = '/images/logo.png'

const createMemberRow = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: '',
  name: '',
  gender: '',
  mobile: '',
  email: '',
  role: ''
})

function NewCellForm() {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL)
  const [accessCode, setAccessCode] = useState('')
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [showAccess, setShowAccess] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [members, setMembers] = useState([createMemberRow()])
  const [formValues, setFormValues] = useState({
    name: '',
    venue: '',
    day: '',
    time: '',
    description: ''
  })

  const membersPayload = useMemo(
    () => members.filter((row) => row.name.trim().length > 0),
    [members]
  )

  useEffect(() => {
    const cached = localStorage.getItem('logoImage')
    if (cached) setLogoUrl(cached)
    fetch('/api/settings/logo')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.logo) {
          localStorage.setItem('logoImage', data.logo)
          setLogoUrl(data.logo)
        }
      })
      .catch(() => {})
  }, [])

  const handleAccessCancel = () => {
    if (window.history.length > 1) {
      window.history.back()
    } else {
      window.close()
    }
  }

  const verifyAccessCode = async () => {
    const trimmed = accessInput.trim()
    if (!trimmed) {
      setAccessError('Access code is required.')
      return false
    }
    try {
      const response = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: trimmed })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Invalid access code')
      }
      setAccessCode(trimmed)
      setAccessError('')
      setShowAccess(false)
      return true
    } catch (err) {
      setAccessError(err.message || 'Invalid access code')
      return false
    }
  }

  const updateMember = (id, field, value) => {
    setMembers((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    )
  }

  const resetForm = () => {
    setFormValues({ name: '', venue: '', day: '', time: '', description: '' })
    setMembers([createMemberRow()])
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!accessCode) {
      setShowAccess(true)
      setAccessError('Access code is required.')
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/cells', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ACCESS-CODE': accessCode
        },
        body: JSON.stringify({
          name: formValues.name.trim(),
          venue: formValues.venue.trim(),
          day: formValues.day,
          time: formValues.time,
          description: formValues.description.trim()
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Request failed')
      }

      for (const row of membersPayload) {
        const memberRes = await fetch('/api/members', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ACCESS-CODE': accessCode
          },
          body: JSON.stringify({
            cellId: data.id,
            title: row.title,
            name: row.name.trim(),
            gender: row.gender,
            mobile: row.mobile.trim(),
            email: row.email.trim(),
            role: row.role
          })
        })
        const memberData = await memberRes.json().catch(() => ({}))
        if (!memberRes.ok) {
          throw new Error(memberData.error || 'Failed to add member')
        }
      }

      window.alert('Cell created successfully!')
      resetForm()
    } catch (err) {
      window.alert(`Failed to create cell: ${err.message || 'Request failed'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="new-cell-page">
      <div className="new-cell-bg-logo" style={{ backgroundImage: `url(${logoUrl})` }} />
      <h1>Add New Cell</h1>
      <form className="new-cell-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="cellName">Cell Name *</label>
          <input
            id="cellName"
            required
            value={formValues.name}
            onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="cellVenue">Venue *</label>
          <input
            id="cellVenue"
            required
            value={formValues.venue}
            onChange={(event) => setFormValues((prev) => ({ ...prev, venue: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="cellDay">Day of Meeting *</label>
          <select
            id="cellDay"
            required
            value={formValues.day}
            onChange={(event) => setFormValues((prev) => ({ ...prev, day: event.target.value }))}
          >
            <option value="">Select Day</option>
            <option>Monday</option>
            <option>Tuesday</option>
            <option>Wednesday</option>
            <option>Thursday</option>
            <option>Friday</option>
            <option>Saturday</option>
            <option>Sunday</option>
          </select>
        </div>
        <div>
          <label htmlFor="cellTime">Time *</label>
          <input
            id="cellTime"
            type="time"
            required
            value={formValues.time}
            onChange={(event) => setFormValues((prev) => ({ ...prev, time: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="cellDescription">Description</label>
          <textarea
            id="cellDescription"
            rows="4"
            value={formValues.description}
            onChange={(event) => setFormValues((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>
        <div>
          <h2 style={{ margin: '8px 0 0', fontSize: '1.1rem', color: '#1e3a5f' }}>
            Add Members (Optional)
          </h2>
        </div>
        <div>
          {members.map((member) => (
            <div className="new-cell-member-group" key={member.id}>
              <div>
                <label>Title</label>
                <select
                  value={member.title}
                  onChange={(event) => updateMember(member.id, 'title', event.target.value)}
                >
                  <option value="">Select Title</option>
                  <option>Brother</option>
                  <option>Sister</option>
                  <option>Dcns</option>
                  <option>Dcn</option>
                  <option>Pastor</option>
                  <option>Mr</option>
                  <option>Mrs</option>
                  <option>Miss</option>
                  <option>Master</option>
                </select>
              </div>
              <div>
                <label>Full Name</label>
                <input
                  type="text"
                  value={member.name}
                  onChange={(event) => updateMember(member.id, 'name', event.target.value)}
                />
              </div>
              <div>
                <label>Gender</label>
                <select
                  value={member.gender}
                  onChange={(event) => updateMember(member.id, 'gender', event.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </div>
              <div>
                <label>Mobile</label>
                <input
                  type="tel"
                  value={member.mobile}
                  onChange={(event) => updateMember(member.id, 'mobile', event.target.value)}
                />
              </div>
              <div>
                <label>Email</label>
                <input
                  type="email"
                  value={member.email}
                  onChange={(event) => updateMember(member.id, 'email', event.target.value)}
                />
              </div>
              <div>
                <label>Cell Role</label>
                <select
                  value={member.role}
                  onChange={(event) => updateMember(member.id, 'role', event.target.value)}
                >
                  <option value="">Select Role</option>
                  <option>Cell Leader</option>
                  <option>Assistant Leader</option>
                  <option>Member</option>
                  <option>New Member</option>
                </select>
              </div>
              <div className="new-cell-member-actions">
                {members.length > 1 && (
                  <button
                    type="button"
                    className="new-cell-btn-link"
                    onClick={() => setMembers((prev) => prev.filter((row) => row.id !== member.id))}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="new-cell-member-actions">
          <button
            type="button"
            className="new-cell-btn-link"
            onClick={() => setMembers((prev) => [...prev, createMemberRow()])}
          >
            + Add another member
          </button>
        </div>
        <div className="new-cell-actions">
          <button className="new-cell-btn new-cell-btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Cell'}
          </button>
          <button
            className="new-cell-btn new-cell-btn-secondary"
            type="button"
            onClick={() => window.history.back()}
          >
            Back
          </button>
        </div>
      </form>

      {showAccess && (
        <div className="new-cell-modal-overlay">
          <div className="new-cell-modal">
            <h2>Access Code</h2>
            <label htmlFor="accessCodeInput">Enter access code to continue</label>
            <input
              id="accessCodeInput"
              type="password"
              value={accessInput}
              onChange={(event) => setAccessInput(event.target.value)}
              autoComplete="one-time-code"
            />
            {accessError && <p style={{ color: '#b23a2c', marginTop: '8px' }}>{accessError}</p>}
            <div className="new-cell-modal-actions">
              <button type="button" className="new-cell-btn new-cell-btn-secondary" onClick={handleAccessCancel}>
                Cancel
              </button>
              <button type="button" className="new-cell-btn new-cell-btn-primary" onClick={verifyAccessCode}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewCellForm
