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

export default function ReminderPanel() {
  const { session } = useAuth()
  const [students, setStudents] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    if (!session) return
    loadLowClassStudents()
  }, [session])

  async function loadLowClassStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, full_name, remaining_classes, packages(is_unlimited)')
      .eq('status', 'Active')
      .lte('remaining_classes', 1)
      .order('remaining_classes', { ascending: true })

    // exclude unlimited packages — they never run out
    const filtered = (data || []).filter((s) => !s.packages?.is_unlimited)
    setStudents(filtered)
  }

  async function handleCopy(student) {
    try {
      await navigator.clipboard.writeText(buildMessage(student))
      setCopiedId(student.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // clipboard access can fail on some browsers/permissions — fail quietly
    }
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
              onClick={() => handleCopy(s)}
              className="text-xs bg-chalk/15 hover:bg-chalk/25 text-chalk px-2.5 py-1.5 rounded-md font-medium transition-colors"
            >
              {copiedId === s.id ? 'Copied ✓' : 'Copy renewal message'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
