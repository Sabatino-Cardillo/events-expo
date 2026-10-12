import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#161b22' },
          headerTintColor: '#e6edf3',
          contentStyle: { backgroundColor: '#0d1117' },
          headerTitleStyle: {
            fontSize: Platform.isTV ? 22 : 17,
            fontWeight: '700',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: '🔴 Live Events',
            headerShown: !Platform.isTV,
          }}
        />
        <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
      </Stack>
    </>
  );
}