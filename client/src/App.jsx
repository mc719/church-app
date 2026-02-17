import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { useEffect, useMemo, useState } from 'react'
import AppLayout from './layout/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AddCellModal from './components/AddCellModal.jsx'
import Login from './pages/Login.jsx'
import Reports from './pages/Reports.jsx'
import Cells from './pages/Cells.jsx'
import FirstTimers from './pages/FirstTimers.jsx'
import FoundationSchool from './pages/FoundationSchool.jsx'
import Birthdays from './pages/Birthdays.jsx'
import Notifications from './pages/Notifications.jsx'
import AccessManagement from './pages/AccessManagement.jsx'
import Departments from './pages/Departments.jsx'
import PageManagement from './pages/PageManagement.jsx'
import Sessions from './pages/Sessions.jsx'
import Settings from './pages/Settings.jsx'
import Profile from './pages/Profile.jsx'
import Placeholder from './pages/Placeholder.jsx'
import Members from './pages/Members.jsx'
import NewCellForm from './pages/NewCellForm.jsx'
import FirstTimerForm from './pages/FirstTimerForm.jsx'
import NewDepartmentForm from './pages/NewDepartmentForm.jsx'

function App() {
  const [showAddCell, setShowAddCell] = useState(false)
  const [hasToken, setHasToken] = useState(Boolean(localStorage.getItem('token')))

  const modalContext = useMemo(() => ({
    openAddCell: () => setShowAddCell(true),
    closeAddCell: () => setShowAddCell(false)
  }), [])

  useEffect(() => {
    const syncToken = () => {
      setHasToken(Boolean(localStorage.getItem('token')))
    }
    syncToken()
    window.addEventListener('storage', syncToken)
    window.addEventListener('auth-changed', syncToken)
    return () => {
      window.removeEventListener('storage', syncToken)
      window.removeEventListener('auth-changed', syncToken)
    }
  }, [])

  useEffect(() => {
    const handleOpenAddCell = () => setShowAddCell(true)
    window.addEventListener('open-add-cell', handleOpenAddCell)
    return () => window.removeEventListener('open-add-cell', handleOpenAddCell)
  }, [])

  return (
    <>
      <Routes>
        <Route path="new-cell" element={<NewCellForm />} />
        <Route path="ft-form" element={<FirstTimerForm />} />
        <Route path="new-department" element={<NewDepartmentForm />} />
        <Route path="login" element={hasToken ? <Navigate to="/" replace /> : <Login />} />
        <Route element={hasToken ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route index element={<Dashboard onAddCell={modalContext.openAddCell} />} />
          <Route path="members" element={<Members />} />
          <Route path="cells" element={<Cells />} />
          <Route path="reports" element={<Reports />} />
          <Route path="first-timers" element={<FirstTimers />} />
          <Route path="foundation-school" element={<FoundationSchool />} />
          <Route path="birthdays" element={<Birthdays />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="departments" element={<Departments />} />
          <Route path="page-management" element={<PageManagement />} />
          <Route path="access-management" element={<AccessManagement />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AddCellModal open={showAddCell} onClose={modalContext.closeAddCell} />
    </>
  )
}

export default App
