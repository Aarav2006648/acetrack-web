import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: DashIcon },
  { to: '/checkin', label: 'Check-In', icon: ScanIcon },
  { to: '/students', label: 'Members', icon: PeopleIcon },
  { to: '/clients', label: 'All Clients', icon: ClientsIcon },
  { to: '/rentals', label: 'Table Rentals', icon: RentalIcon },
  { to: '/announcements', label: 'Announcements', icon: BellIcon },
  { to: '/reports', label: 'Reports', icon: ReportIcon },
]

export default function Layout({ children }) {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-court-900 border-r border-court-700 flex flex-col">
        <div className="px-5 py-6 border-b border-court-700">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-chalk" />
            <span className="font-display text-xl tracking-wide">ACETRACK</span>
          </div>
          <p className="text-[11px] text-line-dim font-mono mt-1">AL HAYATT CLUB</p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-court-700 text-line' : 'text-line-dim hover:bg-court-800 hover:text-line'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-court-700">
          <p className="px-3 text-xs text-line-dim truncate">{session?.user?.email}</p>
          <button
            onClick={handleSignOut}
            className="mt-2 w-full text-left px-3 py-2 rounded-md text-sm text-line-dim hover:bg-court-800 hover:text-danger transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}

function DashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  )
}
function ScanIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" strokeLinecap="round" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  )
}
function PeopleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" strokeLinecap="round" />
    </svg>
  )
}
function ClientsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 9h18" strokeLinecap="round" />
      <path d="M7.5 13h3M7.5 16.5h5" strokeLinecap="round" />
    </svg>
  )
}
function RentalIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function BellIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}
function ReportIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
    </svg>
  )
}
