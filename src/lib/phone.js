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
