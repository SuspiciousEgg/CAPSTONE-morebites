import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "saved_addresses";
const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

export default function SavedAddressesScreen() {
  const [addresses, setAddresses] = useState([]);
  const [addressToDelete, setAddressToDelete] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadAddresses = async () => {
        try {
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          const parsed = stored ? JSON.parse(stored) : [];
          if (active) setAddresses(Array.isArray(parsed) ? parsed : []);
        } catch {
          if (active) setAddresses([]);
          Alert.alert("Unable to load addresses", "Please try again.");
        }
      };

      loadAddresses();
      return () => {
        active = false;
      };
    }, []),
  );

  const persistAddresses = async (nextAddresses) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextAddresses));
      setAddresses(nextAddresses);
    } catch {
      Alert.alert("Unable to update addresses", "Please try again.");
    }
  };

  const setDefaultAddress = (id) => {
    const nextAddresses = addresses.map((address) => ({
      ...address,
      isDefault: address.id === id,
    }));
    persistAddresses(nextAddresses);
  };

  const confirmDelete = () => {
    if (!addressToDelete) return;

    const wasDefault = addressToDelete.isDefault;
    const remaining = addresses.filter((address) => address.id !== addressToDelete.id);
    const nextAddresses =
      wasDefault && remaining.length > 0
        ? remaining.map((address, index) => ({ ...address, isDefault: index === 0 }))
        : remaining;

    setAddressToDelete(null);
    persistAddresses(nextAddresses);
  };

  const editAddress = (address) => {
    router.push({
      pathname: "/edit-address",
      params: { address: JSON.stringify(address) },
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </Pressable>
        <Text style={styles.headerTitle}>Saved Addresses</Text>
        <View style={styles.headerSpacer} />
      </View>

      {addresses.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyContent}>
            <Image source={require("../assets/images/location.png")} style={styles.emptyImage} />
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptyText}>
              Add a delivery address so we know where to bring your order.
            </Text>
          </View>
          <Pressable style={styles.emptyAddButton} onPress={() => router.push("/add-address")}>
            <Text style={styles.emptyAddButtonText}>+ Add Address</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {addresses.map((address) => (
            <View
              key={String(address.id)}
              style={[styles.addressCard, address.isDefault && styles.defaultAddressCard]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.addressLabel}>{address.label}</Text>
                {address.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.addressLine}>
                {[address.street, address.barangay, address.city].filter(Boolean).join(", ")}
              </Text>
              {address.landmark ? (
                <View style={styles.landmarkRow}>
                  <Ionicons name="navigate-outline" size={12} color="#64748B" />
                  <Text style={styles.landmark}>Near {address.landmark}</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  style={styles.actionBtnEdit}
                  onPress={() => editAddress(address)}
                  hitSlop={4}
                >
                  <Ionicons name="pencil-outline" size={13} color="#334155" />
                  <Text style={styles.actionBtnEditText}>Edit</Text>
                </Pressable>
                {!address.isDefault ? (
                  <>
                    <Pressable
                      style={styles.actionBtnDefault}
                      onPress={() => setDefaultAddress(address.id)}
                      hitSlop={4}
                    >
                      <Ionicons name="checkmark-circle-outline" size={13} color="#EA580C" />
                      <Text style={styles.actionBtnDefaultText}>Set Default</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtnDelete}
                      onPress={() => setAddressToDelete(address)}
                      hitSlop={4}
                    >
                      <Ionicons name="trash-outline" size={13} color="#DC2626" />
                      <Text style={styles.actionBtnDeleteText}>Delete</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          ))}
          <Pressable style={styles.listAddButton} onPress={() => router.push("/add-address")}>
            <Ionicons name="add" size={18} color={PRIMARY} />
            <Text style={styles.listAddButtonText}>Add New Address</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal
        visible={Boolean(addressToDelete)}
        transparent
        animationType="fade"
        onRequestClose={() => setAddressToDelete(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddressToDelete(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Image source={require("../assets/images/bin.png")} style={styles.binImage} />
            <Text style={styles.modalTitle}>Remove Address?</Text>
            <Text style={styles.modalText}>
              Are you sure want to remove {addressToDelete?.label} from your saved addresses?
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalDeleteButton} onPress={confirmDelete}>
                <Text style={styles.modalDeleteText}>Yes, Remove</Text>
              </Pressable>
              <Pressable style={styles.modalCancelButton} onPress={() => setAddressToDelete(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSpacer: { width: 24 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 28, gap: 14 },
  addressCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  defaultAddressCard: {
    borderColor: "#FDBA74",
    backgroundColor: "#FFF9F2",
    shadowColor: "#F97000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  addressLabel: {
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  defaultBadge: {
    borderRadius: 9999,
    backgroundColor: PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
  },
  defaultBadgeText: {
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  addressLine: {
    fontFamily: FONT,
    fontSize: 13.5,
    lineHeight: 21,
    color: "#475569",
    marginBottom: 4,
  },
  landmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  landmark: {
    fontFamily: FONT,
    fontSize: 12,
    color: "#64748B",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtnEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  actionBtnEditText: {
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#334155",
  },
  actionBtnDefault: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
  },
  actionBtnDefaultText: {
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#EA580C",
  },
  actionBtnDelete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  actionBtnDeleteText: {
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#DC2626",
  },
  emptyState: { flex: 1, justifyContent: "space-between", padding: 16 },
  emptyContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyImage: { width: 112, height: 112, resizeMode: "contain", marginBottom: 18 },
  emptyTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "700", color: "#242424" },
  emptyText: { marginTop: 6, fontFamily: FONT, fontSize: 13, lineHeight: 19, textAlign: "center", color: "#777777" },
  emptyAddButton: { width: "100%", height: 52, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: PRIMARY },
  emptyAddButtonText: { fontFamily: FONT, fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  listAddButton: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 2,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: PRIMARY,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  listAddButtonText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "700", color: PRIMARY },
  modalOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { width: "100%", maxWidth: 360, alignItems: "center", borderRadius: 18, padding: 24, backgroundColor: "#FFFFFF" },
  binImage: { width: 72, height: 72, resizeMode: "contain", marginBottom: 14 },
  modalTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "700", color: "#202020" },
  modalText: { marginTop: 7, fontFamily: FONT, fontSize: 13, textAlign: "center", color: "#777777" },
  modalActions: { width: "100%", flexDirection: "row", marginTop: 24, gap: 10 },
  modalCancelButton: { flex: 1, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#DADADA" },
  modalCancelText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#555555" },
  modalDeleteButton: { flex: 1, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#D94848" },
  modalDeleteText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
