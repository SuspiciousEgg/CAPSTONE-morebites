import { useEffect, useRef, useState } from 'react'
import { IconMore } from './Icons'
import './RowActionMenu.css'

export function MoreButton({ onClick, label = 'More actions', className = '' }) {
  return (
    <button
      type="button"
      className={`ram-more ${className}`.trim()}
      aria-label={label}
      onClick={onClick}
    >
      <IconMore />
    </button>
  )
}

export function RowActionMenuPopup({ menuRef, top, left, children }) {
  if (top == null || left == null) return null

  return (
    <div
      className="ram-menu ram-menu-popup"
      ref={menuRef}
      style={{ top, left }}
      role="menu"
    >
      {children}
    </div>
  )
}

export function useRowActionMenu() {
  const menuRef = useRef(null)
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    function onDoc(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !e.target.closest('.ram-more')
      ) {
        setMenu(null)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function toggleMenu(event, key, extra = {}) {
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 170
    const estimatedHeight = 48
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < estimatedHeight + 16
    setMenu((prev) =>
      prev?.key === key
        ? null
        : {
            key,
            top: openUp ? Math.max(12, rect.top - estimatedHeight - 8) : rect.bottom + 8,
            left: Math.min(
              Math.max(12, rect.right - menuWidth),
              window.innerWidth - menuWidth - 12,
            ),
            ...extra,
          },
    )
  }

  function closeMenu() {
    setMenu(null)
  }

  return { menuRef, menu, setMenu, toggleMenu, closeMenu }
}
