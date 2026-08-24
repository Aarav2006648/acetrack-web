import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Clients from './pages/Clients'
import CheckIn from './pages/CheckIn'
import Reports from './pages/Reports'
import Rentals from './pages/Rentals'
import ParentPortal from './pages/ParentPortal'
import ProtectedRoute from './components/ProtectedRoute'
import ReminderPanel from './components/ReminderPanel'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/parent" element={<ParentPortal />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/checkin" element={<ProtectedRoute><CheckIn /></ProtectedRoute>} />
        <Route path="/rentals" element={<ProtectedRoute><Rentals /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      </Routes>
      <ReminderPanel />
    </>
  )
}
