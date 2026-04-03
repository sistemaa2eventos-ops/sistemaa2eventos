import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { A2Button } from '@/components/A2Button';
import { A2Input } from '@/components/A2Input';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/services/supabase';
import { useRouter } from 'expo-router';

export default function RegisterScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const router = useRouter();

    const handleRegister = async () => {
        if (!email || !password || !confirmPassword) {
            Alert.alert('Erro', 'Por favor, preencha todos os campos.');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Erro', 'As senhas não coincidem.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            Alert.alert('Erro no Cadastro', error.message);
        } else {
            Alert.alert('Sucesso', 'Verifique seu e-mail para confirmar o cadastro.', [
                { text: 'OK', onPress: () => router.replace('/login') }
            ]);
        }
        setLoading(false);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                    <View style={styles.header}>
                        <ThemedText type="title" style={styles.title}>Criar Conta</ThemedText>
                        <ThemedText style={styles.subtitle}>Junte-se ao NZT hoje</ThemedText>
                    </View>

                    <View style={styles.form}>
                        <A2Input
                            label="E-mail"
                            placeholder="seu@email.com"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <A2Input
                            label="Senha"
                            placeholder="••••••••"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                        <A2Input
                            label="Confirmar Senha"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                        />

                        <A2Button
                            title="Cadastrar"
                            onPress={handleRegister}
                            loading={loading}
                            style={styles.registerButton}
                        />

                        <View style={styles.footer}>
                            <ThemedText>Já tem uma conta?</ThemedText>
                            <TouchableOpacity onPress={() => router.back()}>
                                <ThemedText style={[styles.link, { color: theme.tint }]}> Fazer Login</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    scroll: {
        padding: 24,
        flexGrow: 1,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 40,
    },
    title: {
        fontSize: 32,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        opacity: 0.6,
    },
    form: {
        gap: 16,
    },
    registerButton: {
        marginTop: 10,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
    },
    link: {
        fontWeight: 'bold',
    },
});
