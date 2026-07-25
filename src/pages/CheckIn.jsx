import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

const SCANNER_ID = 'qr-reader'
const ACTIVITY = 'Badminton'
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function CheckIn() {
  const [mode, setMode] = useState('scan') // 'scan' | 'guest'
  const [status, setStatus] = useState(null)
  const [scanning, setScanning] = useState(false)
  const isRunningRef = useRef(false)
  const busyRef = useRef(false)

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestAmount, setGuestAmount] = useState('')
  const [guestPaymentStatus, setGuestPaymentStatus] = useState('Paid')
  const [guestSaving, setGuestSaving] = useState(false)

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
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            isRunningRef.current = false
          })
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

    // block a second check-in for the same activity on the same day
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', member.id)
      .eq('activity', ACTIVITY)
      .eq('attendance_date', todayStr())
      .maybeSingle()

    if (existing) {
      setStatus({
        type: 'error',
        message: `${member.full_name} is already checked in for ${ACTIVITY} today`,
        member,
      })
      setTimeout(() => (busyRef.current = false), 2000)
      return
    }

    const { error: insertError } = await supabase.from('attendance').insert({
      student_id: member.id,
      activity: ACTIVITY,
    })

    if (insertError) {
      setStatus({ type: 'error', message: insertError.message })
      setTimeout(() => (busyRef.current = false), 1500)
      return
    }

    if (member.packages && !member.packages.is_unlimited) {
      await supabase
        .from('students')
        .update({
          remaining_classes: Math.max(0, member.remaining_classes - 1),
          classes_used: member.classes_used + 1,
        })
        .eq('id', member.id)
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

    setStatus({
      type: 'success',
      message: `Checked in for ${ACTIVITY}`,
      member: { full_name: `${guestName} (guest)` },
    })
    setGuestName('')
    setGuestPhone('')
    setGuestAmount('')
    setGuestPaymentStatus('Paid')
  }

  return (
    <Layout>
      <div className="p-8 max-w-xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl">CHECK-IN</h1>
          <p className="text-line-dim text-sm mt-1">Scan a member's QR, or log a walk-in guest — Badminton</p>
        </header>

        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={() => { setMode('scan'); setStatus(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              mode === 'scan' ? 'bg-court-700 text-line' : 'text-line-dim hover:text-line'
            }`}
          >
            Member (scan QR)
          </button>
          <button
            onClick={() => { setMode('guest'); setStatus(null) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              mode === 'guest' ? 'bg-court-700 text-line' : 'text-line-dim hover:text-line'
            }`}
          >
            Walk-in guest
          </button>
        </div>

        {mode === 'scan' && (
          <div className="bg-court-900 border border-court-700 rounded-xl p-4 overflow-hidden">
            <div id={SCANNER_ID} className="rounded-lg overflow-hidden" />
            {!scanning && !status && (
              <p className="text-center text-line-dim text-sm mt-3">Starting camera…</p>
            )}
          </div>
        )}

        {mode === 'guest' && (
          <form onSubmit={handleGuestCheckIn} className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Name</label>
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Phone (optional)</label>
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-line-dim mb-1.5">Amount charged (AED)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={guestAmount}
                  onChange={(e) => setGuestAmount(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
              </div>
              <div>
                <label className="block text-xs text-line-dim mb-1.5">Payment</label>
                <select
                  value={guestPaymentStatus}
                  onChange={(e) => setGuestPaymentStatus(e.target.value)}
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                >
                  <option>Paid</option>
                  <option>Pending</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-line-dim">
              This won't create a member profile or QR code — just a one-off attendance + payment record for {ACTIVITY}.
            </p>
            <button
              type="submit"
              disabled={guestSaving}
              className="w-full bg-chalk hover:bg-chalk-bright text-court-950 font-semibold py-2.5 rounded-md text-sm disabled:opacity-60"
            >
              {guestSaving ? 'Logging…' : 'Log walk-in check-in'}
            </button>
          </form>
        )}

        {status && (
          <div
            className={`mt-6 rounded-xl p-5 border text-center ${
              status.type === 'success'
                ? 'bg-net/10 border-net text-line'
                : 'bg-danger/10 border-danger text-line'
            }`}
          >
            {status.member && <p className="font-display text-2xl mb-1">{status.member.full_name}</p>}
            <p className={status.type === 'success' ? 'text-net' : 'text-danger'}>{status.message}</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
