import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchDeliveryFees } from "../src/api/fees";
import { useCart } from "../src/context/CartContext";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

// One row inside the price breakdown card
function SummaryRow({ label, value, isTotal }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, isTotal && styles.totalLabel]}>{label}</Text>
      <Text style={[styles.summaryValue, isTotal && styles.totalValue]}>
        {isTotal ? `₱ ${Number(value).toFixed(2)}` : `₱${value}`}
      </Text>
    </View>
  );
}

// A single cart item with image, details, and quantity controls
function CartItemCard({ item, onRemove, onIncrease }) {
  return (
    <View style={styles.card}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.itemImage} />
      ) : (
        <View style={styles.itemImagePlaceholder}>
          <Ionicons name="fast-food-outline" size={28} color="#8A8A8A" />
        </View>
      )}

      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
        {item.size ? <Text style={styles.itemSize}>Size: {item.size}</Text> : null}
        <Text style={styles.itemPrice}>₱{item.price}</Text>
      </View>

      <View style={styles.quantityRow}>
        <Pressable onPress={() => onRemove(item)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color="#D94343" />
        </Pressable>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <Pressable style={styles.increaseButton} onPress={() => onIncrease(item)} hitSlop={8}>
          <Ionicons name="add" size={15} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

export default function CartScreen() {
  const { cartItems, removeFromCart, updateQuantity, cartTotal } = useCart();
  const [deliveryFee, setDeliveryFee] = useState(40);
  const [serviceFee, setServiceFee] = useState(20);

  useEffect(() => {
    fetchDeliveryFees().then((fees) => {
      setDeliveryFee(fees.deliveryFee);
      setServiceFee(fees.serviceFee);
    });
  }, []);

  const removeItem = (item) => removeFromCart(item.id, item.size);
  const increaseItem = (item) => updateQuantity(item.id, item.size, item.quantity + 1);
  const total = cartTotal + deliveryFee + serviceFee;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#121212" />
        </Pressable>
        <Text style={styles.headerTitle}>My Cart</Text>
        <View style={styles.headerSpacer} />
      </View>

      {cartItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={72} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>Add items from the menu to get started</Text>
          <Pressable style={styles.browseButton} onPress={() => router.push("/(tabs)/home")}>
            <Text style={styles.browseButtonText}>Browse Menu</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {cartItems.map((item) => (
              <CartItemCard
                key={`${item.id}-${item.size}`}
                item={item}
                onRemove={removeItem}
                onIncrease={increaseItem}
              />
            ))}

            <Pressable style={styles.addMoreButton} onPress={() => router.push("/(tabs)/home")}>
              <Text style={styles.addMoreText}>+ Add More Items</Text>
            </Pressable>

            <View style={styles.summaryCard}>
              <SummaryRow label="Sub total" value={cartTotal} />
              <SummaryRow label="Delivery fee" value={deliveryFee} />
              <SummaryRow label="Service fee" value={serviceFee} />
              <Text style={styles.feeNote}>
                Delivery fee is based on distance from the store. The exact amount is calculated at checkout from your address.
              </Text>
              <View style={styles.divider} />
              <SummaryRow label="Total" value={total} isTotal />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.checkoutButton} onPress={() => router.push("/checkout")}>
              <Text style={styles.checkoutButtonText}>Proceed to Checkout →</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F7F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  itemImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  itemSize: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 2,
  },
  itemPrice: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FCE3C6",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quantityText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    minWidth: 14,
    textAlign: "center",
  },
  increaseButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  addMoreButton: {
    height: 50,
    borderWidth: 1.5,
    borderColor: PRIMARY,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  addMoreText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 14,
  },
  summaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  totalLabel: {
    color: "#121212",
    fontSize: 16,
    fontWeight: "700",
  },
  totalValue: {
    color: PRIMARY,
    fontSize: 18,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 4,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  checkoutButton: {
    height: 54,
    borderRadius: 9,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySubtitle: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
  },
  browseButton: {
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 9,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  browseButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
});
