import { useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

function firstOfMonth() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [attendanceRows, setAttendanceRows] = useState([])
  const [rentalRows, setRentalRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  async function runReport() {
    setLoading(true)

    const [{ data: attendance }, { data: rentals }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, activity, attendance_date, check_in_time, guest_name, amount, payment_status, students(full_name, phone, student_code)')
        .gte('attendance_date', from)
        .lte('attendance_date', to)
        .order('check_in_time', { ascending: false }),
      supabase
        .from('rentals')
        .select('id, court_number, duration, price, payment_status, booking_date, start_time, guest_name, students(full_name, phone)')
        .gte('booking_date', from)
        .lte('booking_date', to)
        .order('start_time', { ascending: false }),
    ])

    setAttendanceRows(attendance || [])
    setRentalRows(rentals || [])
    setLoading(false)
    setRan(true)
  }

  function nameFor(row) {
    return row.students?.full_name || row.guest_name || 'Unknown'
  }

  function exportAttendanceCsv() {
    const csvRows = attendanceRows.map((r) => ({
      Date: r.attendance_date,
      Time: new Date(r.check_in_time).toLocaleTimeString('en-AE'),
      Name: nameFor(r),
      Type: r.students ? 'Member' : 'Guest',
      Activity: r.activity,
      'Amount (AED)': r.amount ?? '',
      Payment: r.students ? '' : r.payment_status || '',
    }))
    downloadCsv(csvRows, `badminton_attendance_${from}_to_${to}.csv`)
  }

  function exportRentalsCsv() {
    const csvRows = rentalRows.map((r) => ({
      Date: r.booking_date,
      Time: new Date(r.start_time).toLocaleTimeString('en-AE'),
      Name: nameFor(r),
      Type: r.students ? 'Member' : 'Guest',
      Table: r.court_number || '',
      'Duration (min)': r.duration,
      'Price (AED)': r.price,
      Payment: r.payment_status,
    }))
    downloadCsv(csvRows, `billiards_rentals_${from}_to_${to}.csv`)
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

  // per-person visit count summary (badminton)
  const attendanceSummary = Object.values(
    attendanceRows.reduce((acc, r) => {
      const name = nameFor(r)
      const key = `${name}|${r.students ? 'member' : 'guest'}`
      acc[key] = acc[key] || { name, isGuest: !r.students, visits: 0 }
      acc[key].visits += 1
      return acc
    }, {})
  ).sort((a, b) => b.visits - a.visits)

  // guest-only revenue for badminton walk-ins (members pay at enrollment, tracked separately)
  const guestAttendance = attendanceRows.filter((r) => !r.students)
  const badmintonCollected = guestAttendance
    .filter((r) => r.payment_status === 'Paid')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  const badmintonPending = guestAttendance
    .filter((r) => r.payment_status === 'Pending')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)

  const rentalsRevenue = rentalRows
    .filter((r) => r.payment_status === 'Paid')
    .reduce((sum, r) => sum + Number(r.price || 0), 0)
  const rentalsPending = rentalRows
    .filter((r) => r.payment_status === 'Pending')
    .reduce((sum, r) => sum + Number(r.price || 0), 0)

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">REPORTS</h1>
          <p className="text-line-dim text-sm mt-1">Badminton attendance and billiards rentals for a date range</p>
        </header>

        <div className="flex flex-wrap items-end gap-3 mb-8">
          <div>
            <label className="block text-xs text-line-dim mb-1.5">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-line-dim mb-1.5">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={runReport}
            disabled={loading}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
          >
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>

        {ran && (
          <>
            {/* Badminton attendance */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-wide">BADMINTON ATTENDANCE</h2>
              {attendanceRows.length > 0 && (
                <button
                  onClick={exportAttendanceCsv}
                  className="border border-court-600 px-3 py-1.5 rounded-md text-xs text-line-dim hover:text-line hover:bg-court-800"
                >
                  Export CSV
                </button>
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
            <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden mb-10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Visits in range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-court-800">
                  {attendanceSummary.map((s) => (
                    <tr key={`${s.name}-${s.isGuest}`}>
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-5 py-3 text-line-dim">{s.isGuest ? 'Guest' : 'Member'}</td>
                      <td className="px-5 py-3 font-mono">{s.visits}</td>
                    </tr>
                  ))}
                  {attendanceSummary.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-8 text-center text-line-dim">
                        No check-ins in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Billiards rentals */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg tracking-wide">BILLIARDS RENTALS</h2>
              {rentalRows.length > 0 && (
                <button
                  onClick={exportRentalsCsv}
                  className="border border-court-600 px-3 py-1.5 rounded-md text-xs text-line-dim hover:text-line hover:bg-court-800"
                >
                  Export CSV
                </button>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                    <th className="px-5 py-3 font-medium">Name</th>
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
                      <td className="px-5 py-3 text-line-dim">{r.court_number || '—'}</td>
                      <td className="px-5 py-3 font-mono">{r.duration} min</td>
                      <td className="px-5 py-3 font-mono">AED {Number(r.price).toFixed(0)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            r.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'
                          }`}
                        >
                          {r.payment_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rentalRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-line-dim">
                        No rentals in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
