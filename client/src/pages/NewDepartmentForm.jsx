import { useEffect, useState } from 'react'
import './NewDepartmentForm.css'

const DEFAULT_LOGO_URL = '/images/logo.png'

const hodTitles = ['Brother', 'Sister', 'Dcn', 'Dcns', 'Pastor']

function NewDepartmentForm() {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL)
  const [accessCode, setAccessCode] = useState('')
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [showAccess, setShowAccess] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formValues, setFormValues] = useState({
    name: '',
    hodTitle: '',
    hodName: '',
    hodMobile: ''
  })

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

  const resetForm = () => {
    setFormValues({ name: '', hodTitle: '', hodName: '', hodMobile: '' })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!accessCode) {
      const ok = await verifyAccessCode()
      if (!ok) return
    }
    setSubmitting(true)
    try {
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ACCESS-CODE': accessCode
        },
        body: JSON.stringify({
          name: formValues.name.trim(),
          hodTitle: formValues.hodTitle || '',
          hodName: formValues.hodName.trim(),
          hodMobile: formValues.hodMobile.trim()
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Request failed')
      }
      window.alert('Department created successfully!')
      resetForm()
    } catch (err) {
      window.alert(`Failed to create department: ${err.message || 'Request failed'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="new-department-page">
      <div className="new-department-bg-logo" style={{ backgroundImage: `url(${logoUrl})` }} />
      <h1>Add Department</h1>
      <form className="new-department-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="departmentName">Department Name *</label>
          <input
            id="departmentName"
            required
            value={formValues.name}
            onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="hodTitle">HOD Title</label>
          <select
            id="hodTitle"
            value={formValues.hodTitle}
            onChange={(event) => setFormValues((prev) => ({ ...prev, hodTitle: event.target.value }))}
          >
            <option value="">Select Title</option>
            {hodTitles.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hodName">HOD Name</label>
          <input
            id="hodName"
            value={formValues.hodName}
            onChange={(event) => setFormValues((prev) => ({ ...prev, hodName: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="hodMobile">HOD Mobile</label>
          <input
            id="hodMobile"
            value={formValues.hodMobile}
            onChange={(event) => setFormValues((prev) => ({ ...prev, hodMobile: event.target.value }))}
          />
        </div>
        <div className="form-actions">
          <button className="btn" type="reset" onClick={resetForm} disabled={submitting}>
            Clear
          </button>
          <button className="btn btn-success" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Save'}
          </button>
        </div>
      </form>

      {showAccess && (
        <div className="modal-overlay active" onClick={() => setShowAccess(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Access Required</h3>
              <button className="close-modal" type="button" onClick={handleAccessCancel}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Access Code</label>
                <input
                  className="form-control"
                  value={accessInput}
                  onChange={(event) => setAccessInput(event.target.value)}
                />
                {accessError && <div className="error-message">{accessError}</div>}
              </div>
              <div className="form-actions">
                <button className="btn" type="button" onClick={handleAccessCancel}>
                  Cancel
                </button>
                <button className="btn btn-success" type="button" onClick={verifyAccessCode}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NewDepartmentForm
