import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.timeless.app',
  appName: 'Timeless',
  webDir: 'dist',
  android: {
    // Türkçe karakterlerin doğru görünmesi ve koyu tema için
    backgroundColor: '#0f1115',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_timeless',
      iconColor: '#4F8CFF',
    },
  },
};

export default config;
