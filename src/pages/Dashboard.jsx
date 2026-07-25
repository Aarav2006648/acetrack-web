import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalMembers: null,
    todayCheckins: null,
    activePackages: null,
    monthRevenue: null,
    monthPending: null,
  })
  const [recent, setRecent] = useState([])

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const today = new Date().toISOString().slice(0, 10)
    const monthStart = new Date()
    monthStart.setDate(1)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    const [
      { count: totalMembers },
      { count: todayCheckins },
      { count: activePackages },
      { data: enrollmentPayments },
      { data: monthRentals },
      { data: monthGuestAttendance },
      { data: recentCheckins },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('attendance_date', today),
      supabase.from('students').select('*', { count: 'exact', head: true }).gt('remaining_classes', 0),
      supabase.from('payments').select('amount').gte('payment_date', monthStartStr),
      supabase.from('rentals').select('price, payment_status').gte('booking_date', monthStartStr),
      supabase
        .from('attendance')
        .select('amount, payment_status')
        .is('student_id', null)
        .gte('attendance_date', monthStartStr),
      supabase
        .from('attendance')
        .select('id, activity, check_in_time, guest_name, students(full_name)')
        .order('check_in_time', { ascending: false })
        .limit(8),
    ])

    // Revenue = enrollment/package payments this month + billiards rentals collected this month + badminton walk-in guests collected this month
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
      activePackages,
      monthRevenue: enrollmentTotal + rentalsPaid + guestPaid,
      monthPending: rentalsPending + guestPending,
    })
    setRecent(recentCheckins || [])
  }

  const cards = [
    { label: 'Active Members', value: stats.totalMembers },
    { label: 'Check-ins Today', value: stats.todayCheckins },
    { label: 'Members With Classes Left', value: stats.activePackages },
    {
      label: 'Revenue This Month',
      value: stats.monthRevenue != null ? `AED ${stats.monthRevenue.toFixed(0)}` : null,
      sub:
        stats.monthPending != null && stats.monthPending > 0
          ? `+ AED ${stats.monthPending.toFixed(0)} pending`
          : null,
    },
  ]

  return (
    <Layout>
      <div className="p-8 max-w-6xl">
        <header className="mb-8">
          <h1 className="font-display text-3xl">DASHBOARD</h1>
          <p className="text-line-dim text-sm mt-1">Today, {new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {cards.map((c) => (
            <div key={c.label} className="bg-court-900 border border-court-700 rounded-xl p-5">
              <p className="text-xs text-line-dim uppercase tracking-wide">{c.label}</p>
              <p className="font-mono text-3xl mt-2 text-chalk">
                {c.value === null ? '—' : c.value}
              </p>
              {c.sub && <p className="text-xs text-line-dim mt-1">{c.sub}</p>}
            </div>
          ))}
        </div>

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-court-700">
            <h2 className="font-display text-lg tracking-wide">RECENT CHECK-INS</h2>
          </div>
          <div className="divide-y divide-court-800">
            {recent.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No check-ins yet — scan a member QR on the Check-In page to get started.</p>
            )}
            {recent.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{r.students?.full_name || r.guest_name || 'Unknown'}</span>
                  <span className="text-line-dim ml-2">{r.activity}</span>
                </div>
                <span className="font-mono text-line-dim text-xs">
                  {new Date(r.check_in_time).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
