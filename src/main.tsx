// Literata with its optical-size axis: large headings get its display cut. Atkinson
// Hyperlegible Next, upright only (the app sets no italics).
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTheme, readTheme } from './lib/theme'

// index.html already set the colours; this also sets the browser frame colour.
applyTheme(readTheme())

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
