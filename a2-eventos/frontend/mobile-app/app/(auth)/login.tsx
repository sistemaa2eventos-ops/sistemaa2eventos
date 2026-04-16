import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { A2Input } from '@/components/A2Input';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/services/supabase';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const router = useRouter();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Erro', 'Por favor, preencha todos os campos.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                Alert.alert('Erro de Login', error.message);
            } else {
                router.replace('/(tabs)');
            }
        } catch {
            Alert.alert('Erro', 'Ocorreu um erro inesperado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <LinearGradient
                colors={['#050B18', '#0A1628', '#050B18']}
                style={styles.background}
            />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.content}
                >
                    <View style={styles.header}>
                        <ThemedText style={styles.logoText}>A2</ThemedText>
                        <ThemedText style={styles.title}>NEXUS ACCESS</ThemedText>
                        <ThemedText style={styles.subtitle}>SISTEMA DE MONITORAMENTO E CREDENCIAMENTO</ThemedText>
                    </View>

                    <View style={styles.form}>
                        <A2Input
                            label="IDENTIFICAÇÃO (EMAIL)"
                            placeholder="usuario@a2eventos.com.br"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <A2Input
                            label="CHAVE DE ACESSO (SENHA)"
                            placeholder="••••••••"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />

                        <A2Button
                            title="AUTENTICAR NO SISTEMA"
                            onPress={handleLogin}
                            loading={loading}
                            style={styles.loginButton}
                        />

                        <View style={styles.footer}>
                            <ThemedText style={styles.footerText}>OPERADOR NÃO CADASTRADO?</ThemedText>
                            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                                <ThemedText style={[styles.link, { color: theme.tint }]}> SOLICITAR ACESSO</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.systemInfo}>
                        <ThemedText style={styles.versionText}>v2.4.0-NEXUS • ENCRYPTED CONNECTION</ThemedText>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 32,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 50,
    },
    logoText: {
        fontFamily: 'Orbitron-Black',
        fontSize: 48,
        color: '#00D4FF',
        textShadowColor: 'rgba(0, 212, 255, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
        marginBottom: 8,
    },
    title: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 22,
        color: '#FFFFFF',
        letterSpacing: 4,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 10,
        color: '#90A4AE',
        letterSpacing: 1.5,
        textAlign: 'center',
        fontWeight: '700',
    },
    form: {
        gap: 20,
    },
    loginButton: {
        marginTop: 10,
    },
    footer: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginTop: 32,
    },
    footerText: {
        fontSize: 10,
        color: '#90A4AE',
        letterSpacing: 1,
    },
    link: {
        fontFamily: 'Orbitron-Bold',
        fontSize: 12,
        letterSpacing: 1,
    },
    systemInfo: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    versionText: {
        fontSize: 9,
        color: 'rgba(144, 164, 174, 0.4)',
        letterSpacing: 1,
        fontWeight: '600',
    }
});
