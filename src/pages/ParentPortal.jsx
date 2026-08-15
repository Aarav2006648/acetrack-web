import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ParentPortal() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [students, setStudents] = useState([]) // grouped by student

  async function handleSearch(e) {
    e.preventDefault()
    setLoading(true)
    setSearched(false)

    const { data, error } = await supabase.rpc('get_student_attendance', { p_phone: phone.trim() })

    setLoading(false)
    setSearched(true)

    if (error || !data) {
      setStudents([])
      return
    }

    // group flat rows by student_id
    const grouped = {}
    for (const row of data) {
      if (!grouped[row.student_id]) {
        grouped[row.student_id] = {
          full_name: row.full_name,
          package_name: row.package_name,
          total_classes: row.total_classes,
          remaining_classes: row.remaining_classes,
          classes_used: row.classes_used,
          is_unlimited: row.is_unlimited,
          sessions: [],
        }
      }
      if (row.attendance_date) {
        grouped[row.student_id].sessions.push({
          date: row.attendance_date,
          activity: row.activity,
          time: row.check_in_time,
        })
      }
    }
    setStudents(Object.values(grouped))
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-chalk" />
            <span className="font-display text-2xl tracking-wide">ACETRACK</span>
          </div>
          <p className="text-line-dim text-sm font-mono">Al Hayatt Badminton &amp; Billiards Club</p>
          <h1 className="font-display text-xl mt-6">CHECK YOUR CHILD'S ATTENDANCE</h1>
          <p className="text-line-dim text-sm mt-1">
            Enter the phone number used when they enrolled
          </p>
        </div>

        <form onSubmit={handleSearch} className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-line-dim mb-1.5">Phone number</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0501234567"
              className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-chalk hover:bg-chalk-bright text-court-950 font-semibold py-2.5 rounded-md text-sm disabled:opacity-60"
          >
            {loading ? 'Searching…' : 'View attendance'}
          </button>
        </form>

        {searched && students.length === 0 && (
          <p className="text-center text-line-dim text-sm mt-6">
            No student found with that phone number. Double check the number, or contact the club front desk.
          </p>
        )}

        {students.map((s, i) => (
          <div key={i} className="bg-court-900 border border-court-700 rounded-xl p-6 mt-6">
            <h2 className="font-display text-xl mb-1">{s.full_name}</h2>
            <p className="text-line-dim text-sm mb-4">{s.package_name || 'No package'}</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-court-800 rounded-lg p-4">
                <p className="text-xs text-line-dim uppercase">Classes done</p>
                <p className="font-mono text-2xl mt-1 text-chalk">{s.classes_used ?? 0}</p>
              </div>
              <div className="bg-court-800 rounded-lg p-4">
                <p className="text-xs text-line-dim uppercase">Classes remaining</p>
                <p className="font-mono text-2xl mt-1 text-chalk">
                  {s.is_unlimited ? 'Unlimited' : s.remaining_classes ?? 0}
                </p>
              </div>
            </div>

            <p className="text-xs text-line-dim uppercase mb-2">Attendance history</p>
            <div className="divide-y divide-court-800 max-h-64 overflow-y-auto">
              {s.sessions.length === 0 && (
                <p className="text-sm text-line-dim py-3">No sessions logged yet.</p>
              )}
              {s.sessions.map((sess, j) => (
                <div key={j} className="py-2.5 flex items-center justify-between text-sm">
                  <span>
                    {new Date(sess.date).toLocaleDateString('en-AE', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span className="text-line-dim">{sess.activity}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-line-dim mt-8">
          <Link to="/login" className="hover:text-line underline">
            Club staff login
          </Link>
        </p>
      </div>
    </div>
  )
}
