import React from 'react';
import { View, TextInput, StyleSheet, ViewStyle, TextInputProps } from 'react-native';
import { ThemedText } from './themed-text';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface A2InputProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: ViewStyle;
}

export function A2Input({ label, error, containerStyle, ...props }: A2InputProps) {
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    return (
        <View style={[styles.container, containerStyle]}>
            {label && <ThemedText style={styles.label}>{label}</ThemedText>}
            <View style={[
                styles.inputContainer,
                {
                    backgroundColor: 'rgba(10, 22, 40, 0.4)',
                    borderColor: error ? '#FF3366' : theme.border
                }
            ]}>
                <TextInput
                    placeholderTextColor="rgba(144, 164, 174, 0.5)"
                    style={[styles.input, { color: '#FFFFFF' }]}
                    {...props}
                />
            </View>
            {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        width: '100%',
    },
    label: {
        fontSize: 10,
        fontFamily: 'Orbitron-Bold',
        letterSpacing: 2,
        color: '#00D4FF',
        marginBottom: 8,
    },
    inputContainer: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56,
        justifyContent: 'center',
    },
    input: {
        fontSize: 14,
        height: '100%',
        fontWeight: '600',
    },
    errorText: {
        color: '#FF3366',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
        letterSpacing: 0.5,
    },
});
