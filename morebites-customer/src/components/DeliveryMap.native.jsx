import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline } from "react-native-maps";
import { StyleSheet, View } from "react-native";

export default function DeliveryMap({
  initialRegion,
  region,
  routeCoordinates = [],
  storeCoord,
  riderCoord,
  destinationCoord,
}) {
  const originPoint =
    storeCoord ||
    (Array.isArray(routeCoordinates) && routeCoordinates.length >= 2 ? routeCoordinates[0] : null);

  return (
    <MapView
      style={styles.map}
      initialRegion={initialRegion}
      region={region || initialRegion}
      rotateEnabled={false}
      scrollEnabled
      zoomEnabled
    >
      {Array.isArray(routeCoordinates) && routeCoordinates.length >= 2 ? (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#F97000"
          strokeWidth={4}
        />
      ) : null}
      {originPoint ? (
        <Marker coordinate={originPoint} anchor={{ x: 0.5, y: 0.5 }} title="MoreBites Store">
          <View style={styles.originMarker}>
            <Ionicons name="storefront" size={14} color="#FFFFFF" />
          </View>
        </Marker>
      ) : null}
      {destinationCoord ? (
        <Marker coordinate={destinationCoord} anchor={{ x: 0.5, y: 0.5 }} title="Delivery Location">
          <View style={styles.destMarkerOuter}>
            <View style={styles.destMarkerInner}>
              <Ionicons name="location" size={15} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      ) : null}
      {riderCoord ? (
        <Marker coordinate={riderCoord} anchor={{ x: 0.5, y: 0.5 }} title="Rider">
          <View style={styles.riderMarkerOuter}>
            <View style={styles.riderMarkerInner}>
              <Ionicons name="bicycle" size={16} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: "100%", width: "100%" },
  originMarker: {
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
});
