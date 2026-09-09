import { useState } from 'react'
import InventoryStock from './InventoryStock'
import ExpiringStock from './ExpiringStock'
import './InventoryPage.css'

const TABS = [
  { id: 'stock', label: 'Stock List' },
  { id: 'expiring', label: 'Expiring Stock' },
]

export default function InventoryPage({ initialTab = 'stock' }) {
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="inv-page-wrap">
      <nav className="inv-tabs" aria-label="Inventory sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`inv-tab${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'expiring' ? <ExpiringStock /> : <InventoryStock onOpenExpiring={() => setTab('expiring')} />}
    </div>
  )
}
