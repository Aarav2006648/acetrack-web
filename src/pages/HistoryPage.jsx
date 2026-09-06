import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { guestKeyFor } from '../lib/phone'
import { groupVisitsByMonth } from '../lib/monthGroups'
import { fetchAllRows } from '../lib/fetchAllRows'

const ACTIVITY = 'Badminton'

let rowIdCounter = 0
function makeRow() {
  rowIdCounter += 1
  return { id: rowIdCounter, date: '', time: '' }
}

function MonthChips({ months, total, selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          selected === null ? 'bg-chalk text-court-950' : 'bg-court-800 text-line-dim hover:text-line'
        }`}
      >
        All ({total})
      </button>
      {months.map((m) => (
        <button
          type="button"
          key={m.key}
          onClick={() => onSelect(m.key)}
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            selected === m.key ? 'bg-chalk text-court-950' : 'bg-court-800 text-line-dim hover:text-line'
          }`}
        >
          {m.label} ({m.items.length})
        </button>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [params] = useSearchParams()
  const type = params.get('type')

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <Link to="/students" className="text-xs text-line-dim hover:text-line">&larr; Back to Members</Link>
        {type === 'guest' ? <GuestHistory params={params} /> : <MemberHistory studentId={params.get('id')} />}
      </div>
    </Layout>
  )
}

/* =========================================================
   MEMBER — attendance + package/renewal history
   ========================================================= */

function MemberHistory({ studentId }) {
  const [student, setStudent] = useState(null)
  const [loadingStudent, setLoadingStudent] = useState(true)

  const [packageHistory, setPackageHistory] = useState([])
  const [packageLoading, setPackageLoading] = useState(true)
  const [packageError, setPackageError] = useState('')

  const [attendanceRows, setAttendanceRows] = useState([])
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [attendanceError, setAttendanceError] = useState('')
  const [attSelectedMonth, setAttSelectedMonth] = useState(null)

  const [attEditingId, setAttEditingId] = useState(null)
  const [attEditDate, setAttEditDate] = useState('')
  const [attEditTime, setAttEditTime] = useState('')
  const [attSaving, setAttSaving] = useState(false)
  const [attDeletingId, setAttDeletingId] = useState(null)

  const [quickAddRows, setQuickAddRows] = useState([])
  const [quickAddSaving, setQuickAddSaving] = useState(false)

  const attendanceMonths = useMemo(
    () => groupVisitsByMonth(attendanceRows, 'attendance_date'),
    [attendanceRows]
  )
  const visibleAttendanceRows = attSelectedMonth
    ? attendanceMonths.find((m) => m.key === attSelectedMonth)?.items || []
    : attendanceRows

  useEffect(() => {
    if (!studentId) return
    loadStudent()
    loadPackageHistory()
    loadAttendance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  async function loadStudent() {
    setLoadingStudent(true)
    const { data } = await supabase
      .from('students')
      .select('*, packages(package_name, is_unlimited)')
      .eq('id', studentId)
      .maybeSingle()
    setStudent(data)
    setLoadingStudent(false)
  }

  async function loadPackageHistory() {
    setPackageLoading(true)
    setPackageError('')
    const { data, error } = await supabase
      .from('package_history')
      .select('id, start_date, end_date, classes_used, remaining_classes, renewed_on, packages(package_name, total_classes)')
      .eq('student_id', studentId)
      .order('renewed_on', { ascending: false })
    setPackageLoading(false)
    if (error) {
      setPackageError(error.message)
      return
    }
    setPackageHistory(data || [])
  }

  async function loadAttendance() {
    setAttendanceLoading(true)
    setAttendanceError('')
    const { data, error } = await supabase
      .from('attendance')
      .select('id, activity, attendance_date, check_in_time, court_number, checked_in_by')
      .eq('student_id', studentId)
      .order('attendance_date', { ascending: false })
      .order('check_in_time', { ascending: false })
    setAttendanceLoading(false)
    if (error) {
      setAttendanceError(error.message)
      return
    }
    setAttendanceRows(data || [])
  }

  function startEditAttendance(row) {
    setAttEditingId(row.id)
    setAttEditDate(row.attendance_date)
    setAttEditTime(new Date(row.check_in_time).toTimeString().slice(0, 5))
  }

  function cancelEditAttendance() {
    setAttEditingId(null)
    setAttEditDate('')
    setAttEditTime('')
  }

  async function saveEditAttendance(rowId) {
    if (!attEditDate || !attEditTime) return
    setAttSaving(true)
    setAttendanceError('')
    const checkInTimestamp = new Date(`${attEditDate}T${attEditTime}:00`).toISOString()
    const { error } = await supabase
      .from('attendance')
      .update({ attendance_date: attEditDate, check_in_time: checkInTimestamp })
      .eq('id', rowId)
    setAttSaving(false)
    if (error) {
      setAttendanceError(error.message)
      return
    }
    setAttEditingId(null)
    await loadAttendance()
  }

  async function deleteAttendance(row) {
    if (attDeletingId) return

    const confirmed = window.confirm(
      `Remove this ${row.activity} check-in from ${new Date(row.attendance_date).toLocaleDateString('en-AE')}?\n\n` +
        'Use this only if it was added by mistake. This cannot be undone.'
    )
    if (!confirmed) return

    setAttDeletingId(row.id)
    setAttendanceError('')

    const { error } = await supabase.from('attendance').delete().eq('id', row.id)

    if (error) {
      setAttDeletingId(null)
      setAttendanceError(error.message)
      return
    }

    // Give the class back, since this visit no longer counts.
    if (student?.packages && !student.packages.is_unlimited) {
      const restoredRemaining = (student.remaining_classes ?? 0) + 1
      const restoredUsed = Math.max(0, (student.classes_used ?? 0) - 1)

      await supabase.from('students').update({
        remaining_classes: restoredRemaining,
        classes_used: restoredUsed,
      }).eq('id', studentId)

      setStudent((prev) => prev && { ...prev, remaining_classes: restoredRemaining, classes_used: restoredUsed })
    }

    setAttDeletingId(null)
    await loadAttendance()
  }

  function addQuickAddRow() {
    setQuickAddRows([...quickAddRows, makeRow()])
  }
  function updateQuickAddRow(id, field, value) {
    setQuickAddRows(quickAddRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeQuickAddRow(id) {
    setQuickAddRows(quickAddRows.filter((r) => r.id !== id))
  }

  async function saveQuickAddClasses() {
    const validRows = quickAddRows.filter((r) => r.date)
    if (validRows.length === 0 || quickAddSaving) return

    setQuickAddSaving(true)
    setAttendanceError('')

    const attendanceInserts = validRows.map((r) => ({
      student_id: studentId,
      activity: ACTIVITY,
      attendance_date: r.date,
      check_in_time: new Date(`${r.date}T${r.time || '12:00'}:00`).toISOString(),
      checked_in_by: 'Backfilled (added after enrollment)',
    }))

    const { error } = await supabase.from('attendance').insert(attendanceInserts)

    if (error) {
      setQuickAddSaving(false)
      setAttendanceError(error.message)
      return
    }

    if (student?.packages && !student.packages.is_unlimited) {
      const newRemaining = Math.max(0, (student.remaining_classes ?? 0) - validRows.length)
      const newUsed = (student.classes_used ?? 0) + validRows.length

      const { error: updateError } = await supabase
        .from('students')
        .update({ remaining_classes: newRemaining, classes_used: newUsed })
        .eq('id', studentId)

      if (updateError) {
        setQuickAddSaving(false)
        setAttendanceError(`Classes were logged, but the remaining count couldn't be updated: ${updateError.message}`)
        setQuickAddRows([])
        await loadAttendance()
        return
      }

      setStudent((prev) => prev && { ...prev, remaining_classes: newRemaining, classes_used: newUsed })
    }

    setQuickAddSaving(false)
    setQuickAddRows([])
    await loadAttendance()
  }

  if (!studentId) return <p className="text-sm text-danger mt-6">No member specified.</p>
  if (loadingStudent) return <p className="text-sm text-line-dim mt-6">Loading…</p>
  if (!student) return <p className="text-sm text-danger mt-6">Member not found.</p>

  return (
    <>
      <header className="mt-4 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">{student.full_name}</h1>
            <p className="text-line-dim text-sm mt-1 font-mono">{student.student_code} · {student.status}</p>
          </div>
          <a
            href={`/students?edit=${student.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs bg-court-800 hover:bg-court-700 px-3 py-1.5 rounded-md font-medium transition-colors"
          >
            Edit member details
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-sm">
          <div className="bg-court-900 border border-court-700 rounded-lg p-3">
            <p className="text-xs text-line-dim uppercase">Classes done</p>
            <p className="font-mono text-xl mt-1">{student.classes_used ?? 0}</p>
          </div>
          <div className="bg-court-900 border border-court-700 rounded-lg p-3">
            <p className="text-xs text-line-dim uppercase">Remaining</p>
            <p className="font-mono text-xl mt-1">
              {student.packages?.is_unlimited ? 'Unlimited' : student.remaining_classes ?? 0}
            </p>
          </div>
        </div>
      </header>

      {/* PACKAGE / RENEWAL HISTORY */}
      <section className="mb-8">
        <h2 className="font-display text-lg tracking-wide mb-3">PACKAGE &amp; RENEWAL HISTORY</h2>
        {packageError && <p className="text-sm text-danger mb-2">{packageError}</p>}
        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          {packageLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
          {!packageLoading && packageHistory.length === 0 && (
            <p className="px-5 py-6 text-sm text-line-dim">No package history on record yet.</p>
          )}
          <div className="divide-y divide-court-800">
            {packageHistory.map((row) => (
              <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{row.packages?.package_name || 'Unknown package'}</p>
                  <p className="text-xs text-line-dim">
                    Started {row.start_date ? new Date(`${row.start_date}T00:00:00`).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    {row.packages?.total_classes ? ` · ${row.packages.total_classes} classes` : ''}
                  </p>
                </div>
                <p className="text-xs text-line-dim shrink-0">
                  {new Date(row.renewed_on).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ATTENDANCE HISTORY */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg tracking-wide">ATTENDANCE HISTORY</h2>
        </div>

        <div className="bg-court-800/60 border border-court-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-line-dim mb-2">
            Add classes they already attended (e.g. before being added to the system).
          </p>

          {quickAddRows.length > 0 && (
            <div className="space-y-2 mb-2">
              {quickAddRows.map((row) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={row.date}
                    onChange={(e) => updateQuickAddRow(row.id, 'date', e.target.value)}
                    className="flex-1 bg-court-800 border border-court-600 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-chalk"
                  />
                  <input
                    type="time"
                    value={row.time}
                    onChange={(e) => updateQuickAddRow(row.id, 'time', e.target.value)}
                    className="w-24 bg-court-800 border border-court-600 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-chalk"
                  />
                  <button
                    type="button"
                    onClick={() => removeQuickAddRow(row.id)}
                    className="text-line-dim hover:text-danger text-lg leading-none px-1"
                    aria-label="Remove this class"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={addQuickAddRow} className="text-xs text-chalk hover:text-chalk-bright font-medium">
              + Add a class
            </button>
            {quickAddRows.length > 0 && (
              <button
                type="button"
                onClick={saveQuickAddClasses}
                disabled={quickAddSaving || quickAddRows.filter((r) => r.date).length === 0}
                className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
              >
                {quickAddSaving
                  ? 'Saving…'
                  : `Save ${quickAddRows.filter((r) => r.date).length || ''} class${quickAddRows.filter((r) => r.date).length === 1 ? '' : 'es'}`}
              </button>
            )}
          </div>
        </div>

        {attendanceError && <p className="text-sm text-danger mb-2">{attendanceError}</p>}

        {attendanceLoading && <p className="text-sm text-line-dim">Loading…</p>}

        {!attendanceLoading && attendanceRows.length === 0 && (
          <p className="text-sm text-line-dim">No check-ins recorded yet.</p>
        )}

        {!attendanceLoading && attendanceRows.length > 0 && (
          <>
            <MonthChips
              months={attendanceMonths}
              total={attendanceRows.length}
              selected={attSelectedMonth}
              onSelect={setAttSelectedMonth}
            />

            <div className="bg-court-900 border border-court-700 rounded-xl divide-y divide-court-800 overflow-hidden">
              {visibleAttendanceRows.map((row) => (
                <div key={row.id} className="px-5 py-3">
                  {attEditingId === row.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 max-w-xs">
                        <input
                          type="date"
                          value={attEditDate}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setAttEditDate(e.target.value)}
                          className="w-full bg-court-800 border border-court-600 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-chalk"
                        />
                        <input
                          type="time"
                          value={attEditTime}
                          onChange={(e) => setAttEditTime(e.target.value)}
                          className="w-full bg-court-800 border border-court-600 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-chalk"
                        />
                      </div>
                      <div className="flex gap-2 max-w-xs">
                        <button
                          type="button"
                          onClick={cancelEditAttendance}
                          disabled={attSaving}
                          className="flex-1 border border-court-600 rounded-md py-1.5 text-xs text-line-dim hover:bg-court-800 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditAttendance(row.id)}
                          disabled={attSaving}
                          className="flex-1 bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md py-1.5 text-xs disabled:opacity-60"
                        >
                          {attSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm">
                          {new Date(`${row.attendance_date}T00:00:00`).toLocaleDateString('en-AE', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-line-dim">
                          {row.activity}
                          {row.court_number ? ` · Court ${row.court_number}` : ''}
                          {' · '}{new Date(row.check_in_time).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}
                          {row.checked_in_by ? ` · ${row.checked_in_by}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditAttendance(row)}
                          disabled={attDeletingId === row.id}
                          className="text-xs text-chalk hover:text-chalk-bright font-medium px-2 py-1 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAttendance(row)}
                          disabled={attDeletingId === row.id}
                          className="text-xs text-danger hover:text-danger/80 font-medium px-2 py-1 disabled:opacity-60"
                        >
                          {attDeletingId === row.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}

/* =========================================================
   WALK-IN GUEST — visit history (read-only)
   ========================================================= */

function GuestHistory({ params }) {
  const source = params.get('source') === 'rentals' ? 'rentals' : 'attendance'
  const guestKey = params.get('key') || ''
  const name = params.get('name') || 'Unknown guest'
  const phone = params.get('phone') || ''

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(null)

  const activityLabel = source === 'rentals' ? 'Billiards' : 'Badminton'
  const dateField = source === 'rentals' ? 'booking_date' : 'attendance_date'
  const timeField = source === 'rentals' ? 'start_time' : 'check_in_time'

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, guestKey])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const columns = source === 'rentals'
        ? 'guest_name, guest_phone, booking_date, start_time, court_number'
        : 'guest_name, guest_phone, attendance_date, check_in_time, court_number'

      const all = await fetchAllRows((from, to) =>
        supabase
          .from(source)
          .select(columns)
          .is('student_id', null)
          .range(from, to)
      )

      const matches = all
        .filter((v) => guestKeyFor(v.guest_phone, v.guest_name) === guestKey)
        .map((v, i) => ({
          key: `${guestKey}-${i}`,
          date: v[dateField],
          time: v[timeField],
          court: v.court_number,
        }))
        .sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))

      setRows(matches)
    } catch (err) {
      setError(err.message || 'Could not load history.')
    } finally {
      setLoading(false)
    }
  }

  const months = useMemo(() => groupVisitsByMonth(rows, 'date'), [rows])
  const visibleRows = selectedMonth ? months.find((m) => m.key === selectedMonth)?.items || [] : rows

  return (
    <>
      <header className="mt-4 mb-6">
        <h1 className="font-display text-3xl">{name}</h1>
        <p className="text-line-dim text-sm mt-1">
          Walk-in ({activityLabel}){phone ? ` · ${phone}` : ''}
        </p>
      </header>

      {error && <p className="text-sm text-danger mb-2">{error}</p>}
      {loading && <p className="text-sm text-line-dim">Loading…</p>}

      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-line-dim">No visits on record.</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <MonthChips months={months} total={rows.length} selected={selectedMonth} onSelect={setSelectedMonth} />

          <div className="bg-court-900 border border-court-700 rounded-xl divide-y divide-court-800 overflow-hidden">
            {visibleRows.map((row) => (
              <div key={row.key} className="px-5 py-3">
                <p className="text-sm">
                  {new Date(`${row.date}T00:00:00`).toLocaleDateString('en-AE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-xs text-line-dim">
                  {activityLabel}
                  {row.court ? ` · Court ${row.court}` : ''}
                  {row.time ? ` · ${new Date(row.time).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
