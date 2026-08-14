import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginApp } from './LoginApp.tsx'
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('desktop renderer: missing #root')

createRoot(root).render(
  <StrictMode>
    <LoginApp />
  </StrictMode>,
)
