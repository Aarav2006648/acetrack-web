import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { guestKeyFor, normalizePhone } from '../lib/phone'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadInactiveMembers } from '../lib/inactivity'
import { loadTemplates, fillTemplate } from '../lib/whatsappTemplates'

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
const STATUS_OPTIONS = ['All', 'Active', 'Inactive']

export default function Clients() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [sentKeys, setSentKeys] = useState(() => new Set())
  const [templates] = useState(() => loadTemplates())

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setErrorMsg('')

    try {
      const [students, badmintonGuests, rentalGuests, inactiveMembers] = await Promise.all([
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
        loadInactiveMembers(),
      ])

      // Same "hasn't checked in for a week+" rule the Dashboard uses —
      // shown here instead of the raw enrollment status, which stays
      // "Active" for everyone still enrolled regardless of attendance.
      const inactiveIds = new Set(inactiveMembers.map((m) => m.id))

      const memberRows = students.map((s) => ({
        key: `member-${s.id}`,
        studentId: s.id,
        name: s.full_name,
        phone: s.phone || '—',
        type: 'Member',
        detail: s.packages?.package_name || 'No package',
        status: inactiveIds.has(s.id) ? 'Inactive' : s.status,
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
      // Guests have no status at all, so filtering to Active/Inactive
      // naturally narrows the list to members — no need to also force
      // the Type filter to "Member".
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return `${r.name} ${r.phone}`.toLowerCase().includes(q)
    })
  }, [rows, search, typeFilter, statusFilter])

  // Selection is tracked by key against the full `rows` list (not just
  // `filtered`) so it survives the staff tweaking the search/filters
  // after picking people — e.g. selecting all Active members, then
  // switching the filter to double-check who's selected doesn't lose it.
  const selectableFiltered = useMemo(
    () => filtered.filter((r) => normalizePhone(r.phone)),
    [filtered]
  )
  const allVisibleSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((r) => selectedKeys.has(r.key))

  function toggleSelect(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        selectableFiltered.forEach((r) => next.delete(r.key))
      } else {
        selectableFiltered.forEach((r) => next.add(r.key))
      }
      return next
    })
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedKeys.has(r.key) && normalizePhone(r.phone)),
    [rows, selectedKeys]
  )

  function openBroadcast() {
    setBroadcastMessage('')
    setSentKeys(new Set())
    setBroadcastOpen(true)
  }

  function closeBroadcast() {
    setBroadcastOpen(false)
  }

  function pickBroadcastTemplate(templateId) {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return
    // Keep {name} as-is here — it gets swapped for each person's own
    // name individually when their Send button is clicked below, so
    // one shared message still reads personally for everyone.
    setBroadcastMessage(template.body)
  }

  function sendBroadcastTo(row) {
    const phone = normalizePhone(row.phone)
    if (!phone) return

    const message = fillTemplate(broadcastMessage, { name: row.name })
    const whatsappUrl = message.trim()
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${phone}`

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    setSentKeys((prev) => new Set(prev).add(row.key))
  }

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

  // Opens the full history page in a new tab instead of a small popup —
  // much nicer for someone with a long list of visits/renewals.
  function openHistory(row) {
    let url

    if (row.type === 'Member') {
      url = `/history?type=member&id=${row.studentId}`
    } else {
      const source = row.type === 'Walk-in (Badminton)' ? 'attendance' : 'rentals'
      const phoneParam = row.phone === '—' ? '' : row.phone
      url = `/history?type=guest&source=${source}&key=${encodeURIComponent(row.guestKey)}&name=${encodeURIComponent(row.name)}&phone=${encodeURIComponent(phoneParam)}`
    }

    window.open(url, '_blank', 'noopener,noreferrer')
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

          <div className="flex items-center gap-2">
            <button
              onClick={openBroadcast}
              disabled={selectedRows.length === 0}
              className="bg-net/15 hover:bg-net/25 text-net font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-40"
            >
              Message Selected ({selectedRows.length})
            </button>

            <button
              onClick={exportCsv}
              disabled={loading || filtered.length === 0}
              className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
            >
              Download CSV ({filtered.length})
            </button>
          </div>
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'Any status' : s}</option>
            ))}
          </select>
        </div>

        {errorMsg && <p className="text-sm text-danger mb-4">{errorMsg}</p>}

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                  <th className="px-5 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      title="Select everyone currently visible (with a phone number)"
                      className="accent-chalk"
                    />
                  </th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                  <th className="px-5 py-3 font-medium">Last seen / Since</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-court-800">
                {filtered.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => openHistory(r)}
                    className="cursor-pointer hover:bg-court-800/60"
                  >
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      {normalizePhone(r.phone) && (
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(r.key)}
                          onChange={() => toggleSelect(r.key)}
                          className="accent-chalk"
                        />
                      )}
                    </td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 text-line-dim">{r.phone}</td>
                    <td className="px-5 py-3 text-line-dim">{r.type}</td>
                    <td className="px-5 py-3 text-line-dim">
                      {r.detail}{r.status ? ` · ${r.status}` : ''}
                    </td>
                    <td className="px-5 py-3 text-line-dim">
                      {r.since ? new Date(r.since).toLocaleDateString('en-AE') : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.type === 'Member' && (
                        <a
                          href={`/students?edit=${r.studentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-chalk hover:text-chalk-bright font-medium"
                        >
                          Edit
                        </a>
                      )}
                    </td>
                  </tr>
                ))}

                {loading && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-line-dim text-sm">
                      Loading everyone…
                    </td>
                  </tr>
                )}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-line-dim text-sm">
                      No clients match your search/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Phone: stacked cards instead of a cramped/scrolling table */}
          <div className="sm:hidden divide-y divide-court-800">
            {filtered.map((r) => (
              <div
                key={r.key}
                onClick={() => openHistory(r)}
                className="px-4 py-3 cursor-pointer hover:bg-court-800/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {normalizePhone(r.phone) && (
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(r.key)}
                        onChange={() => toggleSelect(r.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-chalk mt-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-line-dim mt-0.5">
                      {r.phone} · {r.type}{r.status ? ` · ${r.status}` : ''}
                    </p>
                    <p className="text-xs text-line-dim mt-0.5">{r.detail}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-line-dim">
                      {r.since ? new Date(r.since).toLocaleDateString('en-AE') : '—'}
                    </p>
                    {r.type === 'Member' && (
                      <a
                        href={`/students?edit=${r.studentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-chalk hover:text-chalk-bright font-medium mt-1 inline-block"
                      >
                        Edit
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <p className="px-4 py-8 text-center text-line-dim text-sm">Loading everyone…</p>
            )}

            {!loading && filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-line-dim text-sm">No clients match your search/filter.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-line-dim mt-3">
          Walk-in guests are grouped by phone number across all their visits (or by name if no phone was recorded).
          Click any row to open their full history in a new tab. Tick the checkbox next to anyone with a phone
          number on file to add them to a broadcast message.
        </p>
      </div>

      {/* BROADCAST — one message, sent one WhatsApp chat at a time */}
      {broadcastOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <div className="bg-court-900 border border-court-700 rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h3 className="font-display text-lg tracking-wide mb-1">MESSAGE {selectedRows.length} PEOPLE</h3>
            <p className="text-xs text-line-dim mb-4">
              WhatsApp doesn't let one message go to many numbers at once — so write it once here, then click
              "Send" next to each person below to open their chat with it already typed in. Just tap through
              the list.
            </p>

            {templates.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-line-dim mb-1.5">Start from a template:</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickBroadcastTemplate(t.id)}
                      className="text-xs bg-court-800 hover:bg-court-700 border border-court-600 px-3 py-1.5 rounded-md font-medium transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Pick a template above, or type your own message here…"
              rows={5}
              className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
            />
            <p className="text-xs text-line-dim mt-1.5 mb-4">
              Use <code className="text-line">{'{name}'}</code> and each person's own name will be swapped in
              automatically when you send theirs.
            </p>

            <div className="border-t border-court-700 pt-3">
              <p className="text-xs text-line-dim mb-2">
                {sentKeys.size} of {selectedRows.length} sent
              </p>
              <div className="space-y-1.5">
                {selectedRows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3 bg-court-800 rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${sentKeys.has(r.key) ? 'text-line-dim line-through' : ''}`}>
                        {r.name}
                      </p>
                      <p className="text-xs text-line-dim">{r.phone}</p>
                    </div>
                    <button
                      onClick={() => sendBroadcastTo(r)}
                      className="text-xs bg-net/15 hover:bg-net/25 text-net px-3 py-1.5 rounded-md font-medium transition-colors shrink-0"
                    >
                      {sentKeys.has(r.key) ? 'Send again' : 'Send'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end mt-4">
              <button
                onClick={closeBroadcast}
                className="text-line-dim hover:text-line font-medium text-sm px-3 py-2"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
