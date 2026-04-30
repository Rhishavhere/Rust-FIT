import "react-native-get-random-values";
import React from 'react';
import { registerRootComponent } from 'expo';
import { debugInfo } from "./src/debug";

import App from './App';
import { ErrorBoundary } from './src/ErrorBoundary';

// Wrap App in ErrorBoundary so unhandled crashes show a debug screen
// instead of the generic Expo Go "Something went wrong" page.
function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
debugInfo("Bootstrap", "registerRootComponent");
registerRootComponent(Root);
