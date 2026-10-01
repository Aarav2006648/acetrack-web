// WhatsApp message templates staff can send to an inactive member's
// parent straight from the Announcements page. Templates live in this
// browser's localStorage (per staff device) so adding one doesn't need
// any backend change — the two defaults below always show up even
// before anyone's added their own, and nothing is lost if storage is
// ever empty or blocked.
//
// Note: the first two defaults used to include emoji (🏸 ✨ etc). Some
// WhatsApp apps — the Windows desktop app in particular — garble those
// into "�" when the message is pre-filled via a wa.me link, so the
// defaults below are plain text instead. Keep that in mind if adding
// your own template with emoji — test it once before relying on it.

const STORAGE_KEY = 'acetrack_whatsapp_templates'
const VERSION_KEY = 'acetrack_whatsapp_templates_version'
const SCHEMA_VERSION = 2

export const DEFAULT_TEMPLATES = [
  {
    id: 'rejoin-offer',
    name: 'We miss you + rejoining offer',
    body: `WE MISS YOU AT AL HAYATH BADMINTON ACADEMY!

Dear Parent,

We noticed that {name} has been away from our coaching classes for the past {days} days. We would love to welcome them back!

Special Rejoining Offers & Discounts are now available!

It's a great time to get back on court, stay active, improve skills, and continue the badminton journey with us.

For more details or to know about our special offers, please feel free to contact us on +971 50 682 1367.

We look forward to seeing your child back at Al Hayatt Badminton Academy!

Come back - Get active - Keep improving!`,
  },
  {
    id: 'checking-in',
    name: 'Just checking in',
    body: `Hi! We haven't seen {name} at Al Hayatt in {days} days and just wanted to check in - hope everything's okay! Let us know if you'd like to book them back in for a session.`,
  },
]

// The exact wording the two defaults used to have, before the emoji were
// removed (see note above) — used only to recognize an unedited old
// default during the one-time migration below, never shown to anyone.
const LEGACY_DEFAULT_BODIES = {
  'rejoin-offer': `🏸 WE MISS YOU AT AL HAYATH BADMINTON ACADEMY! 🏸

Dear Parent, 😊

We noticed that {name} has been away from our coaching classes for the past {days} days. We would love to welcome them back! ❤️

✨ Special Rejoining Offers & Discounts are now available! ✨

It's a great time to get back on court, stay active, improve skills, and continue the badminton journey with us. 🏸🔥

📞 For more details or to know about our special offers, please feel free to contact us on +971 50 682 1367.

We look forward to seeing your child back at Al Hayatt Badminton Academy! 🏸💙

Come back • Get active • Keep improving! 🌟`,
  'checking-in': `Hi! 👋 We haven't seen {name} at Al Hayatt in {days} days and just wanted to check in — hope everything's okay! Let us know if you'd like to book them back in for a session. 🏸`,
}

export function loadTemplates() {
  let templates = DEFAULT_TEMPLATES

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) templates = parsed
    }
  } catch {
    // localStorage can be unavailable/blocked — just fall back to defaults
  }

  try {
    const storedVersion = Number(localStorage.getItem(VERSION_KEY) || '1')
    if (storedVersion < SCHEMA_VERSION) {
      // One-time cleanup: upgrade anyone's already-saved copy of the two
      // built-in templates to the emoji-free wording, but only if they
      // never edited it — a template someone customized, or added
      // themselves, is left exactly as they made it.
      templates = templates.map((t) => {
        const legacyBody = LEGACY_DEFAULT_BODIES[t.id]
        const currentDefault = DEFAULT_TEMPLATES.find((d) => d.id === t.id)
        if (legacyBody && currentDefault && t.body === legacyBody) {
          return { ...t, name: currentDefault.name, body: currentDefault.body }
        }
        return t
      })
      saveTemplates(templates)
      try {
        localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
      } catch {
        // ignore — worst case this runs again next load, which is harmless
      }
    }
  } catch {
    // ignore — migration is best-effort, never block loading templates
  }

  return templates
}

export function saveTemplates(templates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch {
    // nothing to persist to if storage is blocked — the add still works
    // for the rest of this visit, it just won't be remembered next time
  }
}

// Swaps {name} and {days} in a template body for the real member's
// details. Unknown/extra placeholders are left as-is rather than
// breaking the message.
export function fillTemplate(body, { name, days }) {
  return body
    .split('{name}').join(name || 'there')
    .split('{days}').join(days != null ? String(days) : 'a while')
}
