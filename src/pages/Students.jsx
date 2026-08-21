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
  amount_charged: '',
  payment_method: 'Cash',
}

export default function Students() {
  const [students, setStudents] = useState([])
  const [packages, setPackages] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [qrStudent, setQrStudent] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [renewPackageId, setRenewPackageId] = useState('')
  const [renewAmount, setRenewAmount] = useState('')
  const [renewMethod, setRenewMethod] = useState('Cash')
  const [renewSaving, setRenewSaving] = useState(false)
  const [renewError, setRenewError] = useState('')
  const [renewDone, setRenewDone] = useState(false)

  useEffect(() => {
    loadStudents()
    loadPackages()
  }, [])

  async function loadStudents() {
    const { data, error: loadError } = await supabase
      .from('students')
      .select('*, packages(package_name, total_classes, is_unlimited, price)')
      .order('created_at', { ascending: false })

    if (loadError) {
      setError(loadError.message)
      return
    }

    setStudents(data || [])
  }

  async function loadPackages() {
    const { data, error: loadError } = await supabase
      .from('packages')
      .select('*')
      .eq('status', 'Active')

    if (loadError) {
      setError(loadError.message)
      return
    }

    setPackages(data || [])
  }

  function handlePackageChange(packageId) {
    const pkg = packages.find((p) => p.id === packageId)

    setForm({
      ...form,
      package_id: packageId,
      amount_charged: pkg ? pkg.price : '',
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const pkg = packages.find((p) => p.id === form.package_id)

    const { data: newStudent, error: studentError } = await supabase
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

    if (studentError) {
      setSaving(false)
      setError(studentError.message)
      return
    }

    if (form.amount_charged !== '') {
      const { error: paymentError } = await supabase.from('payments').insert({
        student_id: newStudent.id,
        package_id: form.package_id || null,
        amount: Number(form.amount_charged),
        payment_method: form.payment_method,
      })

      if (paymentError) {
        setSaving(false)
        setError(`Member saved, but payment log failed: ${paymentError.message}`)
        return
      }
    }

    setSaving(false)
    setForm(emptyForm)
    setShowForm(false)

    await loadStudents()

    setQrStudent(newStudent)
  }

  function openEdit(student) {
    setEditStudent(student)

    setEditForm({
      full_name: student.full_name,
      phone: student.phone,
      email: student.email || '',
      package_id: student.package_id || '',
      remaining_classes: student.remaining_classes ?? 0,
      status: student.status,
    })

    setEditError('')

    setRenewPackageId(student.package_id || '')
    setRenewAmount('')
    setRenewMethod('Cash')
    setRenewError('')
    setRenewDone(false)
  }

  function handleRenewPackageChange(packageId) {
    setRenewPackageId(packageId)

    const pkg = packages.find((p) => p.id === packageId)

    setRenewAmount(pkg ? String(pkg.price) : '')
  }

  async function handleRenew(e) {
    e.preventDefault()
    setRenewError('')

    if (!renewPackageId) {
      setRenewError('Pick a package to renew with.')
      return
    }

    const pkg = packages.find((p) => p.id === renewPackageId)

    if (!pkg) {
      setRenewError('Package not found.')
      return
    }

    setRenewSaving(true)

    const { error: paymentError } = await supabase.from('payments').insert({
      student_id: editStudent.id,
      package_id: pkg.id,
      amount: renewAmount !== '' ? Number(renewAmount) : pkg.price,
      payment_method: renewMethod,
    })

    if (paymentError) {
      setRenewSaving(false)
      setRenewError(paymentError.message)
      return
    }

    const { error: historyError } = await supabase
      .from('package_history')
      .insert({
        student_id: editStudent.id,
        package_id: pkg.id,
        start_date: new Date().toISOString().slice(0, 10),
        classes_used: 0,
        remaining_classes: pkg.total_classes,
      })

    if (historyError) {
      console.error('Package history error:', historyError)
    }

    const { error: updateError } = await supabase
      .from('students')
      .update({
        package_id: pkg.id,
        remaining_classes: pkg.total_classes,
        classes_used: 0,
        status: 'Active',
      })
      .eq('id', editStudent.id)

    setRenewSaving(false)

    if (updateError) {
      setRenewError(updateError.message)
      return
    }

    setRenewDone(true)

    await loadStudents()
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setEditError('')
    setEditSaving(true)

    const { error: updateError } = await supabase
      .from('students')
      .update({
        full_name: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email || null,
        package_id: editForm.package_id || null,
        remaining_classes: Number(editForm.remaining_classes),
        status: editForm.status,
      })
      .eq('id', editStudent.id)

    setEditSaving(false)

    if (updateError) {
      setEditError(updateError.message)
      return
    }

    setEditStudent(null)
    setEditForm(null)

    await loadStudents()
  }

  async function handleDeleteStudent() {
    if (!editStudent || deleteSaving) return

    const confirmed = window.confirm(
      `Are you sure you want to permanently remove ${editStudent.full_name}?\n\n` +
        'This will delete their member record and any related payment, attendance, and package-history records. This cannot be undone.'
    )

    if (!confirmed) return

    setEditError('')
    setDeleteSaving(true)

    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', editStudent.id)

    setDeleteSaving(false)

    if (deleteError) {
      setEditError(`Could not remove member: ${deleteError.message}`)
      return
    }

    setEditStudent(null)
    setEditForm(null)

    await loadStudents()
  }

  const filtered = students.filter((s) =>
    `${s.full_name} ${s.phone} ${s.student_code}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  function isRenewalDue(s) {
    return !s.packages?.is_unlimited && s.remaining_classes <= 1
  }

  return (
    <Layout>
      <div className="p-8 max-w-6xl">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl">MEMBERS</h1>

            <p className="text-line-dim text-sm mt-1">
              {students.length} total
            </p>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm transition-colors"
          >
            + Enroll member
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
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-court-800">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => openEdit(s)}
                  className="cursor-pointer hover:bg-court-800/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium">{s.full_name}</div>

                    <div className="text-xs text-line-dim font-mono">
                      {s.student_code}
                    </div>
                  </td>

                  <td className="px-5 py-3 text-line-dim">
                    {s.phone}
                  </td>

                  <td className="px-5 py-3 text-line-dim">
                    {s.packages?.package_name || '—'}
                  </td>

                  <td className="px-5 py-3 font-mono">
                    <span className={isRenewalDue(s) ? 'text-danger' : ''}>
                      {s.packages?.is_unlimited
                        ? 'Unlimited'
                        : s.remaining_classes}
                    </span>

                    {isRenewalDue(s) && (
                      <span className="ml-2 text-[10px] bg-danger/15 text-danger px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        Renewal due
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setQrStudent(s)
                      }}
                      className="text-chalk hover:text-chalk-bright text-xs font-medium"
                    >
                      View QR
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-line-dim text-sm"
                  >
                    No members yet. Enroll your first member to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-line-dim mt-3">
          Click a member's row to edit their details.
        </p>
      </div>

      {/* ENROLL MEMBER */}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <form
            onSubmit={handleSave}
            className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="font-display text-xl">ENROLL MEMBER</h2>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Full name
              </label>

              <input
                required
                value={form.full_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    full_name: e.target.value,
                  })
                }
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Phone
              </label>

              <input
                required
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value,
                  })
                }
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Email (optional)
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Package
              </label>

              <select
                value={form.package_id}
                onChange={(e) => handlePackageChange(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              >
                <option value="">No package</option>

                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name} (AED {p.price} list price)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Amount actually charged (AED)
              </label>

              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount_charged}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount_charged: e.target.value,
                  })
                }
                placeholder="e.g. discounted or offer price"
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />

              <p className="text-[11px] text-line-dim mt-1">
                Pre-filled from the package price — edit if there's a discount
                or offer.
              </p>
            </div>

            <div>
              <label className="block text-xs text-line-dim mb-1.5">
                Payment method
              </label>

              <select
                value={form.payment_method}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_method: e.target.value,
                  })
                }
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              >
                <option>Cash</option>
                <option>Card</option>
                <option>Bank Transfer</option>
                <option>Other</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setError('')
                  setForm(emptyForm)
                }}
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

      {/* EDIT MEMBER */}

      {editStudent && editForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <div className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl">
              EDIT MEMBER
            </h2>

            <p className="text-xs text-line-dim font-mono -mt-2">
              {editStudent.student_code}
            </p>

            <form
              onSubmit={handleEditSave}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Full name
                </label>

                <input
                  required
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      full_name: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
              </div>

              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Phone
                </label>

                <input
                  required
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      phone: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
              </div>

              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Email
                </label>

                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      email: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
              </div>

              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Package
                </label>

                <select
                  value={editForm.package_id}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      package_id: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                >
                  <option value="">No package</option>

                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.package_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Classes remaining
                </label>

                <input
                  type="number"
                  min="0"
                  value={editForm.remaining_classes}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      remaining_classes: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />

                <p className="text-[11px] text-line-dim mt-1">
                  Adjust manually if a class was made up, refunded, or added
                  as a bonus.
                </p>
              </div>

              <div>
                <label className="block text-xs text-line-dim mb-1.5">
                  Status
                </label>

                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      status: e.target.value,
                    })
                  }
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>

              {editError && (
                <p className="text-sm text-danger">
                  {editError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditStudent(null)
                    setEditForm(null)
                    setEditError('')
                  }}
                  disabled={editSaving || deleteSaving}
                  className="flex-1 border border-court-600 rounded-md py-2 text-sm text-line-dim hover:bg-court-800 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={editSaving || deleteSaving}
                  className="flex-1 bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md py-2 text-sm disabled:opacity-60"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>

            {/* DELETE MEMBER */}

            <div className="border-t border-court-700 pt-4">
              <button
                type="button"
                onClick={handleDeleteStudent}
                disabled={editSaving || deleteSaving}
                className="w-full border border-danger/40 text-danger hover:bg-danger/10 rounded-md py-2 text-sm font-medium disabled:opacity-60"
              >
                {deleteSaving
                  ? 'Removing…'
                  : 'Remove member permanently'}
              </button>

              <p className="text-[11px] text-line-dim mt-2">
                Permanently removes this member and related payment,
                attendance, and package-history records.
              </p>
            </div>

            {/* RENEW MEMBERSHIP */}

            <div className="border-t border-court-700 pt-4">
              <h3 className="font-display text-base mb-1">
                RENEW MEMBERSHIP
              </h3>

              <p className="text-xs text-line-dim mb-3">
                Log a new payment and reset their classes — use this whenever
                a member's package runs out and they pay to continue, whether
                that's today or weeks from now.
              </p>

              {renewDone ? (
                <p className="text-sm text-net bg-net/10 border border-net/30 rounded-md px-3 py-2">
                  Renewed! Classes have been reset and the payment is logged.
                </p>
              ) : (
                <form
                  onSubmit={handleRenew}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs text-line-dim mb-1.5">
                      Package
                    </label>

                    <select
                      value={renewPackageId}
                      onChange={(e) =>
                        handleRenewPackageChange(e.target.value)
                      }
                      className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                    >
                      <option value="">
                        Select a package…
                      </option>

                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.package_name} (AED {p.price} list price)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-line-dim mb-1.5">
                        Amount charged
                      </label>

                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={renewAmount}
                        onChange={(e) =>
                          setRenewAmount(e.target.value)
                        }
                        className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-line-dim mb-1.5">
                        Method
                      </label>

                      <select
                        value={renewMethod}
                        onChange={(e) =>
                          setRenewMethod(e.target.value)
                        }
                        className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                      >
                        <option>Cash</option>
                        <option>Card</option>
                        <option>Bank Transfer</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  {renewError && (
                    <p className="text-sm text-danger">
                      {renewError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={renewSaving}
                    className="w-full bg-net hover:brightness-110 text-court-950 font-semibold rounded-md py-2 text-sm disabled:opacity-60"
                  >
                    {renewSaving
                      ? 'Renewing…'
                      : 'Renew membership'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR MODAL */}

      {qrStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <div className="bg-court-900 border border-court-700 rounded-xl p-6 w-full max-w-xs text-center space-y-4">
            <h2 className="font-display text-xl">
              {qrStudent.full_name}
            </h2>

            <div className="bg-line p-4 rounded-lg inline-block">
              <QRCodeCanvas
                id="qr-canvas"
                value={qrStudent.student_code}
                size={200}
              />
            </div>

            <p className="font-mono text-xs text-line-dim">
              {qrStudent.student_code}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setQrStudent(null)}
                className="flex-1 border border-court-600 rounded-md py-2 text-sm text-line-dim hover:bg-court-800"
              >
                Close
              </button>

              <button
                onClick={() => copyQRToClipboard(qrStudent)}
                className="flex-1 bg-chalk hover:bg-chalk-bright text-court-950 font-semibold rounded-md py-2 text-sm"
              >
                Copy QR
              </button>

              <button
                onClick={() => shareQROnWhatsApp(qrStudent)}
                className="flex-1 bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold rounded-md py-2 text-sm"
              >
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

/* =========================================================
   COPY QR IMAGE TO CLIPBOARD
   ========================================================= */

async function copyQRToClipboard(student) {
  const canvas = document.getElementById('qr-canvas')

  if (!canvas) {
    window.alert('Could not find the QR code.')
    return false
  }

  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    window.alert(
      'Your browser does not support copying QR images directly to the clipboard. Please use the latest version of Chrome or Edge.'
    )

    return false
  }

  try {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result)
          } else {
            reject(new Error('Could not create the QR image.'))
          }
        },
        'image/png'
      )
    })

    const item = new ClipboardItem({
      'image/png': blob,
    })

    await navigator.clipboard.write([item])

    window.alert(
      `QR code for ${student.full_name} copied to clipboard!`
    )

    return true
  } catch (error) {
    console.error('Copy QR failed:', error)

    window.alert(
      'Could not copy the QR code. Make sure you are using the HTTPS version of the website and try again.'
    )

    return false
  }
}

/* =========================================================
   WHATSAPP
   ========================================================= */

async function shareQROnWhatsApp(student) {
  const phone = normalizeWhatsAppPhone(student.phone)

  if (!phone) {
    window.alert(
      'This member does not have a valid phone number saved.'
    )

    return
  }

  // Copy the QR image first.
  const copied = await copyQRToClipboard(student)

  if (!copied) {
    return
  }

  // Open the member's WhatsApp chat.
  const whatsappUrl = `https://wa.me/${phone}`

  window.open(
    whatsappUrl,
    '_blank',
    'noopener,noreferrer'
  )

  window.setTimeout(() => {
    window.alert(
      'QR code copied to your clipboard. Open the WhatsApp chat and paste the QR image.'
    )
  }, 500)
}

/* =========================================================
   WHATSAPP PHONE NUMBER NORMALIZATION
   ========================================================= */

function normalizeWhatsAppPhone(phone) {
  if (!phone) return ''

  // Keep digits only.
  let digits = String(phone).replace(/\D/g, '')

  // UAE convenience:
  // 0501234567 -> 971501234567
  if (digits.startsWith('05') && digits.length === 10) {
    digits = `971${digits.slice(1)}`
  }

  return digits
}
