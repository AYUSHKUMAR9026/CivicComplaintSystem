import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import 'leaflet/dist/leaflet.css'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#11191a',
              color: '#eef8f5',
              boxShadow: '0 22px 60px -24px rgba(0, 0, 0, 0.85)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(180, 220, 213, 0.19)',
            },
            success: {
              iconTheme: {
                primary: '#65dece',
                secondary: '#0b1011',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#eef8f5',
              },
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
