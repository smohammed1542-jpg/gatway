import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import './responsive.css'
import './print.css'
import './landing.css'
import './erp-table.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--surface)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: 'var(--shadow-lg)',
            },
            success: {
              iconTheme: { primary: 'var(--color-success)', secondary: 'var(--surface)' },
            },
            error: {
              iconTheme: { primary: 'var(--color-danger)', secondary: 'var(--surface)' },
            },
          }}
        />
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
