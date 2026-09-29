import { useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function today() { return new Date().toISOString().slice(0, 10) }

// First/last day of the calendar month `offset` months back (0 = this month,
// 1 = last month, etc.) — powers the "quick jump" month buttons below.
function monthRange(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  const from = d.toISOString().slice(0, 10)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const to = lastDay.toISOString().slice(0, 10)
  return { from, to }
}

function monthLabel(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - offset)
  return d.toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
}

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [attendanceRows, setAttendanceRows] = useState([])
  const [rentalRows, setRentalRows] = useState([])
  const [paymentRows, setPaymentRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  // Lets staff correct a membership payment after the fact — e.g. they
  // renewed a member but charged the wrong amount, or picked the wrong
  // payment method. Editing here updates the same `payments` row the
  // Dashboard's revenue figure is calculated from, so once saved it's
  // reflected everywhere without any extra step.
  const [editingPayment, setEditingPayment] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMethod, setEditMethod] = useState('Cash')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Accepts an explicit range so the quick month-jump buttons can run a
  // report immediately after setting the dates, without waiting on a
  // state update — the manual "Run report" button just uses the inputs.
  async function runReport(fromDate = from, toDate = to) {
    setLoading(true)

    const [{ data: attendance }, { data: rentals }, { data: payments }] = await Promise.all([
      supabase.from('attendance')
        .select('id, activity, attendance_date, check_in_time, guest_name, guest_phone, amount, payment_status, students(full_name, phone, student_code)')
        .gte('attendance_date', fromDate).lte('attendance_date', toDate).order('check_in_time', { ascending: false }),
      supabase.from('rentals')
        .select('id, court_number, duration, price, payment_status, booking_date, start_time, guest_name, guest_phone, students(full_name, phone)')
        .gte('booking_date', fromDate).lte('booking_date', toDate).order('start_time', { ascending: false }),
      supabase.from('payments')
        .select('id, amount, payment_method, payment_status, payment_date, students(full_name, phone), packages(package_name)')
        .gte('payment_date', fromDate).lte('payment_date', toDate + 'T23:59:59').order('payment_date', { ascending: false }),
    ])

    setAttendanceRows(attendance || [])
    setRentalRows(rentals || [])
    setPaymentRows(payments || [])
    setLoading(false)
    setRan(true)
  }

  function selectMonth(offset) {
    const { from: f, to: t } = monthRange(offset)
    setFrom(f)
    setTo(t)
    runReport(f, t)
  }

  function openEditPayment(p) {
    setEditingPayment(p)
    setEditAmount(String(p.amount ?? ''))
    setEditMethod(p.payment_method || 'Cash')
    setEditError('')
  }

  function closeEditPayment() {
    if (editSaving) return
    setEditingPayment(null)
    setEditAmount('')
    setEditMethod('Cash')
    setEditError('')
  }

  async function handleSavePaymentEdit(e) {
    e.preventDefault()
    setEditError('')

    const amountNumber = Number(editAmount)
    if (!editAmount || Number.isNaN(amountNumber) || amountNumber < 0) {
      setEditError('Enter a valid amount.')
      return
    }

    setEditSaving(true)

    const { error } = await supabase
      .from('payments')
      .update({ amount: amountNumber, payment_method: editMethod })
      .eq('id', editingPayment.id)

    setEditSaving(false)

    if (error) {
      setEditError(error.message)
      return
    }

    // Update it in place rather than re-running the whole report, so the
    // corrected amount/method — and the totals above that are calculated
    // from paymentRows — reflect immediately.
    setPaymentRows((rows) =>
      rows.map((row) =>
        row.id === editingPayment.id ? { ...row, amount: amountNumber, payment_method: editMethod } : row
      )
    )
    setEditingPayment(null)
  }

  // For a payment logged by mistake entirely (wrong member, duplicate
  // entry, etc.) rather than just a wrong amount — removes the record
  // outright after a confirmation, since this can't be undone.
  async function handleDeletePayment() {
    const name = editingPayment.students?.full_name || 'Unknown'
    const confirmed = window.confirm(
      `Delete this AED ${Number(editingPayment.amount).toFixed(0)} payment for ${name}? This can't be undone.`
    )
    if (!confirmed) return

    setEditSaving(true)
    setEditError('')

    const { error } = await supabase.from('payments').delete().eq('id', editingPayment.id)

    setEditSaving(false)

    if (error) {
      setEditError(error.message)
      return
    }

    setPaymentRows((rows) => rows.filter((row) => row.id !== editingPayment.id))
    setEditingPayment(null)
  }

  function nameFor(row) { return row.students?.full_name || row.guest_name || 'Unknown' }
  function phoneFor(row) { return row.students?.phone || row.guest_phone || '—' }

  function exportAttendanceCsv() {
    const csvRows = attendanceRows.map((r) => ({
      Date: r.attendance_date, Time: new Date(r.check_in_time).toLocaleTimeString('en-AE'),
      Name: nameFor(r), Phone: phoneFor(r), Type: r.students ? 'Member' : 'Guest', Activity: r.activity,
      'Amount (AED)': r.amount ?? '', Payment: r.students ? '' : r.payment_status || '',
    }))
    downloadCsv(csvRows, `badminton_attendance_${from}_to_${to}.csv`)
  }

  function exportRentalsCsv() {
    const csvRows = rentalRows.map((r) => ({
      Date: r.booking_date, Time: new Date(r.start_time).toLocaleTimeString('en-AE'),
      Name: nameFor(r), Phone: phoneFor(r), Type: r.students ? 'Member' : 'Guest', Table: r.court_number || '',
      'Duration (min)': r.duration, 'Price (AED)': r.price, Payment: r.payment_status,
    }))
    downloadCsv(csvRows, `billiards_rentals_${from}_to_${to}.csv`)
  }

  function exportPaymentsCsv() {
    const csvRows = paymentRows.map((p) => ({
      Date: new Date(p.payment_date).toLocaleDateString('en-AE'),
      Name: p.students?.full_name || 'Unknown',
      Phone: p.students?.phone || '—',
      Package: p.packages?.package_name || '—',
      'Amount (AED)': p.amount,
      Method: p.payment_method,
    }))
    downloadCsv(csvRows, `membership_payments_${from}_to_${to}.csv`)
  }

  function downloadCsv(rows, filename) {
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const attendanceSummary = Object.values(
    attendanceRows.reduce((acc, r) => {
      const name = nameFor(r)
      const key = `${name}|${r.students ? 'member' : 'guest'}`
      acc[key] = acc[key] || { name, phone: phoneFor(r), isGuest: !r.students, visits: 0 }
      acc[key].visits += 1
      return acc
    }, {})
  ).sort((a, b) => b.visits - a.visits)

  const guestAttendance = attendanceRows.filter((r) => !r.students)
  const badmintonCollected = guestAttendance.filter((r) => r.payment_status === 'Paid').reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const badmintonPending = guestAttendance.filter((r) => r.payment_status === 'Pending').reduce((sum, r) => sum + Number(r.amount || 0), 0)

  const rentalsRevenue = rentalRows.filter((r) => r.payment_status === 'Paid').reduce((sum, r) => sum + Number(r.price || 0), 0)
  const rentalsPending = rentalRows.filter((r) => r.payment_status === 'Pending').reduce((sum, r) => sum + Number(r.price || 0), 0)

  const membershipTotal = paymentRows.reduce((sum, p) => sum + Number(p.amount || 0), 0)

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">REPORTS</h1>
          <p className="text-line-dim text-sm mt-1">Membership payments, badminton attendance, and billiards rentals for a date range</p>
        </header>

        <div className="flex flex-wrap items-end gap-3 mb-8">
          <div>
            <label className="block text-xs text-line-dim mb-1.5">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-line-dim mb-1.5">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm" />
          </div>
          <button onClick={() => runReport()} disabled={loading} className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60">
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8 -mt-4">
          <span className="text-xs text-line-dim mr-1">Quick jump:</span>
          {[0, 1, 2, 3, 4, 5].map((offset) => (
            <button
              key={offset}
              onClick={() => selectMonth(offset)}
              disabled={loading}
              className="text-xs border border-court-600 px-3 py-1.5 rounded-md text-line-dim hover:text-line hover:bg-court-800 disabled:opacity-60"
            >
              {offset === 0 ? 'This month' : offset === 1 ? 'Last month' : monthLabel(offset)}
            </button>
          ))}
        </div>

        {ran && (
          <>
            {/* Combined revenue summary */}
            <div className="bg-court-900 border border-chalk/40 rounded-xl p-6 mb-8">
              <p className="text-xs text-line-dim uppercase tracking-wide mb-1">Total Revenue Collected ({from} to {to})</p>
              <p className="font-mono text-4xl text-chalk">
                AED {(membershipTotal + badmintonCollected + rentalsRevenue).toFixed(0)}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-line-dim">
                <span>Membership payments: <span className="text-line font-mono">AED {membershipTotal.toFixed(0)}</span></span>
                <span>Badminton walk-ins: <span className="text-line font-mono">AED {badmintonCollected.toFixed(0)}</span></span>
                <span>Billiards rentals: <span className="text-line font-mono">AED {rentalsRevenue.toFixed(0)}</span></span>
              </div>
              {(badmintonPending + rentalsPending) > 0 && (
                <p className="text-xs text-danger mt-2">
                  + AED {(badmintonPending + rentalsPending).toFixed(0)} still pending across walk-ins/rentals
                </p>
              )}
            </div>

            {/* Membership payments (enrollments/renewals) */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-wide">MEMBERSHIP PAYMENTS</h2>
              {paymentRows.length > 0 && (
                <button onClick={exportPaymentsCsv} className="border border-court-600 px-3 py-1.5 rounded-md text-xs text-line-dim hover:text-line hover:bg-court-800">Export CSV</button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Payments logged</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{paymentRows.length}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Total collected</p>
                <p className="font-mono text-3xl mt-1 text-chalk">AED {membershipTotal.toFixed(0)}</p>
              </div>
            </div>
            <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden mb-10">
              {/* Tablet/desktop: full table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium">Package</th>
                      <th className="px-5 py-3 font-medium">Amount</th>
                      <th className="px-5 py-3 font-medium">Method</th>
                      <th className="px-5 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-court-800">
                    {paymentRows.map((p) => (
                      <tr key={p.id}>
                        <td className="px-5 py-3 text-line-dim">{new Date(p.payment_date).toLocaleDateString('en-AE')}</td>
                        <td className="px-5 py-3 font-medium">{p.students?.full_name || 'Unknown'}</td>
                        <td className="px-5 py-3 text-line-dim">{p.students?.phone || '—'}</td>
                        <td className="px-5 py-3 text-line-dim">{p.packages?.package_name || '—'}</td>
                        <td className="px-5 py-3 font-mono">AED {Number(p.amount).toFixed(0)}</td>
                        <td className="px-5 py-3 text-line-dim">{p.payment_method}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => openEditPayment(p)}
                            className="text-xs border border-court-600 px-2.5 py-1 rounded-md text-line-dim hover:text-line hover:bg-court-800"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {paymentRows.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-8 text-center text-line-dim">No membership payments in this date range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Phone: stacked cards instead of a cramped/scrolling table */}
              <div className="sm:hidden divide-y divide-court-800">
                {paymentRows.map((p) => (
                  <div key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.students?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-line-dim mt-0.5">
                          {new Date(p.payment_date).toLocaleDateString('en-AE')} · {p.packages?.package_name || '—'} · {p.payment_method}
                        </p>
                      </div>
                      <p className="font-mono text-sm shrink-0">AED {Number(p.amount).toFixed(0)}</p>
                    </div>
                    <button
                      onClick={() => openEditPayment(p)}
                      className="mt-2 text-xs border border-court-600 px-2.5 py-1 rounded-md text-line-dim hover:text-line hover:bg-court-800"
                    >
                      Edit
                    </button>
                  </div>
                ))}
                {paymentRows.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-line-dim">No membership payments in this date range.</p>
                )}
              </div>
            </div>

            {/* Badminton attendance */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-wide">BADMINTON ATTENDANCE</h2>
              {attendanceRows.length > 0 && (
                <button onClick={exportAttendanceCsv} className="border border-court-600 px-3 py-1.5 rounded-md text-xs text-line-dim hover:text-line hover:bg-court-800">Export CSV</button>
              )}
            </div>
            <div className="grid sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Total check-ins</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{attendanceRows.length}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Unique people</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{attendanceSummary.length}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Walk-in revenue</p>
                <p className="font-mono text-3xl mt-1 text-chalk">AED {badmintonCollected.toFixed(0)}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Walk-in pending</p>
                <p className="font-mono text-3xl mt-1 text-danger">AED {badmintonPending.toFixed(0)}</p>
              </div>
            </div>
            <p className="text-xs text-line-dim mb-2">
              Note: members pay at enrollment (see Membership Payments above) — their check-ins here won't show a per-visit amount. Only guest walk-ins carry a payment per visit.
            </p>
            <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden mb-10">
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Visits in range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-court-800">
                    {attendanceSummary.map((s) => (
                      <tr key={`${s.name}-${s.isGuest}`}>
                        <td className="px-5 py-3 font-medium">{s.name}</td>
                        <td className="px-5 py-3 text-line-dim">{s.phone}</td>
                        <td className="px-5 py-3 text-line-dim">{s.isGuest ? 'Guest' : 'Member'}</td>
                        <td className="px-5 py-3 font-mono">{s.visits}</td>
                      </tr>
                    ))}
                    {attendanceSummary.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-line-dim">No check-ins in this date range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden divide-y divide-court-800">
                {attendanceSummary.map((s) => (
                  <div key={`${s.name}-${s.isGuest}`} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-line-dim mt-0.5">{s.phone} · {s.isGuest ? 'Guest' : 'Member'}</p>
                    </div>
                    <p className="font-mono text-sm shrink-0">{s.visits} visits</p>
                  </div>
                ))}
                {attendanceSummary.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-line-dim">No check-ins in this date range.</p>
                )}
              </div>
            </div>

            {/* Billiards rentals */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-wide">BILLIARDS RENTALS</h2>
              {rentalRows.length > 0 && (
                <button onClick={exportRentalsCsv} className="border border-court-600 px-3 py-1.5 rounded-md text-xs text-line-dim hover:text-line hover:bg-court-800">Export CSV</button>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Total rentals</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{rentalRows.length}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Collected</p>
                <p className="font-mono text-3xl mt-1 text-chalk">AED {rentalsRevenue.toFixed(0)}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Pending</p>
                <p className="font-mono text-3xl mt-1 text-danger">AED {rentalsPending.toFixed(0)}</p>
              </div>
            </div>
            <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium">Table</th>
                      <th className="px-5 py-3 font-medium">Duration</th>
                      <th className="px-5 py-3 font-medium">Price</th>
                      <th className="px-5 py-3 font-medium">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-court-800">
                    {rentalRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium">{nameFor(r)}</td>
                        <td className="px-5 py-3 text-line-dim">{phoneFor(r)}</td>
                        <td className="px-5 py-3 text-line-dim">{r.court_number || '—'}</td>
                        <td className="px-5 py-3 font-mono">{r.duration} min</td>
                        <td className="px-5 py-3 font-mono">AED {Number(r.price).toFixed(0)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${r.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'}`}>{r.payment_status}</span>
                        </td>
                      </tr>
                    ))}
                    {rentalRows.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-8 text-center text-line-dim">No rentals in this date range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="sm:hidden divide-y divide-court-800">
                {rentalRows.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{nameFor(r)}</p>
                        <p className="text-xs text-line-dim mt-0.5">
                          {phoneFor(r)} · Table {r.court_number || '—'} · {r.duration} min
                        </p>
                      </div>
                      <p className="font-mono text-sm shrink-0">AED {Number(r.price).toFixed(0)}</p>
                    </div>
                    <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full ${r.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'}`}>{r.payment_status}</span>
                  </div>
                ))}
                {rentalRows.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-line-dim">No rentals in this date range.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editingPayment && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditPayment()
          }}
        >
          <form
            onSubmit={handleSavePaymentEdit}
            className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-sm space-y-4"
          >
            <div>
              <h2 className="font-display text-xl">Edit payment</h2>
              <p className="text-line-dim text-sm mt-1">
                {editingPayment.students?.full_name || 'Unknown'} · {new Date(editingPayment.payment_date).toLocaleDateString('en-AE')}
              </p>
            </div>

            {editError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">{editError}</p>}

            <div>
              <label className="block text-xs text-line-dim mb-1.5">Amount charged (AED)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">Payment method</label>
              <select
                value={editMethod}
                onChange={(e) => setEditMethod(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              >
                <option>Cash</option>
                <option>Card</option>
                <option>Bank Transfer</option>
                <option>Other</option>
              </select>
            </div>

            <p className="text-[11px] text-line-dim">
              This only corrects the payment record — classes remaining/used aren't touched. Fix those from
              the member's profile on the Members page if needed.
            </p>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleDeletePayment}
                disabled={editSaving}
                className="text-xs text-danger hover:text-danger/80 font-medium px-2 py-2 disabled:opacity-60"
              >
                Delete payment
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditPayment}
                  disabled={editSaving}
                  className="border border-court-600 rounded-md px-4 py-2.5 text-sm text-line-dim hover:bg-court-800 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md px-4 py-2.5 text-sm disabled:opacity-60"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
