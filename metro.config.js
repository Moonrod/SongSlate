// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Browser preview build (npm run preview:web): swap expo-router for an
 * in-memory navigator, because the hosted preview frame's address can't be
 * used for routing. Normal native and web builds are unaffected.
 */
if (process.env.SYNCSLATE_WEB_PREVIEW === '1') {
  const entry = path.resolve(__dirname, 'src/preview/entry.tsx');
  const routerShim = path.resolve(__dirname, 'src/preview/routerShim.tsx');
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // The app entry arrives as a path (e.g. "./node_modules/expo-router/entry"), not a package name.
    if (/(^|[\\/])expo-router[\\/]entry(\.js)?$/.test(moduleName)) return { type: 'sourceFile', filePath: entry };
    if (moduleName === 'expo-router') return { type: 'sourceFile', filePath: routerShim };
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
