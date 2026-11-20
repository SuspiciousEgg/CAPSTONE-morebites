import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { LuChevronDown } from 'react-icons/lu'
import './CustomSelect.css'

function flattenOptions(children) {
  const list = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) {
      list.push(...flattenOptions(child.props.children))
      return
    }
    if (child.type === 'option') {
      const rawChildren = child.props.children
      const label = Array.isArray(rawChildren)
        ? rawChildren
            .map((c) => (c == null || typeof c === 'boolean' ? '' : String(c)))
            .join('')
        : rawChildren == null || typeof rawChildren === 'boolean'
          ? ''
          : String(rawChildren)
      const val =
        child.props.value !== undefined ? String(child.props.value) : label
      list.push({
        value: val,
        label,
        disabled: Boolean(child.props.disabled),
      })
    }
  })
  return list
}

export default function CustomSelect({
  value,
  onChange,
  children,
  className = '',
  style,
  id,
  name,
  disabled = false,
  title,
  'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 160, flipUp: false })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const options = useMemo(() => flattenOptions(children), [children])
  const strValue = value == null ? '' : String(value)

  const selectedOption = useMemo(() => {
    return (
      options.find((opt) => opt.value === strValue) ||
      options[0] || { value: '', label: '' }
    )
  }, [options, strValue])

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const menuWidth = Math.max(rect.width, 130)
    const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8)
    const left = Math.min(Math.max(8, rect.left), maxLeft)
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedHeight = Math.min(240, options.length * 36 + 10)
    const flipUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight

    setCoords({
      top: flipUp ? rect.top - 5 : rect.bottom + 5,
      left,
      width: menuWidth,
      flipUp,
    })
  }, [options.length])

  useEffect(() => {
    if (!open) return undefined
    updatePosition()

    const handleOutsideClick = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handleScrollOrResize = (e) => {
      if (menuRef.current && e?.target && menuRef.current.contains(e.target)) {
        return
      }
      updatePosition()
    }

    document.addEventListener('mousedown', handleOutsideClick, true)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('resize', handleScrollOrResize)
    window.addEventListener('scroll', handleScrollOrResize, true)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', handleScrollOrResize)
      window.removeEventListener('scroll', handleScrollOrResize, true)
    }
  }, [open, updatePosition])

  const handleTriggerClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (!open) {
      updatePosition()
    }
    setOpen((prev) => !prev)
  }

  const handleSelectOption = (e, opt) => {
    e.preventDefault()
    e.stopPropagation()
    if (opt.disabled) return
    setOpen(false)
    if (onChange && opt.value !== strValue) {
      onChange({
        target: { value: opt.value, name, id },
        currentTarget: { value: opt.value, name, id },
      })
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={style}
        className={`mb-select-trigger${className ? ` ${className}` : ''}${open ? ' open' : ''}`}
        onClick={handleTriggerClick}
      >
        <span className="mb-select-label">{selectedOption.label}</span>
        <LuChevronDown size={15} className="mb-select-chevron" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="mb-select-menu"
            style={{
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              ...(coords.flipUp
                ? { bottom: `${window.innerHeight - coords.top}px` }
                : { top: `${coords.top}px` }),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === strValue
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  disabled={opt.disabled}
                  aria-selected={isSelected}
                  title={opt.label}
                  className={`mb-select-option${isSelected ? ' selected' : ''}`}
                  onClick={(e) => handleSelectOption(e, opt)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
