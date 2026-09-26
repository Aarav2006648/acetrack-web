import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { loadInactiveMembers, INACTIVITY_DAYS } from '../lib/inactivity'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMembers: null,
    todayCheckins: null,
    renewalsDue: null,
    inactiveCount: null,
    monthRevenue: null,
    monthPending: null,
  })
  const [recent, setRecent] = useState([])
  const [undoingId, setUndoingId] = useState(null)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = new Date()
    monthStart.setDate(1)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    const [
      [
        { count: totalMembers },
        { count: todayCheckins },
        { data: renewalCandidates },
        { data: enrollmentPayments },
        { data: monthRentals },
        { data: monthGuestAttendance },
        { data: recentCheckins },
      ],
      inactiveMembers,
    ] = await Promise.all([
      Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('attendance_date', today),
        supabase.from('students').select('id, remaining_classes, packages(is_unlimited)').eq('status', 'Active').lte('remaining_classes', 1),
        supabase.from('payments').select('amount').gte('payment_date', monthStartStr),
        supabase.from('rentals').select('price, payment_status').gte('booking_date', monthStartStr),
        supabase
          .from('attendance')
          .select('amount, payment_status')
          .is('student_id', null)
          .gte('attendance_date', monthStartStr),
        supabase
          .from('attendance')
          .select('id, activity, check_in_time, student_id, guest_name, students(full_name, remaining_classes, classes_used, packages(is_unlimited))')
          .eq('attendance_date', today)
          .order('check_in_time', { ascending: false })
          .limit(20),
      ]),
      loadInactiveMembers(),
    ])

    // exclude unlimited-package members — they never run out, so they're never "due"
    const renewalsDue = (renewalCandidates || []).filter((s) => !s.packages?.is_unlimited).length

    const enrollmentTotal = (enrollmentPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const rentalsPaid = (monthRentals || [])
      .filter((r) => r.payment_status === 'Paid')
      .reduce((sum, r) => sum + Number(r.price || 0), 0)
    const rentalsPending = (monthRentals || [])
      .filter((r) => r.payment_status === 'Pending')
      .reduce((sum, r) => sum + Number(r.price || 0), 0)
    const guestPaid = (monthGuestAttendance || [])
      .filter((a) => a.payment_status === 'Paid')
      .reduce((sum, a) => sum + Number(a.amount || 0), 0)
    const guestPending = (monthGuestAttendance || [])
      .filter((a) => a.payment_status === 'Pending')
      .reduce((sum, a) => sum + Number(a.amount || 0), 0)

    setStats({
      totalMembers,
      todayCheckins,
      renewalsDue,
      inactiveCount: inactiveMembers.length,
      monthRevenue: enrollmentTotal + rentalsPaid + guestPaid,
      monthPending: rentalsPending + guestPending,
    })
    setRecent(recentCheckins || [])
  }

  // Removes a check-in logged by mistake (wrong member scanned, guest
  // double-tapped, etc.) and — for a member on a limited package — gives
  // the class back exactly the way CheckIn.jsx took it away, so undoing
  // never leaves their remaining/used counts out of sync.
  async function handleUndoCheckIn(row) {
    const label = row.students?.full_name || row.guest_name || 'this check-in'
    const givesBackClass = Boolean(row.student_id && row.students && !row.students.packages?.is_unlimited)

    const confirmed = window.confirm(
      `Undo ${label}'s check-in?${givesBackClass ? ' This gives back 1 class.' : ''}`
    )
    if (!confirmed) return

    setUndoingId(row.id)

    const { error: deleteError } = await supabase.from('attendance').delete().eq('id', row.id)

    if (deleteError) {
      setUndoingId(null)
      window.alert(`Could not undo: ${deleteError.message}`)
      return
    }

    if (givesBackClass) {
      await supabase
        .from('students')
        .update({
          remaining_classes: row.students.remaining_classes + 1,
          classes_used: Math.max(0, row.students.classes_used - 1),
        })
        .eq('id', row.student_id)
    }

    await loadStats()
    setUndoingId(null)
  }

  // "Active Members" here means currently-engaged members — Active status
  // AND not already sitting in the Inactive Members bucket below — so the
  // two cards add up sensibly instead of double-counting the same person
  // as both "active" and "inactive" at once.
  const engagedMembers =
    stats.totalMembers != null && stats.inactiveCount != null
      ? stats.totalMembers - stats.inactiveCount
      : stats.totalMembers

  const cards = [
    {
      label: 'Active Members',
      value: engagedMembers,
      sub: stats.inactiveCount > 0 ? `${stats.inactiveCount} inactive not counted` : null,
    },
    { label: 'Check-ins Today', value: stats.todayCheckins },
    {
      label: 'Renewals Due',
      value: stats.renewalsDue,
      sub: stats.renewalsDue > 0 ? 'Package running low' : null,
      linkTo: '/announcements#classes-ending-soon',
    },
    {
      label: 'Inactive Members',
      value: stats.inactiveCount,
      sub: stats.inactiveCount > 0 ? `No check-in in ${INACTIVITY_DAYS}+ days` : null,
      linkTo: '/announcements#hasnt-attended-recently',
    },
    {
      label: 'Revenue This Month',
      value: stats.monthRevenue != null ? `AED ${stats.monthRevenue.toFixed(0)}` : null,
      sub: stats.monthPending != null && stats.monthPending > 0 ? `+ AED ${stats.monthPending.toFixed(0)} pending` : null,
    },
  ]

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-6xl">
        <header className="mb-8">
          <h1 className="font-display text-3xl">DASHBOARD</h1>
          <p className="text-line-dim text-sm mt-1">Today, {new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
          {cards.map((c) => {
            const CardTag = c.linkTo ? Link : 'div'
            return (
              <CardTag
                key={c.label}
                {...(c.linkTo ? { to: c.linkTo } : {})}
                className={`bg-court-900 border border-court-700 rounded-xl p-5 block ${c.linkTo ? 'hover:border-chalk/50 transition-colors cursor-pointer' : ''}`}
              >
                <p className="text-xs text-line-dim uppercase tracking-wide">{c.label}</p>
                <p className="font-mono text-3xl mt-2 text-chalk">{c.value === null ? '—' : c.value}</p>
                {c.sub && <p className="text-xs text-line-dim mt-1">{c.sub}</p>}
              </CardTag>
            )
          })}
        </div>
        <p className="text-xs text-line-dim mb-10">
          Revenue this month is calculated live from this month's payments — it isn't stored, so it rolls over
          to AED 0 automatically the moment the 1st of the month begins. Looking for a previous month?{' '}
          <Link to="/reports" className="text-chalk hover:text-chalk-bright underline underline-offset-2">
            Jump to Reports and pick a date range →
          </Link>
        </p>

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-court-700">
            <h2 className="font-display text-lg tracking-wide">RECENT CHECK-INS</h2>
            <p className="text-xs text-line-dim mt-1">Today only — head to Check-In to log or backdate one.</p>
          </div>
          <div className="divide-y divide-court-800">
            {recent.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No check-ins yet today — scan a member QR on the Check-In page to get started.</p>
            )}
            {recent.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between text-sm gap-3">
                <div>
                  <span className="font-medium">{r.students?.full_name || r.guest_name || 'Unknown'}</span>
                  <span className="text-line-dim ml-2">{r.activity}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-line-dim text-xs">
                    {new Date(r.check_in_time).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUndoCheckIn(r)}
                    disabled={undoingId === r.id}
                    className="text-[11px] text-line-dim hover:text-danger transition-colors disabled:opacity-50"
                  >
                    {undoingId === r.id ? 'Undoing…' : 'Undo'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
