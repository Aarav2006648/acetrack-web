import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { normalizePhone } from '../lib/phone'
import { groupVisitsByMonth } from '../lib/monthGroups'
import { fetchAllRows } from '../lib/fetchAllRows'

// A guest's key for grouping repeat visits into one row: their normalized
// phone number when they gave one (so "0501234567" and "501234567" merge
// into the same person), falling back to their name if no phone was given.
function guestKeyFor(guestPhone, guestName) {
  const normalized = normalizePhone(guestPhone)
  if (normalized) return `phone:${normalized}`
  return `name:${(guestName || 'Unknown guest').trim().toLowerCase()}`
}

// Guest visits (badminton walk-ins, billiards rentals) are logged per-visit,
// not as a single client record — so multiple visits from the same person
// need to be collapsed into one row, keyed by phone (falling back to name
// if no phone was given) — this is what turns "came 3 times" into one row
// with a visit count instead of 3 duplicate rows.
function dedupeGuestVisits(visits, typeLabel, dateField) {
  const map = new Map()

  for (const v of visits) {
    const name = (v.guest_name || 'Unknown guest').trim()
    const key = guestKeyFor(v.guest_phone, name)

    if (!map.has(key)) {
      map.set(key, { name, phone: v.guest_phone || '', visits: 0, lastDate: v[dateField] })
    }

    const entry = map.get(key)
    entry.visits += 1
    if (v[dateField] && (!entry.lastDate || v[dateField] > entry.lastDate)) {
      entry.lastDate = v[dateField]
    }
  }

  return Array.from(map.entries()).map(([key, v]) => ({
    key: `${typeLabel}-${key}`,
    guestKey: key,
    name: v.name,
    phone: v.phone || '—',
    type: typeLabel,
    detail: `${v.visits} visit${v.visits === 1 ? '' : 's'}`,
    status: '',
    since: v.lastDate,
  }))
}

const TYPE_OPTIONS = ['All', 'Member', 'Walk-in (Badminton)', 'Walk-in (Billiards)']

export default function Clients() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')

  // Raw per-visit rows kept around (not just the deduped summary) so a
  // click on a walk-in can show every date/time they came, without an
  // extra round trip to the database.
  const [badmintonGuestVisits, setBadmintonGuestVisits] = useState([])
  const [rentalGuestVisits, setRentalGuestVisits] = useState([])

  const [historyFor, setHistoryFor] = useState(null)
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(null)

  const historyMonths = useMemo(() => groupVisitsByMonth(historyRows, 'date'), [historyRows])
  const visibleHistoryRows = selectedMonth
    ? historyMonths.find((m) => m.key === selectedMonth)?.items || []
    : historyRows

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setErrorMsg('')

    try {
      const [students, badmintonGuests, rentalGuests] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('students')
            .select('id, full_name, phone, email, student_code, status, join_date, packages(package_name)')
            .order('full_name')
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('attendance')
            .select('guest_name, guest_phone, attendance_date, check_in_time, court_number')
            .is('student_id', null)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('rentals')
            .select('guest_name, guest_phone, booking_date, start_time, court_number')
            .is('student_id', null)
            .range(from, to)
        ),
      ])

      const memberRows = students.map((s) => ({
        key: `member-${s.id}`,
        studentId: s.id,
        name: s.full_name,
        phone: s.phone || '—',
        type: 'Member',
        detail: s.packages?.package_name || 'No package',
        status: s.status,
        since: s.join_date,
      }))

      const badmintonRows = dedupeGuestVisits(badmintonGuests, 'Walk-in (Badminton)', 'attendance_date')
      const rentalRows = dedupeGuestVisits(rentalGuests, 'Walk-in (Billiards)', 'booking_date')

      setBadmintonGuestVisits(badmintonGuests)
      setRentalGuestVisits(rentalGuests)
      setRows([...memberRows, ...badmintonRows, ...rentalRows])
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load clients.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== 'All' && r.type !== typeFilter) return false
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return `${r.name} ${r.phone}`.toLowerCase().includes(q)
    })
  }, [rows, search, typeFilter])

  function exportCsv() {
    const csvRows = filtered.map((r) => ({
      Name: r.name,
      Phone: r.phone,
      Type: r.type,
      Detail: r.detail,
      Status: r.status || '',
      'Last seen / Member since': r.since ? new Date(r.since).toLocaleDateString('en-AE') : '',
    }))

    const csv = Papa.unparse(csvRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `all_clients_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function openHistory(row) {
    setHistoryFor(row)
    setHistoryError('')
    setHistoryRows([])
    setSelectedMonth(null)

    if (row.type === 'Member') {
      setHistoryLoading(true)

      const [{ data: attRows, error: attErr }, { data: rentRows, error: rentErr }] = await Promise.all([
        supabase
          .from('attendance')
          .select('id, activity, attendance_date, check_in_time, court_number')
          .eq('student_id', row.studentId)
          .order('check_in_time', { ascending: false }),
        supabase
          .from('rentals')
          .select('id, activity, booking_date, start_time, court_number')
          .eq('student_id', row.studentId)
          .order('start_time', { ascending: false }),
      ])

      setHistoryLoading(false)

      if (attErr || rentErr) {
        setHistoryError((attErr || rentErr).message)
        return
      }

      const combined = [
        ...(attRows || []).map((r) => ({ key: `a-${r.id}`, activity: r.activity, date: r.attendance_date, time: r.check_in_time, court: r.court_number })),
        ...(rentRows || []).map((r) => ({ key: `r-${r.id}`, activity: r.activity, date: r.booking_date, time: r.start_time, court: r.court_number })),
      ].sort((a, b) => new Date(b.time) - new Date(a.time))

      setHistoryRows(combined)
      return
    }

    // Walk-in guest — we already fetched every visit up front, just filter
    // down to whichever ones match this person's grouping key.
    const source = row.type === 'Walk-in (Badminton)' ? badmintonGuestVisits : rentalGuestVisits
    const dateField = row.type === 'Walk-in (Badminton)' ? 'attendance_date' : 'booking_date'
    const timeField = row.type === 'Walk-in (Badminton)' ? 'check_in_time' : 'start_time'
    const activityLabel = row.type === 'Walk-in (Badminton)' ? 'Badminton' : 'Billiards'

    const matches = source
      .filter((v) => guestKeyFor(v.guest_phone, v.guest_name) === row.guestKey)
      .map((v, i) => ({
        key: `${row.guestKey}-${i}`,
        activity: activityLabel,
        date: v[dateField],
        time: v[timeField],
        court: v.court_number,
      }))
      .sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))

    setHistoryRows(matches)
  }

  function closeHistory() {
    setHistoryFor(null)
    setHistoryRows([])
    setHistoryError('')
    setSelectedMonth(null)
  }

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-6xl">
        <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl">ALL CLIENTS</h1>
            <p className="text-line-dim text-sm mt-1">
              {loading
                ? 'Loading…'
                : `${filtered.length} of ${rows.length} total — members and walk-in guests`}
            </p>
          </div>

          <button
            onClick={exportCsv}
            disabled={loading || filtered.length === 0}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
          >
            Download CSV ({filtered.length})
          </button>
        </header>

        <div className="flex flex-wrap gap-3 mb-5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="flex-1 min-w-[220px] bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Detail</th>
                <th className="px-5 py-3 font-medium">Last seen / Since</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-court-800">
              {filtered.map((r) => (
                <tr
                  key={r.key}
                  onClick={() => openHistory(r)}
                  className="cursor-pointer hover:bg-court-800/60"
                >
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-line-dim">{r.phone}</td>
                  <td className="px-5 py-3 text-line-dim">{r.type}</td>
                  <td className="px-5 py-3 text-line-dim">
                    {r.detail}{r.status ? ` · ${r.status}` : ''}
                  </td>
                  <td className="px-5 py-3 text-line-dim">
                    {r.since ? new Date(r.since).toLocaleDateString('en-AE') : '—'}
                  </td>
                </tr>
              ))}

              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-line-dim text-sm">
                    Loading everyone…
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-line-dim text-sm">
                    No clients match your search/filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-line-dim mt-3">
          Walk-in guests are grouped by phone number across all their visits (or by name if no phone was recorded).
          Click any row to see exactly which days and times they came.
        </p>
      </div>

      {historyFor && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return
            closeHistory()
          }}
        >
          <div className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-sm space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-xl">{historyFor.name}</h2>
                <p className="text-xs text-line-dim">{historyFor.type}{historyFor.phone !== '—' ? ` · ${historyFor.phone}` : ''}</p>
              </div>
              <button
                onClick={closeHistory}
                className="text-line-dim hover:text-line text-xl leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {historyError && <p className="text-sm text-danger">{historyError}</p>}
            {historyLoading && <p className="text-sm text-line-dim">Loading…</p>}

            {!historyLoading && historyRows.length === 0 && !historyError && (
              <p className="text-sm text-line-dim">No visits on record.</p>
            )}

            {!historyLoading && historyRows.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedMonth(null)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      selectedMonth === null ? 'bg-chalk text-court-950' : 'bg-court-800 text-line-dim hover:text-line'
                    }`}
                  >
                    All ({historyRows.length})
                  </button>
                  {historyMonths.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setSelectedMonth(m.key)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        selectedMonth === m.key ? 'bg-chalk text-court-950' : 'bg-court-800 text-line-dim hover:text-line'
                      }`}
                    >
                      {m.label} ({m.items.length})
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-court-800 border border-court-700 rounded-lg overflow-hidden">
                  {visibleHistoryRows.map((row) => (
                    <div key={row.key} className="px-3 py-2.5">
                      <p className="text-sm">
                        {new Date(`${row.date}T00:00:00`).toLocaleDateString('en-AE', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-line-dim">
                        {row.activity}
                        {row.court ? ` · Court ${row.court}` : ''}
                        {row.time ? ` · ${new Date(row.time).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
