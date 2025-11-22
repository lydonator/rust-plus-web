const { PushReceiver } = require('@eneris/push-receiver');

const SENDER_ID = '976529667804'; // Rust+ Sender ID

async function test() {
    console.log('Instantiating PushReceiver...');
    const receiver = new PushReceiver({
        senderId: SENDER_ID,
    });

    receiver.onNotification((notification) => {
        console.log('Notification received:', notification);
    });

    receiver.onReady(() => {
        console.log('Receiver is ready!');
        console.log('FCM Token:', receiver.fcmToken);
    });

    receiver.onCredentialsChanged((credentials) => {
        console.log('Credentials changed:', credentials);
    });

    console.log('Registering...');
    try {
        await receiver.registerIfNeeded();
        console.log('Registration initiated.');
    } catch (err) {
        console.error('Registration failed:', err);
    }
}

test();
