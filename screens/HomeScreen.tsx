import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Settings } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import MapViewLeaflet, {
  MapViewLeafletHandle,
} from "../components/MapViewLeaflet";

const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  * { margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var GRID_SIZE = 0.005;
  var MAX_DELTA_FOR_GRID = 0.15;

  var map = L.map('map', {
    center: [40.7128, -74.006],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  var gridLayer = L.layerGroup().addTo(map);
  var selectedRect = null;
  var selectedKey = null;

  function cellKey(lat, lng) {
    var rLat = Math.round(Math.floor(lat / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
    var rLng = Math.round(Math.floor(lng / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
    return rLat + ',' + rLng;
  }

  function cellBounds(lat, lng) {
    var latStart = Math.round(Math.floor(lat / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
    var lngStart = Math.round(Math.floor(lng / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
    return [[latStart, lngStart], [latStart + GRID_SIZE, lngStart + GRID_SIZE]];
  }

  function drawGrid() {
    gridLayer.clearLayers();
    var bounds = map.getBounds();
    var latDelta = bounds.getNorth() - bounds.getSouth();
    var lngDelta = bounds.getEast() - bounds.getWest();

    if (latDelta > MAX_DELTA_FOR_GRID || lngDelta > MAX_DELTA_FOR_GRID) {
      sendMessage({ type: 'gridVisible', visible: false });
      return;
    }

    sendMessage({ type: 'gridVisible', visible: true });

    var south = bounds.getSouth();
    var north = bounds.getNorth();
    var west = bounds.getWest();
    var east = bounds.getEast();

    var startLat = Math.floor(south / GRID_SIZE) * GRID_SIZE;
    var startLng = Math.floor(west / GRID_SIZE) * GRID_SIZE;

    var gridStyle = { color: 'rgba(0, 80, 180, 0.6)', weight: 1 };

    for (var lat = startLat; lat <= north; lat += GRID_SIZE) {
      var rLat = Math.round(lat * 1e6) / 1e6;
      L.polyline([[rLat, west], [rLat, east]], gridStyle).addTo(gridLayer);
    }
    for (var lng = startLng; lng <= east; lng += GRID_SIZE) {
      var rLng = Math.round(lng * 1e6) / 1e6;
      L.polyline([[south, rLng], [north, rLng]], gridStyle).addTo(gridLayer);
    }
  }

  function selectCell(lat, lng) {
    var key = cellKey(lat, lng);
    if (selectedKey === key) {
      clearSelection();
      return;
    }
    if (selectedRect) {
      map.removeLayer(selectedRect);
    }
    var b = cellBounds(lat, lng);
    selectedRect = L.rectangle(b, {
      color: '#007bff',
      weight: 2,
      fillColor: 'rgba(0, 123, 255, 0.25)',
      fillOpacity: 0.25
    }).addTo(map);
    selectedKey = key;
    sendMessage({ type: 'cellSelected', key: key, bounds: b });
  }

  function clearSelection() {
    if (selectedRect) {
      map.removeLayer(selectedRect);
      selectedRect = null;
    }
    selectedKey = null;
    sendMessage({ type: 'cellCleared' });
  }

  function sendMessage(obj) {
    var msg = JSON.stringify(obj);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  map.on('moveend', drawGrid);
  map.on('zoomend', drawGrid);

  map.on('click', function(e) {
    var bounds = map.getBounds();
    var latDelta = bounds.getNorth() - bounds.getSouth();
    var lngDelta = bounds.getEast() - bounds.getWest();
    if (latDelta > MAX_DELTA_FOR_GRID || lngDelta > MAX_DELTA_FOR_GRID) return;
    selectCell(e.latlng.lat, e.latlng.lng);
  });

  drawGrid();

  document.addEventListener('message', handleExternalMessage);
  window.addEventListener('message', handleExternalMessage);

  function handleExternalMessage(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'setLocation') {
        map.setView([msg.lat, msg.lng], 14);
      } else if (msg.type === 'clearSelection') {
        clearSelection();
      }
    } catch(err) {}
  }
<\/script>
</body>
</html>
`;

export default function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(0));
  const mapRef = useRef<MapViewLeafletHandle>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      mapRef.current?.postMessage(
        JSON.stringify({
          type: "setLocation",
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        })
      );
    })();
  }, []);

  const toggleMenu = () => {
    if (menuOpen) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start(() => setMenuOpen(false));
    } else {
      setMenuOpen(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };

  const menuHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 50],
  });

  const handleMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "cellSelected") {
        setSelectedCell(msg.key);
      } else if (msg.type === "cellCleared") {
        setSelectedCell(null);
      } else if (msg.type === "gridVisible") {
        setShowGrid(msg.visible);
      }
    } catch {}
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCell(null);
    mapRef.current?.postMessage(JSON.stringify({ type: "clearSelection" }));
  }, []);

  return (
    <View style={styles.container}>
      <MapViewLeaflet
        ref={mapRef}
        style={styles.map}
        html={LEAFLET_HTML}
        onMessage={handleMessage}
      />

      {/* Zoom hint banner */}
      {!showGrid && (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>Zoom in to see map grid sections</Text>
        </View>
      )}

      {/* Selected cell indicator */}
      {selectedCell && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionText}>1 section selected</Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearSelection}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings gear */}
      <TouchableOpacity style={styles.gearButton} onPress={toggleMenu}>
        <Settings size={24} color="#333" />
      </TouchableOpacity>

      {menuOpen && (
        <Animated.View style={[styles.menu, { height: menuHeight }]}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => supabase.auth.signOut()}
          >
            <Text style={styles.menuItemText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Dismiss menu on map tap */}
      {menuOpen && (
        <Pressable style={styles.menuDismiss} onPress={toggleMenu} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  gearButton: {
    position: "absolute",
    top: 54,
    right: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  menu: {
    position: "absolute",
    top: 100,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    overflow: "hidden",
    zIndex: 9,
    minWidth: 140,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 16,
    color: "#333",
  },
  menuDismiss: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  hintBanner: {
    position: "absolute",
    top: 54,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  hintText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  selectionBanner: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  selectionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  clearButton: {
    backgroundColor: "#007bff",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  clearButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
