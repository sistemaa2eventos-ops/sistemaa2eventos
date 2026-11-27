import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import 'react-native-reanimated';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { cores, fonte } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

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
  }, [user, loading, segments]);

  return (
    <>
      {isOffline && (
        <View style={{ backgroundColor: cores.erro, paddingTop: insets.top + 4, paddingBottom: 4, paddingHorizontal: 16, alignItems: 'center', zIndex: 999 }}>
          <Text style={{ color: cores.sobreErro, fontFamily: fonte.corpoSemi, fontSize: 12 }}>MODO OFFLINE ATIVO</Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.fundo },
          headerTintColor: cores.primaria,
          headerTitleStyle: { fontFamily: fonte.titulo, fontSize: 14 },
          headerBackTitle: '',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}


// Segura a splash até as fontes carregarem (evita texto na fonte do sistema por um instante)
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontesCarregadas, erroFontes] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontesCarregadas || erroFontes) SplashScreen.hideAsync().catch(() => {});
  }, [fontesCarregadas, erroFontes]);

  if (!fontesCarregadas && !erroFontes) return null;

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootLayoutNav />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
