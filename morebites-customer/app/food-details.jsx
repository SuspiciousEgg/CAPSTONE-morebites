import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCart } from "../src/context/CartContext";
import { mediaUrl } from "../src/api/client";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

/**
 * Ratings Investigation Report (Prompt 23):
 * - Does a real ratings data source exist?
 *   YES. When customers rate their delivery order via the Rate Order screen (`customerApi.rateOrder`),
 *   the rating is saved to the backend database on the `orders` table as `food_rating` (1 to 5 integer)
 *   and `food_comment`, along with `rider_rating`, `rider_comment`, and `rated_at`.
 * - How is it aggregated per menu item?
 *   Each order has items in the `order_items` table linking `order_id` to `menu_item_id`.
 *   The backend endpoint `/api/customer/menu` computes the real average food rating and review count
 *   for each product across all rated customer orders (`AVG(orders.food_rating)` and `COUNT(DISTINCT orders.id)`).
 * - Honest state for unrated items:
 *   If a menu item has zero ratings yet (`reviewCount === 0` or `rating == null`), it honestly displays
 *   "No ratings yet" with an outline star rather than showing fabricated numbers (replacing the previous
 *   hardcoded 4.9 stars and "76 reviews" placeholder).
 */

function parseJson(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getItem(params) {
  const serializedItem = parseJson(params.item, {});
  const routeItem = {
    id: params.id,
    name: params.name,
    description: params.description,
    price: params.price,
    hasSizes: params.hasSizes,
    sizes: params.sizes,
    image: params.image,
    rating: params.rating,
    reviewCount: params.reviewCount,
    reviews: params.reviews,
  };

  const item = { ...serializedItem, ...Object.fromEntries(Object.entries(routeItem).filter(([, value]) => value != null)) };
  const sizes = parseJson(item.sizes, []);
  const reviewCount = Number(item.reviewCount ?? item.reviews) || 0;
  const rating = item.rating != null && !isNaN(Number(item.rating)) && reviewCount > 0
    ? Number(item.rating)
    : null;

  return {
    ...item,
    price: Number(item.price) || 0,
    hasSizes: item.hasSizes === true || item.hasSizes === "true",
    sizes: Array.isArray(sizes) ? sizes : [],
    rating,
    reviewCount,
  };
}

export default function FoodDetailsScreen() {
  const params = useLocalSearchParams();
  const item = getItem(params);
  const isAvailable = item.availability !== false && item.available !== false;
  const { addToCart } = useCart();
  const navigationTimer = useRef(null);
  const [selectedSize, setSelectedSize] = useState(item.hasSizes ? item.sizes[0] ?? null : null);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [instructionsFocused, setInstructionsFocused] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    return () => clearTimeout(navigationTimer.current);
  }, []);

  const selectedPrice = selectedSize ? Number(selectedSize.price) : item.price;

  const handleAddToCart = () => {
    if (!isAvailable) {
      Alert.alert("This item is currently unavailable");
      return;
    }

    if (item.hasSizes && !selectedSize) {
      Alert.alert("Please select a size");
      return;
    }

    addToCart({
      id: item.id,
      db_id: item.db_id ?? (Number(item.id) || null),
      name: item.name,
      price: selectedPrice,
      size: selectedSize?.sizeName ?? null,
      quantity: 1,
      image: item.image,
    });

    setShowSuccess(true);
    navigationTimer.current = setTimeout(() => {
      router.replace("/(tabs)/home");
    }, 1500);
  };

  return (
    <View style={styles.screen}>
      {item.image ? (
        <Image source={{ uri: mediaUrl(item.image) }} style={styles.foodImage} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="fast-food-outline" size={64} color="#8A8A8A" />
        </View>
      )}

      <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color="#121212" />
      </Pressable>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.foodName}>{item.name}</Text>

        <View style={styles.ratingRow}>
          {item.rating != null && item.reviewCount > 0 ? (
            <>
              <Ionicons name="star" size={16} color={PRIMARY} />
              <Text style={styles.rating}>{Number(item.rating).toFixed(1)}</Text>
              <Text style={styles.reviews}>
                ({item.reviewCount} {item.reviewCount === 1 ? "review" : "reviews"})
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="star-outline" size={15} color="#9CA3AF" />
              <Text style={styles.noRatingText}>No ratings yet</Text>
            </>
          )}
        </View>

        <Text style={styles.description}>{item.description}</Text>

        {item.hasSizes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose Size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.sizeRow}>
                {item.sizes.map((size) => {
                  const isSelected = selectedSize?.sizeName === size.sizeName;

                  return (
                    <Pressable
                      key={size.sizeName}
                      style={({ pressed }) => [
                        styles.sizeButton,
                        isSelected && styles.selectedSizeButton,
                        pressed && styles.pressedSizeButton,
                      ]}
                      onPress={() => setSelectedSize(size)}
                      hitSlop={4}
                    >
                      <Text style={[styles.sizeName, isSelected && styles.selectedSizeText]}>
                        {size.sizeName}
                      </Text>
                      <Text style={[styles.sizePrice, isSelected && styles.selectedSizeText]}>
                        ₱{size.price}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.currentPrice}>₱{selectedPrice}</Text>

        <View style={styles.instructionsSection}>
          <Text style={styles.sectionTitle}>Special Instructions</Text>
          <Text style={styles.instructionsSubtitle}>
            Kindly inform us of any allergies you have or anything you would like us to avoid
          </Text>
          <TextInput
            style={[styles.instructionsInput, instructionsFocused && styles.focusedInput]}
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            onFocus={() => setInstructionsFocused(true)}
            onBlur={() => setInstructionsFocused(false)}
            placeholder="e.g. less cheese"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      {showSuccess ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#15803D" />
          <Text style={styles.successText}>Added to cart!</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          style={[styles.addButton, !isAvailable && styles.addButtonDisabled]}
          onPress={handleAddToCart}
          disabled={!isAvailable}
        >
          <Ionicons name="cart-outline" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {isAvailable ? "Add to Cart" : "Unavailable"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  foodImage: {
    width: "100%",
    height: 280,
    backgroundColor: "#E5E7EB",
    resizeMode: "cover",
  },
  imagePlaceholder: {
    width: "100%",
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  backButton: {
    position: "absolute",
    top: 48,
    left: 16,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 4,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  foodName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 26,
    fontWeight: "700",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  rating: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 5,
  },
  reviews: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    marginLeft: 6,
  },
  noRatingText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 5,
  },
  description: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
  },
  sizeRow: {
    flexDirection: "row",
    marginTop: 10,
    paddingRight: 16,
  },
  sizeButton: {
    minWidth: 88,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D4D4D4",
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectedSizeButton: {
    backgroundColor: "#121212",
    borderColor: "#121212",
  },
  pressedSizeButton: {
    opacity: 0.7,
  },
  sizeName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
  },
  sizePrice: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  selectedSizeText: {
    color: "#FFFFFF",
  },
  currentPrice: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12,
  },
  instructionsSection: {
    marginTop: 20,
  },
  instructionsSubtitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  instructionsInput: {
    height: 80,
    backgroundColor: "#FFFFFF",
    borderColor: "#D4D4D4",
    borderRadius: 10,
    borderWidth: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  focusedInput: {
    borderColor: PRIMARY,
  },
  successBanner: {
    position: "absolute",
    right: 16,
    bottom: 82,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCFCE7",
    borderRadius: 9,
    paddingVertical: 10,
  },
  successText: {
    color: "#15803D",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  addButton: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
    borderRadius: 9,
  },
  addButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
});
