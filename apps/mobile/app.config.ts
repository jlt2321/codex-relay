import type { ConfigContext, ExpoConfig } from "expo/config";

export default function appConfig(_context: ConfigContext): ExpoConfig {
  return {
    name: "JLT Relay",
    slug: "jlt-relay",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: ["jlt-relay", "codex-relay"],
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/images/icon.png",
      bundleIdentifier: "com.jlt2321.jltrelay",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
        ITSAppUsesNonExemptEncryption: false,
        NSLocalNetworkUsageDescription:
          "JLT Relay connects this device to your own relay server running on your computer or VPS tunnel.",
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#191919",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      package: "com.jlt2321.jltrelay",
      permissions: ["android.permission.CAMERA"],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-dev-client",
        {
          launchMode: "most-recent",
        },
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#191919",
          image: "./assets/images/splash-icon.png",
          imageWidth: 112,
          android: {
            image: "./assets/images/splash-icon.png",
            imageWidth: 112,
          },
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "JLT Relay uses the camera to scan QR codes that contain your private relay server address.",
          microphonePermission: false,
          recordAudioAndroid: false,
          barcodeScannerEnabled: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "JLT Relay uses photo library access so you can attach images to a Codex chat, for example to ask Codex to inspect a screenshot.",
          microphonePermission: false,
        },
      ],
      "expo-font",
      "expo-image",
      "expo-system-ui",
      "expo-web-browser",
      "@hot-updater/react-native",
      "react-native-enriched-markdown",
      [
        "expo-secure-store",
        {
          faceIDPermission: false,
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.4",
          },
          android: {
            usesCleartextTraffic: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "9871949d-7a32-4606-99ca-4ed63b4347ae",
      },
    },
  };
}
