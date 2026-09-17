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
    const cleanPhone = phone.replace(/\s/g, "");
    if (!cleanPhone) next.phone = "Phone number is required";
    else if (!/^09\d{9}$/.test(cleanPhone)) next.phone = "Enter a valid 11-digit Philippine mobile number starting with 09";
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
    if (feeQuote?.deliverable === false || (feeQuote?.distanceKm != null && feeQuote.distanceKm > 10)) {
      Alert.alert(
        "Outside Delivery Range",
        feeQuote?.error || "Delivery not available beyond 10km. Please select an address within 10km."
      );
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
        id: placed?.id,
        db_id: placed?.db_id,
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
      router.push({
        pathname: "/order-confirmed",
        params: {
          order: JSON.stringify(order),
          orderId: order.orderId,
          dbId: String(placed?.db_id || ""),
        },
      });
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
          <Ionicons name="arrow-back" size={24} color="#121212" />
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
            <Ionicons name="bag-handle-outline" size={20} color={PRIMARY} />
          </View>
          <View style={styles.orderInfo}>
            <Text style={styles.orderLabel}>Your Order</Text>
            <Text style={styles.orderTotal}>₱ {Number(total).toFixed(2)}</Text>
          </View>
          <Pressable style={styles.viewPill} onPress={() => setShowOrderSheet(true)} hitSlop={8}>
            <Text style={styles.viewLink}>View</Text>
            <Ionicons name="chevron-forward" size={14} color={PRIMARY} />
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
          maxLength={11}
          value={phone}
          onChangeText={(val) => setPhone(val.replace(/\D/g, "").slice(0, 11))}
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
        <View style={styles.paymentCard}>
          <View style={styles.paymentLeft}>
            <View style={styles.paymentIconWrap}>
              <Ionicons name="cash-outline" size={20} color={PRIMARY} />
            </View>
            <View>
              <Text style={styles.paymentValue}>Cash on Delivery (COD)</Text>
              <Text style={styles.paymentSubtext}>Pay in cash when your order arrives</Text>
            </View>
            <Text style={styles.paymentValue}>Cash on Delivery (COD)</Text>
            <Text style={styles.paymentSubtext}>Pay in cash when your order arrives</Text>
          </View>
          <View style={styles.paymentBadge}>
            <Text style={styles.paymentBadgeText}>Default</Text>
          </View>
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
          <View style={styles.feeHeader}>
            <Ionicons name="receipt-outline" size={18} color={PRIMARY} />
            <Text style={styles.feeTitle}>Delivery & Order Summary</Text>
          </View>
          <Text style={styles.feeTitle}>Delivery & Order Summary</Text>
          {quoting ? (
            <View style={styles.feeHintWrap}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.feeHint}>Calculating distance from store…</Text>
            </View>
          ) : street.trim() && barangay.trim() && city.trim() ? (
            feeQuote?.deliverable === false || (feeQuote?.distanceKm != null && feeQuote.distanceKm > 10) ? (
              <View style={styles.feeErrorBanner}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.feeErrorText}>
                  {feeQuote?.error || "Delivery not available beyond 10km. Please select an address within 10km."}
                </Text>
              </View>
            ) : (
              <>
                {feeQuote?.distanceKm != null ? (
                  <View style={styles.distanceBadge}>
                    <Ionicons name="location-outline" size={14} color={PRIMARY} />
                    <Text style={styles.distanceBadgeText}>
                      {Number(feeQuote.distanceKm).toFixed(1)} km from store
                    </Text>
                  </View>
                ) : null}
                {feeQuote?.formula ? (
                  <Text style={styles.feeFormula}>{feeQuote.formula}</Text>
                ) : null}
                {(feeQuote?.calculation || []).map((line, index) => (
                  <Text key={`${line}-${index}`} style={styles.feeStep}>
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
                  <View style={styles.feeDivider} />
                  <View style={styles.feeTotalRow}>
                    <Text style={styles.feeTotalLabel}>Total Amount</Text>
                    <Text style={styles.feeTotalValue}>₱{Number(total).toFixed(2)}</Text>
                  </View>
                </View>
              </>
            )
          ) : (
            <View style={styles.feeHintWrap}>
              <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
              <Text style={styles.feeHint}>
                Enter street, barangay, and city to calculate the distance-based delivery fee.
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={[
            styles.confirmButton,
            (submitting || feeQuote?.deliverable === false || (feeQuote?.distanceKm != null && feeQuote.distanceKm > 10)) && { opacity: 0.6 }
          ]}
          onPress={confirmOrder}
          disabled={submitting || feeQuote?.deliverable === false || (feeQuote?.distanceKm != null && feeQuote.distanceKm > 10)}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>Confirm Order →</Text>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={cancelOrder}>
          <Text style={styles.cancelText}>Cancel Order</Text>
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
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Your Order</Text>
              <Pressable onPress={() => setShowOrderSheet(false)} hitSlop={8}>
                <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {cartItems.map((item, index) => (
                <View key={`${item.id}-${item.size || "reg"}-${index}`} style={styles.sheetRow}>
                  <View style={styles.sheetItemLeft}>
                    <Text style={styles.sheetItemQty}>{item.quantity}x</Text>
                    <View style={styles.sheetItemTextWrap}>
                      <Text style={styles.sheetItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.size ? (
                        <Text style={styles.sheetItemSize}>Size: {item.size}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.sheetItemPrice}>₱{(item.price * item.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.sheetDivider} />
              <View style={styles.sheetRow}>
                <Text style={styles.sheetSummaryLabel}>Delivery fee</Text>
                <Text style={styles.sheetSummaryValue}>₱{Number(deliveryFee).toFixed(2)}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetSummaryLabel}>Service fee</Text>
                <Text style={styles.sheetSummaryValue}>₱{Number(serviceFee).toFixed(2)}</Text>
              </View>
              {feeQuote?.formula ? (
                <Text style={styles.sheetFormula}>{feeQuote.formula}</Text>
              ) : null}
              <View style={styles.sheetDivider} />
              <View style={styles.sheetTotalRow}>
                <Text style={styles.sheetTotalLabel}>Total</Text>
                <Text style={styles.sheetTotalValue}>₱{Number(total).toFixed(2)}</Text>
              </View>
            </ScrollView>
            <Pressable style={styles.closeButton} onPress={() => setShowOrderSheet(false)}>
              <Text style={styles.closeButtonText}>Done</Text>
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
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  orderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  orderIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#FFF4EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "500",
  },
  orderTotal: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  viewPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4EB",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 2,
  },
  viewLink: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: "#374151",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  inputWrap: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  focusedInput: {
    borderColor: PRIMARY,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
  },
  errorInput: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
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
    marginTop: 4,
  },
  fieldErrorText: {
    color: "#EF4444",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  paymentCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  paymentLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  paymentIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFF4EB",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  paymentSubtext: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 2,
  },
  paymentBadge: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paymentBadgeText: {
    color: "#059669",
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "700",
  },
  feeCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    marginTop: 6,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  feeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  feeTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
  },
  feeHintWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  feeHint: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  feeErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    gap: 8,
  },
  feeErrorText: {
    color: "#DC2626",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    lineHeight: 18,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFF4EB",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    marginBottom: 10,
  },
  distanceBadgeText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "700",
  },
  feeFormula: {
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  feeStep: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  feeTotals: {
    borderTopColor: "#F3F4F6",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
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
  feeDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 6,
  },
  feeTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  feeTotalLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "800",
  },
  feeTotalValue: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "800",
  },
  confirmButton: {
    height: 54,
    borderRadius: 10,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  cancelText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sheetTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "800",
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
    borderBottomColor: "#F9FAFB",
  },
  sheetItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  sheetItemQty: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginRight: 10,
    minWidth: 24,
  },
  sheetItemTextWrap: {
    flex: 1,
  },
  sheetItemName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  sheetItemSize: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 2,
  },
  sheetItemPrice: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  sheetDivider: {
    backgroundColor: "#F3F4F6",
    height: 1,
    marginVertical: 8,
  },
  sheetSummaryLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
  },
  sheetSummaryValue: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  sheetFormula: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 4,
    marginBottom: 4,
  },
  sheetTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    marginBottom: 4,
  },
  sheetTotalLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "800",
  },
  sheetTotalValue: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "800",
  },
  closeButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: PRIMARY,
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
