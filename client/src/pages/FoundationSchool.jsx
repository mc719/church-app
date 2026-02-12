import { useEffect, useMemo, useState } from 'react'

function FoundationSchool() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch('/api/first-timers?includeArchived=true&foundationSchool=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data.filter((x) => !x.archived) : []))
      .catch(() => setItems([]))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.title, item.name, item.surname, item.mobile, item.email, item.cellName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [items, search])

  return (
    <div className="table-container">
      <div className="search-box" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search foundation school..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className="mobile-grid-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Mobile</th>
            <th>Email</th>
            <th>Cell</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', padding: '32px' }}>
                No records in foundation school.
              </td>
            </tr>
          )}
          {filtered.map((item) => (
            <tr key={item.id}>
              <td data-label="Name">{item.title ? `${item.title} ` : ''}{item.name || ''} {item.surname || ''}</td>
              <td data-label="Mobile">{item.mobile || '-'}</td>
              <td data-label="Email">{item.email || '-'}</td>
              <td data-label="Cell">{item.cellName || '-'}</td>
              <td data-label="Status">{item.status || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default FoundationSchool
