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
