import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-chalk" />
            <span className="font-display text-2xl tracking-wide">ACETRACK</span>
          </div>
          <p className="text-line-dim text-sm font-mono">Al Hayatt Badminton &amp; Billiards Club</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-court-900 border border-court-700 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-line-dim mb-1.5">Staff email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm text-line focus:outline-none focus:ring-2 focus:ring-chalk"
              placeholder="staff@alhayatt.club"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-line-dim mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm text-line focus:outline-none focus:ring-2 focus:ring-chalk"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-chalk hover:bg-chalk-bright text-court-950 font-semibold py-2.5 rounded-md transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-line-dim mt-4">
          Accounts are created in Supabase Auth by the club admin.
        </p>
      </div>
    </div>
  )
}
