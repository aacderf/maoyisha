import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hl.cardarena",
  appName: "茂一杀",
  webDir: "apps/web/dist",
  server: {
    androidScheme: "http",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
      hidden: true,
      animation: "NONE",
    },
  },
};

export default config;
