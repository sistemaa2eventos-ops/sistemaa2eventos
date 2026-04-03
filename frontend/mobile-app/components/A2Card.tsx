import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface A2CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

export function A2Card({ children, style }: A2CardProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    return (
        <View style={[
            styles.card,
            {
                backgroundColor: theme.card,
                borderColor: theme.border,
                // Neon glow for dark mode
                ...(colorScheme === 'dark' && {
                    shadowColor: theme.primary,
                    shadowOpacity: 0.1,
                    shadowRadius: 10,
                })
            },
            style
        ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 4,
    },
});
