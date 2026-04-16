import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'dark'].tint,
        tabBarInactiveTintColor: 'rgba(144, 164, 174, 0.5)',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#050B18',
          borderTopWidth: 1,
          borderTopColor: 'rgba(0, 212, 255, 0.2)',
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Orbitron-Bold',
          fontSize: 10,
          letterSpacing: 1,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dashboard', { defaultValue: 'OPERAÇÕES' }),
          tabBarIcon: ({ color }) => <Ionicons size={24} name="stats-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: t('tabs.monitor', { defaultValue: 'MONITOR' }),
          tabBarIcon: ({ color }) => <Ionicons size={24} name="desktop-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tabs.events', { defaultValue: 'EVENTOS' }),
          tabBarIcon: ({ color }) => <Ionicons size={24} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.settings', { defaultValue: 'TERMINAL' }),
          tabBarIcon: ({ color }) => <Ionicons size={24} name="person" color={color} />,
        }}
      />
    </Tabs>
  );
}
