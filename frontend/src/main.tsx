import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = window.document.documentElement
const stored = localStorage.getItem('applywise-ui')
if (stored) {
  try {
    const parsed = JSON.parse(stored)
    if (parsed.state?.theme === 'dark') root.classList.add('dark')
    else if (parsed.state?.theme === 'light') root.classList.add('light')
    else if (parsed.state?.theme === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark')
      else root.classList.add('light')
    }
  } catch {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark')
    else root.classList.add('light')
  }
} else {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark')
  else root.classList.add('light')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
