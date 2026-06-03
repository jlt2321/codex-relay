import { Drawer } from "expo-router/drawer";

import { ThreadDrawerContent } from "@/components/chat/ThreadDrawerContent";

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <ThreadDrawerContent {...props} />}
      screenOptions={{
        drawerType: "front",
        headerShown: false,
        swipeEnabled: false,
        sceneStyle: {
          backgroundColor: "#191919",
        },
        drawerStyle: {
          backgroundColor: "#202222",
          borderRightColor: "rgba(255, 255, 255, 0.08)",
          borderRightWidth: 1,
          width: 320,
        },
        overlayColor: "rgba(0, 0, 0, 0.28)",
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: "Threads",
          title: "JLT Relay",
        }}
      />
      {__DEV__ ? (
        <Drawer.Screen
          name="preview"
          options={{
            drawerItemStyle: { display: "none" },
            title: "Chat Preview",
          }}
        />
      ) : null}
    </Drawer>
  );
}
