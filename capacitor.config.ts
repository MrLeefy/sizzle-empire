import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sizzleempire.tycoon',
  appName: 'Sizzle Empire',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    backgroundColor: '#5CC8FF',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#5CC8FF',
      overlaysWebView: true,
    },
  },
};

export default config;
