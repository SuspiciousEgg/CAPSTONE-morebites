import { createContext, useContext, useMemo, useState } from 'react'

const InventoryContext = createContext(null)

function computeStatus(stock, reorderPoint, expiryDate) {
  const qty = Number(stock) || 0
  const reorder = Number(reorderPoint) || 0
  let daysLeft = null

  if (expiryDate) {
    const now = new Date()
    const end = new Date(`${expiryDate}T00:00:00`)
    const diff = end.getTime() - now.getTime()
    daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (daysLeft < 0) return { status: 'Expired', daysLeft }
    if (daysLeft === 0) return { status: 'Expires Today', daysLeft }
    if (daysLeft <= 7) return { status: 'Expiring Soon', daysLeft }
  }

  if (qty <= 0) return { status: 'Out of Stock', daysLeft }
  if (qty <= reorder) return { status: 'Low Stock', daysLeft }
  return { status: 'Sufficient', daysLeft }
}

export function InventoryProvider({ children }) {
  const [inventoryItems, setInventoryItems] = useState([])
  const [activityLogs, setActivityLogs] = useState([])

  const addLog = (payload) => {
    const log = {
      id: Date.now() + Math.random(),
      date: new Date().toISOString(),
      ...payload,
    }
    setActivityLogs((prev) => [log, ...prev])
  }

  const addItem = (itemData) => {
    const now = new Date().toISOString()
    const currentStock = Number(itemData.currentStock) || 0
    const reorderPoint = Number(itemData.reorderPoint) || 0
    const { status, daysLeft } = computeStatus(currentStock, reorderPoint, itemData.expiryDate)

    const item = {
      id: Date.now(),
      name: itemData.name.trim(),
      category: itemData.category,
      currentStock,
      reorderPoint,
      datePlaced: itemData.datePlaced || '',
      expiryDate: itemData.expiryDate || '',
      daysLeft,
      status,
      createdAt: now,
      lastUpdated: now,
    }
    setInventoryItems((prev) => [item, ...prev])
    addLog({
      itemName: item.name,
      category: item.category,
      action: 'New Stock',
      quantity: `+${item.currentStock} pcs`,
      newStock: `${item.currentStock} pcs`,
      reason: 'Initial Stock Addition',
      performedBy: 'Admin',
    })
  }

  const restockItem = (id, quantityToAdd) => {
    const qty = Number(quantityToAdd) || 0
    if (qty <= 0) return

    setInventoryItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const currentStock = item.currentStock + qty
        const { status, daysLeft } = computeStatus(currentStock, item.reorderPoint, item.expiryDate)
        const updated = {
          ...item,
          currentStock,
          status,
          daysLeft,
          lastUpdated: new Date().toISOString(),
        }
        addLog({
          itemName: updated.name,
          category: updated.category,
          action: 'Restocked',
          quantity: `+${qty} pcs`,
          newStock: `${updated.currentStock} pcs`,
          reason: 'Manual Restock',
          performedBy: 'Admin',
        })
        return updated
      }),
    )
  }

  const editItem = (id, updatedItemData) => {
    setInventoryItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const currentStock = Number(updatedItemData.currentStock) || 0
        const reorderPoint = Number(updatedItemData.reorderPoint) || 0
        const expiryDate = updatedItemData.expiryDate || ''
        const { status, daysLeft } = computeStatus(currentStock, reorderPoint, expiryDate)
        const updated = {
          ...item,
          name: updatedItemData.name.trim(),
          category: updatedItemData.category,
          currentStock,
          reorderPoint,
          datePlaced: updatedItemData.datePlaced || '',
          expiryDate,
          status,
          daysLeft,
          lastUpdated: new Date().toISOString(),
        }
        addLog({
          itemName: updated.name,
          category: updated.category,
          action: 'Manual Adjustment',
          quantity: `${updated.currentStock} pcs`,
          newStock: `${updated.currentStock} pcs`,
          reason: 'Item Details Updated',
          performedBy: 'Admin',
        })
        return updated
      }),
    )
  }

  const value = useMemo(
    () => ({
      inventoryItems,
      activityLogs,
      addItem,
      restockItem,
      editItem,
    }),
    [inventoryItems, activityLogs],
  )

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory() {
  return useContext(InventoryContext)
}
