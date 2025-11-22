const { register, listen } = require('electron-push-receiver');

const SENDER_ID = '976529667804';

async function test() {
    try {
        console.log('Registering with Sender ID:', SENDER_ID);
        const credentials = await register(SENDER_ID);
        console.log('Registered!', credentials);
    } catch (err) {
        console.error('Error:', err);
    }
}

test();
