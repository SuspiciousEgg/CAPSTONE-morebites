import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { StyleSheet, View } from "react-native";

const OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function DeliveryMap({
  initialRegion,
  region,
  routeCoordinates = [],
  riderCoord,
  destinationCoord,
}) {
  return (
    <MapView
      style={styles.map}
      initialRegion={initialRegion}
      region={region || initialRegion}
      mapType="none"
      rotateEnabled={false}
      scrollEnabled
      zoomEnabled
    >
      <UrlTile urlTemplate={OSM_TILE} maximumZ={19} flipY={false} />
      {Array.isArray(routeCoordinates) && routeCoordinates.length >= 2 ? (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#F97000"
          strokeWidth={4}
          lineDashPattern={[8, 8]}
        />
      ) : null}
      {riderCoord ? (
        <Marker coordinate={riderCoord} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.riderMarkerOuter}>
            <View style={styles.riderMarkerInner} />
          </View>
        </Marker>
      ) : null}
      {destinationCoord ? (
        <Marker coordinate={destinationCoord} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.destMarkerOuter}>
            <View style={styles.destMarkerInner} />
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: "100%", width: "100%" },
  riderMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.25)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  riderMarkerInner: {
    backgroundColor: "#22C55E",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 2.5,
    height: 18,
    width: 18,
  },
  destMarkerOuter: {
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.25)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  destMarkerInner: {
    backgroundColor: "#EF4444",
    borderColor: "#FFFFFF",
    borderRadius: 9,
    borderWidth: 2.5,
    height: 18,
    width: 18,
  },
});
