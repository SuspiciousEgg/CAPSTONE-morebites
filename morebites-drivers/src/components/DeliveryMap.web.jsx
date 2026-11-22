import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
    };
  }

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

  let accumulatedDist = haversineMeters(riderCoord, validRoute[nextIdx]);
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
      return {
        heading,
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
    }
    accumulatedDist += haversineMeters(segMid, segEnd);
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

/** Web map: OpenStreetMap embed when live coords exist, plus Turn-by-Turn HUD when navigationMode is enabled. */
export default function DeliveryMap({
  destinationCoord,
  riderCoord,
  routeCoordinates = [],
  navigationMode = false,
  destinationAddress = "",
}) {
  const lastStepKeyRef = useRef("");
  const [osrmStep, setOsrmStep] = useState(null);

  const telemetry = useMemo(
    () =>
      deriveNavigationTelemetry(riderCoord, routeCoordinates, destinationCoord),
    [riderCoord, routeCoordinates, destinationCoord],
  );

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
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [navigationMode, riderCoord, destinationCoord]);

  const dest = destinationCoord || riderCoord;
  if (!dest?.latitude || !dest?.longitude) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>Waiting for live coordinates…</Text>
      </View>
    );
  }

  const focusPoint = navigationMode && riderCoord?.latitude ? riderCoord : dest;
  const lat = Number(focusPoint.latitude);
  const lng = Number(focusPoint.longitude);
  const marker = riderCoord || dest;
  const padLng = navigationMode ? 0.0035 : 0.02;
  const padLat = navigationMode ? 0.0025 : 0.015;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - padLng}%2C${lat - padLat}%2C${lng + padLng}%2C${lat + padLat}&layer=mapnik&marker=${marker.latitude}%2C${marker.longitude}`;

  const activeDirection = osrmStep?.direction || telemetry.direction || "straight";
  const activeInstruction =
    osrmStep?.instruction || telemetry.instruction || "Continue straight";
  const activeDistanceLabel = formatStepDistance(
    osrmStep?.distanceMeters != null
      ? osrmStep.distanceMeters
      : telemetry.distanceMeters,
  );
  const fallbackStreet = destinationAddress
    ? String(destinationAddress).split(",")[0].trim()
    : "Delivery route";
  const activeRoadName = osrmStep?.roadName || fallbackStreet;

  return (
    <View style={styles.wrap}>
      <iframe title="Delivery map" src={src} style={styles.iframe} />
      {navigationMode ? (
        <View style={styles.navHudWrap} pointerEvents="none">
          <View style={styles.navTopBanner}>
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
                  size={20}
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
          <View style={styles.navStreetSubBar}>
            <Ionicons name="navigate-circle" size={15} color="#F97000" />
            <Text style={styles.streetNameText} numberOfLines={1}>
              {activeRoadName}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.caption}>Live delivery map</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    flex: 1,
    justifyContent: "center",
    position: "relative",
  },
  iframe: {
    borderWidth: 0,
    height: "100%",
    width: "100%",
  },
  caption: {
    backgroundColor: "rgba(255,255,255,0.9)",
    bottom: 8,
    color: "#4B5563",
    fontSize: 11,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
  },
  empty: {
    color: "#6B7280",
    fontSize: 13,
    paddingHorizontal: 16,
    textAlign: "center",
  },
  navHudWrap: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FED7AA",
    borderRadius: 14,
    borderWidth: 1,
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
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  maneuverCopy: {
    alignItems: "flex-start",
    flex: 1,
  },
  maneuverDistanceText: {
    color: "#121212",
    fontFamily: FONT,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 23,
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
  streetNameText: {
    color: "#9A3412",
    flex: 1,
    fontFamily: FONT,
    fontSize: 12.5,
    fontWeight: "700",
  },
});
