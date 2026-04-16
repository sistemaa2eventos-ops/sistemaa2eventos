import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { notificationService } from '@/services/notificationService';
import { offlineService } from '@/services/offlineService';
import { apiService } from '@/services/apiService';
import { SyncManager } from '@/services/SyncManager';
import '@/config/i18n'; // Global i18n init

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Escuta estado da rede para a UI
    const unsubscribeNet = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false);
    });
    // Initialize notifications
    notificationService.registerForPushNotificationsAsync();

    const unsubscribe = notificationService.addNotificationListeners(
      (notification) => {
        console.log('Notificação recebida:', notification);
      },
      (response) => {
        console.log('Resposta à notificação:', response);
      }
    );

    // Inicializa gerenciador de Sincronização em Background (Modo Offline)
    SyncManager.init();

    // CIRURGIA 3: Inicializa SQLite e pré-carrega pessoas para modo offline
    offlineService.initDB().then(() => {
      apiService.prefetchPessoasForOffline();
    });

    return () => {
      unsubscribe();
      unsubscribeNet();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // Redirect to login if not authenticated and not in auth screens
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      // Redirect to home if authenticated and trying to access auth screens
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  return (
    <>
      {isOffline && (
        <View style={{ backgroundColor: '#ff4444', padding: 4, paddingTop: 40, alignItems: 'center', zIndex: 999 }}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>MODO OFFLINE ATIVO</Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#050B18' },
          headerTintColor: '#00D4FF',
          headerTitleStyle: { fontFamily: 'Orbitron-Bold', fontSize: 14 },
          headerBackTitle: '',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'MODAL' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootLayoutNav />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
