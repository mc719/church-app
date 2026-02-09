import { useEffect, useMemo, useRef, useState } from 'react'
import './FirstTimerForm.css'

const DEFAULT_LOGO_URL = '/images/logo.png'

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function FirstTimerForm() {
  const formRef = useRef(null)
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL)
  const [accessCode, setAccessCode] = useState('')
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [showAccess, setShowAccess] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const days = useMemo(() => Array.from({ length: 31 }, (_, index) => index + 1), [])

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

  const collectFormData = () => {
    const data = {}
    const form = formRef.current
    if (!form) return data
    const fd = new FormData(form)
    for (const [key, value] of fd.entries()) {
      if (data[key] !== undefined) {
        data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value]
      } else {
        data[key] = value
      }
    }
    return data
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!accessCode) {
      const ok = await verifyAccessCode()
      if (!ok) return
    }

    const data = collectFormData()
    const fullName = [data.name, data.surname].filter(Boolean).join(' ').trim()
    if (!fullName || !data.mobile) {
      window.alert('Name, surname and mobile are required.')
      return
    }

    const payload = {
      name: data.name || '',
      surname: data.surname || '',
      gender: data.gender || '',
      mobile: data.mobile || '',
      email: data.email || '',
      address: data.address || '',
      postcode: data.postcode || '',
      birthday:
        data.birthday_month && data.birthday_day
          ? `${String(data.birthday_month).padStart(2, '0')}-${String(data.birthday_day).padStart(2, '0')}`
          : '',
      ageGroup: data.age_group || '',
      maritalStatus: data.marital_status || '',
      bornAgain: data.born_again || null,
      speakTongues: data.speak_tongues || null,
      findOut: data.find_out || [],
      invitedBy: data.invited_by || '',
      contactPref: data.contact_pref || [],
      visit: data.visit || null,
      visitWhen: data.visit_when || '',
      prayerRequests: [data.prayer_1, data.prayer_2, data.prayer_3].filter(Boolean),
      dateJoined: new Date().toISOString().slice(0, 10),
      status: 'amber',
      foundationSchool: 'Not Yet',
      cellId: ''
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/first-timers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ACCESS-CODE': accessCode
        },
        body: JSON.stringify(payload)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit form')
      }
      window.alert(`Submitted successfully for ${fullName}.`)
      formRef.current?.reset()
    } catch (error) {
      window.alert(error.message || 'Failed to submit form')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ft-form-page">
      <div className="sheet" role="document" aria-label="Christ Embassy Welcome Form">
        <div className="border-outer"></div>
        <div className="border-inner"></div>
        <div className="border-line"></div>
        <div className="zig top"></div>
        <div className="zig bottom"></div>

        <div className="content">
          <div className="header">
            <div className="logo" aria-label="LoveWorld logo">
              <img src={logoUrl} alt="Church Logo" />
            </div>

            <div className="headtext">
              <div className="h1">CHRIST EMBASSY</div>
              <div className="h2">Welcome FORM!</div>
              <div className="p">
                <strong>We</strong> are most delighted to have <strong>YOU</strong> in our midst today.
              </div>
              <div className="p">
                By completing this form, you consent to our processing of your personal information for your
                church attendance and participation in our ministry programs.
              </div>
              <div className="note">Please complete and tick as appropriate</div>
            </div>

            <div></div>
          </div>

          <div className="prompt">In your own words, kindly express your thoughts about today&apos;s service.</div>
          <div className="hr"></div>

          <form id="welcomeForm" ref={formRef} onSubmit={handleSubmit} noValidate>
            <div className="row">
              <div className="label">Gender:</div>
              <div className="checks" role="group" aria-label="Gender">
                <label className="check">
                  <input type="radio" name="gender" value="Male" /> Male
                </label>
                <label className="check">
                  <input type="radio" name="gender" value="Female" /> Female
                </label>
              </div>
            </div>

            <div className="two">
              <div className="row">
                <div className="label">Name:</div>
                <input className="line" name="name" autoComplete="given-name" />
              </div>

              <div className="row">
                <div className="label">Surname</div>
                <input className="line" name="surname" autoComplete="family-name" />
              </div>

              <div className="row" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Address:</div>
                <input className="line" name="address" autoComplete="street-address" />
              </div>

              <div className="row" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
                <div className="label" style={{ minWidth: 'auto' }}>Post Code</div>
                <input
                  className="line"
                  name="postcode"
                  style={{ maxWidth: '230px', minWidth: '230px' }}
                  autoComplete="postal-code"
                />
              </div>

              <div className="row" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Mobile Number</div>
                <input className="line" name="mobile" inputMode="tel" autoComplete="tel" />
              </div>

              <div className="row" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Email</div>
                <input className="line" name="email" type="email" autoComplete="email" />
              </div>

              <div className="row" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Birthday</div>
                <select className="line" name="birthday_day" style={{ maxWidth: '120px', minWidth: '120px' }}>
                  <option value="">Day</option>
                  {days.map((day) => (
                    <option key={`day-${day}`} value={String(day)}>
                      {day}
                    </option>
                  ))}
                </select>
                <select className="line" name="birthday_month" style={{ maxWidth: '220px', minWidth: '220px' }}>
                  <option value="">Month</option>
                  {months.map((month, index) => (
                    <option key={`month-${month}`} value={String(index + 1)}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row spaced">
              <div className="inline-group">
                <div className="label">Age Group:</div>
                <label className="check">
                  <input type="radio" name="age_group" value="13-19" /> 13-19
                </label>
                <label className="check">
                  <input type="radio" name="age_group" value="20-35" /> 20-35
                </label>
                <label className="check">
                  <input type="radio" name="age_group" value="36-45" /> 36-45
                </label>
                <label className="check">
                  <input type="radio" name="age_group" value="46&above" /> 46&amp;above
                </label>
              </div>

              <div className="inline-group">
                <div className="label">Marital Status</div>
                <label className="check">
                  <input type="radio" name="marital_status" value="Married" /> Married
                </label>
                <label className="check">
                  <input type="radio" name="marital_status" value="Single" /> Single
                </label>
              </div>
            </div>

            <div className="row spaced">
              <div className="inline-group">
                <div className="label">Are you born again?</div>
                <label className="check">
                  <input type="radio" name="born_again" value="Yes" /> Yes
                </label>
                <label className="check">
                  <input type="radio" name="born_again" value="No" /> No
                </label>
              </div>

              <div className="inline-group">
                <div className="label">Do you speak in tongues?</div>
                <label className="check">
                  <input type="radio" name="speak_tongues" value="Yes" /> Yes
                </label>
                <label className="check">
                  <input type="radio" name="speak_tongues" value="No" /> No
                </label>
              </div>
            </div>

            <div className="section-title">How did you find out about Christ Embassy?</div>
            <div className="row" style={{ gap: '18px' }}>
              <label className="check">
                <input type="checkbox" name="find_out" value="TV" /> TV
              </label>
              <label className="check">
                <input type="checkbox" name="find_out" value="SOCIAL MEDIA" /> SOCIAL MEDIA
              </label>
              <label className="check">
                <input type="checkbox" name="find_out" value="A CHRIST EMBASSY PROGRAM" /> A CHRIST EMBASSY PROGRAM
              </label>
              <label className="check">
                <input type="checkbox" name="find_out" value="PERSONAL INVITATION" /> PERSONAL INVITATION
              </label>
            </div>

            <div className="row">
              <div className="smalllabel">Name of Person that Invited you:</div>
              <input className="line" name="invited_by" />
            </div>

            <div className="section-title">Please tell us how you prefer to be contacted</div>
            <div className="row" style={{ gap: '28px' }}>
              <label className="check">
                <input type="checkbox" name="contact_pref" value="Telephone" /> Telephone
              </label>
              <label className="check">
                <input type="checkbox" name="contact_pref" value="SMS" /> SMS
              </label>
              <label className="check">
                <input type="checkbox" name="contact_pref" value="Post" /> Post
              </label>
              <label className="check">
                <input type="checkbox" name="contact_pref" value="Email" /> Email
              </label>
            </div>

            <div className="row" style={{ gap: '14px' }}>
              <div className="smalllabel">Would you like us to visit you?</div>
              <label className="check">
                <input type="radio" name="visit" value="Yes" /> Yes
              </label>
              <label className="check">
                <input type="radio" name="visit" value="No" /> No
              </label>
              <div className="smalllabel">If yes, when is most convenient?</div>
              <input className="line" name="visit_when" style={{ minWidth: '260px', maxWidth: '320px' }} />
            </div>

            <div className="section-title" style={{ marginTop: '6px' }}>
              Please list any Prayer Request that you may have
            </div>
            <div className="prayer">
              <input className="line" name="prayer_1" aria-label="Prayer request line 1" />
              <input className="line" name="prayer_2" aria-label="Prayer request line 2" />
              <input className="line" name="prayer_3" aria-label="Prayer request line 3" />
            </div>

            <div className="turnover">KINDLY TURN OVER &#x279C;</div>

            <div className="actions">
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  if (window.confirm('Cancel and clear the form?')) {
                    formRef.current?.reset()
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAccess && (
        <div className="ft-form-access-overlay">
          <div className="ft-form-access-modal">
            <h2>Access Code</h2>
            <label htmlFor="ftAccessCode">Enter access code to continue</label>
            <input
              id="ftAccessCode"
              type="password"
              value={accessInput}
              onChange={(event) => setAccessInput(event.target.value)}
              autoComplete="one-time-code"
              style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: '8px', border: '1px solid #d0d7e5' }}
            />
            {accessError && <p style={{ color: '#b23a2c', marginTop: '8px' }}>{accessError}</p>}
            <div className="ft-form-access-actions">
              <button type="button" className="secondary" onClick={handleAccessCancel}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={verifyAccessCode}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FirstTimerForm
