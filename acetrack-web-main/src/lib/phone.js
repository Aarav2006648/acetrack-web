// Normalizes a UAE mobile number to a single canonical form (971XXXXXXXX)
// regardless of how staff typed it in — with or without the leading 0,
// with spaces/dashes, etc. Used everywhere two phone numbers need to be
// compared: WhatsApp links, duplicate-member detection, and merging a
// walk-in guest's repeat visits into one row.
export function normalizePhone(phone) {
  if (!phone) return ''

  let digits = String(phone).replace(/\D/g, '')

  // Local mobile typed without the leading 0 (e.g. "501234567" instead of
  // "0501234567") — treat it the same as if the 0 had been there.
  if (/^5\d{8}$/.test(digits)) {
    digits = `0${digits}`
  }

  // 05XXXXXXXX -> 971XXXXXXXX
  if (digits.startsWith('05') && digits.length === 10) {
    digits = `971${digits.slice(1)}`
  }

  return digits
}

// A guest's key for grouping repeat visits into one person: their
// normalized phone when they gave one, falling back to their name if
// not. Shared by the All Clients directory and the per-person history
// page so both agree on how a walk-in's visits get grouped.
export function guestKeyFor(guestPhone, guestName) {
  const normalized = normalizePhone(guestPhone)
  if (normalized) return `phone:${normalized}`
  return `name:${(guestName || 'Unknown guest').trim().toLowerCase()}`
}
