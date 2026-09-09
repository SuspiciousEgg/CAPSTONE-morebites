import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function getRatingLabel(rating) {
  return ["Not rated", "Bad", "Poor", "Okay", "Good", "Excellent"][rating] || "Not rated";
}

function StarSummary({ rating }) {
  return (
    <View style={styles.summaryStars}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? "star" : "star-outline"}
          size={17}
          color={star <= rating ? PRIMARY : "#D1D5DB"}
        />
      ))}
    </View>
  );
}

function RatingCard({ type, name, subtitle, rating }) {
  const isFood = type === "food";

  return (
    <View style={styles.ratingCard}>
      <View style={styles.cardImage}>
        <Ionicons
          name={isFood ? "pizza-outline" : "bicycle"}
          size={26}
          color={isFood ? PRIMARY : "#121212"}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.ratingSummary}>
        <StarSummary rating={rating} />
        <Text style={styles.ratingLabel}>{getRatingLabel(rating)}</Text>
      </View>
    </View>
  );
}

export default function RateThanksScreen() {
  const params = useLocalSearchParams();
  const foodName = params.foodName || "Supreme Pizza";
  const foodPrice = Number(params.foodPrice) || 480;
  const foodRating = Number(params.foodRating) || 0;
  const riderRating = Number(params.riderRating) || 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          <Text style={styles.title}>Thanks for your feedback!</Text>
          <Text style={styles.subtitle}>
            Your ratings help us improve our food and delivery service.
          </Text>
        </View>

        <View style={styles.cards}>
          <RatingCard
            type="food"
            name={foodName}
            subtitle={`₱${foodPrice}`}
            rating={foodRating}
          />
          <RatingCard
            type="rider"
            name="John Morebytes"
            subtitle="Delivery Rider"
            rating={riderRating}
          />
        </View>

        <Pressable style={styles.homeButton} onPress={() => router.replace("/(tabs)/home")}>
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  topSection: {
    alignItems: "center",
  },
  title: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 20,
  },
  subtitle: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 18,
  },
  cards: {
    gap: 12,
    marginTop: 32,
  },
  ratingCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  cardImage: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#F3F4F6",
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardName: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "700",
  },
  cardSubtitle: {
    color: "#8A8A8A",
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 3,
  },
  ratingSummary: {
    alignItems: "flex-end",
  },
  summaryStars: {
    flexDirection: "row",
    gap: 2,
  },
  ratingLabel: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 4,
  },
  homeButton: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: PRIMARY,
    marginTop: 32,
  },
  homeButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 17,
    fontWeight: "700",
  },
});
