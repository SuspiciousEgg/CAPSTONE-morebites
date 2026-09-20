import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";

const OSM_TILE = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

export function MapViewWithTiles({ style, initialRegion, region, children, ...props }) {
  return (
    <MapView
      style={style}
      initialRegion={initialRegion}
      region={region}
      mapType="none"
      rotateEnabled={false}
      {...props}
    >
      <UrlTile urlTemplate={OSM_TILE} maximumZ={19} flipY={false} />
      {children}
    </MapView>
  );
}

export { Marker, Polyline };
export default MapViewWithTiles;
