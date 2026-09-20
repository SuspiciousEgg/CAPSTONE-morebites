import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { customerApi, mediaUrl } from "../src/api/client";
import { useCart } from "../src/context/CartContext";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";
const RECENT_SEARCHES_KEY = "recent_searches";

function FoodCard({ item, compact = false }) {
  const isAvailable = item.availability !== false && item.available !== false;
  const openDetails = () => {
    if (!isAvailable) return;
    router.push({ pathname: "/food-details", params: { item: JSON.stringify(item) } });
  };

  const imageUrl = mediaUrl(item.image);

  return (
    <Pressable
      style={[
        styles.foodCard,
        compact && styles.compactFoodCard,
        !isAvailable && styles.cardDisabled,
      ]}
      disabled={!isAvailable}
      onPress={openDetails}
    >
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.foodImageThumb} />
        ) : (
          <View style={styles.foodImage}>
            <Ionicons name="fast-food-outline" size={34} color="#9CA3AF" />
          </View>
        )}
        {!isAvailable && (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableBadgeText}>Unavailable</Text>
          </View>
        )}
      </View>
      <View style={styles.foodCardContent}>
        <Text style={styles.foodName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.foodCardFooter}>
          <Text style={styles.foodPrice}>{item.priceLabel || `₱${item.price}`}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const { cartItems } = useCart();
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [recentSearches, setRecentSearches] = useState([]);
  const [focused, setFocused] = useState(true);
  const [pastOrders, setPastOrders] = useState([]);
  const [topSellingItems, setTopSellingItems] = useState([]);
  const isSearching = searchText.trim().length > 0;

  const popularSearches = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((i) => i.category).filter(Boolean)));
    return cats.slice(0, 5);
  }, [menuItems]);

  useEffect(() => {
    const load = async () => {
      setLoadingMenu(true);
      try {
        const [stored, res, ordersRes, topRes] = await Promise.all([
          AsyncStorage.getItem(RECENT_SEARCHES_KEY),
          customerApi.menu(),
          customerApi.orders().catch(() => ({ data: [] })),
          customerApi.topSelling().catch(() => ({ data: [] })),
        ]);
        const searches = stored ? JSON.parse(stored) : [];
        setRecentSearches(Array.isArray(searches) ? searches.slice(0, 5) : []);
        const items = res.data || [];
        setMenuItems(items);
        setPastOrders(ordersRes?.data || []);
        setTopSellingItems(topRes?.data || []);
      } catch {
        setMenuItems([]);
        setPastOrders([]);
        setTopSellingItems([]);
      } finally {
        setLoadingMenu(false);
      }
    };
    load();
  }, []);

  const suggestedItems = useMemo(() => {
    if (!menuItems.length) return [];

    // 1. Items currently in customer's cart
    const cartItemIds = new Set((cartItems || []).map((c) => String(c.id || c.db_id || "")).filter(Boolean));
    const cartItemNames = new Set((cartItems || []).map((c) => String(c.name || "").trim().toLowerCase()).filter(Boolean));

    // 2. Items customer has already ordered before and categories they ordered from
    const orderedItemIds = new Set();
    const orderedItemNames = new Set();
    const orderedCategories = new Set();

    (pastOrders || []).forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.menu_item_id) orderedItemIds.add(String(item.menu_item_id));
        if (item.id) orderedItemIds.add(String(item.id));
        if (item.name) {
          const normName = String(item.name).trim().toLowerCase();
          orderedItemNames.add(normName);
          const found = menuItems.find(
            (m) => String(m.id) === String(item.menu_item_id) || String(m.name).trim().toLowerCase() === normName
          );
          if (found?.category) orderedCategories.add(found.category);
        }
      });
    });

    const isExcluded = (item) => {
      const idStr = String(item.id || item.db_id || "");
      const nameLower = String(item.name || "").trim().toLowerCase();
      return (
        (idStr && (cartItemIds.has(idStr) || orderedItemIds.has(idStr))) ||
        (nameLower && (cartItemNames.has(nameLower) || orderedItemNames.has(nameLower)))
      );
    };

    const hasOrderHistory = pastOrders.length > 0 && (orderedItemIds.size > 0 || orderedItemNames.size > 0);

    if (hasOrderHistory) {
      // Unpurchased items
      const unpurchased = menuItems.filter((item) => !isExcluded(item));

      // Prioritize unpurchased items belonging to categories customer previously ordered from
      const preferred = unpurchased.filter((item) => item.category && orderedCategories.has(item.category));
      const others = unpurchased.filter((item) => !item.category || !orderedCategories.has(item.category));

      const combined = [...preferred, ...others];
      if (combined.length > 0) {
        return combined.slice(0, 8);
      }
    }

    // Fallback: If customer has no order history at all, fall back to top-selling, excluding cart
    const fallbackTop = (topSellingItems.length ? topSellingItems : menuItems).filter(
      (item) => {
        const idStr = String(item.id || item.db_id || "");
        const nameLower = String(item.name || "").trim().toLowerCase();
        return !cartItemIds.has(idStr) && !cartItemNames.has(nameLower);
      }
    );

    return fallbackTop.slice(0, 8);
  }, [menuItems, cartItems, pastOrders, topSellingItems]);

  const runSearch = (term) => {
    setSearchText(term);
    const normalizedTerm = term.trim().toLowerCase();
    setResults(
      normalizedTerm
        ? menuItems.filter((item) =>
            `${item.name} ${item.category || ""}`.toLowerCase().includes(normalizedTerm),
          )
        : [],
    );
  };

  const saveRecentSearch = async () => {
    const term = searchText.trim();
    if (!term) return;

    const withoutDuplicate = recentSearches.filter(
      (item) => item.toLowerCase() !== term.toLowerCase(),
    );
    const nextSearches = [term, ...withoutDuplicate].slice(0, 5);
    setRecentSearches(nextSearches);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches));
  };

  const removeRecentSearch = async (term) => {
    const nextSearches = recentSearches.filter((item) => item !== term);
    setRecentSearches(nextSearches);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(nextSearches));
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={PRIMARY} />
        </Pressable>
        <View style={[styles.searchWrap, focused && styles.focusedSearchWrap]}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={runSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={saveRecentSearch}
            placeholder="Search menu..."
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
            autoFocus
          />
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isSearching ? (
          results.length ? (
            <View style={styles.resultsGrid}>
              {results.map((item) => <FoodCard key={item.id} item={item} />)}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No results for &apos;{searchText.trim()}&apos;</Text>
              <Text style={styles.emptySubtitle}>Try searching for something else</Text>
            </View>
          )
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Searches</Text>
              {recentSearches.length ? (
                <Pressable onPress={clearRecentSearches} hitSlop={8}>
                  <Text style={styles.clearText}>Clear All</Text>
                </Pressable>
              ) : null}
            </View>

            {recentSearches.length ? recentSearches.map((term) => (
              <Pressable key={term} style={styles.searchRow} onPress={() => runSearch(term)}>
                <Ionicons name="time-outline" size={20} color="#9CA3AF" />
                <Text style={styles.searchTerm}>{term}</Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    removeRecentSearch(term);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#9CA3AF" />
                </Pressable>
              </Pressable>
            )) : <Text style={styles.noRecentText}>No recent searches</Text>}

            <Text style={styles.popularTitle}>Popular Searches</Text>
            {loadingMenu ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 8 }} />
            ) : popularSearches.length ? (
              popularSearches.map((term) => (
                <Pressable key={term} style={styles.searchRow} onPress={() => runSearch(term)}>
                  <Ionicons name="flame-outline" size={20} color={PRIMARY} />
                  <Text style={styles.searchTerm}>{term}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.noRecentText}>No categories yet</Text>
            )}

            <Text style={styles.suggestionsTitle}>You Might Like</Text>
            {loadingMenu ? (
              <ActivityIndicator color={PRIMARY} style={{ marginVertical: 12 }} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionsRow}
              >
                {suggestedItems.map((item) => (
                  <View key={item.id} style={styles.suggestionCardWrap}>
                    <FoodCard item={item} compact />
                  </View>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  searchWrap: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D4D4D4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  focusedSearchWrap: {
    borderColor: PRIMARY,
  },
  searchInput: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    marginLeft: 8,
    paddingVertical: 10,
  },
  cancelText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
  clearText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "600",
  },
  searchRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  searchTerm: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    marginLeft: 11,
  },
  noRecentText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    paddingVertical: 14,
  },
  popularTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 8,
  },
  suggestionsTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 26,
    marginBottom: 12,
  },
  suggestionsRow: {
    paddingRight: 16,
  },
  suggestionCardWrap: {
    width: 156,
    marginRight: 12,
  },
  resultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  foodCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  compactFoodCard: {
    width: "100%",
  },
  imageWrap: {
    position: "relative",
    width: "100%",
  },
  unavailableBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#4B5563",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    zIndex: 10,
  },
  unavailableBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  foodImage: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  foodImageThumb: {
    height: 110,
    width: "100%",
    resizeMode: "cover",
  },
  foodCardContent: {
    minHeight: 72,
    justifyContent: "space-between",
    padding: 10,
  },
  foodName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  foodCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  foodPrice: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  addButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: PRIMARY,
  },
  addButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  emptyState: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 16,
  },
  emptySubtitle: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 14,
    textAlign: "center",
    marginTop: 7,
  },
});
