import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabaseClient'

export default function Rentals() {
  const [rateCard, setRateCard] = useState([])
  const [rentals, setRentals] = useState([])

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [courtNumber, setCourtNumber] = useState('')
  const [rateId, setRateId] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('Paid')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadRateCard()
    loadRentals()
  }, [])

  async function loadRateCard() {
    const { data } = await supabase.from('rate_card').select('*').eq('activity', 'Billiards').eq('status', 'Active').order('unit_minutes')
    setRateCard(data || [])
    if (data && data.length > 0) {
      setRateId(data[0].id)
      setCustomPrice(String(data[0].price))
    }
  }

  async function loadRentals() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('rentals').select('*').eq('booking_date', today).order('start_time', { ascending: false })
    setRentals(data || [])
  }

  function handleRateChange(id) {
    setRateId(id)
    const rate = rateCard.find((r) => r.id === id)
    if (rate) setCustomPrice(String(rate.price))
  }

  async function handleStart(e) {
    e.preventDefault()
    setError('')

    if (!guestName) {
      setError('Enter a name for the walk-in.')
      return
    }

    const rate = rateCard.find((r) => r.id === rateId)
    if (!rate) {
      setError('No rate selected.')
      return
    }

    const price = customPrice !== '' ? Number(customPrice) : rate.price

    setSaving(true)
    const start = new Date()
    const end = new Date(start.getTime() + rate.unit_minutes * 60000)

    const { error } = await supabase.from('rentals').insert({
      student_id: null,
      guest_name: guestName,
      guest_phone: guestPhone || null,
      activity: 'Billiards',
      court_number: courtNumber || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration: rate.unit_minutes,
      price,
      payment_status: paymentStatus,
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setGuestName('')
    setGuestPhone('')
    setCourtNumber('')
    await loadRentals()
  }

  const todayTotal = rentals.filter((r) => r.payment_status === 'Paid').reduce((sum, r) => sum + Number(r.price || 0), 0)

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <header className="mb-6">
          <h1 className="font-display text-3xl">TABLE RENTALS</h1>
          <p className="text-line-dim text-sm mt-1">Billiards — start a timed table booking for a walk-in</p>
        </header>

        <form onSubmit={handleStart} className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4 mb-8">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Name</label>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Phone (optional)</label>
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Table number</label>
              <input value={courtNumber} onChange={(e) => setCourtNumber(e.target.value)} placeholder="e.g. 2"
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Duration</label>
              <select value={rateId} onChange={(e) => handleRateChange(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk">
                {rateCard.map((r) => (
                  <option key={r.id} value={r.id}>{r.unit_minutes} min — AED {r.price}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Amount charged (AED)</label>
              <input type="number" step="0.01" min="0" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk" />
            </div>
            <div>
              <label className="block text-xs text-line-dim mb-1.5">Payment</label>
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk">
                <option>Paid</option><option>Pending</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-line-dim">Amount pre-fills from the rate card — edit it if they paid a different amount (half session, offer, etc).</p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={saving || rateCard.length === 0}
            className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-5 py-2.5 rounded-md text-sm disabled:opacity-60">
            {saving ? 'Starting…' : 'Start rental'}
          </button>
          {rateCard.length === 0 && (
            <p className="text-xs text-danger">No billiards rates found — run migration_2.sql in Supabase to add the rate card.</p>
          )}
        </form>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg tracking-wide">TODAY'S RENTALS</h2>
          <p className="text-sm text-line-dim">Collected: <span className="text-chalk font-mono">AED {todayTotal.toFixed(0)}</span></p>
        </div>

        <div className="bg-court-900 border border-court-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-line-dim text-xs uppercase border-b border-court-700">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Table</th>
                <th className="px-5 py-3 font-medium">Duration</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-court-800">
              {rentals.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 font-medium">{r.guest_name || 'Unknown'}</td>
                  <td className="px-5 py-3 text-line-dim">{r.court_number || '—'}</td>
                  <td className="px-5 py-3 font-mono">{r.duration} min</td>
                  <td className="px-5 py-3 font-mono">AED {Number(r.price).toFixed(0)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${r.payment_status === 'Paid' ? 'bg-net/15 text-net' : 'bg-chalk/15 text-chalk'}`}>
                      {r.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
              {rentals.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-line-dim text-sm">No table rentals logged today yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
