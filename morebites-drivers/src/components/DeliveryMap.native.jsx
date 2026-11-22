import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const FONT = "Plus Jakarta Sans";

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function isValidCoord(pt) {
  return (
    pt &&
    Number.isFinite(Number(pt.latitude)) &&
    Number.isFinite(Number(pt.longitude))
  );
}

function haversineMeters(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return 0;
  const R = 6371000;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function computeBearing(from, to) {
  if (!isValidCoord(from) || !isValidCoord(to)) return 0;
  const lat1 = toRad(Number(from.latitude));
  const lat2 = toRad(Number(to.latitude));
  const dLon = toRad(Number(to.longitude) - Number(from.longitude));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function normalizeDeltaAngle(b1, b2) {
  let diff = ((b2 - b1 + 540) % 360) - 180;
  if (diff === -180) diff = 180;
  return diff;
}

function formatStepDistance(meters) {
  const m = Math.max(0, Math.round(Number(meters) || 0));
  if (m >= 1000) {
    return `${(m / 1000).toFixed(1)} km`;
  }
  if (m >= 100) {
    return `${Math.round(m / 10) * 10} m`;
  }
  return `${Math.max(10, Math.round(m / 5) * 5)} m`;
}

function deriveNavigationTelemetry(riderCoord, routeCoordinates, destinationCoord) {
  const validRoute = Array.isArray(routeCoordinates)
    ? routeCoordinates.filter(isValidCoord)
    : [];

  if (!isValidCoord(riderCoord)) {
    return {
      heading: 0,
      distanceMeters: 70,
      direction: "straight",
      instruction: "Continue straight",
      aheadArrowPoint: null,
    };
  }

  if (validRoute.length < 2) {
    const target = isValidCoord(destinationCoord) ? destinationCoord : riderCoord;
    const dist = haversineMeters(riderCoord, target);
    const heading = computeBearing(riderCoord, target);
    return {
      heading,
      distanceMeters: dist || 70,
      direction: dist < 25 ? "arrive" : "straight",
      instruction: dist < 25 ? "Arrive at destination" : "Continue straight",
      aheadArrowPoint: null,
    };
  }

  // Find closest vertex index to current rider position
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < validRoute.length; i += 1) {
    const d = haversineMeters(riderCoord, validRoute[i]);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  const nextIdx = Math.min(closestIdx + 1, validRoute.length - 1);
  const lookAheadPt = validRoute[nextIdx] || destinationCoord || riderCoord;
  const heading = computeBearing(riderCoord, lookAheadPt);

  // Compute an arrow point slightly ahead on the route for the road overlay
  const arrowIdx = Math.min(closestIdx + 2, validRoute.length - 1);
  const aheadArrowPoint =
    arrowIdx > closestIdx ? validRoute[arrowIdx] : lookAheadPt;

  // Walk forward along the polyline to find the next turn where bearing changes >= 28 deg
  let accumulatedDist = haversineMeters(riderCoord, validRoute[nextIdx]);
  let foundTurn = null;

  for (let i = nextIdx; i < validRoute.length - 1; i += 1) {
    const segStart = i === nextIdx ? riderCoord : validRoute[i - 1];
    const segMid = validRoute[i];
    const segEnd = validRoute[i + 1];
    const b1 = computeBearing(segStart, segMid);
    const b2 = computeBearing(segMid, segEnd);
    const turnAngle = normalizeDeltaAngle(b1, b2);

    if (Math.abs(turnAngle) >= 28) {
      const isRight = turnAngle > 0;
      const isSharp = Math.abs(turnAngle) >= 55;
      foundTurn = {
        distanceMeters: accumulatedDist,
        direction: isRight ? "right" : "left",
        instruction: isRight
          ? isSharp
            ? "Turn right"
            : "Keep right"
          : isSharp
            ? "Turn left"
            : "Keep left",
      };
      break;
    }

    accumulatedDist += haversineMeters(segMid, segEnd);
  }

  if (foundTurn) {
    return {
      heading,
      distanceMeters: foundTurn.distanceMeters,
      direction: foundTurn.direction,
      instruction: foundTurn.instruction,
      aheadArrowPoint,
    };
  }

  const totalRemaining =
    accumulatedDist ||
    (isValidCoord(destinationCoord)
      ? haversineMeters(riderCoord, destinationCoord)
      : 70);

  return {
    heading,
    distanceMeters: totalRemaining,
    direction: totalRemaining < 30 ? "arrive" : "straight",
    instruction:
      totalRemaining < 30 ? "Arrive at destination" : "Continue straight",
    aheadArrowPoint,
  };
}

function parseOsrmManeuver(step) {
  if (!step) return null;
  const type = step?.maneuver?.type || "";
  const mod = step?.maneuver?.modifier || "";
  const dist = Number(step?.distance);
  const roadName = String(step?.name || step?.ref || "").trim();

  if (type === "arrive") {
    return {
      direction: "arrive",
      instruction: "Arrive at destination",
      distanceMeters: Number.isFinite(dist) ? dist : null,
      roadName,
    };
  }
  if (mod.includes("left")) {
    return {
      direction: "left",
      instruction: mod.includes("slight") ? "Keep left" : "Turn left",
      distanceMeters: Number.isFinite(dist) ? dist : null,
      roadName,
    };
  }
  if (mod.includes("right")) {
    return {
      direction: "right",
      instruction: mod.includes("slight") ? "Keep right" : "Turn right",
      distanceMeters: Number.isFinite(dist) ? dist : null,
      roadName,
    };
  }
  return {
    direction: "straight",
    instruction: "Continue straight",
    distanceMeters: Number.isFinite(dist) ? dist : null,
    roadName,
  };
}

export default function DeliveryMap({
  initialRegion,
  region,
  routeCoordinates = [],
  storeCoord,
  riderCoord,
  destinationCoord,
  navigationMode = false,
  destinationAddress = "",
}) {
  const mapRef = useRef(null);
  const lastStepKeyRef = useRef("");
  const [osrmStep, setOsrmStep] = useState(null);

  const originPoint =
    storeCoord ||
    (Array.isArray(routeCoordinates) && routeCoordinates.length >= 2
      ? routeCoordinates[0]
      : null);

  const telemetry = useMemo(
    () =>
      deriveNavigationTelemetry(riderCoord, routeCoordinates, destinationCoord),
    [riderCoord, routeCoordinates, destinationCoord],
  );

  // Fetch turn-by-turn road name & step instruction from OSRM when in navigation mode
  useEffect(() => {
    if (
      !navigationMode ||
      !isValidCoord(riderCoord) ||
      !isValidCoord(destinationCoord)
    ) {
      return undefined;
    }

    const stepKey = `${Number(riderCoord.latitude).toFixed(4)},${Number(riderCoord.longitude).toFixed(4)}->${Number(destinationCoord.latitude).toFixed(4)},${Number(destinationCoord.longitude).toFixed(4)}`;
    if (stepKey === lastStepKeyRef.current) return undefined;
    lastStepKeyRef.current = stepKey;

    let cancelled = false;
    const url = `https://router.project-osrm.org/route/v1/driving/${Number(riderCoord.longitude)},${Number(riderCoord.latitude)};${Number(destinationCoord.longitude)},${Number(destinationCoord.latitude)}?overview=false&steps=true`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.routes?.[0]?.legs?.[0]?.steps) return;
        const steps = data.routes[0].legs[0].steps;
        const upcoming =
          steps.find(
            (s) => s?.maneuver?.type && s.maneuver.type !== "depart" && s.distance > 5,
          ) ||
          steps[1] ||
          steps[0];
        const parsed = parseOsrmManeuver(upcoming);
        const currentRoad = String(steps[0]?.name || upcoming?.name || "").trim();
        if (parsed) {
          setOsrmStep({
            ...parsed,
            roadName: parsed.roadName || currentRoad,
          });
        }
      })
      .catch(() => {
        // Fallback to local route geometry telemetry
      });

    return () => {
      cancelled = true;
    };
  }, [navigationMode, riderCoord, destinationCoord]);

  // Animate camera between 3D first-person Turn-by-Turn view and 2D Top-Down overview
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (navigationMode) {
      const centerTarget = isValidCoord(riderCoord)
        ? {
            latitude: Number(riderCoord.latitude),
            longitude: Number(riderCoord.longitude),
          }
        : isValidCoord(destinationCoord)
          ? {
              latitude: Number(destinationCoord.latitude),
              longitude: Number(destinationCoord.longitude),
            }
          : region || initialRegion;

      if (centerTarget?.latitude && centerTarget?.longitude) {
        map.animateCamera(
          {
            center: {
              latitude: Number(centerTarget.latitude),
              longitude: Number(centerTarget.longitude),
            },
            pitch: 60,
            heading: telemetry.heading || 0,
            zoom: 18,
            altitude: 220,
          },
          { duration: 600 },
        );
      }
    } else {
      const targetRegion = region || initialRegion;
      if (targetRegion) {
        map.animateCamera(
          {
            center: {
              latitude: Number(targetRegion.latitude),
              longitude: Number(targetRegion.longitude),
            },
            pitch: 0,
            heading: 0,
          },
          { duration: 400 },
        );
        const t = setTimeout(() => {
          mapRef.current?.animateToRegion?.(targetRegion, 350);
        }, 180);
        return () => clearTimeout(t);
      }
    }
    return undefined;
  }, [
    navigationMode,
    riderCoord,
    destinationCoord,
    telemetry.heading,
    region,
    initialRegion,
  ]);

  const activeDirection = osrmStep?.direction || telemetry.direction || "straight";
  const activeInstruction =
    osrmStep?.instruction || telemetry.instruction || "Continue straight";
  const activeDistanceLabel = formatStepDistance(
    osrmStep?.distanceMeters != null
      ? osrmStep.distanceMeters
      : telemetry.distanceMeters,
  );
  const fallbackStreet = useMemo(() => {
    if (!destinationAddress) return "Delivery route";
    const firstPart = String(destinationAddress).split(",")[0].trim();
    return firstPart || destinationAddress;
  }, [destinationAddress]);
  const activeRoadName = osrmStep?.roadName || fallbackStreet;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        region={navigationMode ? undefined : region || initialRegion}
        rotateEnabled={navigationMode}
        pitchEnabled={navigationMode}
        scrollEnabled
        zoomEnabled
      >
        {Array.isArray(routeCoordinates) && routeCoordinates.length >= 2 ? (
          navigationMode ? (
            <>
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#C2410C"
                strokeWidth={10}
              />
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#F97000"
                strokeWidth={6}
              />
            </>
          ) : (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#F97000"
              strokeWidth={4}
            />
          )
        ) : null}

        {/* Standardized Store Origin Marker (#F97000 + storefront icon) */}
        {originPoint ? (
          <Marker
            coordinate={originPoint}
            anchor={{ x: 0.5, y: 0.5 }}
            title="MoreBites Store"
          >
            <View style={styles.originMarkerOuter}>
              <View style={styles.originMarkerInner}>
                <Ionicons name="storefront" size={14} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        ) : null}

        {/* Standardized Customer Destination Marker (#EF4444 + location pin icon) */}
        {destinationCoord ? (
          <Marker
            coordinate={destinationCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Delivery Location"
          >
            <View style={styles.destMarkerOuter}>
              <View style={styles.destMarkerInner}>
                <Ionicons name="location" size={15} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        ) : null}

        {/* Forward direction arrow along route in Turn-by-Turn mode */}
        {navigationMode && telemetry.aheadArrowPoint ? (
          <Marker
            coordinate={telemetry.aheadArrowPoint}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={telemetry.heading || 0}
          >
            <View style={styles.routeAheadArrow}>
              <Ionicons name="arrow-up" size={14} color="#F97000" />
            </View>
          </Marker>
        ) : null}

        {/* Standardized Rider Marker: Forward Navigation Chevron in Turn-by-Turn, Green Rider Badge in Top-Down */}
        {riderCoord ? (
          <Marker
            coordinate={riderCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Rider"
            flat={navigationMode}
          >
            {navigationMode ? (
              <View style={styles.navPuckOuter}>
                <View style={styles.navPuckInner}>
                  <Ionicons
                    name="navigate"
                    size={18}
                    color="#FFFFFF"
                    style={styles.navPuckIcon}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.riderMarkerOuter}>
                <View style={styles.riderMarkerInner}>
                  <Ionicons name="bicycle" size={16} color="#FFFFFF" />
                </View>
              </View>
            )}
          </Marker>
        ) : null}
      </MapView>

      {/* First-Person Turn-by-Turn Navigation HUD Card (Aligned with MoreBites System Design) */}
      {navigationMode ? (
        <View style={styles.navHudWrap} pointerEvents="none">
          <View style={styles.navTopBanner}>
            {/* Lane / Turn Direction Strip */}
            <View style={styles.laneStrip}>
              <View
                style={[
                  styles.laneSlot,
                  activeDirection === "left" && styles.laneSlotActive,
                ]}
              >
                <Ionicons
                  name="return-up-back"
                  size={18}
                  color={activeDirection === "left" ? "#FFFFFF" : "#9CA3AF"}
                />
              </View>
              <View style={styles.laneDivider} />
              <View
                style={[
                  styles.laneSlot,
                  (activeDirection === "straight" ||
                    activeDirection === "arrive") &&
                    styles.laneSlotActive,
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={
                    activeDirection === "straight" ||
                    activeDirection === "arrive"
                      ? "#FFFFFF"
                      : "#9CA3AF"
                  }
                />
              </View>
              <View style={styles.laneDivider} />
              <View
                style={[
                  styles.laneSlot,
                  activeDirection === "right" && styles.laneSlotActive,
                ]}
              >
                <Ionicons
                  name="return-up-forward"
                  size={18}
                  color={activeDirection === "right" ? "#FFFFFF" : "#9CA3AF"}
                />
              </View>
            </View>

            {/* Distance & Primary Turn Instruction */}
            <View style={styles.maneuverRow}>
              <View style={styles.maneuverIconBadge}>
                <Ionicons
                  name={
                    activeDirection === "left"
                      ? "return-up-back"
                      : activeDirection === "right"
                        ? "return-up-forward"
                        : activeDirection === "arrive"
                          ? "location"
                          : "arrow-up"
                  }
                  size={22}
                  color="#F97000"
                />
              </View>
              <View style={styles.maneuverCopy}>
                <Text style={styles.maneuverDistanceText}>
                  {activeDistanceLabel}
                </Text>
                <Text style={styles.maneuverInstructionText} numberOfLines={1}>
                  {activeInstruction}
                </Text>
              </View>
            </View>
          </View>

          {/* Street / Road Sub-Banner */}
          <View style={styles.navStreetSubBar}>
            <View style={styles.streetCompassIcon}>
              <Ionicons name="navigate-circle" size={16} color="#F97000" />
            </View>
            <Text style={styles.streetNameText} numberOfLines={1}>
              {activeRoadName}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    position: "relative",
    width: "100%",
  },
  map: {
    height: "100%",
    width: "100%",
  },
  originMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(249, 112, 0, 0.22)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  originMarkerInner: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  riderMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.22)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  riderMarkerInner: {
    alignItems: "center",
    backgroundColor: "#22C55E",
    borderColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  destMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.22)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  destMarkerInner: {
    alignItems: "center",
    backgroundColor: "#EF4444",
    borderColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  navPuckOuter: {
    alignItems: "center",
    backgroundColor: "rgba(249, 112, 0, 0.24)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  navPuckInner: {
    alignItems: "center",
    backgroundColor: "#F97000",
    borderColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 2.5,
    elevation: 5,
    height: 36,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 36,
  },
  navPuckIcon: {
    transform: [{ rotate: "-45deg" }],
  },
  routeAheadArrow: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#F97000",
    borderRadius: 11,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  navHudWrap: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FED7AA",
    borderRadius: 14,
    borderWidth: 1,
    elevation: 6,
    left: 10,
    overflow: "hidden",
    position: "absolute",
    right: 10,
    shadowColor: "#121212",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    top: 10,
    zIndex: 10,
  },
  navTopBanner: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  laneStrip: {
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
    paddingVertical: 4,
  },
  laneSlot: {
    alignItems: "center",
    borderRadius: 7,
    justifyContent: "center",
    marginHorizontal: 6,
    paddingHorizontal: 14,
    paddingVertical: 3,
  },
  laneSlotActive: {
    backgroundColor: "#F97000",
  },
  laneDivider: {
    backgroundColor: "#E5E7EB",
    height: 14,
    width: 1,
  },
  maneuverRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  maneuverIconBadge: {
    alignItems: "center",
    backgroundColor: "#FFF4E5",
    borderColor: "#FED7AA",
    borderRadius: 11,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  maneuverCopy: {
    alignItems: "flex-start",
    flex: 1,
  },
  maneuverDistanceText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 24,
  },
  maneuverInstructionText: {
    color: "#F97000",
    fontFamily: FONT,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 1,
  },
  navStreetSubBar: {
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderTopColor: "#FED7AA",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  streetCompassIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  streetNameText: {
    color: "#9A3412",
    flex: 1,
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "700",
  },
});
