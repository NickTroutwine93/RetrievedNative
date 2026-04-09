import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { auth } from '@/src/services/firebaseClient';
import { initNotificationCenter } from '@/src/services/notificationCenter';
import {
  startInAppNotifications,
  stopInAppNotifications,
} from '@/src/services/notificationService';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';

  useEffect(() => {
    void initNotificationCenter();
  }, []);

  useEffect(() => {
    let activeStop: (() => void) | null = null;
    let isMounted = true;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      activeStop?.();
      activeStop = null;

      if (!isMounted || !user?.email) {
        stopInAppNotifications();
        return;
      }

      try {
        const stop = await startInAppNotifications(user.email);
        if (!isMounted) {
          stop();
          return;
        }

        activeStop = stop;
      } catch (error) {
        console.error('Failed to start home-radius notifications:', error);
      }
    });

    return () => {
      isMounted = false;
      activeStop?.();
      stopInAppNotifications();
      unsubscribeAuth();
    };
  }, []);

  const navigationTheme = scheme === 'dark'
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: Colors.dark.background,
          card: Colors.dark.surface,
          text: Colors.dark.text,
          border: Colors.dark.border,
          primary: Colors.dark.primary,
          notification: Colors.dark.danger,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: Colors.light.background,
          card: Colors.light.surface,
          text: Colors.light.text,
          border: Colors.light.border,
          primary: Colors.light.primary,
          notification: Colors.light.danger,
        },
      };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="search/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="search/[id]/sighting" options={{ headerShown: false }} />
          <Stack.Screen name="messages/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
