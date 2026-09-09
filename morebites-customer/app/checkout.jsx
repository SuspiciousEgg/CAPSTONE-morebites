import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../src/api/client";
import { fetchDeliveryFees } from "../src/api/fees";
import { useCart } from "../src/context/CartContext";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

// Shared labeled input with the same focus/error styling used across the app
function FormField({ label, error, focused, onFocus, onBlur, ...inputProps }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.focusedInput, error && styles.errorInput]}>
        <TextInput
          style={styles.input}
          placeholderTextColor="#9CA3AF"
          onFocus={onFocus}
          onBlur={onBlur}
          {...inputProps}
        />
      </View>
      {error ? (
        <View style={styles.fieldErrorRow}>
          <Ionicons name="warning-outline" size={14} color="#D94343" />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function CheckoutScreen() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const [deliveryFee, setDeliveryFee] = useState(40);
  const [serviceFee, setServiceFee] = useState(20);
  const [feeQuote, setFeeQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const total = cartTotal + deliveryFee + serviceFee;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [landmark, setLandmark] = useState("");
  const [errors, setErrors] = useState({});
  const [focusedField, setFocusedField] = useState("");
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDeliveryFees().then((fees) => {
      setDeliveryFee(fees.deliveryFee);
      setServiceFee(fees.serviceFee);
      setFeeQuote(fees);
    });
  }, []);

  useEffect(() => {
    const deliveryAddress = [street.trim(), barangay.trim(), city.trim(), landmark.trim()]
      .filter(Boolean)
      .join(", ");
    if (!street.trim() || !barangay.trim() || !city.trim()) return undefined;

    setQuoting(true);
    const timer = setTimeout(() => {
      fetchDeliveryFees(null, deliveryAddress).then((fees) => {
        setDeliveryFee(fees.deliveryFee);
        setServiceFee(fees.serviceFee);
        setFeeQuote(fees);
        setQuoting(false);
      });
    }, 700);

    return () => {
      clearTimeout(timer);
      setQuoting(false);
    };
  }, [street, barangay, city, landmark]);

  useEffect(() => {
    const loadSavedDetails = async () => {
      const user = await authStorage.getUser();
      if (user) {
        setFullName(user.fullName || "");
        setPhone(user.phone || "");
        if (user.delivery_address && !street) {
          setStreet(user.delivery_address);
        }
      }

      const savedAddresses = await AsyncStorage.getItem("saved_addresses");
      if (savedAddresses) {
        const addresses = JSON.parse(savedAddresses);
        const defaultAddress = addresses.find((address) => address.isDefault) || addresses[0];
        if (defaultAddress) {
          setStreet(defaultAddress.street || "");
          setBarangay(defaultAddress.barangay || "");
          setCity(defaultAddress.city || "");
          setLandmark(defaultAddress.landmark || "");
        }
      }
    };
    loadSavedDetails();
  }, []);

  const focusField = (name) => setFocusedField(name);
  const blurField = () => setFocusedField("");

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = "Full name is required";
    if (!phone.trim()) next.phone = "Phone number is required";
    if (!street.trim()) next.street = "Street address is required";
    if (!barangay.trim()) next.barangay = "Barangay is required";
    if (!city.trim()) next.city = "City is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const confirmOrder = async () => {
    if (!validate()) return;
    if (!cartItems.length) {
      Alert.alert("Cart is empty", "Add items before placing an order.");
      return;
    }
    if (submitting) return;

    const deliveryAddress = [street.trim(), barangay.trim(), city.trim(), landmark.trim()]
      .filter(Boolean)
      .join(", ");

    setSubmitting(true);
    try {
      const res = await customerApi.placeOrder({
        full_name: fullName.trim(),
        phone: phone.replace(/\s/g, ""),
        delivery_address: deliveryAddress,
        payment_method: "COD",
        items: cartItems.map((item) => ({
          menu_item_id: item.db_id ?? (Number(item.id) || null),
          name: item.name,
          size: item.size || null,
          qty: item.quantity,
          unit_price: item.price,
        })),
      });

      const placed = res.data;
      const order = {
        orderId: placed?.id || `#ORD-${Date.now()}`,
        items: cartItems,
        total: placed?.total ?? total,
        delivery_fee: placed?.delivery_fee ?? deliveryFee,
        service_fee: placed?.service_fee ?? serviceFee,
        fullName,
        phone,
        street,
        barangay,
        city,
        landmark,
        paymentMethod: "COD",
      };

      clearCart();
      router.push({ pathname: "/order-confirmed", params: { order: JSON.stringify(order) } });
    } catch (err) {
      Alert.alert("Order failed", err.message || "Could not place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = () => {
    Alert.alert("Cancel this order?", "", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: "destructive",
        onPress: () => {
          clearCart();
          router.replace("/(tabs)/home");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orderBar}>
          <View style={styles.orderIconWrap}>
            <Ionicons name="briefcase-outline" size={20} color={PRIMARY} />
          </View>
          <View style={styles.orderInfo}>
            <Text style={styles.orderLabel}>Your Order</Text>
            <Text style={styles.orderTotal}>₱ {total.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => setShowOrderSheet(true)}>
            <Text style={styles.viewLink}>View</Text>
          </Pressable>
        </View>

        <FormField
          label="Full Name"
          placeholder="John Doe"
          value={fullName}
          onChangeText={setFullName}
          error={errors.fullName}
          focused={focusedField === "fullName"}
          onFocus={() => focusField("fullName")}
          onBlur={blurField}
        />

        <FormField
          label="Phone Number"
          placeholder="09XX XXX XXXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          focused={focusedField === "phone"}
          onFocus={() => focusField("phone")}
          onBlur={blurField}
        />

        <FormField
          label="Street Address"
          placeholder="House no., Street name..."
          value={street}
          onChangeText={setStreet}
          error={errors.street}
          focused={focusedField === "street"}
          onFocus={() => focusField("street")}
          onBlur={blurField}
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <FormField
              label="Barangay"
              placeholder="Barangay"
              value={barangay}
              onChangeText={setBarangay}
              error={errors.barangay}
              focused={focusedField === "barangay"}
              onFocus={() => focusField("barangay")}
              onBlur={blurField}
            />
          </View>
          <View style={styles.halfField}>
            <FormField
              label="City"
              placeholder="City"
              value={city}
              onChangeText={setCity}
              error={errors.city}
              focused={focusedField === "city"}
              onFocus={() => focusField("city")}
              onBlur={blurField}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Payment Method</Text>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentValue}>COD</Text>
          {/* Only cash on delivery is supported for now */}
          <Text style={styles.changeText}>CHANGE</Text>
        </View>

        <FormField
          label="Landmark (optional)"
          placeholder="e.g. near 7 Eleven..."
          value={landmark}
          onChangeText={setLandmark}
          focused={focusedField === "landmark"}
          onFocus={() => focusField("landmark")}
          onBlur={blurField}
        />

        <View style={styles.feeCard}>
          <Text style={styles.feeTitle}>Delivery fee calculation</Text>
          {quoting ? (
            <Text style={styles.feeHint}>Measuring distance from the store…</Text>
          ) : street.trim() && barangay.trim() && city.trim() ? (
            <>
              {feeQuote?.distanceKm != null ? (
                <Text style={styles.feeFormula}>{feeQuote.formula}</Text>
              ) : null}
              {(feeQuote?.calculation || []).map((line) => (
                <Text key={line} style={styles.feeStep}>
                  {line}
                </Text>
              ))}
              <View style={styles.feeTotals}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Subtotal</Text>
                  <Text style={styles.feeValue}>₱{Number(cartTotal).toFixed(2)}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Delivery fee</Text>
                  <Text style={styles.feeValue}>₱{Number(deliveryFee).toFixed(2)}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Service fee</Text>
                  <Text style={styles.feeValue}>₱{Number(serviceFee).toFixed(2)}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeTotalLabel}>Total</Text>
                  <Text style={styles.feeTotalValue}>₱{Number(total).toFixed(2)}</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.feeHint}>
              Enter street, barangay, and city to calculate the distance-based delivery fee.
            </Text>
          )}
        </View>

        <Pressable style={styles.cancelButton} onPress={cancelOrder}>
          <Text style={styles.cancelText}>Cancel Order</Text>
        </Pressable>

        <Pressable
          style={[styles.confirmButton, submitting && { opacity: 0.7 }]}
          onPress={confirmOrder}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>Confirm Order</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={showOrderSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOrderSheet(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Your Order</Text>
            <ScrollView style={styles.sheetList}>
              {cartItems.map((item) => (
                <View key={`${item.id}-${item.size}`} style={styles.sheetRow}>
                  <Text style={styles.sheetItemName} numberOfLines={1}>
                    {item.name}{item.size ? ` (${item.size})` : ""} x{item.quantity}
                  </Text>
                  <Text style={styles.sheetItemPrice}>₱{item.price * item.quantity}</Text>
                </View>
              ))}
              <View style={styles.sheetDivider} />
              <View style={styles.sheetRow}>
                <Text style={styles.sheetItemName}>Delivery fee</Text>
                <Text style={styles.sheetItemPrice}>₱{Number(deliveryFee).toFixed(2)}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetItemName}>Service fee</Text>
                <Text style={styles.sheetItemPrice}>₱{Number(serviceFee).toFixed(2)}</Text>
              </View>
              {feeQuote?.formula ? (
                <Text style={styles.sheetFormula}>{feeQuote.formula}</Text>
              ) : null}
            </ScrollView>
            <Pressable style={styles.closeButton} onPress={() => setShowOrderSheet(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFF9F5",
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
    fontSize: 20,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 24,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  orderBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBEAE1",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  orderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  orderInfo: {
    flex: 1,
  },
  orderLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
  },
  orderTotal: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  viewLink: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  fieldGroup: {
    marginBottom: 4,
  },
  fieldLabel: {
    color: "#4B4B4B",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputWrap: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  focusedInput: {
    borderColor: PRIMARY,
  },
  errorInput: {
    borderColor: "#D94343",
    backgroundColor: "#FFF3F2",
  },
  input: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    paddingVertical: 10,
  },
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  fieldErrorText: {
    color: "#D94343",
    fontFamily: FONT,
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  paymentValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
  },
  changeText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  feeCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3E6DC",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    marginTop: 8,
    padding: 14,
  },
  feeTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  feeHint: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 18,
  },
  feeFormula: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  feeStep: {
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  feeTotals: {
    borderTopColor: "#F3E6DC",
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  feeLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  feeValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  feeTotalLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "800",
  },
  feeTotalValue: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "800",
  },
  cancelButton: {
    height: 54,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#121212",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  cancelText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  confirmButton: {
    height: 54,
    borderRadius: 9,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  confirmText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  sheetTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  sheetList: {
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  sheetItemName: {
    flex: 1,
    marginRight: 8,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
  },
  sheetItemPrice: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  sheetDivider: {
    backgroundColor: "#F0F0F0",
    height: 1,
    marginVertical: 6,
  },
  sheetFormula: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 8,
  },
  closeButton: {
    height: 48,
    borderRadius: 9,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
});
