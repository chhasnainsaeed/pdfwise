import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppStatus } from './components/AppStatus.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import Home from './components/Home.jsx'
import { collectSharedFiles } from './lib/pwa.js'

const ToolPage = lazy(() => import('./components/ToolPage.jsx'))

export default function App() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  // Files shared into the installed app land on /?shared=1 (see scripts/sw-template.js).
  useEffect(() => {
    if (!new URLSearchParams(search).has('shared')) return
    navigate('/', { replace: true })
    collectSharedFiles()
  }, [search, navigate])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const isHome = pathname === '/'

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Suspense
          fallback={
            <div className="page-loading">
              <span className="spinner" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/:toolId" element={<ToolPage />} />
          </Routes>
        </Suspense>
      </main>
      {isHome && <Footer />}
      <CommandPalette />
      <AppStatus />
    </div>
  )
}
