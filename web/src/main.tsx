import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './styles/global.css'
import { NotificationHost, reportUpdateAvailable } from './components/NotificationViewport'

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false, networkMode: 'always' } } })
window.addEventListener('vite:preloadError', event => {
  event.preventDefault()
  // Do not reload automatically: a tab may contain an unsaved draft.
  reportUpdateAvailable()
})
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><NotificationHost><RouterProvider router={router} /></NotificationHost></QueryClientProvider></StrictMode>)
