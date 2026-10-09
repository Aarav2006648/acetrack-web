import { useState } from 'react'
import { saveTemplates } from '../lib/whatsappTemplates'

// Inline add/edit/delete UI for WhatsApp message templates — shared by
// the Announcements page (messaging one inactive member) and the All
// Clients page (broadcasting to several), so there's exactly one place
// that knows how to add/edit/delete a template, no matter where staff
// opened it from. `templates` is the current list, `onChange` gets the
// updated list back (the caller holds the actual state); this component
// also persists every change to localStorage itself via saveTemplates.
export default function TemplateManager({ templates, onChange }) {
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')

  function persist(next) {
    onChange(next)
    saveTemplates(next)
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim() || !newBody.trim()) return

    persist([...templates, { id: `custom-${Date.now()}`, name: newName.trim(), body: newBody.trim() }])
    setNewName('')
    setNewBody('')
  }

  function handleDelete(id) {
    persist(templates.filter((t) => t.id !== id))
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditName(t.name)
    setEditBody(t.body)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function handleSaveEdit(e) {
    e.preventDefault()
    if (!editName.trim() || !editBody.trim()) return

    persist(templates.map((t) => (t.id === editingId ? { ...t, name: editName.trim(), body: editBody.trim() } : t)))
    setEditingId(null)
  }

  return (
    <div className="bg-court-900 border border-court-700 rounded-xl p-4 space-y-3">
      <div className="space-y-2">
        {templates.map((t) =>
          editingId === t.id ? (
            <form
              key={t.id}
              onSubmit={handleSaveEdit}
              className="space-y-2 text-xs bg-court-800 rounded-md px-3 py-3"
            >
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Template name"
                className="w-full bg-court-900 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
                className="w-full bg-court-900 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!editName.trim() || !editBody.trim()}
                  className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-3 py-1.5 rounded-md text-xs disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
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
                <button onClick={() => startEdit(t)} className="text-chalk hover:text-chalk-bright font-medium">
                  Edit
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-danger hover:text-danger/80 font-medium">
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <form onSubmit={handleAdd} className="space-y-2 pt-3 border-t border-court-700">
        <p className="text-xs text-line-dim">
          Add your own template — use <code className="text-line">{'{name}'}</code> and{' '}
          <code className="text-line">{'{days}'}</code> and they'll be filled in automatically when sent.
          Plain text works most reliably — some WhatsApp apps garble emoji in pre-filled messages.
        </p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Template name (e.g. Holiday offer)"
          className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
        />
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Message text…"
          rows={4}
          className="w-full bg-court-800 border border-court-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-chalk"
        />
        <button
          type="submit"
          disabled={!newName.trim() || !newBody.trim()}
          className="bg-chalk hover:bg-chalk-bright text-court-950 font-semibold px-4 py-2 rounded-md text-sm disabled:opacity-60"
        >
          Add template
        </button>
      </form>
    </div>
  )
}
