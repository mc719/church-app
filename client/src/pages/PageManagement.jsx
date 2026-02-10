import { useEffect, useMemo, useState } from 'react'
import './PageManagement.css'

const DEFAULT_PAGES = [
  { id: '/', label: 'Dashboard', icon: 'fas fa-home', section: 'Main' },
  { id: '/members', label: 'Members', icon: 'fas fa-users', section: 'Main' },
  { id: '/first-timers', label: 'First-Timers', icon: 'fas fa-user-check', section: 'Main' },
  { id: '/birthdays', label: 'Birthdays', icon: 'fas fa-birthday-cake', section: 'Main' },
  { id: '/cells', label: 'All Cells', icon: 'fas fa-layer-group', section: 'Cell Groups' },
  { id: '/notifications', label: 'Notifications', icon: 'fas fa-bell', section: 'Administrator' },
  { id: '/page-management', label: 'Page Management', icon: 'fas fa-file-alt', section: 'Administrator' },
  { id: '/access-management', label: 'Access Management', icon: 'fas fa-user-shield', section: 'Administrator' },
  { id: '/sessions', label: 'Sessions', icon: 'fas fa-history', section: 'Administrator' },
  { id: '/settings', label: 'Settings', icon: 'fas fa-cog', section: 'Administrator' }
]

function PageManagement() {
  const [pageMeta, setPageMeta] = useState({})
  const [pageVisibility, setPageVisibility] = useState({})
  const [editingPage, setEditingPage] = useState(null)
  const [sectionVisibility, setSectionVisibility] = useState({})
  const [deletedPages, setDeletedPages] = useState([])
  const [dynamicPages, setDynamicPages] = useState([])

  useEffect(() => {
    const loadFromStorage = () => {
      try {
        setPageMeta(JSON.parse(localStorage.getItem('pageMeta') || '{}'))
      } catch {
        setPageMeta({})
      }
      try {
        setPageVisibility(JSON.parse(localStorage.getItem('pageVisibility') || '{}'))
      } catch {
        setPageVisibility({})
      }
      try {
        setSectionVisibility(JSON.parse(localStorage.getItem('sectionVisibility') || '{}'))
      } catch {
        setSectionVisibility({})
      }
      try {
        const deleted = JSON.parse(localStorage.getItem('deletedPages') || '[]')
        setDeletedPages(Array.isArray(deleted) ? deleted : [])
      } catch {
        setDeletedPages([])
      }
    }

    const fetchDynamicPages = async () => {
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [cells, departments] = await Promise.all([
          fetch('/api/cells', { headers }).then((r) => (r.ok ? r.json() : [])),
          fetch('/api/departments', { headers }).then((r) => (r.ok ? r.json() : []))
        ])
        const cellPages = (Array.isArray(cells) ? cells : []).map((cell) => ({
          id: `/cells?cellId=${cell.id}`,
          label: cell.name || `Cell ${cell.id}`,
          icon: 'fas fa-users',
          section: 'Cell Groups'
        }))
        const departmentPages = (Array.isArray(departments) ? departments : []).map((dept) => ({
          id: `/departments?departmentId=${dept.id}`,
          label: dept.name || `Department ${dept.id}`,
          icon: 'fas fa-sitemap',
          section: 'Departments'
        }))
        setDynamicPages([...cellPages, ...departmentPages])
      } catch {
        setDynamicPages([])
      }
    }

    loadFromStorage()
    fetchDynamicPages()

    const handleRefresh = () => {
      loadFromStorage()
      fetchDynamicPages()
    }

    window.addEventListener('page-meta-updated', handleRefresh)
    window.addEventListener('page-visibility-updated', handleRefresh)
    window.addEventListener('page-deleted-updated', handleRefresh)
    window.addEventListener('section-visibility-updated', handleRefresh)
    window.addEventListener('cells-updated', handleRefresh)
    window.addEventListener('departments-updated', handleRefresh)
    return () => {
      window.removeEventListener('page-meta-updated', handleRefresh)
      window.removeEventListener('page-visibility-updated', handleRefresh)
      window.removeEventListener('page-deleted-updated', handleRefresh)
      window.removeEventListener('section-visibility-updated', handleRefresh)
      window.removeEventListener('cells-updated', handleRefresh)
      window.removeEventListener('departments-updated', handleRefresh)
    }
  }, [])

  const pages = useMemo(() => {
    const merged = [
      ...DEFAULT_PAGES.map((page) => ({
        ...page,
        label: pageMeta[page.id]?.label || page.label,
        icon: pageMeta[page.id]?.icon || page.icon,
        visible: pageVisibility[page.id] !== false
      })),
      ...dynamicPages.map((page) => ({
        ...page,
        label: pageMeta[page.id]?.label || page.label,
        icon: pageMeta[page.id]?.icon || page.icon,
        visible: pageVisibility[page.id] !== false
      }))
    ]
    return merged.filter((page) => !deletedPages.includes(page.id))
  }, [pageMeta, pageVisibility, dynamicPages, deletedPages])

  const saveVisibility = (updated) => {
    localStorage.setItem('pageVisibility', JSON.stringify(updated))
    setPageVisibility(updated)
    window.dispatchEvent(new Event('page-visibility-updated'))
  }

  const saveMeta = (updated) => {
    localStorage.setItem('pageMeta', JSON.stringify(updated))
    setPageMeta(updated)
    window.dispatchEvent(new Event('page-meta-updated'))
  }

  const saveSectionVisibility = (updated) => {
    localStorage.setItem('sectionVisibility', JSON.stringify(updated))
    setSectionVisibility(updated)
    window.dispatchEvent(new Event('section-visibility-updated'))
  }

  const saveDeletedPages = (updated) => {
    localStorage.setItem('deletedPages', JSON.stringify(updated))
    setDeletedPages(updated)
    window.dispatchEvent(new Event('page-deleted-updated'))
  }

  const toggleVisibility = (pageId, value) => {
    saveVisibility({ ...pageVisibility, [pageId]: value })
  }

  const handleDeletePage = (pageId) => {
    const confirmed = window.confirm('Delete this page from the menu?')
    if (!confirmed) return
    const nextDeleted = Array.from(new Set([...(deletedPages || []), pageId]))
    saveDeletedPages(nextDeleted)
    const nextMeta = { ...(pageMeta || {}) }
    delete nextMeta[pageId]
    saveMeta(nextMeta)
    const nextVisibility = { ...(pageVisibility || {}) }
    delete nextVisibility[pageId]
    saveVisibility(nextVisibility)
  }

  const handleShowAll = () => {
    const next = {}
    DEFAULT_PAGES.forEach((page) => {
      next[page.id] = true
    })
    saveVisibility(next)
  }

  const handleHideAll = () => {
    const next = {}
    DEFAULT_PAGES.forEach((page) => {
      next[page.id] = false
    })
    saveVisibility(next)
  }

  const toggleSection = (section, value) => {
    saveSectionVisibility({ ...sectionVisibility, [section]: value })
  }

  const handleSave = (event) => {
    event.preventDefault()
    if (!editingPage) return
    saveMeta({
      ...pageMeta,
      [editingPage.id]: {
        label: editingPage.label,
        icon: editingPage.icon
      }
    })
    setEditingPage(null)
  }

  return (
    <div className="page-management-page">
      <div className="page-actions page-actions-below" style={{ justifyContent: 'flex-end', gap: '10px' }}>
        <button className="btn" type="button" onClick={handleShowAll}>
          Show All
        </button>
        <button className="btn btn-danger" type="button" onClick={handleHideAll}>
          Hide All
        </button>
      </div>

      <div className="page-actions" style={{ justifyContent: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        {['Main', 'Cell Groups', 'Departments', 'Administrator'].map((section) => (
          <label key={section} className="section-toggle">
            <input
              type="checkbox"
              checked={sectionVisibility[section] !== false}
              onChange={(e) => toggleSection(section, e.target.checked)}
            />
            <span>{section}</span>
          </label>
        ))}
      </div>

      <div className="table-container">
        <table className="mobile-grid-table">
          <thead>
            <tr>
              <th>Menu Name</th>
              <th>Icon</th>
              <th>Section</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td data-label="Menu Name">{page.label}</td>
                <td data-label="Icon">
                  <i className={page.icon}></i>
                  <span style={{ marginLeft: '8px' }}>{page.icon}</span>
                </td>
                <td data-label="Section">{page.section}</td>
                <td data-label="Status">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={page.visible}
                      onChange={(e) => toggleVisibility(page.id, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </td>
                <td data-label="Actions">
                  <div className="action-buttons">
                    <button className="action-btn edit-btn" type="button" onClick={() => setEditingPage(page)}>
                      <i className="fas fa-edit"></i> Edit
                    </button>
                    <button className="action-btn delete-btn" type="button" onClick={() => handleDeletePage(page.id)}>
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingPage && (
        <div className="modal-overlay active" onClick={() => setEditingPage(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Menu</h3>
              <button className="close-modal" type="button" onClick={() => setEditingPage(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>Menu Name</label>
                  <input
                    className="form-control"
                    value={editingPage.label}
                    onChange={(e) => setEditingPage({ ...editingPage, label: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Icon</label>
                  <input
                    className="form-control"
                    value={editingPage.icon}
                    onChange={(e) => setEditingPage({ ...editingPage, icon: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn" type="button" onClick={() => setEditingPage(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-success" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PageManagement
