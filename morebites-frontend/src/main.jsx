import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { MenuProvider } from './context/MenuContext'
import { InventoryProvider } from './context/InventoryContext'
import { DriverProvider } from './context/DriverContext'
import { OrdersProvider } from './context/OrdersContext'

import ErrorBoundary from './components/ErrorBoundary.jsx'

// Global lightweight tracker so every native <select> flips its chevron up while open
// and back down immediately when an option is chosen, Escape is pressed, or focus leaves.
if (typeof document !== 'undefined') {
  const closeAllOpenSelects = (except = null) => {
    document.querySelectorAll('select[data-select-open="true"]').forEach((el) => {
      if (el !== except) {
        el.removeAttribute('data-select-open')
      }
    })
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      const sel = e.target?.closest?.('select')
      if (!sel || sel.disabled) {
        closeAllOpenSelects()
        return
      }
      const isCurrentlyOpen = sel.getAttribute('data-select-open') === 'true'
      closeAllOpenSelects(sel)
      if (isCurrentlyOpen) {
        sel.removeAttribute('data-select-open')
      } else {
        sel.setAttribute('data-select-open', 'true')
      }
    },
    true,
  )

  document.addEventListener(
    'change',
    (e) => {
      const sel = e.target?.closest?.('select')
      if (sel) sel.removeAttribute('data-select-open')
    },
    true,
  )

  document.addEventListener(
    'blur',
    (e) => {
      const sel = e.target?.closest?.('select')
      if (sel) sel.removeAttribute('data-select-open')
    },
    true,
  )

  document.addEventListener(
    'keydown',
    (e) => {
      const sel = e.target?.closest?.('select')
      if (!sel) return
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') {
        sel.removeAttribute('data-select-open')
      } else if (e.key === ' ' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
        sel.setAttribute('data-select-open', 'true')
      }
    },
    true,
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <MenuProvider>
          <InventoryProvider>
            <DriverProvider>
              <OrdersProvider>
                <App />
              </OrdersProvider>
            </DriverProvider>
          </InventoryProvider>
        </MenuProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
