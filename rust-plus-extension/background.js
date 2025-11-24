// Rust+ Web Companion Bridge - Background Service Worker
// This extension acts as a "localhost" bridge to communicate with Facepunch APIs

console.log('[Rust+ Bridge] Extension loaded');

// Constants from Rust+ companion app (public constants)
const RUSTPLUS_CONFIG = {
  API_KEY: 'AIzaSyB5y2y-Tzqb4-I4Qnlsh_9naYv_TD8pCvY',
  PROJECT_ID: 'rust-companion-app',
  SENDER_ID: '976529667804',
  GMS_APP_ID: '1:976529667804:android:d6f1ddeb4403b338fea619',
  ANDROID_PACKAGE: 'com.facepunch.rust.companion',
  ANDROID_CERT: 'E28D05345FB78A7A1A63D70F4A302DBF426CA5AD',
  EXPO_PROJECT_ID: '49451aca-a822-41e6-ad59-955718d0ff9c'
};

// Listen for messages from web app
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('[Rust+ Bridge] Received message:', request.action);

  // Handle async operations
  (async () => {
    try {
      switch (request.action) {
        case 'ping':
          sendResponse({ success: true, message: 'Extension is alive!' });
          break;

        case 'registerFCM':
          const fcmResult = await registerFCM(request.data);
          sendResponse(fcmResult);
          break;

        case 'getExpoPushToken':
          const expoResult = await getExpoPushToken(request.data.fcmToken, request.data.deviceId);
          sendResponse(expoResult);
          break;

        case 'testFacepunchAPI':
          const testResult = await testFacepunchAPI();
          sendResponse(testResult);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('[Rust+ Bridge] Error handling message:', error);
      sendResponse({ success: false, error: error.message, stack: error.stack });
    }
  })();

  return true; // Keep channel open for async response
});

/**
 * Register with FCM using the Android emulation approach
 * This mimics the @liamcottle/push-receiver registration
 */
async function registerFCM(data) {
  try {
    console.log('[Rust+ Bridge] Starting FCM registration...');

    // Step 1: Register with Google FCM
    const fcmRegistration = await fetch('https://fcmregistrations.googleapis.com/v1/projects/' + RUSTPLUS_CONFIG.SENDER_ID + '/registrations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        web: {
          applicationPubKey: RUSTPLUS_CONFIG.SENDER_ID,
          auth: generateRandomString(16),
          endpoint: 'https://fcm.googleapis.com/fcm/send/' + generateRandomString(152),
          p256dh: generateRandomString(88)
        }
      })
    });

    if (!fcmRegistration.ok) {
      throw new Error('FCM registration failed: ' + fcmRegistration.statusText);
    }

    const fcmData = await fcmRegistration.json();
    console.log('[Rust+ Bridge] FCM registration successful');

    return {
      success: true,
      data: fcmData,
      message: 'FCM registration completed from extension context'
    };

  } catch (error) {
    console.error('[Rust+ Bridge] FCM registration error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Get Expo Push Token from FCM token
 * This is the critical step that communicates with Facepunch's infrastructure
 */
async function getExpoPushToken(fcmToken, deviceId) {
  try {
    console.log('[Rust+ Bridge] Getting Expo Push Token...');
    console.log('[Rust+ Bridge] FCM Token:', fcmToken);
    console.log('[Rust+ Bridge] Device ID:', deviceId);

    const response = await fetch('https://exp.host/--/api/v2/push/getExpoPushToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'fcm',
        deviceId: deviceId,
        development: false,
        appId: RUSTPLUS_CONFIG.ANDROID_PACKAGE,
        deviceToken: fcmToken,
        projectId: RUSTPLUS_CONFIG.EXPO_PROJECT_ID
      })
    });

    console.log('[Rust+ Bridge] Expo API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Expo API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('[Rust+ Bridge] Expo Push Token retrieved successfully');

    return {
      success: true,
      expoPushToken: data.data.expoPushToken,
      message: 'Expo token retrieved from extension context'
    };

  } catch (error) {
    console.error('[Rust+ Bridge] Expo token error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Test if we can reach Facepunch's companion API
 * This will help determine if extension origin is accepted
 */
async function testFacepunchAPI() {
  try {
    console.log('[Rust+ Bridge] Testing Facepunch API access...');

    // Try to access the Facepunch companion API endpoint
    const response = await fetch('https://companion-rust.facepunch.com/api/version', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('[Rust+ Bridge] Facepunch API test status:', response.status);
    console.log('[Rust+ Bridge] Response headers:', [...response.headers.entries()]);

    const data = await response.text();

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: data,
      message: response.ok
        ? 'Successfully contacted Facepunch API from extension!'
        : 'Facepunch API returned an error'
    };

  } catch (error) {
    console.error('[Rust+ Bridge] Facepunch API test error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
      message: 'Failed to contact Facepunch API'
    };
  }
}

/**
 * Generate random string for tokens
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Extension installation handler
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Rust+ Bridge] Extension installed/updated');
});

console.log('[Rust+ Bridge] Background service worker initialized');
