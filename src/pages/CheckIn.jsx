import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

const SCANNER_ID = 'qr-reader'
const ACTIVITY = 'Badminton'
const todayStr = () => new Date().toISOString().slice(0, 10)
const nowTimeStr = () => new Date().toTimeString().slice(0, 5)

function formatDateNice(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-AE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CheckIn() {
  const [mode, setMode] = useState('scan')
  const [status, setStatus] = useState(null)
  const [scanning, setScanning] = useState(false)
  const isRunningRef = useRef(false)
  const busyRef = useRef(false)

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestAmount, setGuestAmount] = useState('')
  const [guestPaymentStatus, setGuestPaymentStatus] = useState('Paid')
  const [guestSaving, setGuestSaving] = useState(false)

  // ---- manual / backdated check-in state ----
  const [manualQuery, setManualQuery] = useState('')
  const [manualResults, setManualResults] = useState([])
  const [manualSearching, setManualSearching] = useState(false)
  const [manualSelected, setManualSelected] = useState(null)
  const [manualDate, setManualDate] = useState(todayStr())
  const [manualTime, setManualTime] = useState(nowTimeStr())
  const [manualSaving, setManualSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'scan') return
    let cancelled = false
    const scanner = new Html5Qrcode(SCANNER_ID)

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return
        if (!devices || devices.length === 0) {
          setStatus({ type: 'error', message: 'No camera found on this device.' })
          return
        }
        const backCam = devices.find((d) => /back|rear|environment/i.test(d.label))
        const cameraId = backCam ? backCam.id : devices[0].id

        return scanner
          .start(cameraId, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, () => {})
          .then(() => {
            if (cancelled) {
              scanner.stop().catch(() => {})
              return
            }
            isRunningRef.current = true
            setScanning(true)
          })
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus({ type: 'error', message: `Could not access camera. Check browser permissions. (${err})` })
        }
      })

    return () => {
      cancelled = true
      if (isRunningRef.current) {
        scanner.stop().catch(() => {}).finally(() => { isRunningRef.current = false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  async function onScanSuccess(decodedText) {
    if (busyRef.current) return
    busyRef.current = true

    const code = decodedText.trim()

    const { data: member, error: findError } = await supabase
      .from('students')
      .select('*, packages(package_name, is_unlimited)')
      .eq('student_code', code)
      .maybeSingle()

    if (findError || !member) {
      setStatus({ type: 'error', message: `QR not recognized: ${code}` })
      setTimeout(() => (busyRef.current = false), 1500)
      return
    }

    if (member.status !== 'Active') {
      setStatus({ type: 'error', message: `${member.full_name}'s membership is inactive`, member })
      setTimeout(() => (busyRef.current = false), 1500)
      return
    }

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', member.id)
      .eq('activity', ACTIVITY)
      .eq('attendance_date', todayStr())
      .maybeSingle()

    if (existing) {
      setStatus({ type: 'error', message: `${member.full_name} is already checked in for ${ACTIVITY} today`, member })
      setTimeout(() => (busyRef.current = false), 2000)
      return
    }

    const { error: insertError } = await supabase.from('attendance').insert({ student_id: member.id, activity: ACTIVITY })

    if (insertError) {
      setStatus({ type: 'error', message: insertError.message })
      setTimeout(() => (busyRef.current = false), 1500)
      return
    }

    if (member.packages && !member.packages.is_unlimited) {
      await supabase.from('students').update({
        remaining_classes: Math.max(0, member.remaining_classes - 1),
        classes_used: member.classes_used + 1,
      }).eq('id', member.id)
    }

    setStatus({ type: 'success', message: `Checked in for ${ACTIVITY}`, member })
    setTimeout(() => (busyRef.current = false), 1500)
  }

  async function handleGuestCheckIn(e) {
    e.preventDefault()
    setGuestSaving(true)
    setStatus(null)

    const { error } = await supabase.from('attendance').insert({
      student_id: null,
      guest_name: guestName,
      guest_phone: guestPhone || null,
      activity: ACTIVITY,
      amount: guestAmount !== '' ? Number(guestAmount) : null,
      payment_status: guestPaymentStatus,
    })

    setGuestSaving(false)

    if (error) {
      setStatus({ type: 'error', message: error.message })
      return
    }

    setStatus({ type: 'success', message: `Checked in for ${ACTIVITY}`, member: { full_name: `${guestName} (guest)` } })
    setGuestName('')
    setGuestPhone('')
    setGuestAmount('')
    setGuestPaymentStatus('Paid')
  }

  // ---- manual / backdated check-in handlers ----

  async function handleManualSearch(e) {
    e.preventDefault()
    const term = manualQuery.trim()
    if (!term) return

    setManualSearching(true)
    setManualSelected(null)

    const escaped = term.replace(/[%,]/g, '')

    const { data, error } = await supabase
      .from('students')
      .select('*, packages(package_name, is_unlimited)')
      .or(`full_name.ilike.%${escaped}%,student_code.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      .order('full_name')
      .limit(8)

    setManualSearching(false)

    if (error) {
      setStatus({ type: 'error', message: error.message })
      return
    }

    setManualResults(data || [])
  }

  function selectManualStudent(student) {
    setManualSelected(student)
    setManualResults([])
    setManualQuery('')
    setStatus(null)
  }

  async function handleManualCheckIn(e) {
    e.preventDefault()
    if (!manualSelected) return

    setManualSaving(true)
    setStatus(null)

    const member = manualSelected

    if (member.status !== 'Active') {
      setManualSaving(false)
      setStatus({ type: 'error', message: `${member.full_name}'s membership is inactive`, member })
      return
    }

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', member.id)
      .eq('activity', ACTIVITY)
      .eq('attendance_date', manualDate)
      .maybeSingle()

    if (existing) {
      setManualSaving(false)
      setStatus({
        type: 'error',
        message: `${member.full_name} is already checked in for ${ACTIVITY} on ${formatDateNice(manualDate)}`,
        member,
      })
      return
    }

    const checkInTimestamp = new Date(`${manualDate}T${manualTime}:00`).toISOString()

    const { error: insertError } = await supabase.from('attendance').insert({
      student_id: member.id,
      activity: ACTIVITY,
      attendance_date: manualDate,
      check_in_time: checkInTimestamp,
      // Internal note only — never shown to parents, who just see the
      // date/activity like any other session. Lets staff tell later that
      // this one was added by hand instead of scanned live.
      checked_in_by: 'Manually added (forgot to scan)',
    })

    if (insertError) {
      setManualSaving(false)
      setStatus({ type: 'error', message: insertError.message })
      return
    }

    if (member.packages && !member.packages.is_unlimited) {
      await supabase.from('students').update({
        remaining_classes: Math.max(0, member.remaining_classes - 1),
        classes_used: member.classes_used + 1,
      }).eq('id', member.id)
    }

    setManualSaving(false)
    setStatus({
      type: 'success',
      message: `Manually checked in for ${ACTIVITY} on ${formatDateNice(manualDate)}`,
      member,
    })
    setManualSelected(null)
    setManualDate(todayStr())
    setManualTime(nowTimeStr())
  }

  return (
    <Layout>
      <div className="p-8 max-w-xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl">CHECK-IN</h1>
          <p className="text-line-dim text-sm mt-1">Scan a member's QR, or log a walk-in guest — Badminton</p>
        </header>

        <div className="flex justify-center gap-2 mb-6 flex-wrap">
          <button onClick={() => { setMode('scan'); setStatus(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === 'scan' ? 'bg-court-700 text-line' : 'text-line-dim hover:text-line'}`}>
            Member (scan QR)
          </button>
          <button onClick={() => { setMode('guest'); setStatus(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === 'guest' ? 'bg-court-700 text-line' : 'text-line-dim hover:text-line'}`}>
            Walk-in guest
          </button>
          <button onClick={() => { setMode('manual'); setStatus(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === 'manual' ? 'bg-court-700 text-line' : 'text-line-dim hover:text-line'}`}>
            Manual entry (forgot to scan)
          </button>
        </div>

        {mode === 'scan' && (
          <div className="bg-court-900 border border-court-700 rounded-xl p-4 overflow-hidden">
            <div id={SCANNER_ID} className="rounded-lg overflow-hidden" />
            {!scanning && !status && <p className="text-center text-line-dim text-sm mt-3">Starting camera…</p>}
          </div>
        )}

        {mode === 'guest' && (
          <form onSubmit={handleGuestCheckIn} className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Name</label>
              <input required value={guestName} onChange={(e) => setGuestName(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Phone (optional)</label>
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-line-dim mb-1.5">Amount charged (AED)</label>
                <input type="number" step="0.01" min="0" value={guestAmount} onChange={(e) => setGuestAmount(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
              </div>
              <div>
                <label className="block text-xs text-line-dim mb-1.5">Payment</label>
                <select value={guestPaymentStatus} onChange={(e) => setGuestPaymentStatus(e.target.value)}
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk">
                  <option>Paid</option><option>Pending</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-line-dim">This won't create a member profile or QR code — just a one-off attendance + payment record for {ACTIVITY}.</p>
            <button type="submit" disabled={guestSaving}
              className="w-full bg-chalk hover:bg-chalk-bright text-court-950 font-semibold py-2.5 rounded-md text-sm disabled:opacity-60">
              {guestSaving ? 'Logging…' : 'Log walk-in check-in'}
            </button>
          </form>
        )}

        {mode === 'manual' && (
          <div className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4">
            <p className="text-[11px] text-line-dim">
              Only use this if a member's QR was missed at the time (forgotten, staff missed the scan, etc).
              Set the actual date and time they attended — the record will look exactly like a normal
              scanned check-in to parents, with no sign it was added later.
            </p>

            {!manualSelected && (
              <form onSubmit={handleManualSearch} className="space-y-2">
                <label className="block text-xs text-line-dim mb-1.5">Find member</label>
                <div className="flex gap-2">
                  <input
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Search by name, phone, or code…"
                    className="flex-1 bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                  />
                  <button type="submit" disabled={manualSearching}
                    className="bg-court-700 hover:bg-court-600 text-line px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60">
                    {manualSearching ? '…' : 'Search'}
                  </button>
                </div>
              </form>
            )}

            {!manualSelected && manualResults.length > 0 && (
              <div className="divide-y divide-court-800 border border-court-700 rounded-lg overflow-hidden">
                {manualResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectManualStudent(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-court-800 flex items-center justify-between"
                  >
                    <span className="text-sm">{s.full_name}</span>
                    <span className="text-xs text-line-dim font-mono">{s.student_code}</span>
                  </button>
                ))}
              </div>
            )}

            {!manualSelected && manualResults.length === 0 && manualQuery === '' && (
              <p className="text-xs text-line-dim">Search for the member above to continue.</p>
            )}

            {manualSelected && (
              <form onSubmit={handleManualCheckIn} className="space-y-4">
                <div className="bg-court-800 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{manualSelected.full_name}</p>
                    <p className="text-xs text-line-dim font-mono">{manualSelected.student_code}</p>
                  </div>
                  <button type="button" onClick={() => setManualSelected(null)}
                    className="text-xs text-line-dim hover:text-line underline">
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-line-dim mb-1.5">Actual date attended</label>
                    <input
                      type="date"
                      required
                      max={todayStr()}
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-line-dim mb-1.5">Actual time</label>
                    <input
                      type="time"
                      required
                      value={manualTime}
                      onChange={(e) => setManualTime(e.target.value)}
                      className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                    />
                  </div>
                </div>

                <button type="submit" disabled={manualSaving}
                  className="w-full bg-chalk hover:bg-chalk-bright text-court-950 font-semibold py-2.5 rounded-md text-sm disabled:opacity-60">
                  {manualSaving ? 'Saving…' : 'Add attendance record'}
                </button>
              </form>
            )}
          </div>
        )}

        {status && (
          <div className={`mt-6 rounded-xl p-5 border text-center ${status.type === 'success' ? 'bg-net/10 border-net text-line' : 'bg-danger/10 border-danger text-line'}`}>
            {status.member && <p className="font-display text-2xl mb-1">{status.member.full_name}</p>}
            <p className={status.type === 'success' ? 'text-net' : 'text-danger'}>{status.message}</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
