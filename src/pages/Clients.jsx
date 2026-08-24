import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

const PAGE_SIZE = 1000

// Supabase caps a single query at 1000 rows by default. This pages through
// with .range() so directories with 500+ (or many thousands of) people are
// still fetched in full, not silently truncated.
async function fetchAllRows(queryFn) {
  let rows = []
  let from = 0

  while (true) {
    const { data, error } = await queryFn(from, from + PAGE_SIZE - 1)
    if (error) throw error

    rows = rows.concat(data || [])

    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

// Guest visits (badminton walk-ins, billiards rentals) are logged per-visit,
// not as a single client record — so multiple visits from the same person
// need to be collapsed into one row, keyed by phone (falling back to name
// if no phone was given).
function dedupeGuestVisits(visits, typeLabel, dateField) {
  const map = new Map()

  for (const v of visits) {
    const phone = (v.guest_phone || '').trim()
    const name = (v.guest_name || 'Unknown guest').trim()
    const key = phone ? `phone:${phone}` : `name:${name.toLowerCase()}`

    if (!map.has(key)) {
      map.set(key, { name, phone: phone || '—', visits: 0, lastDate: v[dateField] })
    }

    const entry = map.get(key)
    entry.visits += 1
    if (v[dateField] && (!entry.lastDate || v[dateField] > entry.lastDate)) {
      entry.lastDate = v[dateField]
    }
  }

  return Array.from(map.entries()).map(([key, v]) => ({
    key: `${typeLabel}-${key}`,
    name: v.name,
    phone: v.phone,
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
            .select('guest_name, guest_phone, attendance_date')
            .is('student_id', null)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from('rentals')
            .select('guest_name, guest_phone, booking_date')
            .is('student_id', null)
            .range(from, to)
        ),
      ])

      const memberRows = students.map((s) => ({
        key: `member-${s.id}`,
        name: s.full_name,
        phone: s.phone || '—',
        type: 'Member',
        detail: s.packages?.package_name || 'No package',
        status: s.status,
        since: s.join_date,
      }))

      const badmintonRows = dedupeGuestVisits(badmintonGuests, 'Walk-in (Badminton)', 'attendance_date')
      const rentalRows = dedupeGuestVisits(rentalGuests, 'Walk-in (Billiards)', 'booking_date')

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

  return (
    <Layout>
      <div className="p-8 max-w-6xl">
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
                <tr key={r.key}>
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
        </p>
      </div>
    </Layout>
  )
}
