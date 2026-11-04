import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <main className="fallback"><img src="/icon.svg" alt="" /><h1>This page is not here.</h1><p>Your entries are still on the calendar.</p><Link to="/calendar" search={{ date: undefined }}>Return to calendar</Link></main>,
  errorComponent: ({ reset }) => <main className="fallback"><h1>Something went wrong.</h1><p>Try again to return to your day.</p><button className="primary" onClick={reset}>Try again</button><a href="/">Reload Tickmark</a></main>,
})
