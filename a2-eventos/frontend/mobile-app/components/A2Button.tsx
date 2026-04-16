import React from 'react';
import { StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface A2ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline';
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle | ViewStyle[];
    textStyle?: TextStyle;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function A2Button({
    title,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    style,
    textStyle
}: A2ButtonProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    // Animation values
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const onPressIn = () => {
        scale.value = withTiming(0.96, { duration: 100 });
    };

    const onPressOut = () => {
        scale.value = withSpring(1);
    };

    const getBackgroundColor = () => {
        if (disabled) return colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : theme.border;
        if (variant === 'primary') return theme.primary;
        if (variant === 'secondary') return theme.secondary;
        return 'transparent';
    };

    const getTextColor = () => {
        if (disabled) return theme.icon;
        if (variant === 'primary') return '#000000';
        if (variant === 'secondary') return '#FFFFFF';
        return theme.tint;
    };

    const getBorderColor = () => {
        if (variant === 'outline') return theme.tint;
        return 'transparent';
    };

    return (
        <AnimatedTouchableOpacity
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={disabled || loading}
            activeOpacity={0.8}
            style={[
                styles.button,
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: getBorderColor(),
                    borderWidth: variant === 'outline' ? 1 : 0,
                    // Neon glow effect for dark mode primary
                    ...(variant === 'primary' && colorScheme === 'dark' && !disabled && {
                        shadowColor: theme.primary,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 10,
                        elevation: 5,
                    })
                },
                style,
                animatedStyle
            ]}
        >
            {loading ? (
                <ActivityIndicator color={getTextColor()} />
            ) : (
                <ThemedText style={[styles.text, { color: getTextColor(), fontFamily: 'Orbitron-Bold' }, textStyle]}>
                    {title}
                </ThemedText>
            )}
        </AnimatedTouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    text: {
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    disabled: {
        opacity: 0.5,
    },
});
