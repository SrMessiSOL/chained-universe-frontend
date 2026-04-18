import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chaineduniverse.app',
  appName: 'GAMESOL',
  webDir: 'dist',
  server: {
    hostname: 'chained-universe.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
