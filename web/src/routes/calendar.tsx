import { createFileRoute } from '@tanstack/react-router'
import { CalendarPage } from '../features/calendar/CalendarPage'
export const Route = createFileRoute('/calendar')({
  validateSearch: (search: Record<string, unknown>): { date?: string } => ({ date: typeof search.date === 'string' ? search.date : undefined }),
  component: CalendarRoute,
})
function CalendarRoute() {
  const { date } = Route.useSearch()
  return <CalendarPage date={date} />
}
