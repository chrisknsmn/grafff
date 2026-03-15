import { useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Settings } from "lucide-react-native";
import { supabase } from "../lib/supabase";

export default function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(0));

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

  return (
    <View style={styles.container}>
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

      <Pressable
        style={styles.content}
        onPress={() => menuOpen && toggleMenu()}
      >
        <Text style={styles.title}>Hello, World!</Text>
        <Text style={styles.subtitle}>Welcome to grafff</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  gearButton: {
    position: "absolute",
    top: 54,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  menu: {
    position: "absolute",
    top: 90,
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
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
  },
});
