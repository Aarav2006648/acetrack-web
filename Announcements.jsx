import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { normalizePhone } from '../lib/phone'

const todayStr = () => new Date().toISOString().slice(0, 10)

function buildRenewalMessage(student) {
  const name = student.full_name
  if (student.remaining_classes <= 0) {
    return `Hi! Just a quick note that ${name}'s current badminton package with Al Hayatt Club has now been completed. We'd love to see ${name} continue with us — whenever you're ready to renew, just let us know and we'll get them booked in. Thank you!`
  }
  return `Hi! A friendly reminder that ${name}'s next badminton session will be their last one on the current package with Al Hayatt Club. We'd love to see ${name} continue with us — please let us know if you'd like to renew so we can keep their spot. Thank you!`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
}

export default function Announcements() {
  const [renewals, setRenewals] = useState([])
  const [renewalsLoading, setRenewalsLoading] = useState(true)
  const [sentId, setSentId] = useState(null)

  const [pending, setPending] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [markingId, setMarkingId] = useState(null)
  const [pendingError, setPendingError] = useState('')

  const [todaysWalkIns, setTodaysWalkIns] = useState([])
  const [walkInsLoading, setWalkInsLoading] = useState(true)

  useEffect(() => {
    loadRenewals()
    loadPending()
    loadTodaysWalkIns()
  }, [])

  async function loadRenewals() {
    setRenewalsLoading(true)

    const { data } = await supabase
      .from('students')
      .select('id, full_name, phone, remaining_classes, packages(is_unlimited)')
      .eq('status', 'Active')
      .lte('remaining_classes', 1)
      .order('remaining_classes', { ascending: true })

    setRenewals((data || []).filter((s) => !s.packages?.is_unlimited))
    setRenewalsLoading(false)
  }

  // Pending payments can come from a badminton walk-in (attendance,
  // guest_name not null) or a billiards table rental (rentals) — both
  // are surfaced here so nothing gets forgotten once the session ends.
  async function loadPending() {
    setPendingLoading(true)
    setPendingError('')

    const [{ data: pendingAttendance, error: attErr }, { data: pendingRentals, error: rentErr }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, guest_name, guest_phone, activity, court_number, check_in_time, amount, attendance_date')
        .not('guest_name', 'is', null)
        .eq('payment_status', 'Pending')
        .order('check_in_time', { ascending: false }),
      supabase
        .from('rentals')
        .select('id, guest_name, guest_phone, activity, court_number, start_time, price, booking_date')
        .eq('payment_status', 'Pending')
        .order('start_time', { ascending: false }),
    ])

    if (attErr || rentErr) {
      setPendingError((attErr || rentErr).message)
      setPendingLoading(false)
      return
    }

    const attRows = (pendingAttendance || []).map((r) => ({
      key: `attendance-${r.id}`,
      source: 'attendance',
      id: r.id,
      name: r.guest_name,
      phone: r.guest_phone,
      activity: r.activity,
      court: r.court_number,
      time: r.check_in_time,
      amount: r.amount,
      date: r.attendance_date,
    }))

    const rentalRows = (pendingRentals || []).map((r) => ({
      key: `rentals-${r.id}`,
      source: 'rentals',
      id: r.id,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: r.activity,
      court: r.court_number,
      time: r.start_time,
      amount: r.price,
      date: r.booking_date,
    }))

    setPending(
      [...attRows, ...rentalRows].sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))
    )
    setPendingLoading(false)
  }

  async function loadTodaysWalkIns() {
    setWalkInsLoading(true)
    const today = todayStr()

    const [{ data: badmintonGuests }, { data: billiardsGuests }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, guest_name, guest_phone, court_number, check_in_time, payment_status, amount')
        .is('student_id', null)
        .eq('attendance_date', today)
        .order('check_in_time', { ascending: false }),
      supabase
        .from('rentals')
        .select('id, guest_name, guest_phone, court_number, start_time, payment_status, price')
        .eq('booking_date', today)
        .order('start_time', { ascending: false }),
    ])

    const badminton = (badmintonGuests || []).map((r) => ({
      key: `bm-${r.id}`,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: 'Badminton',
      court: r.court_number,
      time: r.check_in_time,
      payment_status: r.payment_status,
      amount: r.amount,
    }))

    const billiards = (billiardsGuests || []).map((r) => ({
      key: `bl-${r.id}`,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: 'Billiards',
      court: r.court_number,
      time: r.start_time,
      payment_status: r.payment_status,
      amount: r.price,
    }))

    setTodaysWalkIns(
      [...badminton, ...billiards].sort((a, b) => new Date(b.time) - new Date(a.time))
    )
    setWalkInsLoading(false)
  }

  async function handleSendRenewal(student) {
    const message = buildRenewalMessage(student)
    const phone = normalizePhone(student.phone)

    if (!phone) {
      try {
        await navigator.clipboard.writeText(message)
      } catch {
        // clipboard can fail silently on some browsers — not critical
      }
      window.alert(`${student.full_name} doesn't have a valid phone number saved. The message was copied instead.`)
      return
    }

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

    setSentId(student.id)
    setTimeout(() => setSentId(null), 2000)
  }

  async function handleMarkPaid(row) {
    setMarkingId(row.key)
    setPendingError('')

    const { error } = await supabase
      .from(row.source)
      .update({ payment_status: 'Paid' })
      .eq('id', row.id)

    setMarkingId(null)

    if (error) {
      setPendingError(error.message)
      return
    }

    await loadPending()
    await loadTodaysWalkIns()
  }

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">ANNOUNCEMENTS</h1>
          <p className="text-line-dim text-sm mt-1">Renewal reminders, pending payments, and today's walk-ins</p>
        </header>

        {/* RENEWALS */}
        <section className="mb-8">
          <h2 className="font-display text-lg tracking-wide mb-3">CLASSES ENDING SOON</h2>
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {renewalsLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!renewalsLoading && renewals.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No members are close to running out right now.</p>
            )}
            <div className="divide-y divide-court-800">
              {renewals.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{s.full_name}</p>
                    <p className="text-xs text-line-dim">
                      {s.remaining_classes <= 0 ? 'Package finished' : '1 class left'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSendRenewal(s)}
                    className="text-xs bg-chalk/15 hover:bg-chalk/25 text-chalk px-3 py-1.5 rounded-md font-medium transition-colors shrink-0"
                  >
                    {sentId === s.id ? 'Opened ✓' : 'Send reminder on WhatsApp'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PENDING PAYMENTS */}
        <section className="mb-8">
          <h2 className="font-display text-lg tracking-wide mb-3">PENDING PAYMENTS</h2>
          <p className="text-xs text-line-dim mb-3">
            Walk-ins logged as Pending (e.g. paying after their session) — mark them Paid
            once they've settled up so they stop showing here.
          </p>
          {pendingError && <p className="text-sm text-danger mb-2">{pendingError}</p>}
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {pendingLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!pendingLoading && pending.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No pending payments — everyone's settled up.</p>
            )}
            <div className="divide-y divide-court-800">
              {pending.map((row) => (
                <div key={row.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-line-dim">
                      {row.activity}{row.court ? ` · Court ${row.court}` : ''} · {row.time ? formatTime(row.time) : ''}
                      {row.amount ? ` · AED ${Number(row.amount).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMarkPaid(row)}
                    disabled={markingId === row.key}
                    className="text-xs bg-net/15 hover:bg-net/25 text-net px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-60 shrink-0"
                  >
                    {markingId === row.key ? 'Saving…' : 'Mark as Paid'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TODAY'S WALK-INS */}
        <section>
          <h2 className="font-display text-lg tracking-wide mb-3">TODAY'S WALK-INS</h2>
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {walkInsLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!walkInsLoading && todaysWalkIns.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No walk-ins logged yet today.</p>
            )}
            <div className="divide-y divide-court-800">
              {todaysWalkIns.map((row) => (
                <div key={row.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-line-dim">
                      {row.activity}{row.court ? ` · Court ${row.court}` : ''} · {formatTime(row.time)}
                      {row.amount ? ` · AED ${Number(row.amount).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${row.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'}`}>
                    {row.payment_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}
