// useExtensionBridge - React hook for communicating with Rust+ Extension
// This hook handles FCM registration via the browser extension

import { useState, useCallback } from 'react';

// TypeScript declaration for chrome API
declare const chrome: any;

// Extension ID (will be different in production after publishing to Chrome Web Store)
const EXTENSION_ID = 'mcckljgfhenkbgickkbnbnghanooiaam';

export interface ExtensionBridgeResult {
  success: boolean;
  fcmCredentials?: any;
  expoPushToken?: string;
  deviceId?: string;
  error?: string;
}

export interface ExtensionBridge {
  isInstalled: boolean | null;
  isRegistering: boolean;
  error: string | null;
  checkExtension: () => Promise<boolean>;
  registerUser: (steamId: string) => Promise<ExtensionBridgeResult>;
}

export function useExtensionBridge(): ExtensionBridge {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if extension is installed
  const checkExtension = useCallback(async (): Promise<boolean> => {
    // Check if we're in browser environment
    if (typeof window === 'undefined' || typeof chrome === 'undefined') {
      setIsInstalled(false);
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage(EXTENSION_ID, { action: 'ping' });
      const installed = response?.success === true;
      setIsInstalled(installed);
      return installed;
    } catch (err) {
      setIsInstalled(false);
      return false;
    }
  }, []);

  // Register user with Facepunch via extension
  const registerUser = useCallback(async (steamId: string): Promise<ExtensionBridgeResult> => {
    setIsRegistering(true);
    setError(null);

    // Check if we're in browser environment
    if (typeof window === 'undefined' || typeof chrome === 'undefined') {
      const errorMsg = 'Extension not available';
      setError(errorMsg);
      setIsRegistering(false);
      return { success: false, error: errorMsg };
    }

    try {
      console.log('[Extension Bridge] Registering user via extension:', steamId);

      const response = await chrome.runtime.sendMessage(EXTENSION_ID, {
        action: 'registerUserWithFacepunch',
        data: { steamId }
      });

      setIsRegistering(false);

      if (response.success) {
        console.log('[Extension Bridge] Registration successful');
        return response;
      } else {
        const errorMsg = response.error || 'Registration failed';
        setError(errorMsg);
        console.error('[Extension Bridge] Registration failed:', errorMsg);
        return { success: false, error: errorMsg };
      }

    } catch (err: any) {
      const errorMsg = err.message || 'Extension communication failed';
      setError(errorMsg);
      setIsRegistering(false);
      console.error('[Extension Bridge] Error:', err);
      return { success: false, error: errorMsg };
    }
  }, []);

  return {
    isInstalled,
    isRegistering,
    error,
    checkExtension,
    registerUser
  };
}
