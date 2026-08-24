import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

function buildMessage(student) {
  const name = student.full_name
  if (student.remaining_classes <= 0) {
    return `Hi! Just a quick note that ${name}'s current badminton package with Al Hayatt Club has now been completed. We'd love to see ${name} continue with us — whenever you're ready to renew, just let us know and we'll get them booked in. Thank you!`
  }
  return `Hi! A friendly reminder that ${name}'s next badminton session will be their last one on the current package with Al Hayatt Club. We'd love to see ${name} continue with us — please let us know if you'd like to renew so we can keep their spot. Thank you!`
}

// Same UAE-friendly normalization used for the QR-share WhatsApp links in
// Students.jsx: strips everything but digits and expands a local
// 05XXXXXXXX number to the 971 country code so wa.me accepts it.
function normalizeWhatsAppPhone(phone) {
  if (!phone) return ''

  let digits = String(phone).replace(/\D/g, '')

  if (digits.startsWith('05') && digits.length === 10) {
    digits = `971${digits.slice(1)}`
  }

  return digits
}

export default function ReminderPanel() {
  const { session } = useAuth()
  const [students, setStudents] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [sentId, setSentId] = useState(null)

  useEffect(() => {
    if (!session) return
    loadLowClassStudents()
  }, [session])

  async function loadLowClassStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, phone, remaining_classes, packages(is_unlimited)')
      .eq('status', 'Active')
      .lte('remaining_classes', 1)
      .order('remaining_classes', { ascending: true })

    // exclude unlimited packages — they never run out
    const filtered = (data || []).filter((s) => !s.packages?.is_unlimited)
    setStudents(filtered)
  }

  async function handleSend(student) {
    const message = buildMessage(student)
    const phone = normalizeWhatsAppPhone(student.phone)

    if (!phone) {
      // No usable phone on file — fall back to just copying the message
      // so staff can still send it manually from wherever they have the number.
      try {
        await navigator.clipboard.writeText(message)
      } catch {
        // clipboard access can fail on some browsers/permissions — fail quietly
      }
      window.alert(`${student.full_name} doesn't have a valid phone number saved. The message was copied instead — paste it into the chat manually.`)
      return
    }

    // wa.me with a `text` param opens WhatsApp with that number's chat
    // already open AND the message pre-filled in the input box — staff
    // just has to hit send.
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

    setSentId(student.id)
    setTimeout(() => setSentId(null), 2000)
  }

  if (!session || dismissed || students.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 w-80 bg-court-900 border border-court-700 rounded-xl shadow-xl z-30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-court-700">
        <h3 className="font-display text-sm tracking-wide text-chalk">CLASSES ENDING SOON</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-line-dim hover:text-line text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-court-800">
        {students.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">{s.full_name}</span>
              <span className="text-xs text-line-dim font-mono">
                {s.remaining_classes <= 0 ? 'Finished' : '1 class left'}
              </span>
            </div>
            <button
              onClick={() => handleSend(s)}
              className="text-xs bg-chalk/15 hover:bg-chalk/25 text-chalk px-2.5 py-1.5 rounded-md font-medium transition-colors"
            >
              {sentId === s.id ? 'Opened ✓' : 'Send reminder on WhatsApp'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

