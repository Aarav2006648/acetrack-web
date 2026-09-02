// Groups a list of visit rows (attendance, rentals, etc.) by calendar
// month, newest month first. Used anywhere staff can drill into a
// person's history "by month" instead of one long scrolling list —
// the member attendance history and the All Clients visit-history popup.
//
// `dateField` is the property on each row holding a "YYYY-MM-DD" string
// (or anything Date() can parse the year/month out of).
export function groupVisitsByMonth(rows, dateField = 'date') {
  const map = new Map()

  for (const row of rows) {
    const dateStr = row[dateField]
    if (!dateStr) continue

    const monthKey = String(dateStr).slice(0, 7) // "YYYY-MM"

    if (!map.has(monthKey)) map.set(monthKey, [])
    map.get(monthKey).push(row)
  }

  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString('en-AE', {
        month: 'long',
        year: 'numeric',
      }),
      items,
    }))
}
