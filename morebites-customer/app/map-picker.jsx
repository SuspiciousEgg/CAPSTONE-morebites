import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker } from "../src/components/AppMap";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT = "Plus Jakarta Sans";
const PRIMARY = "#F97000";

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseNominatimAddress(data) {
  if (!data) return { street: "", barangay: "", city: "" };

  const address = data.address || {};

  // 1. Street / Purok
  let road = address.road || address.street || address.residential || address.pedestrian || address.path || "";
  if (address.house_number && road && !road.includes(address.house_number)) {
    road = `${address.house_number} ${road}`;
  }

  // Detect Purok in neighbourhood / quarter / suburb / hamlet
  const purokCandidate = [address.neighbourhood, address.quarter, address.suburb, address.hamlet].find(
    (val) => val && /\b(purok|prk)\b/i.test(val)
  );

  let street = "";
  if (road && purokCandidate && !road.toLowerCase().includes(purokCandidate.toLowerCase())) {
    street = `${road}, ${purokCandidate}`;
  } else if (road) {
    street = road;
  } else if (purokCandidate) {
    street = purokCandidate;
  } else if (address.neighbourhood && !/\b(barangay|brgy)\b/i.test(address.neighbourhood)) {
    street = address.neighbourhood;
  }

  // 2. Barangay
  let barangay = "";
  const brgyCandidate = [
    address.quarter,
    address.suburb,
    address.village,
    address.neighbourhood,
    address.city_district,
  ].find((val) => val && /\b(barangay|brgy)\b/i.test(val));

  if (brgyCandidate) {
    barangay = brgyCandidate;
  } else if (
    [address.quarter, address.suburb, address.village].some(
      (v) => v && v.trim().toLowerCase() === "poblacion"
    )
  ) {
    barangay = "Poblacion";
  } else if (address.village) {
    barangay = address.village;
  } else if (address.quarter && address.quarter !== purokCandidate && address.quarter !== street) {
    barangay = address.quarter;
  } else if (address.suburb && address.suburb !== purokCandidate && address.suburb !== street) {
    barangay = address.suburb;
  } else if (address.city_district) {
    barangay = address.city_district;
  } else if (address.neighbourhood && address.neighbourhood !== street && address.neighbourhood !== purokCandidate) {
    barangay = address.neighbourhood;
  }

  // 3. Municipality / City
  let city =
    address.city ||
    address.town ||
    address.municipality ||
    "";
  if (!city && address.county) {
    city = address.county;
  }

  // Fallback: If address object was missing or didn't provide enough fields, try parsing display_name
  if (!street && !barangay && !city && data.display_name) {
    const parts = data.display_name.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      street = parts[0];
      barangay = parts[1];
      city = parts[2];
    } else if (parts.length === 2) {
      street = parts[0];
      city = parts[1];
    } else if (parts.length === 1) {
      street = parts[0];
    }
  }

  // Prevent duplication between fields
  if (street && barangay && street.trim().toLowerCase() === barangay.trim().toLowerCase()) {
    street = "";
  }
  if (barangay && city && barangay.trim().toLowerCase() === city.trim().toLowerCase()) {
    barangay = "";
  }

  return {
    street: street.trim(),
    barangay: barangay.trim(),
    city: city.trim(),
  };
}

async function reverseGeocode(latitude, longitude) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MoreBitesCapstone/1.0",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      displayName: data?.display_name || null,
      parsed: parseNominatimAddress(data),
    };
  } catch {
    return null;
  }
}

export default function MapPickerScreen() {
  const params = useLocalSearchParams();
  const latitude = Number(firstParam(params.latitude));
  const longitude = Number(firstParam(params.longitude));
  const returnTo = firstParam(params.returnTo) || "/add-address";
  const draft = firstParam(params.draft) || "{}";
  const initialCoordinate =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null;

  const [selectedCoordinate, setSelectedCoordinate] = useState(initialCoordinate);
  const [mapRegion, setMapRegion] = useState(
    initialCoordinate
      ? { ...initialCoordinate, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : null,
  );
  const [addressLabel, setAddressLabel] = useState("");
  const [parsedAddress, setParsedAddress] = useState({ street: "", barangay: "", city: "" });
  const [locating, setLocating] = useState(!initialCoordinate);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (initialCoordinate) {
        const res = await reverseGeocode(
          initialCoordinate.latitude,
          initialCoordinate.longitude,
        );
        if (!cancelled && res) {
          if (res.displayName) setAddressLabel(res.displayName);
          if (res.parsed) setParsedAddress(res.parsed);
        }
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) setLocating(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const coordinate = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setMapRegion({
          ...coordinate,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setSelectedCoordinate(coordinate);
        const res = await reverseGeocode(coordinate.latitude, coordinate.longitude);
        if (!cancelled && res) {
          if (res.displayName) setAddressLabel(res.displayName);
          if (res.parsed) setParsedAddress(res.parsed);
        }
      } catch {
        // leave map empty until user taps
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on param lat/lng
  }, [latitude, longitude]);

  const selectCoordinate = async (coordinate) => {
    const next = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
    setSelectedCoordinate(next);
    setAddressLabel("Looking up address…");
    const res = await reverseGeocode(next.latitude, next.longitude);
    if (res?.displayName) {
      setAddressLabel(res.displayName);
      setParsedAddress(res.parsed || { street: "", barangay: "", city: "" });
    } else {
      setAddressLabel(`${next.latitude.toFixed(6)}, ${next.longitude.toFixed(6)}`);
      setParsedAddress({ street: "", barangay: "", city: "" });
    }
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "MoreBitesCapstone/1.0",
        },
      });
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (!hit) return;
      const coordinate = {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
      };
      setMapRegion({
        ...coordinate,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setSelectedCoordinate(coordinate);
      setAddressLabel(hit.display_name || q);
      setParsedAddress(parseNominatimAddress(hit));
    } catch {
      // keep previous selection
    } finally {
      setSearching(false);
    }
  };

  const confirmLocation = () => {
    if (!selectedCoordinate) return;

    router.replace({
      pathname: returnTo,
      params: {
        draft,
        latitude: String(selectedCoordinate.latitude),
        longitude: String(selectedCoordinate.longitude),
        street: parsedAddress.street || "",
        barangay: parsedAddress.barangay || "",
        city: parsedAddress.city || "",
        fullAddress: addressLabel || "",
      },
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#191919" />
        </Pressable>
        <Text style={styles.headerTitle}>Pick Location</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.mapArea}>
        {mapRegion ? (
          <MapView
            style={styles.map}
            initialRegion={mapRegion}
            region={mapRegion}
            onPress={(event) => selectCoordinate(event.nativeEvent.coordinate)}
          >
            {selectedCoordinate ? (
              <Marker
                coordinate={selectedCoordinate}
                draggable
                onDragEnd={(event) => selectCoordinate(event.nativeEvent.coordinate)}
              />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.mapLoading}>
            {locating ? (
              <>
                <ActivityIndicator color={PRIMARY} />
                <Text style={styles.mapLoadingText}>Getting your location…</Text>
              </>
            ) : (
              <Text style={styles.mapLoadingText}>
                Allow location access, or search below to pick a place.
              </Text>
            )}
          </View>
        )}

        <View style={styles.searchWrap} pointerEvents="box-none">
          <View style={styles.searchBar}>
            <Ionicons name="search" size={19} color="#777777" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search location"
              placeholderTextColor="#888888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={runSearch}
              returnKeyType="search"
            />
            <Pressable onPress={runSearch} hitSlop={8} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <Text style={styles.searchAction}>Go</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.bottomCard}>
          <View style={styles.handle} />
          <View style={styles.addressRow}>
            <View style={styles.pinCircle}>
              <Ionicons name="location" size={21} color={PRIMARY} />
            </View>
            <View style={styles.addressCopy}>
              {selectedCoordinate ? (
                <>
                  <Text style={styles.addressLabel}>Selected address</Text>
                  <Text style={styles.addressText}>
                    {addressLabel || "Selected pin"}
                  </Text>
                  <Text style={styles.coordinatesText}>
                    {selectedCoordinate.latitude.toFixed(6)}, {selectedCoordinate.longitude.toFixed(6)}
                  </Text>
                </>
              ) : (
                <Text style={styles.tapHint}>Tap on the map to select your location</Text>
              )}
            </View>
          </View>
          <Pressable
            style={[styles.confirmButton, !selectedCoordinate && styles.disabledButton]}
            onPress={confirmLocation}
            disabled={!selectedCoordinate}
          >
            <Text style={styles.confirmButtonText}>Confirm Location</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 15, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EEEEEE", zIndex: 2 },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: FONT, fontSize: 18, fontWeight: "700", color: "#191919" },
  headerSpacer: { width: 24 },
  mapArea: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    gap: 10,
    paddingHorizontal: 24,
  },
  mapLoadingText: {
    color: "#6B7280",
    fontFamily: FONT,
    fontSize: 13,
    textAlign: "center",
  },
  searchWrap: { position: "absolute", top: 14, right: 16, left: 16 },
  searchBar: { height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#FFFFFF", shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  searchInput: { flex: 1, marginLeft: 9, paddingVertical: 0, fontFamily: FONT, fontSize: 13, color: "#333333" },
  searchAction: { color: PRIMARY, fontFamily: FONT, fontSize: 13, fontWeight: "700" },
  bottomCard: { position: "absolute", right: 0, bottom: 0, left: 0, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: "#FFFFFF", shadowColor: "#000000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D7D7D7", marginBottom: 17 },
  addressRow: { flexDirection: "row", alignItems: "center" },
  pinCircle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#FFF0E5", marginRight: 12 },
  addressCopy: { flex: 1 },
  addressLabel: { fontFamily: FONT, fontSize: 11, color: "#858585" },
  addressText: { marginTop: 2, fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#252525" },
  coordinatesText: { marginTop: 3, fontFamily: FONT, fontSize: 10, color: "#888888" },
  tapHint: { fontFamily: FONT, fontSize: 12, color: "#777777" },
  confirmButton: { height: 54, alignItems: "center", justifyContent: "center", marginTop: 18, borderRadius: 11, backgroundColor: PRIMARY },
  disabledButton: { backgroundColor: "#CFCFCF" },
  confirmButtonText: { fontFamily: FONT, fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
