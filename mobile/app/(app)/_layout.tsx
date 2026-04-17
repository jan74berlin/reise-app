// mobile/app/(app)/_layout.tsx
import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#2563eb',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Reisen',
          tabBarLabel: 'Reisen',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarLabel: 'Einstellungen',
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{ href: null }}
      />
    </Tabs>
  );
}
