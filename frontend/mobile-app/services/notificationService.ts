import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const notificationService = {
    /**
     * Registra o dispositivo para receber notificações push
     */
    async registerForPushNotificationsAsync() {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        if (Device.isDevice) {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.log('Falha ao obter permissão para notificações push!');
                return;
            }
            try {
                // Temporarily disabled for Expo Go local testing as it requires an EAS Project UUID
                // token = (await Notifications.getExpoPushTokenAsync({
                //     projectId: '00000000-0000-0000-0000-000000000000' 
                // })).data;
                // console.log('Push Token:', token);
                console.log('Push notifications skipped for local Dev environment.');
            } catch (error) {
                console.warn('⚠️ Push notifications skipped.', error);
            }
        } else {
            console.log('Notificações funcionam apenas em dispositivos físicos.');
        }

        return token;
    },

    /**
     * Adiciona listeners para eventos de notificação
     */
    addNotificationListeners(
        onReceived?: (notification: Notifications.Notification) => void,
        onResponse?: (response: Notifications.NotificationResponse) => void
    ) {
        const notificationListener = Notifications.addNotificationReceivedListener(notification => {
            if (onReceived) onReceived(notification);
        });

        const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
            if (onResponse) onResponse(response);
        });

        return () => {
            notificationListener.remove();
            responseListener.remove();
        };
    }
};
