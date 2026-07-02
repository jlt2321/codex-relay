import type { ConfigContext, ExpoConfig } from "expo/config";
import {
  withInfoPlist,
  withXcodeProject,
  type ConfigPlugin,
} from "expo/config-plugins";

type XcodeBuildPhaseRef = {
  value: string;
  comment?: string;
};

type XcodeNativeTarget = {
  buildPhases?: XcodeBuildPhaseRef[];
};

function isDevClientEnabled() {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const appEnv = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_ENV;

  if (!buildProfile && !appEnv) {
    return true;
  }

  return buildProfile === "development" || appEnv === "development";
}

const removeDevClientInfoPlistEntries: ConfigPlugin = (config) =>
  withInfoPlist(config, (config) => {
    const infoPlist = config.modResults;

    if (Array.isArray(infoPlist.CFBundleURLTypes)) {
      infoPlist.CFBundleURLTypes = infoPlist.CFBundleURLTypes.map(
        (urlType) => {
          if (!Array.isArray(urlType.CFBundleURLSchemes)) {
            return urlType;
          }

          return {
            ...urlType,
            CFBundleURLSchemes: urlType.CFBundleURLSchemes.filter(
              (scheme) =>
                typeof scheme !== "string" || !scheme.startsWith("exp+"),
            ),
          };
        },
      ).filter(
        (urlType) =>
          !Array.isArray(urlType.CFBundleURLSchemes) ||
          urlType.CFBundleURLSchemes.length > 0,
      );
    }

    if (Array.isArray(infoPlist.NSBonjourServices)) {
      infoPlist.NSBonjourServices = infoPlist.NSBonjourServices.filter(
        (service) => service !== "_expo._tcp",
      );

      if (infoPlist.NSBonjourServices.length === 0) {
        delete infoPlist.NSBonjourServices;
      }
    }

    return config;
  });

const removeDevClientXcodeBuildPhase: ConfigPlugin = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const shellScriptBuildPhases =
      project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    const devLauncherBuildPhaseIds = new Set<string>();

    for (const [id, phase] of Object.entries(shellScriptBuildPhases)) {
      if (
        id.endsWith("_comment") ||
        typeof phase !== "object" ||
        phase === null ||
        !("name" in phase)
      ) {
        continue;
      }

      if (
        phase.name ===
        '"[Expo Dev Launcher] Strip Local Network Keys for Release"'
      ) {
        devLauncherBuildPhaseIds.add(id);
      }
    }

    if (devLauncherBuildPhaseIds.size === 0) {
      return config;
    }

    for (const id of devLauncherBuildPhaseIds) {
      delete shellScriptBuildPhases[id];
      delete shellScriptBuildPhases[`${id}_comment`];
    }

    for (const target of Object.values(project.pbxNativeTargetSection())) {
      const nativeTarget = target as XcodeNativeTarget;

      if (!Array.isArray(nativeTarget.buildPhases)) {
        continue;
      }

      nativeTarget.buildPhases = nativeTarget.buildPhases.filter(
        (phase) => !devLauncherBuildPhaseIds.has(phase.value),
      );
    }

    return config;
  });

export default function appConfig(_context: ConfigContext): ExpoConfig {
  const enableDevClient = isDevClientEnabled();
  const plugins: NonNullable<ExpoConfig["plugins"]> = [
    "expo-router",
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
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "JLT Relay uses the microphone to turn your speech into text in the chat composer.",
        speechRecognitionPermission:
          "JLT Relay uses speech recognition to turn your speech into text in the chat composer.",
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
  ];

  if (enableDevClient) {
    plugins.splice(1, 0, [
      "expo-dev-client",
      {
        launchMode: "most-recent",
      },
    ]);
  } else {
    plugins.push(
      removeDevClientInfoPlistEntries as unknown as NonNullable<
        ExpoConfig["plugins"]
      >[number],
    );
    plugins.push(
      removeDevClientXcodeBuildPhase as unknown as NonNullable<
        ExpoConfig["plugins"]
      >[number],
    );
  }

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
          NSAllowsArbitraryLoadsInWebContent: true,
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
    plugins,
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
