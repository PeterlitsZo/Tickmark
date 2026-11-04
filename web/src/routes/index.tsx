import { createFileRoute, redirect } from '@tanstack/react-router'
import { today } from '../lib/time'
export const Route = createFileRoute('/')({ beforeLoad: () => { throw redirect({ to: '/calendar', search: { date: today() }, replace: true }) } })
