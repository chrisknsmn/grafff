import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Eye, Settings } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import MapViewLeaflet, {
  MapViewLeafletHandle,
} from "../components/MapViewLeaflet";
import BuildingScene from "./BuildingScene";

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
  var GRID_COLOR = 'rgba(0, 80, 180, 0.6)';
  var GRID_FILL = 'rgba(0, 120, 255, 0.05)';
  var SELECT_COLOR = '#007bff';
  var SELECT_FILL = 'rgba(0, 123, 255, 0.25)';
  var FADE_DURATION = 350;
  var FADE_MAX_DELAY = 300;

  var map = L.map('map', {
    center: [40.7128, -74.006],
    zoom: 14,
    minZoom: 3,
    maxBoundsViscosity: 1.0,
    maxBounds: [[-85, -Infinity], [85, Infinity]],
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  map.createPane('gridPane');
  var gridPane = map.getPane('gridPane');
  var gridLayer = L.layerGroup({ pane: 'gridPane' }).addTo(map);

  var gridShowing = false;
  var gridFadingOut = false;
  var drawnCells = {};
  var zoomingOut = false;
  var preZoomLevel = map.getZoom();
  var lastCenter = map.getCenter();
  var selectedRect = null;
  var selectedKey = null;

  function roundCoord(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  function snapCoord(value) {
    return roundCoord(Math.floor(value / GRID_SIZE) * GRID_SIZE);
  }

  function cellKey(lat, lng) {
    return snapCoord(lat) + ',' + snapCoord(lng);
  }

  function cellBounds(lat, lng) {
    var latStart = snapCoord(lat);
    var lngStart = snapCoord(lng);
    return [[latStart, lngStart], [latStart + GRID_SIZE, lngStart + GRID_SIZE]];
  }

  function sendMessage(obj) {
    var msg = JSON.stringify(obj);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  function setGridVisible(visible) {
    if (visible !== gridShowing) {
      gridShowing = visible;
      sendMessage({ type: 'gridVisible', visible: visible });
    }
  }

  function clearGrid() {
    gridLayer.clearLayers();
    drawnCells = {};
  }

  function getMapDeltaState() {
    var bounds = map.getBounds();
    var latDelta = bounds.getNorth() - bounds.getSouth();
    var lngDelta = bounds.getEast() - bounds.getWest();
    return {
      bounds: bounds,
      latDelta: latDelta,
      lngDelta: lngDelta,
      inRange: latDelta <= MAX_DELTA_FOR_GRID && lngDelta <= MAX_DELTA_FOR_GRID
    };
  }

  function styleFadeInCells(cells) {
    if (!cells.length) return;

    // Sort by distance so we can stagger cell-by-cell in order
    cells.sort(function(a, b) { return a.dist - b.dist; });

    var totalStagger = Math.min(cells.length * 15, 600);
    var perCellDelay = cells.length > 1 ? totalStagger / (cells.length - 1) : 0;
    var cellFade = 0.18;

    for (var i = 0; i < cells.length; i++) {
      var el = cells[i].rect.getElement();
      if (!el) continue;

      el.style.opacity = '0';
      el.style.transition = 'opacity ' + cellFade + 's ease-out';

      (function(element, d) {
        setTimeout(function() {
          element.style.opacity = '1';
        }, d);
      })(el, Math.round(i * perCellDelay));
    }
  }

  function fadeOutGridFromEdges() {
    setGridVisible(false);
    gridFadingOut = true;

    var fadeCenter = map.getCenter();
    var fadeKeys = Object.keys(drawnCells);
    var fadeCells = [];
    var fadeMaxDist = 0;

    for (var i = 0; i < fadeKeys.length; i++) {
      var key = fadeKeys[i];
      var parts = key.split(',');
      var cLat = parseFloat(parts[0]) + GRID_SIZE / 2;
      var cLng = parseFloat(parts[1]) + GRID_SIZE / 2;
      var dist = Math.sqrt(Math.pow(cLat - fadeCenter.lat, 2) + Math.pow(cLng - fadeCenter.lng, 2));

      if (dist > fadeMaxDist) fadeMaxDist = dist;
      fadeCells.push({ rect: drawnCells[key], dist: dist });
    }

    for (var i = 0; i < fadeCells.length; i++) {
      var el = fadeCells[i].rect.getElement();
      if (!el) continue;
      el.style.transition = 'none';
      el.style.opacity = '1';
    }

    gridPane.style.display = '';

    requestAnimationFrame(function() {
      for (var i = 0; i < fadeCells.length; i++) {
        var el = fadeCells[i].rect.getElement();
        if (!el) continue;

        el.style.transition = 'opacity ' + (FADE_DURATION / 1000) + 's ease';

        var delay = fadeMaxDist > 0
          ? Math.round(((fadeMaxDist - fadeCells[i].dist) / fadeMaxDist) * FADE_MAX_DELAY)
          : 0;

        (function(element, d) {
          setTimeout(function() {
            element.style.opacity = '0';
          }, d);
        })(el, delay);
      }

      setTimeout(function() {
        clearGrid();
        gridFadingOut = false;
      }, FADE_MAX_DELAY + FADE_DURATION + 50);
    });
  }

  function drawGrid() {
    var state = getMapDeltaState();
    var bounds = state.bounds;
    var shouldShow = state.inRange;

    setGridVisible(shouldShow);
    if (!shouldShow) {
      if (!gridFadingOut) clearGrid();
      return;
    }

    var bufferLat = state.latDelta * 0.05;
    var bufferLng = state.lngDelta * 0.05;
    var south = bounds.getSouth() - bufferLat;
    var north = bounds.getNorth() + bufferLat;
    var west = bounds.getWest() - bufferLng;
    var east = bounds.getEast() + bufferLng;

    var startLat = Math.floor(south / GRID_SIZE) * GRID_SIZE;
    var startLng = Math.floor(west / GRID_SIZE) * GRID_SIZE;

    var center = map.getCenter();
    // Determine drag direction: new cells appear on the opposite side
    // Use lastCenter as the origin so cells closest to where we came from fade in first
    var dragOriginLat = lastCenter.lat;
    var dragOriginLng = lastCenter.lng;
    lastCenter = center;

    var needed = {};
    var newCells = [];
    var cellStyle = {
      color: GRID_COLOR,
      weight: 1,
      fillColor: GRID_FILL,
      fillOpacity: 1
    };

    for (var lat = startLat; lat < north; lat += GRID_SIZE) {
      for (var lng = startLng; lng < east; lng += GRID_SIZE) {
        var rLat = roundCoord(lat);
        var rLng = roundCoord(lng);
        var key = rLat + ',' + rLng;

        needed[key] = true;
        if (drawnCells[key]) continue;

        var rect = L.rectangle(
          [[rLat, rLng], [rLat + GRID_SIZE, rLng + GRID_SIZE]],
          cellStyle
        ).addTo(gridLayer);

        drawnCells[key] = rect;

        var cellCenterLat = rLat + GRID_SIZE / 2;
        var cellCenterLng = rLng + GRID_SIZE / 2;
        // Distance from the drag origin — cells nearest to where we
        // came from (existing cells) get the shortest delay
        var dist = Math.sqrt(
          Math.pow(cellCenterLat - dragOriginLat, 2) +
          Math.pow(cellCenterLng - dragOriginLng, 2)
        );

        newCells.push({ rect: rect, dist: dist });
      }
    }

    styleFadeInCells(newCells);

    for (var key in drawnCells) {
      if (!needed[key]) {
        gridLayer.removeLayer(drawnCells[key]);
        delete drawnCells[key];
      }
    }
  }

  function clearSelection() {
    if (selectedRect) {
      map.removeLayer(selectedRect);
      selectedRect = null;
    }
    selectedKey = null;
    sendMessage({ type: 'cellCleared' });
  }

  function selectCell(lat, lng) {
    var key = cellKey(lat, lng);
    if (selectedKey === key) return clearSelection();

    if (selectedRect) map.removeLayer(selectedRect);

    var bounds = cellBounds(lat, lng);
    selectedRect = L.rectangle(bounds, {
      color: SELECT_COLOR,
      weight: 2,
      fillColor: SELECT_FILL,
      fillOpacity: 0.25
    }).addTo(map);

    selectedKey = key;
    sendMessage({ type: 'cellSelected', key: key, bounds: bounds });
  }

  new MutationObserver(function() {
    var svgs = gridPane.querySelectorAll('.leaflet-zoom-animated');
    for (var i = 0; i < svgs.length; i++) {
      svgs[i].classList.remove('leaflet-zoom-animated');
    }
  }).observe(gridPane, { childList: true, subtree: true });

  map.on('zoomstart', function() {
    preZoomLevel = map.getZoom();
    if (gridShowing && !gridFadingOut) {
      zoomingOut = true;
      gridPane.style.display = 'none';
    }
  });

  map.on('zoomend', function() {
    if (!zoomingOut) return;
    zoomingOut = false;

    var cur = map.getZoom();
    if (cur >= preZoomLevel) {
      gridPane.style.display = '';
      drawGrid();
      return;
    }

    if (getMapDeltaState().inRange) {
      gridPane.style.display = '';
      drawGrid();
      return;
    }

    fadeOutGridFromEdges();
  });

  map.on('moveend', drawGrid);
  map.on('zoomend', drawGrid);

  map.on('click', function(e) {
    if (!getMapDeltaState().inRange) return;
    selectCell(e.latlng.lat, e.latlng.lng);
  });

  function handleExternalMessage(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'setLocation') {
        map.setView([msg.lat, msg.lng], 14);
      } else if (msg.type === 'clearSelection') {
        clearSelection();
      }
    } catch (err) {}
  }

  document.addEventListener('message', handleExternalMessage);
  window.addEventListener('message', handleExternalMessage);

  drawGrid();
<\/script>
</body>
</html>
`;

const MENU_HEIGHT = 50;
const MENU_DURATION = 200;
const MAP_ZOOM_LOCATION = 14;

export default function HomeScreen() {
  const mapRef = useRef<MapViewLeafletHandle>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [viewing3D, setViewing3D] = useState<string | null>(null);

  useEffect(() => {
    const setCurrentLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const { coords } = await Location.getCurrentPositionAsync({});
      mapRef.current?.postMessage(
        JSON.stringify({
          type: "setLocation",
          lat: coords.latitude,
          lng: coords.longitude,
          zoom: MAP_ZOOM_LOCATION,
        })
      );
    };

    setCurrentLocation();
  }, []);

  const animateMenu = useCallback(
    (open: boolean) => {
      if (open) setMenuOpen(true);

      Animated.timing(slideAnim, {
        toValue: open ? 1 : 0,
        duration: MENU_DURATION,
        useNativeDriver: false,
      }).start(() => {
        if (!open) setMenuOpen(false);
      });
    },
    [slideAnim]
  );

  const toggleMenu = useCallback(() => {
    animateMenu(!menuOpen);
  }, [animateMenu, menuOpen]);

  const handleMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case "cellSelected":
          setSelectedCell(msg.key);
          break;
        case "cellCleared":
          setSelectedCell(null);
          break;
        case "gridVisible":
          setShowGrid(msg.visible);
          break;
      }
    } catch {}
  }, []);

  const postToMap = useCallback((message: object) => {
    mapRef.current?.postMessage(JSON.stringify(message));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCell(null);
    postToMap({ type: "clearSelection" });
  }, [postToMap]);

  const menuHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MENU_HEIGHT],
  });

  return (
    <View style={styles.container}>
      <MapViewLeaflet
        ref={mapRef}
        style={styles.map}
        html={LEAFLET_HTML}
        onMessage={handleMessage}
      />

      {!showGrid && (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>Zoom in to see map grid sections</Text>
        </View>
      )}

      {selectedCell && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionText}>1 section selected</Text>

          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setViewing3D(selectedCell)}
            >
              <Eye size={14} color="#fff" />
              <Text style={styles.primaryButtonText}>View 3D</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleClearSelection}
            >
              <Text style={styles.primaryButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {viewing3D && (
        <View style={StyleSheet.absoluteFill}>
          <BuildingScene
            cellKey={viewing3D}
            onBack={() => setViewing3D(null)}
          />
        </View>
      )}

      <TouchableOpacity style={styles.gearButton} onPress={toggleMenu}>
        <Settings size={24} color="#333" />
      </TouchableOpacity>

      {menuOpen && (
        <>
          <Animated.View style={[styles.menu, { height: menuHeight }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => supabase.auth.signOut()}
            >
              <Text style={styles.menuItemText}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>

          <Pressable style={styles.menuDismiss} onPress={toggleMenu} />
        </>
      )}
    </View>
  );
}

const sharedShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 4,
  elevation: 5,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

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
    zIndex: 9,
    minWidth: 140,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderRadius: 8,
    ...sharedShadow,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
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

  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#007bff",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },

  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});