import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { initAnalytics } from './lib/analytics.js'
import { listenForInstall, listenForLaunchedFiles, registerServiceWorker } from './lib/pwa.js'
import './styles/index.css'

initAnalytics()
registerServiceWorker()
listenForInstall()
listenForLaunchedFiles()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
