import { createContext, useContext, useMemo, useState } from 'react'

const MenuContext = createContext(null)

export function MenuProvider({ children }) {
  const [menuItems, setMenuItems] = useState([])

  const value = useMemo(
    () => ({
      menuItems,
      setMenuItems,
    }),
    [menuItems],
  )

  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

export function useMenu() {
  return useContext(MenuContext)
}
