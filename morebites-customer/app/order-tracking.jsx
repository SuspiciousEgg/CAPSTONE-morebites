import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "../src/components/AppMap";
import { customerApi } from "../src/api/client";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function parseOrder(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function regionFromPoints(points) {
  const valid = points.filter(
    (p) => p && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)),
  );
  if (!valid.length) return null;

  const lats = valid.map((p) => Number(p.latitude));
  const lngs = valid.map((p) => Number(p.longitude));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.8 || 0.02),
    longitudeDelta: Math.max(0.012, (maxLng - minLng) * 1.8 || 0.02),
  };
}

function TimelineStep({ icon, title, description, timestamp, state, last }) {
  const iconStyle =
    state === "complete"
      ? styles.completeIcon
      : state === "active"
        ? styles.activeIcon
        : styles.pendingIcon;
  const iconColor = state === "pending" ? "#9CA3AF" : "#FFFFFF";

  return (
    <View style={styles.timelineStep}>
      <View style={styles.timelineIndicator}>
        <View style={[styles.timelineIcon, iconStyle]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        {!last ? (
          <View style={[styles.timelineLine, state === "complete" && styles.completeLine]} />
        ) : null}
      </View>
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineTitle}>{title}</Text>
        <Text style={styles.timelineDescription}>{description}</Text>
        {timestamp ? <Text style={styles.timelineTime}>{timestamp}</Text> : null}
      </View>
    </View>
  );
}

export default function OrderTrackingScreen() {
  const params = useLocalSearchParams();
  const orderParam = parseOrder(params.order);
  const dbId = Array.isArray(params.dbId) ? params.dbId[0] : params.dbId;
  const orderIdLabel =
    (Array.isArray(params.orderId) ? params.orderId[0] : params.orderId) ||
    orderParam.orderId ||
    "Order";

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(Boolean(dbId));
  const [error, setError] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const loadTracking = useCallback(async () => {
    if (!dbId) {
      setLoading(false);
      setError("Missing order id");
      return;
    }
    try {
      const res = await customerApi.tracking(dbId);
      setTracking(res.data || res);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load tracking");
    } finally {
      setLoading(false);
    }
  }, [dbId]);

  useEffect(() => {
    loadTracking();
    if (!dbId) return undefined;
    const timer = setInterval(loadTracking, 5000);
    return () => clearInterval(timer);
  }, [dbId, loadTracking]);

  const currentStatus = tracking?.status || orderParam.status || "";
  const items = Array.isArray(tracking?.items)
    ? tracking.items
    : Array.isArray(orderParam.items)
      ? orderParam.items
      : [];
  const destination = tracking?.destination || null;
  const rider = tracking?.rider || null;
  const store = tracking?.store || null;
  const route = Array.isArray(tracking?.route) ? tracking.route : [];
  const region = useMemo(
    () => regionFromPoints([...(route || []), destination, rider, store]),
    [route, destination, rider, store],
  );
  const hasMapPoints = Boolean(destination || rider || route.length >= 2);

  const openRating = () => {
    if (currentStatus === "Delivered" || currentStatus === "Completed") {
      router.push({
        pathname: "/rate-order",
        params: {
          dbId: String(dbId || tracking?.db_id || ""),
          foodName: tracking?.items?.[0]?.name || orderParam.items?.[0]?.name || "Your order",
          foodPrice: String(
            tracking?.items?.[0]?.price ||
              orderParam.items?.[0]?.price ||
              tracking?.total ||
              orderParam.total ||
              0,
          ),
          riderName: tracking?.driver || "Your delivery rider",
        },
      });
    }
  };

  const timeline = Array.isArray(tracking?.timeline) ? tracking.timeline : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#121212" />
        </Pressable>
        <Text style={styles.headerTitle}>Order Tracking</Text>
        <View style={styles.orderBadge}>
          <Text style={styles.orderBadgeText}>{tracking?.order_id || orderIdLabel}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading && !tracking ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.loadingText}>Loading live tracking…</Text>
          </View>
        ) : hasMapPoints && region ? (
          <MapView
            style={styles.map}
            initialRegion={region}
            region={region}
            destination={destination}
            rider={rider}
            route={route}
          >
            {destination ? (
              <Marker coordinate={destination} title="Delivery Location" />
            ) : null}
            {rider ? (
              <Marker coordinate={rider} title="Rider">
                <View style={styles.riderMarker}>
                  <Ionicons name="bicycle" size={18} color="#FFFFFF" />
                </View>
              </Marker>
            ) : null}
            {route.length >= 2 ? (
              <Polyline coordinates={route} strokeColor={PRIMARY} strokeWidth={4} />
            ) : destination && rider ? (
              <Polyline
                coordinates={[rider, destination]}
                strokeColor={PRIMARY}
                strokeWidth={4}
              />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.loadingBox}>
            <Ionicons name="map-outline" size={36} color="#9CA3AF" />
            <Text style={styles.loadingText}>
              {error || "Waiting for live route coordinates…"}
            </Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.arrivalCard}>
            <View>
              <Text style={styles.arrivalLabel}>Estimated Arrival</Text>
              <Text style={styles.arrivalTime}>
                {tracking?.eta_mins != null ? `${tracking.eta_mins} min` : "—"}
              </Text>
            </View>
            <View style={styles.arrivalRight}>
              <Text style={styles.arrivalLabel}>By</Text>
              <Text style={styles.arrivalBy}>{tracking?.arrival_by || "—"}</Text>
            </View>
            <View style={styles.distanceRow}>
              <Ionicons name="location" size={14} color="#9CA3AF" />
              <Text style={styles.distanceText}>
                {tracking?.distance_label
                  ? `${tracking.distance_label} away from your location`
                  : "Waiting for route…"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Order Status</Text>
          <View style={styles.timelineCard}>
            {timeline
              ? timeline.map((step, index) => {
                  const node = (
                    <TimelineStep
                      key={step.key || step.title}
                      icon={step.icon || "checkmark"}
                      title={step.title}
                      description={step.description}
                      timestamp={step.timestamp}
                      state={step.state}
                      last={index === timeline.length - 1}
                    />
                  );
                  if (step.key === "Delivered" || step.title === "Delivered") {
                    return (
                      <TouchableOpacity key={step.key} onPress={openRating} activeOpacity={0.8}>
                        {node}
                      </TouchableOpacity>
                    );
                  }
                  return node;
                })
              : (
                <Text style={styles.emptyDetails}>
                  {loading ? "Loading status…" : "Status updates will appear here."}
                </Text>
              )}
          </View>

          <Pressable
            style={styles.detailsToggle}
            onPress={() => setDetailsExpanded((current) => !current)}
          >
            <View style={styles.detailsToggleTitle}>
              <Ionicons name="receipt-outline" size={19} color="#121212" />
              <Text style={styles.detailsToggleText}>Order Details</Text>
            </View>
            <Ionicons
              name={detailsExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#6B7280"
            />
          </Pressable>

          {detailsExpanded ? (
            <View style={styles.expandedDetails}>
              {items.length ? (
                items.map((item) => (
                  <View key={`${item.id}-${item.size}`} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.name}
                      {item.size ? ` (${item.size})` : ""}
                    </Text>
                    <Text style={styles.itemPrice}>
                      ₱{Number(item.price || 0) * Number(item.quantity || 1)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyDetails}>Order items are unavailable</Text>
              )}
              <View style={styles.detailsDivider} />
              <View style={styles.itemRow}>
                <Text style={styles.detailsTotalLabel}>Total Amount</Text>
                <Text style={styles.detailsTotal}>
                  ₱{Number(tracking?.total || orderParam.total || 0).toLocaleString()}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {(currentStatus === "Delivered" || currentStatus === "Completed") &&
        tracking?.proof_of_delivery ? (
          <View style={styles.proofSection}>
            <Text style={styles.proofTitle}>Proof of Delivery</Text>
            <Image
              source={{ uri: tracking.proof_of_delivery }}
              style={styles.proofImage}
              resizeMode="cover"
            />
            <Text style={styles.proofCaption}>
              Photo sent by {tracking?.driver || "your rider"}
              {tracking?.delivered_at_label ? ` · ${tracking.delivered_at_label}` : ""}
            </Text>
          </View>
        ) : null}

        {currentStatus === "Delivered" || currentStatus === "Completed" ? (
          tracking?.rated ? null : (
          <TouchableOpacity style={styles.rateButton} onPress={openRating} activeOpacity={0.85}>
            <Ionicons name="star-outline" size={22} color="#FFFFFF" />
            <Text style={styles.rateButtonText}>Rate Your Order</Text>
          </TouchableOpacity>
          )
        ) : null}
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
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    flex: 1,
    color: "#121212",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginLeft: 12,
  },
  orderBadge: {
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  orderBadgeText: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: "700",
  },
  map: {
    width: "100%",
    height: 250,
  },
  loadingBox: {
    height: 250,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
  },
  loadingText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    textAlign: "center",
  },
  riderMarker: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  arrivalCard: {
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  arrivalLabel: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 11,
  },
  arrivalTime: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 26,
    fontWeight: "700",
    marginTop: 2,
  },
  arrivalRight: {
    position: "absolute",
    top: 14,
    right: 14,
    alignItems: "flex-end",
  },
  arrivalBy: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 12,
  },
  distanceText: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
  },
  sectionTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
  },
  timelineCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
  },
  timelineStep: {
    minHeight: 72,
    flexDirection: "row",
  },
  timelineIndicator: {
    width: 38,
    alignItems: "center",
  },
  timelineIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  completeIcon: {
    backgroundColor: "#22C55E",
  },
  activeIcon: {
    backgroundColor: PRIMARY,
  },
  pendingIcon: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#D1D5DB",
  },
  completeLine: {
    backgroundColor: "#22C55E",
  },
  timelineCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingTop: 2,
  },
  timelineTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  timelineDescription: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 11,
    marginTop: 3,
  },
  timelineTime: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 10,
    marginTop: 2,
  },
  detailsToggle: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  detailsToggleTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailsToggleText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: "600",
  },
  expandedDetails: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#E5E7EB",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 14,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  itemName: {
    flex: 1,
    color: "#4B5563",
    fontFamily: FONT,
    fontSize: 12,
    marginRight: 10,
  },
  itemPrice: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyDetails: {
    color: "#9CA3AF",
    fontFamily: FONT,
    fontSize: 12,
    textAlign: "center",
  },
  detailsDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 6,
  },
  detailsTotalLabel: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: "700",
  },
  detailsTotal: {
    color: PRIMARY,
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
  },
  proofSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderColor: "#F3F4F6",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  proofTitle: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  proofImage: {
    backgroundColor: "#F3F4F6",
    height: 220,
    width: "100%",
  },
  proofCaption: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rateButton: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PRIMARY,
    borderRadius: 9,
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 24,
  },
  rateButtonText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontSize: 18,
    fontWeight: "700",
  },
});
