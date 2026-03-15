import { useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Settings } from "lucide-react-native";
import { supabase } from "../lib/supabase";

const globeHTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    overflow: hidden;
    background: #000011;
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  #hud {
    position: fixed; bottom: 12px; left: 12px;
    color: rgba(74,144,217,0.7); font: 11px monospace;
    z-index: 999; pointer-events: none;
    text-shadow: 0 0 4px rgba(0,0,17,0.8);
    line-height: 1.5;
  }
  #loading-indicator {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    color: rgba(74,144,217,0.6); font: 14px monospace;
    z-index: 999; pointer-events: none;
    transition: opacity 1s;
  }
</style>
</head>
<body>
<div id="hud"></div>
<div id="loading-indicator">loading globe...</div>
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/"
}}</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

try {
  // ─── Scene ────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000011);
  scene.fog = new THREE.FogExp2(0x000011, 0.08);

  // ─── Renderer ─────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.sortObjects = true;
  document.body.appendChild(renderer.domElement);

  // ─── Camera ───────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.0001, 1000);
  camera.position.set(0, 0.5, 3.0);

  // ─── Globe mesh ───────────────────────────────────
  const GLOBE_R = 1.0;
  const globeGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x0a0a2e,
    transparent: true,
    opacity: 0.97,
    shininess: 30,
    specular: 0x222244,
  });
  const globeMesh = new THREE.Mesh(globeGeo, globeMat);
  scene.add(globeMesh);

  // ─── Atmosphere ───────────────────────────────────
  const atmosGeo = new THREE.SphereGeometry(1.12, 64, 64);
  const atmosMat = new THREE.ShaderMaterial({
    vertexShader: \`
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }\`,
    fragmentShader: \`
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0,0,1)), 2.0);
        gl_FragColor = vec4(0.29, 0.56, 0.85, 1.0) * intensity;
      }\`,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
  });
  scene.add(new THREE.Mesh(atmosGeo, atmosMat));

  // ─── Hex-dot grid ─────────────────────────────────
  function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  const dotPositions = [];
  for (let lat = -80; lat <= 80; lat += 2.8) {
    let lonStep = 2.8 / Math.cos(lat * Math.PI / 180);
    if (lonStep > 30) lonStep = 30;
    for (let lon = -180; lon < 180; lon += lonStep) {
      const offset = (Math.round(lat / 2.8) % 2 === 0) ? lonStep / 2 : 0;
      const p = latLonToVec3(lat, lon + offset, GLOBE_R + 0.003);
      dotPositions.push(p.x, p.y, p.z);
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0x4a90d9, size: 0.012, sizeAttenuation: true,
    transparent: true, opacity: 0.6, depthWrite: false,
  });
  const dotPoints = new THREE.Points(dotGeo, dotMat);
  scene.add(dotPoints);

  // ─── Country outlines (TopoJSON) ─────────────────
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')
    .then(r => r.json())
    .then(topo => {
      const arcs = topo.arcs;
      const tf = topo.transform;
      function decodeArc(ai) {
        const rev = ai < 0;
        const arc = arcs[rev ? ~ai : ai];
        const coords = [];
        let x = 0, y = 0;
        for (let i = 0; i < arc.length; i++) {
          x += arc[i][0]; y += arc[i][1];
          coords.push([x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]]);
        }
        if (rev) coords.reverse();
        return coords;
      }
      function decodeGeometry(obj) {
        let lines = [];
        if (obj.type === 'GeometryCollection') {
          obj.geometries.forEach(g => { lines = lines.concat(decodeGeometry(g)); });
        } else {
          const rings = obj.type === 'Polygon' ? obj.arcs : obj.type === 'MultiPolygon' ? obj.arcs.flat() : [];
          rings.forEach(ring => {
            let coords = [];
            ring.forEach(ai => { coords = coords.concat(decodeArc(ai)); });
            lines.push(coords);
          });
        }
        return lines;
      }
      const allLines = decodeGeometry(topo.objects.land);
      const lp = [];
      allLines.forEach(coords => {
        for (let i = 0; i < coords.length - 1; i++) {
          const a = latLonToVec3(coords[i][1], coords[i][0], GLOBE_R + 0.001);
          const b = latLonToVec3(coords[i + 1][1], coords[i + 1][0], GLOBE_R + 0.001);
          lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      const outlines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
        color: 0x4a90d9, transparent: true, opacity: 0.45
      }));
      scene.add(outlines);
      document.getElementById('loading-indicator').style.opacity = '0';
    });

  // ─── Lighting ─────────────────────────────────────
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);
  scene.add(new THREE.AmbientLight(0x8090b0, 0.8));
  const hemiLight = new THREE.HemisphereLight(0x4a90d9, 0x0a0a2e, 0.3);
  scene.add(hemiLight);

  // ─── Controls ─────────────────────────────────────
  const MIN_DIST = 1.015;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.5;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.8;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = 8;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  };

  // ─── Tile helpers ─────────────────────────────────
  function lon2tile(lon, z) { return Math.floor((lon + 180) / 360 * (1 << z)); }
  function lat2tile(lat, z) {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
  }
  function tile2lon(x, z) { return x / (1 << z) * 360 - 180; }
  function tile2lat(y, z) {
    const n = Math.PI - 2 * Math.PI * y / (1 << z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function distToZoom(d) {
    if (d > 2.5) return -1;
    if (d > 2.0) return 3;
    if (d > 1.6) return 5;
    if (d > 1.35) return 7;
    if (d > 1.2) return 10;
    if (d > 1.1) return 13;
    if (d > 1.05) return 15;
    return 17;
  }

  function createSpherePatch(latT, latB, lonL, lonR, radius, seg) {
    const verts = [], uvs = [], idx = [];
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, v = j / seg;
        const lat = latT + (latB - latT) * v;
        const lon = lonL + (lonR - lonL) * u;
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        verts.push(
          -radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
        uvs.push(u, 1 - v);
      }
    }
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + 1, c = a + (seg + 1), d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ─── Tile LOD system ──────────────────────────────
  const tileGroup = new THREE.Group();
  scene.add(tileGroup);
  let tileMeshes = {};
  let lastTileUpdate = 0;
  let tileLoadCount = 0;

  function getCameraLookLatLon() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = ray.intersectObject(globeMesh);
    if (hits.length === 0) return null;
    const p = hits[0].point;
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, p.y / GLOBE_R))) * 180 / Math.PI;
    let lon = Math.atan2(p.z, -p.x) * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }

  function updateTiles() {
    const dist = camera.position.length();
    const zoom = distToZoom(dist);

    if (zoom < 0) {
      Object.keys(tileMeshes).forEach(k => {
        tileGroup.remove(tileMeshes[k]);
        if (tileMeshes[k].material.map) tileMeshes[k].material.map.dispose();
        tileMeshes[k].material.dispose();
        tileMeshes[k].geometry.dispose();
      });
      tileMeshes = {};
      dotPoints.visible = true;
      return;
    }

    // Fade dots
    dotPoints.visible = dist > 1.8;
    if (dist > 1.8 && dist < 2.5) {
      dotMat.opacity = Math.min(0.6, (dist - 1.8) * 1.5);
    }

    globeMesh.visible = dist > MIN_DIST + 0.005;

    const lookAt = getCameraLookLatLon();
    if (!lookAt) return;

    const cx = lon2tile(lookAt.lon, zoom);
    const cy = lat2tile(lookAt.lat, zoom);
    const maxT = 1 << zoom;

    // Adaptive tile radius based on zoom
    const radius = zoom > 12 ? 2 : 3;
    const needed = {};
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        let tx = cx + dx, ty = cy + dy;
        if (ty < 0 || ty >= maxT) continue;
        tx = ((tx % maxT) + maxT) % maxT;
        const key = zoom + '/' + tx + '/' + ty;
        needed[key] = { x: tx, y: ty, z: zoom };
      }
    }

    // Remove unneeded tiles
    Object.keys(tileMeshes).forEach(k => {
      if (!needed[k]) {
        tileGroup.remove(tileMeshes[k]);
        if (tileMeshes[k].material.map) tileMeshes[k].material.map.dispose();
        tileMeshes[k].material.dispose();
        tileMeshes[k].geometry.dispose();
        delete tileMeshes[k];
      }
    });

    // Load needed tiles
    Object.keys(needed).forEach(k => {
      if (tileMeshes[k]) return;
      const t = needed[k];
      const lonL = tile2lon(t.x, t.z);
      const lonR = tile2lon(t.x + 1, t.z);
      const latT = tile2lat(t.y, t.z);
      const latB = tile2lat(t.y + 1, t.z);

      const geo = createSpherePatch(latT, latB, lonL, lonR, GLOBE_R + 0.002, 16);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1;
      tileGroup.add(mesh);
      tileMeshes[k] = mesh;

      const url = 'https://tile.openstreetmap.org/' + t.z + '/' + t.x + '/' + t.y + '.png';
      fetch(url)
        .then(r => r.blob())
        .then(blob => {
          const objUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const tex = new THREE.Texture(img);
            tex.needsUpdate = true;
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.opacity = 0.95;
            mat.needsUpdate = true;
            URL.revokeObjectURL(objUrl);
            tileLoadCount++;
          };
          img.src = objUrl;
        })
        .catch(() => {});
    });
  }

  // ─── 3D Buildings (Overpass API) ──────────────────
  const buildingGroup = new THREE.Group();
  scene.add(buildingGroup);
  const loadedBuildingTiles = {};
  let lastBuildingUpdate = 0;
  let buildingLoadInProgress = false;

  // Convert lat/lon polygon to 3D extruded mesh on the globe
  function createBuildingMesh(coords, heightMeters, lat, lon) {
    // heightMeters -> globe scale. Earth radius ~6371km, globe radius = 1
    // So 1 meter = 1 / 6371000 in globe units
    const scale = 1 / 6371000;
    const h = Math.max(heightMeters, 8) * scale * 3.0; // exaggerate height 3x for visibility

    // Create a shape from the lat/lon coordinates
    const shape = new THREE.Shape();
    const points3d = [];

    for (let i = 0; i < coords.length; i++) {
      const cLon = coords[i][0];
      const cLat = coords[i][1];
      // Project to local tangent plane centered on building centroid
      const dx = (cLon - lon) * Math.cos(lat * Math.PI / 180) * Math.PI / 180 * 6371000 * scale;
      const dy = (cLat - lat) * Math.PI / 180 * 6371000 * scale;
      if (i === 0) shape.moveTo(dx, dy);
      else shape.lineTo(dx, dy);
    }

    const extrudeSettings = { depth: h, bevelEnabled: false };

    try {
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Position on globe
      const surfacePos = latLonToVec3(lat, lon, GLOBE_R + 0.002);
      const normal = surfacePos.clone().normalize();

      const mat = new THREE.MeshPhongMaterial({
        color: 0x6688cc,
        transparent: true,
        opacity: 0.85,
        shininess: 60,
        specular: 0x334466,
        flatShading: false,
      });

      const mesh = new THREE.Mesh(geo, mat);

      // Orient: the extrusion goes along Z, we want it along the globe normal
      // Create a basis where "up" is the globe normal
      const up = normal;
      const east = new THREE.Vector3(0, 1, 0).cross(up).normalize();
      if (east.length() < 0.001) east.set(1, 0, 0);
      const north = up.clone().cross(east).normalize();

      const matrix = new THREE.Matrix4();
      matrix.makeBasis(east, north, up);
      matrix.setPosition(surfacePos);

      mesh.applyMatrix4(matrix);
      return mesh;
    } catch (e) {
      return null;
    }
  }

  function parseBuildingHeight(tags) {
    if (tags.height) {
      const h = parseFloat(tags.height);
      if (!isNaN(h)) return h;
    }
    if (tags['building:levels']) {
      const levels = parseInt(tags['building:levels']);
      if (!isNaN(levels)) return levels * 3.5;
    }
    // Default heights by building type
    const type = tags.building;
    if (type === 'skyscraper') return 150;
    if (type === 'apartments' || type === 'residential') return 18;
    if (type === 'commercial' || type === 'office') return 25;
    if (type === 'industrial' || type === 'warehouse') return 10;
    if (type === 'church' || type === 'cathedral') return 30;
    return 10;
  }

  function loadBuildings(lat, lon) {
    if (buildingLoadInProgress) return;
    // Create a tile key based on ~0.01 degree grid
    const tileKey = Math.round(lat * 100) + ',' + Math.round(lon * 100);
    if (loadedBuildingTiles[tileKey]) return;

    buildingLoadInProgress = true;
    loadedBuildingTiles[tileKey] = 'loading';

    // Query a small bbox around the point
    const delta = 0.008; // ~800m area
    const bbox = (lat - delta) + ',' + (lon - delta) + ',' + (lat + delta) + ',' + (lon + delta);

    const query = '[out:json][timeout:10];(way["building"](' + bbox + ');relation["building"](' + bbox + '););out body;>;out skel qt;';
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const nodes = {};
        const ways = {};

        data.elements.forEach(el => {
          if (el.type === 'node') nodes[el.id] = el;
          if (el.type === 'way') ways[el.id] = el;
        });

        let buildingCount = 0;
        const maxBuildings = 200; // limit for performance

        Object.values(ways).forEach(way => {
          if (buildingCount >= maxBuildings) return;
          if (!way.tags || !way.tags.building) return;
          if (!way.nodes || way.nodes.length < 4) return;

          const coords = [];
          let cLat = 0, cLon = 0, valid = true;

          for (let i = 0; i < way.nodes.length; i++) {
            const n = nodes[way.nodes[i]];
            if (!n) { valid = false; break; }
            coords.push([n.lon, n.lat]);
            cLat += n.lat;
            cLon += n.lon;
          }
          if (!valid || coords.length < 4) return;

          cLat /= way.nodes.length;
          cLon /= way.nodes.length;

          const height = parseBuildingHeight(way.tags);
          const mesh = createBuildingMesh(coords, height, cLat, cLon);
          if (mesh) {
            mesh.userData.tileKey = tileKey;
            buildingGroup.add(mesh);
            buildingCount++;
          }
        });

        loadedBuildingTiles[tileKey] = 'loaded';
        buildingLoadInProgress = false;
      })
      .catch(() => {
        loadedBuildingTiles[tileKey] = 'error';
        buildingLoadInProgress = false;
      });
  }

  function updateBuildings() {
    const dist = camera.position.length();

    // Only show buildings when zoomed in close
    if (dist > 1.08) {
      buildingGroup.visible = false;
      return;
    }
    buildingGroup.visible = true;

    // Fade buildings in
    const opacity = Math.min(1, (1.08 - dist) / 0.03);
    buildingGroup.children.forEach(child => {
      if (child.material) child.material.opacity = opacity * 0.85;
    });

    const lookAt = getCameraLookLatLon();
    if (!lookAt) return;

    loadBuildings(lookAt.lat, lookAt.lon);

    // Clean up far-away building tiles
    const currentKey = Math.round(lookAt.lat * 100) + ',' + Math.round(lookAt.lon * 100);
    const keysToRemove = [];
    Object.keys(loadedBuildingTiles).forEach(k => {
      if (loadedBuildingTiles[k] !== 'loaded') return;
      const parts = k.split(',');
      const tLat = parseInt(parts[0]) / 100;
      const tLon = parseInt(parts[1]) / 100;
      const dLat = Math.abs(tLat - lookAt.lat);
      const dLon = Math.abs(tLon - lookAt.lon);
      if (dLat > 0.05 || dLon > 0.05) {
        keysToRemove.push(k);
      }
    });
    keysToRemove.forEach(k => {
      const toRemove = [];
      buildingGroup.children.forEach(child => {
        if (child.userData.tileKey === k) toRemove.push(child);
      });
      toRemove.forEach(m => {
        buildingGroup.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      delete loadedBuildingTiles[k];
    });
  }

  // ─── HUD ──────────────────────────────────────────
  const hud = document.getElementById('hud');

  // ─── Resize ───────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── Animation loop ───────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Clamp camera distance
    const dist = camera.position.length();
    if (dist < MIN_DIST) {
      camera.position.normalize().multiplyScalar(MIN_DIST);
    }

    const now = performance.now();

    // Update tiles every 400ms
    if (now - lastTileUpdate > 400) {
      updateTiles();
      lastTileUpdate = now;
    }

    // Update buildings every 800ms
    if (now - lastBuildingUpdate > 800) {
      updateBuildings();
      lastBuildingUpdate = now;
    }

    // HUD
    const zoom = distToZoom(dist);
    const lookAt = getCameraLookLatLon();
    const latStr = lookAt ? lookAt.lat.toFixed(4) : '--';
    const lonStr = lookAt ? lookAt.lon.toFixed(4) : '--';
    hud.textContent = 'alt: ' + dist.toFixed(3) + '  zoom: ' + zoom + '  lat: ' + latStr + '  lon: ' + lonStr +
      '\\ntiles: ' + Object.keys(tileMeshes).length + '  buildings: ' + buildingGroup.children.length;

    renderer.render(scene, camera);
  }
  animate();

} catch(e) {
  document.body.innerHTML = '<pre style="color:red;padding:20px;font-size:14px;">' + e.message + '\\n' + e.stack + '</pre>';
}
</script>
</body>
</html>
`;

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
      {/* Gear icon */}
      <TouchableOpacity style={styles.gearButton} onPress={toggleMenu}>
        <Settings size={24} color="#aaa" />
      </TouchableOpacity>

      {/* Slide-down menu */}
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

      {/* 3D Globe via WebView */}
      <WebView
        style={styles.webview}
        source={{ html: globeHTML }}
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentMode="mobile"
        scalesPageToFit={false}
        allowFileAccessFromFileURLs={true}
        mixedContentMode="compatibility"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000011",
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
    backgroundColor: "#1a1a2e",
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
    color: "#ccc",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000011",
  },
});
