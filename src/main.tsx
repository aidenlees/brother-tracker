// Weight and optical-size axes: large headings get Fraunces' display cut.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/inter'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
