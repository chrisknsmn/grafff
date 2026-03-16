import React, { useCallback, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import Scene3D, { Scene3DHandle } from "../components/Scene3D";

interface CellBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

function buildSceneHTML(bounds: CellBounds): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #e8ecf1; }
  canvas { display: block; }
  #loading {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #e8ecf1; z-index: 10; font-family: system-ui, sans-serif;
    flex-direction: column; gap: 12px; color: #555;
  }
  #loading.hidden { display: none; }
  .spinner {
    width: 32px; height: 32px; border: 3px solid #ccc;
    border-top-color: #007bff; border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #info {
    position: fixed; bottom: 16px; left: 16px;
    background: rgba(255,255,255,0.9); padding: 8px 14px;
    border-radius: 8px; font-family: system-ui, sans-serif;
    font-size: 13px; color: #333; pointer-events: none;
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  }
  #toolbar {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.95); padding: 8px 14px;
    border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 5; user-select: none; -webkit-user-select: none;
    font-family: system-ui, sans-serif; font-size: 13px;
  }
  #toolbar.drawing { border: 2px solid #e03030; }
  .tool-btn {
    padding: 6px 14px; border-radius: 8px; border: 2px solid #ccc;
    background: #fff; cursor: pointer; font-weight: 600; font-size: 13px;
    font-family: system-ui, sans-serif; color: #333;
  }
  .tool-btn.active { border-color: #e03030; color: #e03030; background: #fff0f0; }
  .color-swatch {
    width: 26px; height: 26px; border-radius: 50%; border: 2px solid #ccc;
    cursor: pointer; box-sizing: border-box;
  }
  .color-swatch.selected { border-color: #333; border-width: 3px; }
  #brushSlider { width: 60px; accent-color: #e03030; }
  #undoBtn { color: #555; }
  #undoBtn:disabled { opacity: 0.3; cursor: default; }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><div>Loading buildings...</div></div>
<div id="info"></div>
<div id="toolbar">
  <button class="tool-btn" id="drawToggle">Draw</button>
  <div class="color-swatch selected" style="background:#e03030" data-color="#e03030"></div>
  <div class="color-swatch" style="background:#2196f3" data-color="#2196f3"></div>
  <div class="color-swatch" style="background:#4caf50" data-color="#4caf50"></div>
  <div class="color-swatch" style="background:#ff9800" data-color="#ff9800"></div>
  <div class="color-swatch" style="background:#9c27b0" data-color="#9c27b0"></div>
  <div class="color-swatch" style="background:#222222" data-color="#222222"></div>
  <div class="color-swatch" style="background:#ffffff" data-color="#ffffff"></div>
  <input type="range" id="brushSlider" min="2" max="30" value="8" title="Brush size">
  <button class="tool-btn" id="undoBtn" disabled>Undo</button>
</div>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.164.1/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.164.1/examples/jsm/"
  }
}
<\/script>
<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

  var SOUTH = ${bounds.south};
  var WEST = ${bounds.west};
  var NORTH = ${bounds.north};
  var EAST = ${bounds.east};
  var SCALE = 51000;

  var refLat = (SOUTH + NORTH) / 2;
  var refLng = (WEST + EAST) / 2;

  function project(lat, lng) {
    var x = (lng - refLng) * SCALE * Math.cos(refLat * Math.PI / 180);
    var y = (lat - refLat) * SCALE;
    return { x: x, y: y };
  }

  // Scene setup
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8ecf1);

  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 80, 120);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.1;

  // Lighting
  var ambient = new THREE.AmbientLight(0xffffff, 2.2);
  scene.add(ambient);

  var sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(50, 100, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  scene.add(sun);

  // Ground disc
  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(200, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.65 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  var buildingPairs = [];

  // Fetch buildings from Overpass API
  var query = '[out:json][timeout:25];(' +
    'way["building"](' + SOUTH + ',' + WEST + ',' + NORTH + ',' + EAST + ');' +
    'relation["building"](' + SOUTH + ',' + WEST + ',' + NORTH + ',' + EAST + ');' +
    ');out body geom;';

  var overpassServers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];
  var serverIndex = 0;

  function fetchOverpass(q, retries) {
    var url = overpassServers[serverIndex % overpassServers.length];
    var statusEl = document.getElementById('loading').querySelector('div:last-child');
    return fetch(url, {
      method: 'POST',
      body: q,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).then(function(r) {
      if ((r.status === 429 || r.status === 504 || r.status === 503) && retries > 0) {
        serverIndex++;
        var nextUrl = overpassServers[serverIndex % overpassServers.length];
        var shortName = nextUrl.split('//')[1].split('/')[0];
        statusEl.textContent = 'Server busy, trying ' + shortName + '...';
        return new Promise(function(resolve) {
          setTimeout(resolve, 2000);
        }).then(function() {
          return fetchOverpass(q, retries - 1);
        });
      }
      if (!r.ok) throw new Error('Overpass returned ' + r.status);
      return r.json();
    }).catch(function(err) {
      if (retries > 0) {
        serverIndex++;
        statusEl.textContent = 'Retrying...';
        return new Promise(function(resolve) {
          setTimeout(resolve, 2000);
        }).then(function() {
          return fetchOverpass(q, retries - 1);
        });
      }
      throw err;
    });
  }

  var edgeMat = new THREE.LineBasicMaterial({ color: 0x444444 });
  var buildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

  fetchOverpass(query, 6)
  .then(function(data) {
    var buildings = data.elements;

    var count = 0;
    buildings.forEach(function(bld) {
      if (!bld.geometry || bld.geometry.length < 3) return;

      var pts = bld.geometry.map(function(pt) {
        var p = project(pt.lat, pt.lon);
        return new THREE.Vector2(p.x, p.y);
      });

      if (!pts[0].equals(pts[pts.length - 1])) pts.push(pts[0].clone());

      var shape = new THREE.Shape(pts);
      var height = parseFloat(bld.tags.height || '');
      var levels = parseFloat(bld.tags['building:levels'] || '');
      if (isNaN(height)) height = 10;
      if (!isNaN(levels)) height = levels * 3.2;

      var geom = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: height,
        bevelEnabled: false
      });

      var mesh = new THREE.Mesh(geom, buildingMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { tags: bld.tags, id: bld.id };
      scene.add(mesh);

      var edges = new THREE.EdgesGeometry(geom, 15);
      var line = new THREE.LineSegments(edges, edgeMat);
      line.rotation.x = -Math.PI / 2;
      scene.add(line);

      mesh.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(mesh);
      buildingPairs.push({ mesh: mesh, edges: line, box: box });
      count++;
    });

    document.getElementById('info').textContent = count + ' buildings loaded';
    document.getElementById('loading').classList.add('hidden');

    sendMessage({ type: 'loaded', count: count });
  })
  .catch(function(err) {
    console.error('Building fetch error:', err);
    document.getElementById('loading').innerHTML =
      '<div style="color:#c00">Failed to load buildings</div>';
    sendMessage({ type: 'error', message: err.message });
  });

  // --- Decal-based drawing system ---
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  var drawMode = false;
  var isDrawing = false;
  var currentColor = '#e03030';
  var brushSize = 8;
  var lastPaintPos = null;
  var allDecals = [];       // every decal mesh in the scene
  var undoStack = [];        // each entry is an array of decal meshes from one stroke
  var currentStrokeDecals = [];

  // Brush size maps from slider (2-30) to world units
  function brushWorldSize() {
    return brushSize * 0.08;
  }

  function getBuildingMeshes() {
    return buildingPairs.map(function(bp) { return bp.mesh; }).filter(function(m) { return m.visible; });
  }

  // Create a round decal texture
  var decalCanvas = document.createElement('canvas');
  decalCanvas.width = 64;
  decalCanvas.height = 64;
  var dctx = decalCanvas.getContext('2d');
  dctx.beginPath();
  dctx.arc(32, 32, 30, 0, Math.PI * 2);
  dctx.fillStyle = '#ffffff';
  dctx.fill();
  var decalTex = new THREE.CanvasTexture(decalCanvas);

  function createDecalMaterial(color) {
    return new THREE.MeshBasicMaterial({
      map: decalTex,
      color: new THREE.Color(color),
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });
  }

  function placeDecal(hit) {
    var mesh = hit.object;
    var position = hit.point.clone();
    var normal = hit.face.normal.clone();

    // Transform normal to world space
    normal.transformDirection(mesh.matrixWorld);

    // Orient decal along surface normal
    var orientation = new THREE.Euler();
    var lookTarget = position.clone().add(normal);
    var dummy = new THREE.Object3D();
    dummy.position.copy(position);
    dummy.lookAt(lookTarget);
    orientation.copy(dummy.rotation);

    var size = brushWorldSize();
    var sizeVec = new THREE.Vector3(size, size, size);

    var decalGeom = new DecalGeometry(mesh, position, orientation, sizeVec);
    var decalMesh = new THREE.Mesh(decalGeom, createDecalMaterial(currentColor));
    scene.add(decalMesh);
    allDecals.push(decalMesh);
    currentStrokeDecals.push(decalMesh);
  }

  // --- Toolbar wiring ---
  document.getElementById('drawToggle').addEventListener('click', function() {
    drawMode = !drawMode;
    this.classList.toggle('active', drawMode);
    this.textContent = drawMode ? 'Drawing' : 'Draw';
    document.getElementById('toolbar').classList.toggle('drawing', drawMode);
    controls.enabled = !drawMode;
  });

  document.querySelectorAll('.color-swatch').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('.color-swatch').forEach(function(s) { s.classList.remove('selected'); });
      el.classList.add('selected');
      currentColor = el.dataset.color;
    });
  });

  document.getElementById('brushSlider').addEventListener('input', function() {
    brushSize = parseInt(this.value);
  });

  document.getElementById('undoBtn').addEventListener('click', function() {
    if (undoStack.length === 0) return;
    var strokeDecals = undoStack.pop();
    strokeDecals.forEach(function(d) {
      scene.remove(d);
      d.geometry.dispose();
      var idx = allDecals.indexOf(d);
      if (idx >= 0) allDecals.splice(idx, 1);
    });
    document.getElementById('undoBtn').disabled = undoStack.length === 0;
  });

  function hitTest(x, y) {
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var hits = raycaster.intersectObjects(getBuildingMeshes());
    return hits.length > 0 ? hits[0] : null;
  }

  var MIN_SPACING = 0.15;

  renderer.domElement.addEventListener('pointerdown', function(e) {
    if (!drawMode) return;
    e.preventDefault();
    isDrawing = true;
    lastPaintPos = null;
    currentStrokeDecals = [];
    var hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      placeDecal(hit);
      lastPaintPos = hit.point.clone();
    }
  });

  renderer.domElement.addEventListener('pointermove', function(e) {
    if (!drawMode || !isDrawing) return;
    e.preventDefault();
    var hit = hitTest(e.clientX, e.clientY);
    if (hit) {
      // Space decals along the stroke for smooth coverage
      if (!lastPaintPos || hit.point.distanceTo(lastPaintPos) >= brushWorldSize() * 0.3) {
        placeDecal(hit);
        lastPaintPos = hit.point.clone();
      }
    }
  });

  renderer.domElement.addEventListener('pointerup', function() {
    if (isDrawing && currentStrokeDecals.length > 0) {
      undoStack.push(currentStrokeDecals);
      if (undoStack.length > 30) {
        var old = undoStack.shift();
        old.forEach(function(d) { scene.remove(d); d.geometry.dispose(); });
      }
      document.getElementById('undoBtn').disabled = false;
    }
    isDrawing = false;
    lastPaintPos = null;
    currentStrokeDecals = [];
  });

  renderer.domElement.addEventListener('pointerleave', function() {
    if (isDrawing && currentStrokeDecals.length > 0) {
      undoStack.push(currentStrokeDecals);
      document.getElementById('undoBtn').disabled = false;
    }
    isDrawing = false;
    lastPaintPos = null;
    currentStrokeDecals = [];
  });

  // Info on click (only when not drawing)
  renderer.domElement.addEventListener('click', function(e) {
    if (drawMode) return;
    var hit = hitTest(e.clientX, e.clientY);
    if (hit && hit.object.userData.tags) {
      var tags = hit.object.userData.tags;
      var name = tags.name || 'Building ' + hit.object.userData.id;
      var height = tags.height ? tags.height + 'm' : '';
      var type = tags.building !== 'yes' ? tags.building : '';
      var parts = [name, type, height].filter(Boolean);
      document.getElementById('info').textContent = parts.join(' · ');
    }
  });

  function sendMessage(obj) {
    var msg = JSON.stringify(obj);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  // Handle resize
  window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Hide buildings the camera is inside
    var camPos = camera.position;
    for (var i = 0; i < buildingPairs.length; i++) {
      var bp = buildingPairs[i];
      var inside = bp.box.containsPoint(camPos);
      bp.mesh.visible = !inside;
      bp.edges.visible = !inside;
    }

    renderer.render(scene, camera);
  }
  animate();

  // Listen for external messages
  document.addEventListener('message', handleMsg);
  window.addEventListener('message', handleMsg);
  function handleMsg(e) {
    try { var msg = JSON.parse(e.data); } catch(err) { return; }
  }
<\/script>
</body>
</html>
`;
}

export default function BuildingScene({
  cellKey,
  onBack,
}: {
  cellKey: string;
  onBack: () => void;
}) {
  const sceneRef = useRef<Scene3DHandle>(null);

  // Parse cell key "lat,lng" into bounds
  const [latStr, lngStr] = cellKey.split(",");
  const latStart = parseFloat(latStr);
  const lngStart = parseFloat(lngStr);
  const GRID_SIZE = 0.005;
  const bounds: CellBounds = {
    south: latStart,
    west: lngStart,
    north: latStart + GRID_SIZE,
    east: lngStart + GRID_SIZE,
  };

  const html = buildSceneHTML(bounds);

  const handleMessage = useCallback((data: string) => {
    // Can handle messages from the 3D scene here if needed
  }, []);

  return (
    <View style={styles.container}>
      <Scene3D
        ref={sceneRef}
        style={styles.scene}
        html={html}
        onMessage={handleMessage}
      />

      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <ChevronLeft size={18} color="#333" />
        <Text style={styles.backText}>Back to Map</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scene: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 54,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    gap: 4,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
});
