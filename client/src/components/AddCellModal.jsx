import { useState } from 'react'

const API_BASE = '/api'

function AddCellModal({ open, onClose }) {
  const [form, setForm] = useState({
    name: '',
    venue: '',
    day: '',
    time: '',
    description: ''
  })
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE}/cells`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: form.name.trim(),
          venue: form.venue.trim(),
          day: form.day,
          time: form.time,
          description: form.description.trim()
        })
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to add cell')
      }
      setForm({ name: '', venue: '', day: '', time: '', description: '' })
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Cell</h3>
          <button className="close-modal" onClick={onClose} type="button">&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Cell Name *</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Meeting Venue</label>
              <input
                className="form-control"
                value={form.venue}
                onChange={(e) => updateField('venue', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Meeting Day</label>
              <select
                className="form-control"
                value={form.day}
                onChange={(e) => updateField('day', e.target.value)}
              >
                <option value="">Select Day</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>
            <div className="form-group">
              <label>Meeting Time</label>
              <input
                type="time"
                className="form-control"
                value={form.time}
                onChange={(e) => updateField('time', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                rows="3"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="button" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button className="btn btn-success" type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Add Cell'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AddCellModal
