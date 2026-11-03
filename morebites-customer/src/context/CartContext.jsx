import { createContext, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

function isSameItem(a, b) {
  const idA = String(a?.id ?? a?.db_id ?? "");
  const idB = String(b?.id ?? b?.db_id ?? "");
  const sizeA = a?.size ? String(a.size).trim() : "";
  const sizeB = b?.size ? String(b.size).trim() : "";

  const serializeRemoved = (list) =>
    (Array.isArray(list) ? list : [])
      .map((r) => String(r?.inventory_item_id ?? r?.id ?? r?.name ?? r))
      .sort()
      .join(",");

  const removedA = serializeRemoved(a?.removed_ingredients);
  const removedB = serializeRemoved(b?.removed_ingredients);

  return idA === idB && sizeA === sizeB && removedA === removedB;
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

  const removeFromCart = (idOrItem, size, removed_ingredients) => {
    const target =
      typeof idOrItem === "object" && idOrItem !== null
        ? idOrItem
        : { id: idOrItem, size, removed_ingredients };

    setCartItems((currentItems) =>
      currentItems.filter((item) => !isSameItem(item, target))
    );
  };

  const updateQuantity = (idOrItem, size, quantity, removed_ingredients) => {
    let target;
    let nextQty;

    if (typeof idOrItem === "object" && idOrItem !== null) {
      target = idOrItem;
      nextQty = typeof size === "number" ? size : idOrItem.quantity;
    } else {
      target = { id: idOrItem, size, removed_ingredients };
      nextQty = quantity;
    }

    if (nextQty <= 0) {
      removeFromCart(target);
      return;
    }

    setCartItems((currentItems) =>
      currentItems.map((item) =>
        isSameItem(item, target) ? { ...item, quantity: nextQty } : item
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
