import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

const SCANNER_ID = 'qr-reader'

export default function CheckIn() {
  const [activity, setActivity] = useState('Badminton')
  const [status, setStatus] = useState(null)
  const [scanning, setScanning] = useState(false)
  const isRunningRef = useRef(false)
  const busyRef = useRef(false)

  useEffect(() => {
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
  }, [])

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

    const { error: insertError } = await supabase.from('attendance').insert({
      student_id: member.id,
      activity,
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

    setStatus({ type: 'success', message: `Checked in for ${activity}`, member })
    setTimeout(() => (busyRef.current = false), 1500)
  }

  return (
    <Layout>
      <div className="p-8 max-w-xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="font-display text-3xl">CHECK-IN</h1>
          <p className="text-line-dim text-sm mt-1">Scan a member's QR code to log attendance</p>
        </header>

        <div className="flex justify-center gap-2 mb-6">
          {['Badminton', 'Billiards'].map((a) => (
            <button
              key={a}
              onClick={() => setActivity(a)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activity === a
                  ? 'bg-chalk text-court-950'
                  : 'bg-court-900 border border-court-700 text-line-dim hover:text-line'
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="bg-court-900 border border-court-700 rounded-xl p-4 overflow-hidden">
          <div id={SCANNER_ID} className="rounded-lg overflow-hidden" />
          {!scanning && !status && (
            <p className="text-center text-line-dim text-sm mt-3">Starting camera…</p>
          )}
        </div>

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