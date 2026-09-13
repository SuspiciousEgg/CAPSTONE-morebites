import { createContext, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

function isSameItem(a, b) {
  const idA = String(a?.id ?? a?.db_id ?? "");
  const idB = String(b?.id ?? b?.db_id ?? "");
  const sizeA = a?.size ? String(a.size).trim() : "";
  const sizeB = b?.size ? String(b.size).trim() : "";
  return idA === idB && sizeA === sizeB;
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);

  const addToCart = (item) => {
    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex((cartItem) => isSameItem(cartItem, item));

      if (existingIndex >= 0) {
        return currentItems.map((cartItem, idx) =>
          idx === existingIndex
            ? { ...cartItem, quantity: cartItem.quantity + (item.quantity || 1) }
            : cartItem
        );
      }

      return [...currentItems, { ...item, quantity: item.quantity || 1 }];
    });
  };

  const removeFromCart = (id, size) => {
    const target = { id, size };
    setCartItems((currentItems) =>
      currentItems.filter((item) => !isSameItem(item, target))
    );
  };

  const updateQuantity = (id, size, quantity) => {
    if (quantity <= 0) {
      removeFromCart(id, size);
      return;
    }

    const target = { id, size };
    setCartItems((currentItems) =>
      currentItems.map((item) =>
        isSameItem(item, target) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setCartItems([]);

  const cartTotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartItems]
  );
  const cartCount = useMemo(
    () => cartItems.reduce((count, item) => count + item.quantity, 0),
    [cartItems]
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        setCart: setCartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
