import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Order matters: tokens first, then general -> specific.
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/workspace.css'
import './styles/outputs.css'
import './styles/landing.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
