import { supabase } from './supabaseClient'
import { fetchAllRows } from './fetchAllRows'

// How many days of no check-ins before a still-active member gets flagged
// as "hasn't been seen" — tweak this single number if the club wants a
// shorter/longer window than a week. Shared by the Dashboard (which just
// needs the count) and Announcements (which needs the full list with
// contact details) so the two pages can never disagree on who counts.
export const INACTIVITY_DAYS = 7

function daysBetween(a, b) {
  return Math.floor((a - b) / (1000 * 60 * 60 * 24))
}

// Active members who still have classes left (or an unlimited package)
// but haven't checked in for INACTIVITY_DAYS+ days.
export async function loadInactiveMembers() {
  const [activeStudentsRes, attendanceRows] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, phone, join_date, remaining_classes, packages(is_unlimited)')
      .eq('status', 'Active'),
    fetchAllRows((from, to) =>
      supabase
        .from('attendance')
        .select('student_id, check_in_time')
        .not('student_id', 'is', null)
        .range(from, to)
    ),
  ])

  if (activeStudentsRes.error) throw activeStudentsRes.error

  const lastVisitByStudent = new Map()
  for (const row of attendanceRows) {
    const existing = lastVisitByStudent.get(row.student_id)
    if (!existing || row.check_in_time > existing) {
      lastVisitByStudent.set(row.student_id, row.check_in_time)
    }
  }

  const now = new Date()

  return (activeStudentsRes.data || [])
    .filter((s) => s.packages?.is_unlimited || s.remaining_classes > 0)
    .map((s) => {
      const lastVisit = lastVisitByStudent.get(s.id) || null
      // No visit on record yet — measure from their join date instead,
      // so a member who joined yesterday isn't immediately flagged.
      const referenceDate = lastVisit ? new Date(lastVisit) : new Date(`${s.join_date}T00:00:00`)
      return { ...s, lastVisit, daysSince: daysBetween(now, referenceDate) }
    })
    .filter((s) => s.daysSince >= INACTIVITY_DAYS)
    .sort((a, b) => b.daysSince - a.daysSince)
}
