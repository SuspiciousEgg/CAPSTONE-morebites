import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { customerApi } from "../src/api/client";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";
const RECENT_SEARCHES_KEY = "recent_searches";

function shuffleItems(items) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, 4);
}

function FoodCard({ item, compact = false }) {
  const openDetails = () => {
    router.push({ pathname: "/food-details", params: { item: JSON.stringify(item) } });
  };

  return (
    <Pressable style={[styles.foodCard, compact && styles.compactFoodCard]} onPress={openDetails}>
      <View style={styles.foodImage}>
        <Ionicons name="fast-food-outline" size={34} color="#9CA3AF" />
      </View>
      <View style={styles.foodCardContent}>
        <Text style={styles.foodName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.foodCardFooter}>
          <Text style={styles.foodPrice}>{item.priceLabel || `₱${item.price}`}</Text>
          <Pressable style={styles.addButton} onPress={openDetails} hitSlop={6}>
            <Ionicons name="add" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [recentSearches, setRecentSearches] = useState([]);
  const [focused, setFocused] = useState(true);
  const [suggestedItems, setSuggestedItems] = useState([]);
  const isSearching = searchText.trim().length > 0;

  const popularSearches = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((i) => i.category).filter(Boolean)));
    return cats.slice(0, 5);
  }, [menuItems]);

  useEffect(() => {
    const load = async () => {
      setLoadingMenu(true);
      try {
        const [stored, res] = await Promise.all([
          AsyncStorage.getItem(RECENT_SEARCHES_KEY),
          customerApi.menu(),
        ]);
        const searches = stored ? JSON.parse(stored) : [];
        setRecentSearches(Array.isArray(searches) ? searches.slice(0, 5) : []);
        const items = res.data || [];
        setMenuItems(items);
        setSuggestedItems(shuffleItems(items));
      } catch {
        setMenuItems([]);
        setSuggestedItems([]);
      } finally {
        setLoadingMenu(false);
      }
    };
    load();
  }, []);

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
  compactFoodCard: {
    width: "100%",
  },
  foodImage: {
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
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
