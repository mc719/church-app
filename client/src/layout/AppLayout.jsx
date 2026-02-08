import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'

function AppLayout() {
  const defaultPages = useMemo(() => ([
    { id: '/', label: 'Dashboard', icon: 'fas fa-home', section: 'main' },
    { id: '/members', label: 'Members', icon: 'fas fa-users', section: 'main' },
    { id: '/first-timers', label: 'First-Timers', icon: 'fas fa-user-check', section: 'main' },
    { id: '/birthdays', label: 'Birthdays', icon: 'fas fa-birthday-cake', section: 'main' },
    { id: '/cells', label: 'All Cells', icon: 'fas fa-layer-group', section: 'cells' },
    { id: '/notifications', label: 'Notifications', icon: 'fas fa-bell', section: 'admin' },
    { id: '/page-management', label: 'Page Management', icon: 'fas fa-file-alt', section: 'admin' },
    { id: '/access-management', label: 'Access Management', icon: 'fas fa-user-shield', section: 'admin' },
    { id: '/sessions', label: 'Sessions', icon: 'fas fa-history', section: 'admin' },
    { id: '/settings', label: 'Settings', icon: 'fas fa-cog', section: 'admin' }
  ]), [])

  const [cellGroupsOpen, setCellGroupsOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageMeta, setPageMeta] = useState({})
  const [pageVisibility, setPageVisibility] = useState({})
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [activeNotification, setActiveNotification] = useState(null)
  const [logoSrc, setLogoSrc] = useState('/images/logo.png')
  const [logoTitle, setLogoTitle] = useState('Christ Embassy')
  const [logoSubtitle, setLogoSubtitle] = useState('Church Cell Data')
  const location = useLocation()
  const navigate = useNavigate()
  const notificationsRef = useRef(null)
  const bellRef = useRef(null)

  const navClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`
  const pageTitle = pageMeta[location.pathname]?.label || defaultPages.find((p) => p.id === location.pathname)?.label || 'Dashboard'

  useEffect(() => {
    const isDark = theme === 'dark'
    document.body.classList.toggle('dark-theme', isDark)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const applyLogoText = () => {
      setLogoTitle(localStorage.getItem('logoTitle') || 'Christ Embassy')
      setLogoSubtitle(localStorage.getItem('logoSubtitle') || 'Church Cell Data')
    }

    const fetchLogo = async () => {
      try {
        const res = await fetch('/api/settings/logo', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) return
        const data = await res.json()
        if (data?.logo) {
          setLogoSrc(data.logo)
        }
      } catch {}
    }

    applyLogoText()
    fetchLogo()

    const handleLogoUpdate = () => {
      applyLogoText()
      fetchLogo()
    }

    window.addEventListener('logo-updated', handleLogoUpdate)
    return () => window.removeEventListener('logo-updated', handleLogoUpdate)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    let mounted = true

    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) return
        const data = await res.json()
        if (mounted) setNotifications(Array.isArray(data) ? data : [])
      } catch {
        if (mounted) setNotifications([])
      }
    }

    fetchNotifications()
    const timer = setInterval(fetchNotifications, 30000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!notificationsOpen) return
      if (bellRef.current?.contains(event.target)) return
      if (notificationsRef.current?.contains(event.target)) return
      setNotificationsOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [notificationsOpen])

  useEffect(() => {
    const loadMeta = () => {
      try {
        const meta = JSON.parse(localStorage.getItem('pageMeta') || '{}')
        setPageMeta(meta)
      } catch {
        setPageMeta({})
      }
      try {
        const visibility = JSON.parse(localStorage.getItem('pageVisibility') || '{}')
        setPageVisibility(visibility)
      } catch {
        setPageVisibility({})
      }
    }

    loadMeta()
    window.addEventListener('page-meta-updated', loadMeta)
    window.addEventListener('page-visibility-updated', loadMeta)
    return () => {
      window.removeEventListener('page-meta-updated', loadMeta)
      window.removeEventListener('page-visibility-updated', loadMeta)
    }
  }, [])

  const [sectionVisibility, setSectionVisibility] = useState({})
  useEffect(() => {
    const loadSections = () => {
      try {
        setSectionVisibility(JSON.parse(localStorage.getItem('sectionVisibility') || '{}'))
      } catch {
        setSectionVisibility({})
      }
    }
    loadSections()
    window.addEventListener('section-visibility-updated', loadSections)
    return () => window.removeEventListener('section-visibility-updated', loadSections)
  }, [])

  const getPageMeta = (path) => {
    const fallback = defaultPages.find((p) => p.id === path)
    const override = pageMeta[path]
    return {
      label: override?.label || fallback?.label || path.replace('/', ''),
      icon: override?.icon || fallback?.icon || 'fas fa-file-alt'
    }
  }

  const isVisible = (path) => pageVisibility[path] !== false

  const sectionVisible = (section) => sectionVisibility[section] !== false
  const mainPages = defaultPages.filter((p) => p.section === 'main' && isVisible(p.id) && sectionVisible('Main'))
  const cellPages = defaultPages.filter((p) => p.section === 'cells' && isVisible(p.id) && sectionVisible('Cell Groups'))
  const adminPages = defaultPages.filter((p) => p.section === 'admin' && isVisible(p.id) && sectionVisible('Administrator'))

  const handleToggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const handleCloseSidebar = () => {
    setSidebarOpen(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('restrictedMenus')
    window.dispatchEvent(new Event('auth-changed'))
    navigate('/login')
  }

  const handleLogoutClick = () => {
    setShowLogoutModal(true)
  }

  const handleCancelLogout = () => {
    setShowLogoutModal(false)
  }

  const handleConfirmLogout = () => {
    setShowLogoutModal(false)
    handleLogout()
  }

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const handleOpenProfile = () => {
    navigate('/profile')
  }

  const unreadNotifications = notifications.filter(
    (note) => !(note.readAt || note.read_at)
  )

  const handleToggleNotifications = (event) => {
    event.stopPropagation()
    setNotificationsOpen((prev) => !prev)
  }

  const handleOpenNotification = async (note) => {
    setActiveNotification(note)
    setNotificationsOpen(false)
    setNotifications((prev) =>
      prev.map((item) =>
        String(item.id) === String(note.id)
          ? { ...item, readAt: item.readAt || item.read_at || new Date().toISOString() }
          : item
      )
    )
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      await fetch(`/api/notifications/${note.id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {}
  }

  const handleCloseNotification = () => {
    setActiveNotification(null)
  }

  return (
    <>
      <button className="mobile-menu-toggle" id="mobileMenuToggle" onClick={handleToggleSidebar}>
        <i className="fas fa-bars"></i>
      </button>

      {sidebarOpen && <div className="sidebar-overlay" onClick={handleCloseSidebar}></div>}

      <div className={`sidebar${sidebarOpen ? ' open' : ''}`} id="sidebar">
        <div className="logo-area" id="logoLink">
          <img
            id="logoImage"
            className="logo-img"
            src={logoSrc}
            style={{ display: logoSrc ? 'block' : 'none' }}
            alt="Church Logo"
          />
          <div className="logo-title" id="logoTitleText">{logoTitle}</div>
          <div className="logo-subtitle" id="logoSubtitleText">{logoSubtitle}</div>
        </div>

        <div className="nav-menu" id="navMenu">
          {mainPages.map((page) => {
            const meta = getPageMeta(page.id)
            return (
              <NavLink key={page.id} className={navClass} to={page.id} onClick={handleCloseSidebar}>
                <i className={meta.icon}></i>
                <span>{meta.label}</span>
              </NavLink>
            )
          })}

          <div className="nav-divider" id="cellGroupsDivider"></div>

          <div className="accordion-section" id="cellGroupsSection">
            <button
              className="nav-section-title accordion-toggle"
              id="cellGroupsTitle"
              type="button"
              onClick={() => setCellGroupsOpen((prev) => !prev)}
            >
              <span>Cell Groups</span>
              <i className={`fas fa-chevron-down accordion-caret${cellGroupsOpen ? ' open' : ''}`}></i>
            </button>
            <div id="cellGroupsContainer" className={`accordion-content${cellGroupsOpen ? ' open' : ''}`}>
              {cellPages.map((page) => {
                const meta = getPageMeta(page.id)
                return (
                  <NavLink key={page.id} className={navClass} to={page.id} onClick={handleCloseSidebar}>
                    <i className={meta.icon}></i>
                    <span>{meta.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>

          <div className="nav-divider" id="adminDivider"></div>

          <div className="accordion-section" id="adminSection">
            <button
              className="nav-section-title accordion-toggle"
              id="adminTitle"
              type="button"
              onClick={() => setAdminOpen((prev) => !prev)}
            >
              <span>Administrator</span>
              <i className={`fas fa-chevron-down accordion-caret${adminOpen ? ' open' : ''}`}></i>
            </button>

            <div className={`accordion-content${adminOpen ? ' open' : ''}`} id="adminMenu">
              {adminPages.map((page) => {
                const meta = getPageMeta(page.id)
                return (
                  <NavLink key={page.id} className={navClass} to={page.id} onClick={handleCloseSidebar}>
                    <i className={meta.icon}></i>
                    <span>{meta.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </div>

        <button className="logout-btn" id="logoutBtn" onClick={handleLogoutClick}>
          <i className="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
      </div>

      <div
        className={`modal-overlay confirmation-modal${showLogoutModal ? ' active' : ''}`}
        onClick={handleCancelLogout}
      >
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-body">
            <div className="confirmation-icon">
              <i className="fas fa-sign-out-alt"></i>
            </div>
            <p className="confirmation-text">Are you sure you want to logout?</p>
            <div className="form-actions">
              <button className="btn" type="button" onClick={handleCancelLogout}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" onClick={handleConfirmLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <button className="theme-fab" type="button" onClick={handleToggleTheme} aria-label="Toggle theme">
        <i className={theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon'}></i>
      </button>

      <div className="main-content">
        <div className="page-header app-global-header">
          <div className="app-header-title">
            <h1>{pageTitle}</h1>
          </div>
          <div className="global-header-actions" style={{ marginLeft: 'auto' }}>
            <button
              className="notification-bell-icon"
              id="headerUserButton"
              aria-label="Profile"
              type="button"
              onClick={handleOpenProfile}
            >
              <i className="fas fa-user"></i>
            </button>
            <div className="notification-bell" ref={notificationsRef}>
              <div
                className="notification-bell-icon"
                id="notificationsBell"
                role="button"
                aria-label="Notifications"
                tabIndex="0"
                ref={bellRef}
                onClick={handleToggleNotifications}
              >
                <i className="fas fa-bell"></i>
                <span
                  className="notification-badge"
                  id="notificationsBadge"
                  style={{ display: unreadNotifications.length ? 'inline-flex' : 'none' }}
                >
                  {unreadNotifications.length}
                </span>
              </div>
              <div className={`notifications-dropdown${notificationsOpen ? ' open' : ''}`} id="notificationsDropdown">
                <div className="notifications-header">Unread Notifications</div>
                <div className="notifications-list" id="notificationsList">
                  {unreadNotifications.length === 0 && (
                    <div className="notification-empty">No unread notifications.</div>
                  )}
                  {unreadNotifications.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className="notification-item"
                      onClick={() => handleOpenNotification(note)}
                    >
                      <div className="notification-item-title">{note.title || 'Notification'}</div>
                      <div className="notification-item-text">{note.message || ''}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Outlet />
      </div>

      {activeNotification && (
        <div className="modal-overlay active" onClick={handleCloseNotification}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{activeNotification.title || 'Notification'}</h3>
              <button className="close-modal" type="button" onClick={handleCloseNotification}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {activeNotification.message || ''}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AppLayout
