import { useState } from 'react'
import Papa from 'papaparse'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

function firstOfMonth() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)

  async function runReport() {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('id, activity, attendance_date, check_in_time, students(full_name, phone, student_code)')
      .gte('attendance_date', from)
      .lte('attendance_date', to)
      .order('check_in_time', { ascending: false })

    setRows(data || [])
    setLoading(false)
    setRan(true)
  }

  function exportCsv() {
    const csvRows = rows.map((r) => ({
      Date: r.attendance_date,
      Time: new Date(r.check_in_time).toLocaleTimeString('en-AE'),
      Member: r.students?.full_name,
      Phone: r.students?.phone,
      'Member Code': r.students?.student_code,
      Activity: r.activity,
    }))
    const csv = Papa.unparse(csvRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // simple per-member visit count summary
  const summary = Object.values(
    rows.reduce((acc, r) => {
      const name = r.students?.full_name || 'Unknown'
      acc[name] = acc[name] || { name, visits: 0 }
      acc[name].visits += 1
      return acc
    }, {})
  ).sort((a, b) => b.visits - a.visits)

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">REPORTS</h1>
          <p className="text-line-dim text-sm mt-1">Attendance summary for a date range</p>
        </header>

        <div className="flex flex-wrap items-end gap-3 mb-8">
          <div>
            <label className="block text-xs text-line-dim mb-1.5">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-line-dim mb-1.5">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={runReport}
            disabled={loading}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
          >
            {loading ? 'Running…' : 'Run report'}
          </button>
          {rows.length > 0 && (
            <button
              onClick={exportCsv}
              className="border border-court-600 px-4 py-2 rounded-md text-sm text-line-dim hover:text-line hover:bg-court-800"
            >
              Export CSV
            </button>
          )}
        </div>

        {ran && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Total check-ins</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{rows.length}</p>
              </div>
              <div className="bg-court-900 border border-court-700 rounded-xl p-5">
                <p className="text-xs text-line-dim uppercase">Unique members</p>
                <p className="font-mono text-3xl mt-1 text-chalk">{summary.length}</p>
              </div>
            </div>

            <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                    <th className="px-5 py-3 font-medium">Member</th>
                    <th className="px-5 py-3 font-medium">Visits in range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-court-800">
                  {summary.map((s) => (
                    <tr key={s.name}>
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-5 py-3 font-mono">{s.visits}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-5 py-8 text-center text-line-dim">
                        No check-ins in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
