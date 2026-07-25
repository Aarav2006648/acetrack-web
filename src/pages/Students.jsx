import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

function makeStudentCode() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `AT-${rand}`
}

const emptyForm = {
  full_name: '',
  phone: '',
  email: '',
  package_id: '',
}

export default function Students() {
  const [students, setStudents] = useState([])
  const [packages, setPackages] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [qrStudent, setQrStudent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStudents()
    loadPackages()
  }, [])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('*, packages(package_name, total_classes, is_unlimited)')
      .order('created_at', { ascending: false })
    setStudents(data || [])
  }

  async function loadPackages() {
    const { data } = await supabase.from('packages').select('*').eq('status', 'Active')
    setPackages(data || [])
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const pkg = packages.find((p) => p.id === form.package_id)

    const { data, error } = await supabase
      .from('students')
      .insert({
        student_code: makeStudentCode(),
        full_name: form.full_name,
        phone: form.phone,
        email: form.email || null,
        package_id: form.package_id || null,
        remaining_classes: pkg ? pkg.total_classes : 0,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setForm(emptyForm)
    setShowForm(false)
    await loadStudents()
    setQrStudent(data) // immediately show the new member's QR code
  }

  const filtered = students.filter((s) =>
    `${s.full_name} ${s.phone} ${s.student_code}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="p-8 max-w-6xl">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl">MEMBERS</h1>
            <p className="text-line-dim text-sm mt-1">{students.length} total</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm transition-colors"
          >
            + Add member
          </button>
        </header>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or code…"
          className="w-full max-w-sm bg-court-900 border border-court-700 rounded-md px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-chalk"
        />

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Package</th>
                <th className="px-5 py-3 font-medium">Classes left</th>
                <th className="px-5 py-3 font-medium">QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-court-800">
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{s.full_name}</div>
                    <div className="text-xs text-line-dim font-mono">{s.student_code}</div>
                  </td>
                  <td className="px-5 py-3 text-line-dim">{s.phone}</td>
                  <td className="px-5 py-3 text-line-dim">{s.packages?.package_name || '—'}</td>
                  <td className="px-5 py-3 font-mono">
                    {s.packages?.is_unlimited ? 'Unlimited' : s.remaining_classes}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setQrStudent(s)}
                      className="text-chalk hover:text-chalk-bright text-xs font-medium"
                    >
                      View QR
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-line-dim text-sm">
                    No members yet. Add your first member to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add member modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <form
            onSubmit={handleSave}
            className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-sm space-y-4"
          >
            <h2 className="font-display text-xl">ADD MEMBER</h2>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">Full name</label>
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Phone</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Email (optional)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Package</label>
              <select
                value={form.package_id}
                onChange={(e) => setForm({ ...form, package_id: e.target.value })}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              >
                <option value="">No package</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name} (AED {p.price})
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setError('') }}
                className="flex-1 border border-court-600 rounded-md py-2 text-sm text-line-dim hover:bg-court-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md py-2 text-sm disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QR modal */}
      {qrStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <div className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-xs text-center space-y-4">
            <h2 className="font-display text-xl">{qrStudent.full_name}</h2>
            <div className="bg-line p-4 rounded-lg inline-block">
              <QRCodeCanvas id="qr-canvas" value={qrStudent.student_code} size={200} />
            </div>
            <p className="font-mono text-xs text-line-dim">{qrStudent.student_code}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setQrStudent(null)}
                className="flex-1 border border-court-600 rounded-md py-2 text-sm text-line-dim hover:bg-court-800"
              >
                Close
              </button>
              <button
                onClick={() => downloadQR(qrStudent)}
                className="flex-1 bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md py-2 text-sm"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function downloadQR(student) {
  const canvas = document.getElementById('qr-canvas')
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `${student.student_code}-${student.full_name}.png`
  a.click()
}
