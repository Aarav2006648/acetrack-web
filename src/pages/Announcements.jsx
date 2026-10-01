import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'
import { normalizePhone } from '../lib/phone'
import { loadInactiveMembers, INACTIVITY_DAYS } from '../lib/inactivity'
import { loadTemplates, saveTemplates, fillTemplate } from '../lib/whatsappTemplates'

const todayStr = () => new Date().toISOString().slice(0, 10)

function buildRenewalMessage(student) {
  const name = student.full_name
  if (student.remaining_classes <= 0) {
    return `Hi! Just a quick note that ${name}'s current badminton package with Al Hayatt Club has now been completed. We'd love to see ${name} continue with us — whenever you're ready to renew, just let us know and we'll get them booked in. Thank you!`
  }
  return `Hi! A friendly reminder that ${name}'s next badminton session will be their last one on the current package with Al Hayatt Club. We'd love to see ${name} continue with us — please let us know if you'd like to renew so we can keep their spot. Thank you!`
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
}

export default function Announcements() {
  const [inactive, setInactive] = useState([])
  const [inactiveLoading, setInactiveLoading] = useState(true)
  const [inactiveError, setInactiveError] = useState('')

  const [renewals, setRenewals] = useState([])
  const [renewalsLoading, setRenewalsLoading] = useState(true)
  const [sentId, setSentId] = useState(null)

  const [templates, setTemplates] = useState(() => loadTemplates())
  const [managingTemplates, setManagingTemplates] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateBody, setNewTemplateBody] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [editTemplateName, setEditTemplateName] = useState('')
  const [editTemplateBody, setEditTemplateBody] = useState('')

  const [whatsappStudent, setWhatsappStudent] = useState(null)
  const [whatsappMessage, setWhatsappMessage] = useState('')

  const [pending, setPending] = useState([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [markingId, setMarkingId] = useState(null)
  const [pendingError, setPendingError] = useState('')

  const [todaysWalkIns, setTodaysWalkIns] = useState([])
  const [walkInsLoading, setWalkInsLoading] = useState(true)

  useEffect(() => {
    loadInactive()
    loadRenewals()
    loadPending()
    loadTodaysWalkIns()
  }, [])

  // Deep-links from the Dashboard's stat cards land here with a #hash —
  // scroll to that section once its data has actually loaded, not on
  // first mount. Both "Hasn't Attended Recently" and "Classes Ending
  // Soon" start as a single loading line and can grow a lot once their
  // real lists render, which would otherwise shift the target out from
  // under an already-started smooth scroll (e.g. landing inside the
  // inactive-members list instead of the renewals section below it).
  const scrolledToHash = useRef(false)
  useEffect(() => {
    if (scrolledToHash.current) return
    if (!window.location.hash) return
    if (inactiveLoading || renewalsLoading) return

    scrolledToHash.current = true
    const el = document.getElementById(window.location.hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [inactiveLoading, renewalsLoading])

  // Flags Active members who still have classes left (or an unlimited
  // package) but haven't checked in for INACTIVITY_DAYS — a nudge to call
  // the parent and check in, rather than waiting for them to just fade out.
  // Shared with the Dashboard's "Inactive Members" count via lib/inactivity
  // so the two pages always agree on who counts.
  async function loadInactive() {
    setInactiveLoading(true)
    setInactiveError('')

    try {
      const flagged = await loadInactiveMembers()
      setInactive(flagged)
    } catch (err) {
      setInactiveError(err.message || 'Could not check attendance.')
    } finally {
      setInactiveLoading(false)
    }
  }

  async function loadRenewals() {
    setRenewalsLoading(true)

    const { data } = await supabase
      .from('students')
      .select('id, full_name, phone, remaining_classes, packages(is_unlimited)')
      .eq('status', 'Active')
      .lte('remaining_classes', 1)
      .order('remaining_classes', { ascending: true })

    setRenewals((data || []).filter((s) => !s.packages?.is_unlimited))
    setRenewalsLoading(false)
  }

  // Pending payments can come from a badminton walk-in (attendance,
  // guest_name not null) or a billiards table rental (rentals) — both
  // are surfaced here so nothing gets forgotten once the session ends.
  async function loadPending() {
    setPendingLoading(true)
    setPendingError('')

    const [{ data: pendingAttendance, error: attErr }, { data: pendingRentals, error: rentErr }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, guest_name, guest_phone, activity, court_number, check_in_time, amount, attendance_date')
        .not('guest_name', 'is', null)
        .eq('payment_status', 'Pending')
        .order('check_in_time', { ascending: false }),
      supabase
        .from('rentals')
        .select('id, guest_name, guest_phone, activity, court_number, start_time, price, booking_date')
        .eq('payment_status', 'Pending')
        .order('start_time', { ascending: false }),
    ])

    if (attErr || rentErr) {
      setPendingError((attErr || rentErr).message)
      setPendingLoading(false)
      return
    }

    const attRows = (pendingAttendance || []).map((r) => ({
      key: `attendance-${r.id}`,
      source: 'attendance',
      id: r.id,
      name: r.guest_name,
      phone: r.guest_phone,
      activity: r.activity,
      court: r.court_number,
      time: r.check_in_time,
      amount: r.amount,
      date: r.attendance_date,
    }))

    const rentalRows = (pendingRentals || []).map((r) => ({
      key: `rentals-${r.id}`,
      source: 'rentals',
      id: r.id,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: r.activity,
      court: r.court_number,
      time: r.start_time,
      amount: r.price,
      date: r.booking_date,
    }))

    setPending(
      [...attRows, ...rentalRows].sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))
    )
    setPendingLoading(false)
  }

  async function loadTodaysWalkIns() {
    setWalkInsLoading(true)
    const today = todayStr()

    const [{ data: badmintonGuests }, { data: billiardsGuests }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, guest_name, guest_phone, court_number, check_in_time, payment_status, amount')
        .is('student_id', null)
        .eq('attendance_date', today)
        .order('check_in_time', { ascending: false }),
      supabase
        .from('rentals')
        .select('id, guest_name, guest_phone, court_number, start_time, payment_status, price')
        .eq('booking_date', today)
        .order('start_time', { ascending: false }),
    ])

    const badminton = (badmintonGuests || []).map((r) => ({
      key: `bm-${r.id}`,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: 'Badminton',
      court: r.court_number,
      time: r.check_in_time,
      payment_status: r.payment_status,
      amount: r.amount,
    }))

    const billiards = (billiardsGuests || []).map((r) => ({
      key: `bl-${r.id}`,
      name: r.guest_name || 'Unknown',
      phone: r.guest_phone,
      activity: 'Billiards',
      court: r.court_number,
      time: r.start_time,
      payment_status: r.payment_status,
      amount: r.price,
    }))

    setTodaysWalkIns(
      [...badminton, ...billiards].sort((a, b) => new Date(b.time) - new Date(a.time))
    )
    setWalkInsLoading(false)
  }

  async function handleSendRenewal(student) {
    const message = buildRenewalMessage(student)
    const phone = normalizePhone(student.phone)

    if (!phone) {
      try {
        await navigator.clipboard.writeText(message)
      } catch {
        // clipboard can fail silently on some browsers — not critical
      }
      window.alert(`${student.full_name} doesn't have a valid phone number saved. The message was copied instead.`)
      return
    }

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

    setSentId(student.id)
    setTimeout(() => setSentId(null), 2000)
  }

  // Opens a small "what do you want to say" modal instead of jumping
  // straight to WhatsApp — staff can tap a template to fill the box,
  // then tweak it or just type their own message from scratch, before
  // the chat actually opens.
  function openWhatsappModal(student) {
    setWhatsappStudent(student)
    setWhatsappMessage('')
  }

  function closeWhatsappModal() {
    setWhatsappStudent(null)
    setWhatsappMessage('')
  }

  function pickWhatsappTemplate(templateId) {
    const template = templates.find((t) => t.id === templateId)
    if (!template || !whatsappStudent) return

    setWhatsappMessage(
      fillTemplate(template.body, { name: whatsappStudent.full_name, days: whatsappStudent.daysSince })
    )
  }

  function sendWhatsappMessage() {
    if (!whatsappStudent) return

    const phone = normalizePhone(whatsappStudent.phone)
    if (!phone) {
      window.alert(`${whatsappStudent.full_name} doesn't have a valid phone number saved.`)
      return
    }

    // No message typed/picked — still fine, this just opens the chat
    // itself so staff can write something straight into WhatsApp.
    const whatsappUrl = whatsappMessage.trim()
      ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/${phone}`

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    closeWhatsappModal()
  }

  function handleAddTemplate(e) {
    e.preventDefault()
    if (!newTemplateName.trim() || !newTemplateBody.trim()) return

    const next = [
      ...templates,
      { id: `custom-${Date.now()}`, name: newTemplateName.trim(), body: newTemplateBody.trim() },
    ]
    setTemplates(next)
    saveTemplates(next)
    setNewTemplateName('')
    setNewTemplateBody('')
  }

  function handleDeleteTemplate(id) {
    const next = templates.filter((t) => t.id !== id)
    setTemplates(next)
    saveTemplates(next)
  }

  function startEditTemplate(t) {
    setEditingTemplateId(t.id)
    setEditTemplateName(t.name)
    setEditTemplateBody(t.body)
  }

  function cancelEditTemplate() {
    setEditingTemplateId(null)
  }

  function handleSaveTemplateEdit(e) {
    e.preventDefault()
    if (!editTemplateName.trim() || !editTemplateBody.trim()) return

    const next = templates.map((t) =>
      t.id === editingTemplateId ? { ...t, name: editTemplateName.trim(), body: editTemplateBody.trim() } : t
    )
    setTemplates(next)
    saveTemplates(next)
    setEditingTemplateId(null)
  }

  async function handleMarkPaid(row) {
    setMarkingId(row.key)
    setPendingError('')

    const { error } = await supabase
      .from(row.source)
      .update({ payment_status: 'Paid' })
      .eq('id', row.id)

    setMarkingId(null)

    if (error) {
      setPendingError(error.message)
      return
    }

    await loadPending()
    await loadTodaysWalkIns()
  }

  return (
    <Layout>
      <div className="p-4 sm:p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">ANNOUNCEMENTS</h1>
          <p className="text-line-dim text-sm mt-1">Inactivity alerts, renewal reminders, pending payments, and today's walk-ins</p>
        </header>

        {/* NOT SEEN RECENTLY */}
        <section id="hasnt-attended-recently" className="mb-8 scroll-mt-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-display text-lg tracking-wide">HASN'T ATTENDED RECENTLY</h2>
            <button
              onClick={() => setManagingTemplates(!managingTemplates)}
              className="text-xs text-chalk hover:text-chalk-bright font-medium shrink-0"
            >
              {managingTemplates ? 'Close' : 'Manage WhatsApp templates'}
            </button>
          </div>
          <p className="text-xs text-line-dim mb-3">
            Active members with classes remaining who haven't checked in for {INACTIVITY_DAYS}+ days —
            worth a call to their parent to check in.
          </p>

          {managingTemplates && (
            <div className="bg-court-900 border border-court-700 rounded-xl p-4 mb-3 space-y-3">
              <div className="space-y-2">
                {templates.map((t) =>
                  editingTemplateId === t.id ? (
                    <form
                      key={t.id}
                      onSubmit={handleSaveTemplateEdit}
                      className="space-y-2 text-xs bg-court-800 rounded-md px-3 py-3"
                    >
                      <input
                        value={editTemplateName}
                        onChange={(e) => setEditTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="w-full bg-court-900 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                      />
                      <textarea
                        value={editTemplateBody}
                        onChange={(e) => setEditTemplateBody(e.target.value)}
                        rows={5}
                        className="w-full bg-court-900 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!editTemplateName.trim() || !editTemplateBody.trim()}
                          className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-3 py-1.5 rounded-md text-xs disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditTemplate}
                          className="text-line-dim hover:text-line font-medium px-2 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div key={t.id} className="flex items-start justify-between gap-3 text-xs bg-court-800 rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-line">{t.name}</p>
                        <p className="text-line-dim mt-0.5 whitespace-pre-wrap">
                          {t.body.length > 160 ? `${t.body.slice(0, 160)}…` : t.body}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => startEditTemplate(t)}
                          className="text-chalk hover:text-chalk-bright font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="text-danger hover:text-danger/80 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              <form onSubmit={handleAddTemplate} className="space-y-2 pt-3 border-t border-court-700">
                <p className="text-xs text-line-dim">
                  Add your own template — use <code className="text-line">{'{name}'}</code> and{' '}
                  <code className="text-line">{'{days}'}</code> and they'll be filled in automatically when sent.
                  Plain text works most reliably — some WhatsApp apps garble emoji in pre-filled messages.
                </p>
                <input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template name (e.g. Holiday offer)"
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
                <textarea
                  value={newTemplateBody}
                  onChange={(e) => setNewTemplateBody(e.target.value)}
                  placeholder="Message text…"
                  rows={4}
                  className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
                />
                <button
                  type="submit"
                  disabled={!newTemplateName.trim() || !newTemplateBody.trim()}
                  className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
                >
                  Add template
                </button>
              </form>
            </div>
          )}

          {inactiveError && <p className="text-sm text-danger mb-2">{inactiveError}</p>}
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {inactiveLoading && <p className="px-5 py-6 text-sm text-line-dim">Checking attendance…</p>}
            {!inactiveLoading && inactive.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">Everyone's been showing up — nothing to flag.</p>
            )}
            <div className="divide-y divide-court-800">
              {inactive.map((s) => {
                const phone = normalizePhone(s.phone)
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-line-dim">
                        {s.lastVisit
                          ? `Last seen ${new Date(s.lastVisit).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}`
                          : `Never checked in since joining ${new Date(`${s.join_date}T00:00:00`).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}`}
                        {' · '}{s.daysSince} days ago
                      </p>
                    </div>
                    {phone ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                        <a
                          href={`tel:${phone}`}
                          className="text-xs bg-danger/15 hover:bg-danger/25 text-danger px-3 py-1.5 rounded-md font-medium transition-colors"
                        >
                          Call {s.phone}
                        </a>
                        <button
                          onClick={() => openWhatsappModal(s)}
                          className="text-xs bg-net/15 hover:bg-net/25 text-net px-3 py-1.5 rounded-md font-medium transition-colors"
                        >
                          WhatsApp
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-line-dim shrink-0">No phone on file</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* RENEWALS */}
        <section id="classes-ending-soon" className="mb-8 scroll-mt-4">
          <h2 className="font-display text-lg tracking-wide mb-3">CLASSES ENDING SOON</h2>
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {renewalsLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!renewalsLoading && renewals.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No members are close to running out right now.</p>
            )}
            <div className="divide-y divide-court-800">
              {renewals.map((s) => {
                const phone = normalizePhone(s.phone)
                return (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-line-dim">
                        {s.remaining_classes <= 0 ? 'Package finished' : '1 class left'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          className="text-xs bg-danger/15 hover:bg-danger/25 text-danger px-3 py-1.5 rounded-md font-medium transition-colors"
                        >
                          Call {s.phone}
                        </a>
                      )}
                      <button
                        onClick={() => handleSendRenewal(s)}
                        className="text-xs bg-chalk/15 hover:bg-chalk/25 text-chalk px-3 py-1.5 rounded-md font-medium transition-colors"
                      >
                        {sentId === s.id ? 'Opened ✓' : 'Send reminder on WhatsApp'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* PENDING PAYMENTS */}
        <section className="mb-8">
          <h2 className="font-display text-lg tracking-wide mb-3">PENDING PAYMENTS</h2>
          <p className="text-xs text-line-dim mb-3">
            Walk-ins logged as Pending (e.g. paying after their session) — mark them Paid
            once they've settled up so they stop showing here.
          </p>
          {pendingError && <p className="text-sm text-danger mb-2">{pendingError}</p>}
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {pendingLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!pendingLoading && pending.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No pending payments — everyone's settled up.</p>
            )}
            <div className="divide-y divide-court-800">
              {pending.map((row) => (
                <div key={row.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-line-dim">
                      {row.activity}{row.court ? ` · Court ${row.court}` : ''} · {row.time ? formatTime(row.time) : ''}
                      {row.amount ? ` · AED ${Number(row.amount).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMarkPaid(row)}
                    disabled={markingId === row.key}
                    className="text-xs bg-net/15 hover:bg-net/25 text-net px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-60 shrink-0"
                  >
                    {markingId === row.key ? 'Saving…' : 'Mark as Paid'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TODAY'S WALK-INS */}
        <section>
          <h2 className="font-display text-lg tracking-wide mb-3">TODAY'S WALK-INS</h2>
          <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
            {walkInsLoading && <p className="px-5 py-6 text-sm text-line-dim">Loading…</p>}
            {!walkInsLoading && todaysWalkIns.length === 0 && (
              <p className="px-5 py-6 text-sm text-line-dim">No walk-ins logged yet today.</p>
            )}
            <div className="divide-y divide-court-800">
              {todaysWalkIns.map((row) => (
                <div key={row.key} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-line-dim">
                      {row.activity}{row.court ? ` · Court ${row.court}` : ''} · {formatTime(row.time)}
                      {row.amount ? ` · AED ${Number(row.amount).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${row.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'}`}>
                    {row.payment_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* WHATSAPP COMPOSER — pick a template, tweak it, or just write your own */}
      {whatsappStudent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
          <div className="bg-court-900 border border-court-700 rounded-xl p-5 w-full max-w-md">
            <h3 className="font-display text-lg tracking-wide mb-1">MESSAGE {whatsappStudent.full_name.toUpperCase()}</h3>
            <p className="text-xs text-line-dim mb-4">{whatsappStudent.phone || 'No phone on file'}</p>

            {templates.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-line-dim mb-1.5">Start from a template:</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickWhatsappTemplate(t.id)}
                      className="text-xs bg-court-800 hover:bg-court-700 border border-court-600 px-3 py-1.5 rounded-md font-medium transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={whatsappMessage}
              onChange={(e) => setWhatsappMessage(e.target.value)}
              placeholder="Pick a template above, or just type your own message here…"
              rows={6}
              className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
            />
            <p className="text-xs text-line-dim mt-1.5">
              Leave this blank to just open the chat with nothing typed yet.
            </p>

            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={closeWhatsappModal}
                className="text-line-dim hover:text-line font-medium text-sm px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={sendWhatsappMessage}
                className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm"
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
