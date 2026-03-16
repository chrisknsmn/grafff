# OSM Building Data Pipeline

Extract all building footprints from the OpenStreetMap planet file and load them into Supabase, grouped by grid cell key.

## Requirements

- **PC**: 64GB+ RAM recommended (32GB minimum), fast SSD with ~200GB free space
- **OS**: Linux, macOS, or WSL2 on Windows
- **Tools**: `osmium-tool`, `ogr2ogr` (GDAL), Node.js or Python, `psql`
- **Supabase**: A project with Postgres access (connection string)

## Overview

1. Download the OSM planet file
2. Filter to only building data
3. Convert to GeoJSON
4. Process into grid cells and insert into Supabase

---

## Step 1: Download the Planet File

```bash
# ~70GB compressed, takes several hours depending on connection
wget https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf
```

Alternatively, if you only need specific regions to start:
```bash
# Download a single region from Geofabrik (much smaller/faster)
# Full list: https://download.geofabrik.de/
wget https://download.geofabrik.de/north-america-latest.osm.pbf   # ~12GB
wget https://download.geofabrik.de/europe-latest.osm.pbf          # ~27GB
```

## Step 2: Install Tools

```bash
# macOS
brew install osmium-tool gdal node

# Ubuntu/Debian/WSL2
sudo apt install osmium-tool gdal-bin nodejs npm

# Verify
osmium --version
ogr2ogr --version
```

## Step 3: Filter to Buildings Only

This dramatically reduces file size (planet → ~5-10GB of just buildings).

```bash
osmium tags-filter planet-latest.osm.pbf \
  w/building \
  r/building \
  -o buildings-only.osm.pbf
```

This keeps only ways and relations tagged with `building=*`. Takes 1-3 hours for the full planet.

## Step 4: Convert to GeoJSON

```bash
ogr2ogr -f GeoJSONSeq buildings.geojsonl \
  buildings-only.osm.pbf \
  multipolygons \
  -progress
```

This outputs one GeoJSON feature per line (GeoJSONSeq format), which is streamable and won't blow up memory. Output will be ~30-50GB for the full planet.

If that's too large, process region by region instead (see Step 1 alternatives).

## Step 5: Create the Supabase Table

Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE cell_buildings (
  id BIGSERIAL PRIMARY KEY,
  cell_key TEXT NOT NULL,           -- "40.7100,-74.0050"
  osm_id BIGINT,
  height REAL DEFAULT 10,
  levels INTEGER,
  geometry JSONB NOT NULL,          -- array of {lat, lng} coordinates
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast cell lookups
CREATE INDEX idx_cell_buildings_cell_key ON cell_buildings (cell_key);

-- Summary table for quick "has buildings?" checks
CREATE TABLE cell_summary (
  cell_key TEXT PRIMARY KEY,
  building_count INTEGER NOT NULL DEFAULT 0,
  has_buildings BOOLEAN GENERATED ALWAYS AS (building_count > 0) STORED
);

CREATE INDEX idx_cell_summary_has_buildings ON cell_summary (has_buildings);
```

## Step 6: Process and Insert

Create a Node.js script to stream the GeoJSON, assign each building to a grid cell, and batch-insert into Supabase.

Save as `scripts/import-buildings.mjs`:

```javascript
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { createClient } from "@supabase/supabase-js";

const GRID_SIZE = 0.005;
const BATCH_SIZE = 500;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // use service role key for bulk inserts
);

function cellKey(lat, lng) {
  const rLat =
    Math.round(Math.floor(lat / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
  const rLng =
    Math.round(Math.floor(lng / GRID_SIZE) * GRID_SIZE * 1e6) / 1e6;
  return `${rLat},${rLng}`;
}

function centroid(coords) {
  // coords is an array of [lng, lat] pairs
  let sumLat = 0,
    sumLng = 0;
  for (const [lng, lat] of coords) {
    sumLat += lat;
    sumLng += lng;
  }
  return {
    lat: sumLat / coords.length,
    lng: sumLng / coords.length,
  };
}

async function main() {
  const filePath = process.argv[2] || "buildings.geojsonl";
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let batch = [];
  let count = 0;
  let cellCounts = {};

  for await (const line of rl) {
    if (!line.trim()) continue;

    let feature;
    try {
      feature = JSON.parse(line);
    } catch {
      continue;
    }

    const geom = feature.geometry;
    if (!geom || !geom.coordinates) continue;

    // Get outer ring coordinates
    const coords =
      geom.type === "MultiPolygon"
        ? geom.coordinates[0][0]
        : geom.coordinates[0];

    if (!coords || coords.length < 3) continue;

    const center = centroid(coords);
    const key = cellKey(center.lat, center.lng);

    const tags = feature.properties || {};
    const height = parseFloat(tags.height) || null;
    const levels = parseInt(tags["building:levels"]) || null;

    // Convert coords to {lat, lng} array for the app
    const geometry = coords.map(([lng, lat]) => ({ lat, lng }));

    batch.push({
      cell_key: key,
      osm_id: parseInt(tags.osm_id) || null,
      height: height || (levels ? levels * 3.2 : 10),
      levels: levels,
      geometry: geometry,
      tags: {
        building: tags.building,
        name: tags.name,
        height: tags.height,
        "building:levels": tags["building:levels"],
      },
    });

    // Track cell counts
    cellCounts[key] = (cellCounts[key] || 0) + 1;

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from("cell_buildings").insert(batch);
      if (error) console.error("Insert error:", error.message);
      count += batch.length;
      batch = [];
      if (count % 10000 === 0) {
        console.log(`${count} buildings inserted...`);
      }
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    await supabase.from("cell_buildings").insert(batch);
    count += batch.length;
  }

  console.log(`Done! ${count} buildings inserted.`);

  // Build cell summary table
  console.log("Building cell summary...");
  const summaryBatch = Object.entries(cellCounts).map(([key, cnt]) => ({
    cell_key: key,
    building_count: cnt,
  }));

  for (let i = 0; i < summaryBatch.length; i += BATCH_SIZE) {
    const chunk = summaryBatch.slice(i, i + BATCH_SIZE);
    await supabase.from("cell_summary").upsert(chunk);
  }

  console.log(`${summaryBatch.length} cell summaries written.`);
}

main().catch(console.error);
```

Run it:
```bash
npm install @supabase/supabase-js

SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_KEY=your-service-role-key \
node scripts/import-buildings.mjs buildings.geojsonl
```

## Step 7: Query from the App

Once the data is in Supabase, replace the Overpass fetch in `BuildingScene.tsx` with:

```javascript
const { data } = await supabase
  .from('cell_buildings')
  .select('geometry, height, tags')
  .eq('cell_key', cellKey);
```

And for greying out empty cells on the map:

```javascript
const { data } = await supabase
  .from('cell_summary')
  .select('cell_key, has_buildings')
  .in('cell_key', visibleCellKeys);
```

## Estimated Processing Times

| Dataset | File Size | Filter Time | Convert Time | Import Time |
|---------|-----------|-------------|--------------|-------------|
| Single city | ~500MB | ~1 min | ~5 min | ~10 min |
| US region | ~8GB | ~20 min | ~1 hr | ~3 hrs |
| North America | ~12GB | ~30 min | ~2 hrs | ~5 hrs |
| Full planet | ~70GB | ~2 hrs | ~8 hrs | ~24 hrs |

## Tips

- **Start with a single city** to test the pipeline end-to-end before processing larger regions
- **Use Geofabrik extracts** for the regions you care about instead of the full planet
- The `cell_summary` table lets you instantly check which cells have buildings without loading geometry
- Supabase free tier has 500MB storage — you'll likely need a paid plan for large regions (~$25/mo for 8GB)
- Run the import script with `--max-old-space-size=8192` if you hit Node.js memory limits
- The import is resumable — if it crashes, you can skip already-inserted cells by checking `cell_key` existence
