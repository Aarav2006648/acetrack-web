const PAGE_SIZE = 1000

// Supabase caps a single query at 1000 rows by default. This pages through
// with .range() so a query needing more than 1000 rows (client directories,
// full attendance history, etc.) still comes back complete instead of
// silently truncated.
export async function fetchAllRows(queryFn) {
  let rows = []
  let from = 0

  while (true) {
    const { data, error } = await queryFn(from, from + PAGE_SIZE - 1)
    if (error) throw error

    rows = rows.concat(data || [])

    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}
