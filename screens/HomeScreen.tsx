import { useCallback, useMemo, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Polygon, Region } from "react-native-maps";
import { Settings } from "lucide-react-native";
import { supabase } from "../lib/supabase";

// Grid cell size in degrees (~500m at mid-latitudes)
const GRID_SIZE = 0.005;

// Zoom threshold: only show grid when zoomed in enough
const MAX_DELTA_FOR_GRID = 0.15;

type GridCell = {
  key: string;
  latStart: number;
  lngStart: number;
  latEnd: number;
  lngEnd: number;
};

function computeGridCells(region: Region): GridCell[] {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  // Don't render grid when zoomed too far out
  if (latitudeDelta > MAX_DELTA_FOR_GRID || longitudeDelta > MAX_DELTA_FOR_GRID) {
    return [];
  }

  const south = latitude - latitudeDelta / 2;
  const north = latitude + latitudeDelta / 2;
  const west = longitude - longitudeDelta / 2;
  const east = longitude + longitudeDelta / 2;

  // Snap to grid boundaries
  const startLat = Math.floor(south / GRID_SIZE) * GRID_SIZE;
  const startLng = Math.floor(west / GRID_SIZE) * GRID_SIZE;

  const cells: GridCell[] = [];

  for (let lat = startLat; lat < north; lat += GRID_SIZE) {
    for (let lng = startLng; lng < east; lng += GRID_SIZE) {
      // Round to avoid floating point drift in keys
      const rLat = Math.round(lat * 1e6) / 1e6;
      const rLng = Math.round(lng * 1e6) / 1e6;
      cells.push({
        key: `${rLat},${rLng}`,
        latStart: rLat,
        lngStart: rLng,
        latEnd: rLat + GRID_SIZE,
        lngEnd: rLng + GRID_SIZE,
      });
    }
  }

  return cells;
}

function GridCellOverlay({
  cell,
  isSelected,
  onPress,
}: {
  cell: GridCell;
  isSelected: boolean;
  onPress: (cell: GridCell) => void;
}) {
  const coordinates = [
    { latitude: cell.latStart, longitude: cell.lngStart },
    { latitude: cell.latEnd, longitude: cell.lngStart },
    { latitude: cell.latEnd, longitude: cell.lngEnd },
    { latitude: cell.latStart, longitude: cell.lngEnd },
  ];

  return (
    <Polygon
      coordinates={coordinates}
      strokeColor={isSelected ? "#007bff" : "rgba(0, 120, 255, 0.4)"}
      strokeWidth={isSelected ? 2 : 0.5}
      fillColor={isSelected ? "rgba(0, 123, 255, 0.25)" : "rgba(0, 120, 255, 0.05)"}
      tappable
      onPress={() => onPress(cell)}
    />
  );
}

export default function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(0));
  const [region, setRegion] = useState<Region>({
    latitude: 40.7128,
    longitude: -74.006,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  const gridCells = useMemo(() => computeGridCells(region), [region]);

  const showGrid = region.latitudeDelta <= MAX_DELTA_FOR_GRID;

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

  const handleCellPress = useCallback((cell: GridCell) => {
    setSelectedCell((prev) => (prev === cell.key ? null : cell.key));
  }, []);

  const handleRegionChange = useCallback((newRegion: Region) => {
    setRegion(newRegion);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChange}
        mapType="mutedStandard"
        rotateEnabled={false}
      >
        {gridCells.map((cell) => (
          <GridCellOverlay
            key={cell.key}
            cell={cell}
            isSelected={selectedCell === cell.key}
            onPress={handleCellPress}
          />
        ))}
      </MapView>

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
            onPress={() => setSelectedCell(null)}
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
