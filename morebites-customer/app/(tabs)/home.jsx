import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authStorage, customerApi } from "../../src/api/client";
import { useCart } from "../../src/context/CartContext";

const ORANGE = "#F97000";
const CATEGORIES = ["All", "Pizza", "Snacks", "Desserts", "Beverages", "Rice Meals"];

function FoodCard({ item }) {
  return (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push({ pathname: "/food-details", params: { item: JSON.stringify(item) } })
      }
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.cardImage} />
      ) : (
        <View style={styles.placeholderImage}>
          <Ionicons name="fast-food-outline" size={42} color="#8A8A8A" />
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={styles.foodName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.price}>{item.priceLabel}</Text>
      </View>
    </Pressable>
  );
}

function FoodGrid({ items }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <FoodCard item={item} key={item.id} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [user, setUser] = useState({ fullName: "Customer", photo: null });
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { cartCount } = useCart();

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const savedUser = await authStorage.getUser();
      if (savedUser) {
        setUser((current) => ({ ...current, ...savedUser }));
      }
      const res = await customerApi.menu();
      setMenuItems(res.data || []);
    } catch (err) {
      setLoadError(err.message || "Failed to load menu");
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMenu();
    }, [loadMenu]),
  );

  const categories = useMemo(() => {
    const fromMenu = Array.from(new Set(menuItems.map((i) => i.category).filter(Boolean)));
    return ["All", ...(fromMenu.length ? fromMenu : CATEGORIES.slice(1))];
  }, [menuItems]);

  const popularItems = menuItems.slice(0, 4);
  const selectedItems = menuItems.filter((item) => item.category === activeCategory);

  const renderCategorySections = () => {
    if (activeCategory !== "All") {
      return (
        <>
          <Text style={styles.sectionTitle}>{activeCategory}</Text>
          <FoodGrid items={selectedItems} />
        </>
      );
    }

    return (
      <>
        <Text style={styles.sectionTitle}>Popular Items</Text>
        <FoodGrid items={popularItems} />
        {categories.slice(1).map((category) => {
          const items = menuItems.filter((item) => item.category === category);
          if (!items.length) return null;
          return (
            <View key={category}>
              <Text style={styles.sectionTitle}>{category}</Text>
              <FoodGrid items={items} />
            </View>
          );
        })}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.greetingRow}>
            {user.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={28} color="#8A8A8A" />
              </View>
            )}

            <View style={styles.greetingCopy}>
              <Text style={styles.greeting}>
                Hello, <Text style={styles.userName}>{user.fullName}</Text>
              </Text>
              <Text style={styles.subtitle}>What do you want to eat today?</Text>
            </View>
          </View>

          <Pressable style={styles.cartButton} onPress={() => router.push("/cart")} hitSlop={8}>
            <Ionicons name="cart-outline" size={26} color="#121212" />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Pressable style={styles.searchBar} onPress={() => router.push("/search")}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <Text style={styles.searchPlaceholder}>Search for food</Text>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((category) => {
            const active = category === activeCategory;
            return (
              <Pressable
                key={category}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setActiveCategory(category)}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={styles.helperText}>Loading menu...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Could not load menu</Text>
            <Text style={styles.helperText}>{loadError}</Text>
          </View>
        ) : menuItems.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Menu is empty</Text>
            <Text style={styles.helperText}>Ask admin to add menu items.</Text>
          </View>
        ) : (
          renderCategorySections()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#FFFFFF", flex: 1 },
  content: { paddingBottom: 28, paddingHorizontal: 16 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  greetingRow: { alignItems: "center", flexDirection: "row", flex: 1, gap: 12 },
  avatar: { borderRadius: 28, height: 56, width: 56 },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  greetingCopy: { flex: 1 },
  greeting: { color: "#121212", fontSize: 18, fontWeight: "600" },
  userName: { color: ORANGE, fontWeight: "800" },
  subtitle: { color: "#9CA3AF", fontSize: 13, marginTop: 2 },
  cartButton: { padding: 6, position: "relative" },
  cartBadge: {
    alignItems: "center",
    backgroundColor: ORANGE,
    borderRadius: 9,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    position: "absolute",
    right: 0,
    top: 0,
  },
  cartBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  searchBar: {
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchPlaceholder: { color: "#9CA3AF", fontSize: 14 },
  categoryRow: { gap: 8, paddingVertical: 16 },
  categoryChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: ORANGE },
  categoryText: { color: "#6B7280", fontSize: 13, fontWeight: "600" },
  categoryTextActive: { color: "#FFFFFF" },
  sectionTitle: {
    color: "#121212",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
    marginTop: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    width: "47%",
  },
  placeholderImage: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    height: 110,
    justifyContent: "center",
  },
  cardImage: {
    backgroundColor: "#F8F8F8",
    height: 110,
    width: "100%",
  },
  cardContent: { padding: 10 },
  foodName: { color: "#121212", fontSize: 14, fontWeight: "700", minHeight: 36 },
  price: { color: ORANGE, fontSize: 13, fontWeight: "700", marginTop: 4 },
  centered: { alignItems: "center", paddingTop: 40 },
  helperText: { color: "#9CA3AF", fontSize: 13, marginTop: 8, textAlign: "center" },
  errorTitle: { color: "#121212", fontSize: 16, fontWeight: "700" },
});
