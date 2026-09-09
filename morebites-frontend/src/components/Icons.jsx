import {
  LuLayoutGrid,
  LuPackage,
  LuUtensils,
  LuUsers,
  LuUser,
  LuSettings,
  LuLogOut,
  LuShoppingCart,
  LuBell,
} from 'react-icons/lu'
import { TbClipboardList } from 'react-icons/tb'
import { FaMotorcycle } from 'react-icons/fa'
import { HiChartBar } from 'react-icons/hi2'
import { MdSportsMotorsports } from 'react-icons/md'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconGrid({ size = 20, width, height, className = '', ...props }) {
  return <LuLayoutGrid size={width || height || size} className={className} {...props} />
}

export function IconOrders({ size = 20, width, height, className = '', ...props }) {
  return <TbClipboardList size={width || height || size} className={className} {...props} />
}

export function IconMenu({ size = 20, width, height, className = '', ...props }) {
  return <LuUtensils size={width || height || size} className={className} {...props} />
}

export function IconUtensils({ size = 20, width, height, className = '', ...props }) {
  return <LuUtensils size={width || height || size} className={className} {...props} />
}

export function IconInventory({ size = 20, width, height, className = '', ...props }) {
  return <LuPackage size={width || height || size} className={className} {...props} />
}

export function IconDispatch({ size = 20, width, height, className = '', ...props }) {
  return <FaMotorcycle size={width || height || size} className={className} {...props} />
}

export function IconReports({ size = 20, width, height, className = '', ...props }) {
  return <HiChartBar size={width || height || size} className={className} {...props} />
}

export function IconHelmet({ size = 20, width, height, className = '', ...props }) {
  return <MdSportsMotorsports size={width || height || size} className={className} {...props} />
}

export function IconCustomers({ size = 20, width, height, className = '', ...props }) {
  return <LuUsers size={width || height || size} className={className} {...props} />
}

export function IconAccount({ size = 20, width, height, className = '', ...props }) {
  return <LuUser size={width || height || size} className={className} {...props} />
}

export function IconArchive(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" {...stroke} />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" {...stroke} />
    </svg>
  )
}

export function IconDrivers(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" {...stroke} />
    </svg>
  )
}

export function IconBlacklist(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M7 7l10 10" {...stroke} />
    </svg>
  )
}

export function IconBell({ size = 20, width, height, className = '', ...props }) {
  return <LuBell size={width || height || size} className={className} {...props} />
}

export function IconCart({ size = 20, width, height, className = '', ...props }) {
  return <LuShoppingCart size={width || height || size} className={className} {...props} />
}

export function IconClipboard({ size = 20, width, height, className = '', ...props }) {
  return <TbClipboardList size={width || height || size} className={className} {...props} />
}

export function IconBike({ size = 20, width, height, className = '', ...props }) {
  return <FaMotorcycle size={width || height || size} className={className} {...props} />
}

export function IconBox({ size = 20, width, height, className = '', ...props }) {
  return <LuPackage size={width || height || size} className={className} {...props} />
}

export function IconUser({ size = 18, width, height, className = '', ...props }) {
  return <LuUser size={width || height || size} className={className} {...props} />
}

export function IconShield(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" {...stroke} />
    </svg>
  )
}

export function IconGear({ size = 20, width, height, className = '', ...props }) {
  return <LuSettings size={width || height || size} className={className} {...props} />
}

export function IconChevron(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M9 6l6 6-6 6" {...stroke} />
    </svg>
  )
}

export function IconChevronDown(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M6 9l6 6 6-6" {...stroke} />
    </svg>
  )
}

export function IconSearch(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="11" cy="11" r="7" {...stroke} />
      <path d="M20 20l-3.5-3.5" {...stroke} />
    </svg>
  )
}

export function IconRefresh(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" {...stroke} />
      <path d="M20 4v5h-5" {...stroke} />
    </svg>
  )
}

export function IconCheck(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M8 12.5l2.5 2.5L16 10" {...stroke} />
    </svg>
  )
}

export function IconClock(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 7v5l3 2" {...stroke} />
    </svg>
  )
}

export function IconPlus(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </svg>
  )
}

export function IconMinus(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M5 12h14" {...stroke} />
    </svg>
  )
}

export function IconMore(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBag(props) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M6 8h12l-1 11H7L6 8z" {...stroke} />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" {...stroke} />
      <path d="M4 8h16" {...stroke} />
    </svg>
  )
}

export function IconTruck(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M3 7h11v9H3z" {...stroke} />
      <path d="M14 10h4l3 3v3h-7" {...stroke} />
      <circle cx="7" cy="18" r="1.8" {...stroke} />
      <circle cx="17" cy="18" r="1.8" {...stroke} />
    </svg>
  )
}

export function IconDoc(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...stroke} />
      <path d="M14 3v5h5M9 13h6M9 17h4" {...stroke} />
    </svg>
  )
}

export function IconEdit(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" {...stroke} />
      <path d="M13 6l3 3" {...stroke} />
    </svg>
  )
}

export function IconTrash(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" {...stroke} />
    </svg>
  )
}

export function IconRestore(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" {...stroke} />
      <path d="M3 4v5h5" {...stroke} />
    </svg>
  )
}

export function IconImage(props) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" {...stroke} />
      <circle cx="9" cy="10" r="2" {...stroke} />
      <path d="M3 16l5-4 4 3 3-2 6 5" {...stroke} />
    </svg>
  )
}

export function IconClose(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M6 6l12 12M18 6L6 18" {...stroke} />
    </svg>
  )
}

export function IconWarning(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 3l10 18H2L12 3z" {...stroke} />
      <path d="M12 10v4M12 17h.01" {...stroke} />
    </svg>
  )
}

export function IconEye(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...stroke} />
      <circle cx="12" cy="12" r="3" {...stroke} />
    </svg>
  )
}

export function IconDownload(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" {...stroke} />
    </svg>
  )
}

export function IconStar(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6L12 16.8 6.7 19.7l1-6L3.3 9.4l6-.9L12 3z"
        {...stroke}
      />
    </svg>
  )
}

export function IconSend(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M4 12l16-8-6 16-2-6-8-2z" {...stroke} />
    </svg>
  )
}

export function IconMapPin(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" {...stroke} />
      <circle cx="12" cy="9" r="2.5" {...stroke} />
    </svg>
  )
}

export function IconFile(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" {...stroke} />
      <path d="M14 3v5h5" {...stroke} />
    </svg>
  )
}

export function IconCalendar(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" {...stroke} />
      <path d="M8 3v4M16 3v4M3 10h18" {...stroke} />
    </svg>
  )
}

export function IconPhone(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M7 3h3l1.5 4-2 1.5a12 12 0 0 0 5 5L16 12l4 1.5V17a2 2 0 0 1-2 2A14 14 0 0 1 5 5a2 2 0 0 1 2-2z"
        {...stroke}
      />
    </svg>
  )
}

export function IconStarFill(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6L12 16.8 6.7 19.7l1-6L3.3 9.4l6-.9L12 3z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

export function IconId(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke} />
      <circle cx="9" cy="12" r="2.2" {...stroke} />
      <path d="M14 10h5M14 14h4" {...stroke} />
    </svg>
  )
}

export function IconLogout({ size = 18, width, height, className = '', ...props }) {
  return <LuLogOut size={width || height || size} className={className} {...props} />
}

export function IconFilter(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" {...stroke} />
    </svg>
  )
}

export function IconSliders(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" {...stroke} />
      <circle cx="16" cy="7" r="2.5" {...stroke} />
      <circle cx="8" cy="17" r="2.5" {...stroke} />
    </svg>
  )
}

export function IconUpload(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...props}>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" {...stroke} />
    </svg>
  )
}
