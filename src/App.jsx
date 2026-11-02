import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Footer from './components/Footer.jsx'
import Header from './components/Header.jsx'
import Home from './components/Home.jsx'

const ToolPage = lazy(() => import('./components/ToolPage.jsx'))

export default function App() {
  const { pathname } = useLocation()
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
    </div>
  )
}
