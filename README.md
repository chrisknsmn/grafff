# grafff

A React Native app built with Expo and Supabase.

## Prerequisites

- Node.js
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [rtun](https://github.com/nickelchen/rtun) (for local development with Supabase auth callbacks)

## Setup

```bash
npm install
```

## Local Development

Start the Expo dev server:

```bash
npm start
```

### rtun Commands

To expose your local dev server for Supabase auth redirects and testing on physical devices:

```bash
# Expose the Expo dev server (default port 8081)
rtun --port 8081

# Expose with a specific subdomain
rtun --port 8081 --subdomain grafff

# Expose the Expo web build (port 19006)
rtun --port 19006
```

## Platform-Specific

```bash
npm run ios       # Run on iOS simulator
npm run android   # Run on Android emulator
npm run web       # Run in browser
```

```
npx expo start
```

## Future: Building Data Pipeline

Currently building data is fetched directly from the Overpass API (OpenStreetMap) at runtime. This works fine during development but won't scale for multiple users due to Overpass rate limits (~2 req/s, ~10k/day).

Before release, build a pipeline to pre-cache building data:

1. Run a background job that pulls building footprints from Overpass into Supabase, cell-by-cell (can run slowly overnight to avoid rate limits)
2. Store building geometry per grid cell in a Supabase table
3. Serve building data to players from Supabase instead of Overpass
4. Optionally pre-process/simplify building geometry for faster 3D rendering

https://github.com/cartesiancs/map3d
