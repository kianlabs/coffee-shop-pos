import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kianlabs.coffeeshoppos',
  appName: 'Sura POS',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
    },
  },
};

export default config;
