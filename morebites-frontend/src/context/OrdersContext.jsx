import { createContext, useContext, useMemo, useState } from 'react'

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState([])

  const value = useMemo(
    () => ({
      orders,
      setOrders,
    }),
    [orders],
  )

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  return useContext(OrdersContext)
}
