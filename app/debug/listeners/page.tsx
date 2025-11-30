'use client';

import { useEffect, useState } from 'react';

interface NotificationRecord {
  type: string;
  timestamp: number;
  data?: any;
  notification?: any;
}

interface RegistrationLogEntry {
  timestamp: number;
  step: string;
  data: any;
}

interface FCMClient {
  exists: boolean;
  isConnectedToGoogle: boolean;
  hasRecentActivity: boolean;
  lastNotificationReceived: number | null;
  timeSinceLastNotification: number | null;
  notificationHistory: NotificationRecord[];
  registrationLog: RegistrationLogEntry[];
  socketDestroyed: boolean;
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
}

interface Credentials {
  hasCredentials: boolean;
  androidId: string | null;
  hasFcmToken: boolean;
  fcmTokenPreview: string | null;
}

interface ExpoToken {
  hasToken: boolean;
  token: string | null;
}

interface Auth {
  hasRustPlusToken: boolean;
  tokenPreview: string | null;
}

interface ListenerInfo {
  userId: string;
  steamId: string;
  createdAt: string;
  fcmClient: FCMClient;
  credentials: Credentials;
  expoToken: ExpoToken;
  auth: Auth;
  discrepancies: string[];
}

interface DiagnosticsData {
  timestamp: string;
  totalListeners: number;
  listeners: ListenerInfo[];
}

export default function ListenersDiagnosticPage() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [testingUser, setTestingUser] = useState<string | null>(null);
  const [showNotificationHistory, setShowNotificationHistory] = useState<Set<string>>(new Set());
  const [showRegistrationLog, setShowRegistrationLog] = useState<Set<string>>(new Set());
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffResults, setDiffResults] = useState<any>(null);

  const SHIM_URL = process.env.NEXT_PUBLIC_SHIM_URL || 'http://localhost:4000';
  const OWNER_STEAM_ID = '76561197995028213';

  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        const response = await fetch(`${SHIM_URL}/debug/listeners`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const diagnostics = await response.json();
        setData(diagnostics);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      }
    };

    fetchDiagnostics();

    if (autoRefresh) {
      const interval = setInterval(fetchDiagnostics, 2000); // Update every 2 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, SHIM_URL]);

  const toggleExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const toggleNotificationHistory = (userId: string) => {
    const newShow = new Set(showNotificationHistory);
    if (newShow.has(userId)) {
      newShow.delete(userId);
    } else {
      newShow.add(userId);
    }
    setShowNotificationHistory(newShow);
  };

  const toggleRegistrationLog = (userId: string) => {
    const newShow = new Set(showRegistrationLog);
    if (newShow.has(userId)) {
      newShow.delete(userId);
    } else {
      newShow.add(userId);
    }
    setShowRegistrationLog(newShow);
  };

  const toggleNotification = (notificationKey: string) => {
    const newExpanded = new Set(expandedNotifications);
    if (newExpanded.has(notificationKey)) {
      newExpanded.delete(notificationKey);
    } else {
      newExpanded.add(notificationKey);
    }
    setExpandedNotifications(newExpanded);
  };

  const sendTestNotification = async (userId: string) => {
    setTestingUser(userId);
    try {
      const response = await fetch(`${SHIM_URL}/debug/test-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        const result = await response.json();
        alert(`Test failed: ${result.error}`);
      } else {
        const result = await response.json();
        alert('Test notification sent! Check if it was received.');
      }
    } catch (err: any) {
      alert(`Test failed: ${err.message}`);
    } finally {
      setTestingUser(null);
    }
  };

  const deleteUserFromDB = async (userId: string, steamId: string) => {
    if (!confirm(`Delete user ${steamId} from database?\n\nThis will remove:\n- User account\n- All servers\n- All devices\n- FCM listener\n\nThey will need to re-login at https://app.rustplus.online`)) {
      return;
    }

    try {
      const response = await fetch(`${SHIM_URL}/debug/delete-user/${userId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!response.ok) {
        alert(`Delete failed: ${result.error}`);
      } else {
        alert(`✅ User deleted!\n\n${result.message}\n\nOnce they re-login, check the Registration Flow Log to see the fresh setup process.`);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const toggleComparison = (userId: string) => {
    const newSelected = new Set(selectedForComparison);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      // Only allow 2 selections
      if (newSelected.size >= 2) {
        alert('You can only compare 2 users at a time. Uncheck one first.');
        return;
      }
      newSelected.add(userId);
    }
    setSelectedForComparison(newSelected);
  };

  const compareSelectedUsers = () => {
    if (selectedForComparison.size !== 2) {
      alert('Please select exactly 2 users to compare.');
      return;
    }

    const userIds = Array.from(selectedForComparison);
    const user1 = data?.listeners.find(l => l.userId === userIds[0]);
    const user2 = data?.listeners.find(l => l.userId === userIds[1]);

    if (!user1 || !user2) {
      alert('Could not find selected users.');
      return;
    }

    // Compare registration logs
    const diff = smartDiff(user1, user2);
    setDiffResults(diff);
    setShowDiffModal(true);
  };

  const smartDiff = (user1: ListenerInfo, user2: ListenerInfo) => {
    // Fields that are expected to be different (tokens, IDs, timestamps, etc.)
    const expectedDifferentFields = [
      'token', 'Token', 'TOKEN',
      'id', 'Id', 'ID',
      'timestamp', 'Timestamp', 'TIMESTAMP',
      'time', 'Time', 'TIME',
      'deviceId', 'DeviceId', 'DEVICEID',
      'androidId', 'AndroidId', 'ANDROIDID',
      'pushToken', 'PushToken', 'PUSHTOKEN',
      'expoPushToken', 'ExpoPushToken', 'EXPOPUSHTOKEN',
      'authToken', 'AuthToken', 'AUTHTOKEN',
      'steamId', 'SteamId', 'STEAMID',
      'userId', 'UserId', 'USERID',
      'createdAt', 'CreatedAt', 'CREATEDAT'
    ];

    const shouldIgnoreField = (key: string): boolean => {
      return expectedDifferentFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      );
    };

    const compareObjects = (obj1: any, obj2: any, path: string = ''): any[] => {
      const differences: any[] = [];

      // Get all keys from both objects
      const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

      for (const key of allKeys) {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];

        // Skip if both are undefined
        if (val1 === undefined && val2 === undefined) continue;

        // Check if this is an expected difference (token, ID, etc.)
        const isExpectedDiff = shouldIgnoreField(key);

        // Handle objects recursively
        if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null && !Array.isArray(val1) && !Array.isArray(val2)) {
          differences.push(...compareObjects(val1, val2, currentPath));
          continue;
        }

        // Check if values are different
        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          differences.push({
            path: currentPath,
            user1Value: val1,
            user2Value: val2,
            isExpectedDiff
          });
        }
      }

      return differences;
    };

    // Compare registration logs
    const regLogDiffs = compareObjects(
      user1.fcmClient.registrationLog,
      user2.fcmClient.registrationLog,
      'registrationLog'
    );

    // Compare overall structure
    const structuralDiffs = compareObjects(
      {
        credentials: user1.credentials,
        expoToken: user1.expoToken,
        auth: user1.auth,
        fcmClient: {
          exists: user1.fcmClient.exists,
          isConnectedToGoogle: user1.fcmClient.isConnectedToGoogle,
          hasRecentActivity: user1.fcmClient.hasRecentActivity
        }
      },
      {
        credentials: user2.credentials,
        expoToken: user2.expoToken,
        auth: user2.auth,
        fcmClient: {
          exists: user2.fcmClient.exists,
          isConnectedToGoogle: user2.fcmClient.isConnectedToGoogle,
          hasRecentActivity: user2.fcmClient.hasRecentActivity
        }
      },
      'structure'
    );

    return {
      user1: {
        steamId: user1.steamId,
        userId: user1.userId
      },
      user2: {
        steamId: user2.steamId,
        userId: user2.userId
      },
      registrationLogDiffs: regLogDiffs,
      structuralDiffs: structuralDiffs,
      significantDifferences: [...regLogDiffs, ...structuralDiffs].filter(d => !d.isExpectedDiff)
    };
  };

  const formatTimeSince = (ms: number | null) => {
    if (ms === null) return 'Never';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getStatusColor = (isGood: boolean) => isGood ? 'text-green-600' : 'text-red-600';
  const getStatusIcon = (isGood: boolean) => isGood ? '✅' : '❌';

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">FCM Listener Diagnostics</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">FCM Listener Diagnostics</h1>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 font-mono text-sm text-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2 text-white">FCM Listener Diagnostics</h1>
            <p className="text-gray-400">
              Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {selectedForComparison.size > 0 && (
              <button
                onClick={compareSelectedUsers}
                disabled={selectedForComparison.size !== 2}
                className={`px-4 py-2 rounded font-bold ${
                  selectedForComparison.size === 2
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                🔍 Compare ({selectedForComparison.size}/2)
              </button>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Auto-refresh (2s)</span>
            </label>
            <div className="px-4 py-2 bg-blue-900 border border-blue-600 rounded text-blue-100">
              Total Listeners: <strong>{data.totalListeners}</strong>
            </div>
          </div>
        </div>

        {/* Listeners */}
        <div className="space-y-4">
          {data.listeners.map((listener) => {
            const isOwner = listener.steamId === OWNER_STEAM_ID;
            const isExpanded = expandedUsers.has(listener.userId);
            const hasIssues = listener.discrepancies.length > 0;

            return (
              <div
                key={listener.userId}
                className={`border rounded-lg overflow-hidden ${
                  isOwner
                    ? 'bg-blue-950 border-blue-500 border-2'
                    : hasIssues
                    ? 'bg-red-950 border-red-500'
                    : 'bg-gray-800 border-gray-600'
                }`}
              >
                {/* Summary Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-700"
                  onClick={() => toggleExpanded(listener.userId)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          checked={selectedForComparison.has(listener.userId)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleComparison(listener.userId);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 cursor-pointer"
                          title="Select for comparison"
                        />
                        <span className="text-lg font-bold">
                          {isOwner && '👑 '}
                          Steam ID: {listener.steamId}
                          {isOwner && ' (OWNER - WORKING)'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {listener.userId.substring(0, 8)}...
                        </span>
                      </div>

                      {/* Quick Status */}
                      <div className="flex gap-4 text-xs flex-wrap">
                        <span className={getStatusColor(listener.fcmClient.isConnectedToGoogle && listener.fcmClient.hasRecentActivity)}>
                          {getStatusIcon(listener.fcmClient.isConnectedToGoogle && listener.fcmClient.hasRecentActivity)} FCM Active
                        </span>
                        <span className={listener.fcmClient.hasRecentActivity ? 'text-green-600' : listener.fcmClient.lastNotificationReceived ? 'text-yellow-600' : 'text-gray-500'}>
                          {listener.fcmClient.hasRecentActivity ? '✅' : listener.fcmClient.lastNotificationReceived ? '⚠️' : '❌'} Last RX: {formatTimeSince(listener.fcmClient.timeSinceLastNotification)}
                        </span>
                        <span className={getStatusColor(listener.credentials.hasCredentials)}>
                          {getStatusIcon(listener.credentials.hasCredentials)} Has Credentials
                        </span>
                        <span className={getStatusColor(listener.expoToken.hasToken)}>
                          {getStatusIcon(listener.expoToken.hasToken)} Has Expo Token
                        </span>
                        <span className={getStatusColor(listener.auth.hasRustPlusToken)}>
                          {getStatusIcon(listener.auth.hasRustPlusToken)} Has Auth Token
                        </span>
                      </div>

                      {/* Discrepancies */}
                      {hasIssues && (
                        <div className="mt-2 p-2 bg-red-900 border border-red-600 rounded">
                          <strong className="text-red-300">⚠️ Issues Found:</strong>
                          <ul className="list-disc list-inside mt-1">
                            {listener.discrepancies.map((issue, idx) => (
                              <li key={idx} className="text-red-200">{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <button className="text-2xl">
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                </div>

                {/* Detailed Info */}
                {isExpanded && (
                  <div className="p-4 bg-gray-850 border-t border-gray-700 space-y-4">
                    {/* Action Buttons */}
                    <div className="flex justify-end items-center gap-2">
                      <button
                        onClick={() => sendTestNotification(listener.userId)}
                        disabled={testingUser === listener.userId}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded font-bold text-sm"
                      >
                        {testingUser === listener.userId ? 'Sending...' : '🧪 Send Test Notification'}
                      </button>
                    </div>

                    {/* FCM Client Details */}
                    <div>
                      <h3 className="font-bold mb-2">FCM Client Status (Receive-Only)</h3>
                      <div className="bg-gray-800 p-3 rounded border border-gray-600 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>Client Exists: <span className={getStatusColor(listener.fcmClient.exists)}>{listener.fcmClient.exists ? 'Yes' : 'No'}</span></div>
                          <div>Socket Active: <span className={getStatusColor(listener.fcmClient.isConnectedToGoogle)}>{listener.fcmClient.isConnectedToGoogle ? 'Yes' : 'No'}</span></div>
                          <div className="col-span-2">Recent Activity (5min): <span className={getStatusColor(listener.fcmClient.hasRecentActivity)}>{listener.fcmClient.hasRecentActivity ? 'Yes - Actively Receiving' : 'No - Idle or Never Received'}</span></div>
                          <div className="col-span-2">Last Notification Received: <span className={listener.fcmClient.lastNotificationReceived ? 'text-green-400' : 'text-yellow-400'}>{listener.fcmClient.lastNotificationReceived ? new Date(listener.fcmClient.lastNotificationReceived).toLocaleString() : 'Never'}</span></div>
                          <div className="col-span-2">Time Since Last: <span className={listener.fcmClient.lastNotificationReceived ? 'text-green-400' : 'text-yellow-400'}>{formatTimeSince(listener.fcmClient.timeSinceLastNotification)}</span></div>
                          <div>Socket Destroyed: <span className={getStatusColor(!listener.fcmClient.socketDestroyed)}>{listener.fcmClient.socketDestroyed ? 'Yes (BAD)' : 'No (Good)'}</span></div>
                          {listener.fcmClient.localAddress && (
                            <>
                              <div className="col-span-2">Local: {listener.fcmClient.localAddress}:{listener.fcmClient.localPort}</div>
                              <div className="col-span-2">Remote: {listener.fcmClient.remoteAddress}:{listener.fcmClient.remotePort}</div>
                            </>
                          )}
                        </div>

                        {/* Notification History Drill-Down */}
                        {listener.fcmClient.notificationHistory && listener.fcmClient.notificationHistory.length > 0 && (
                          <div className="border-t border-gray-700 pt-2 mt-2">
                            <button
                              onClick={() => toggleNotificationHistory(listener.userId)}
                              className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex justify-between items-center"
                            >
                              <span className="font-bold text-blue-400">
                                📬 Notification History ({listener.fcmClient.notificationHistory.length} received)
                              </span>
                              <span className="text-xl">{showNotificationHistory.has(listener.userId) ? '▼' : '▶'}</span>
                            </button>

                            {showNotificationHistory.has(listener.userId) && (
                              <div className="mt-2 space-y-1">
                                {listener.fcmClient.notificationHistory.map((notif, idx) => {
                                  const notifKey = `${listener.userId}-notif-${idx}`;
                                  const isExpanded = expandedNotifications.has(notifKey);

                                  return (
                                    <div key={idx} className="border border-blue-600 rounded overflow-hidden">
                                      <button
                                        onClick={() => toggleNotification(notifKey)}
                                        className="w-full text-left px-3 py-2 bg-gray-900 hover:bg-gray-800 flex justify-between items-center text-xs"
                                      >
                                        <div className="flex gap-3 items-center">
                                          <span className="text-gray-500">
                                            #{listener.fcmClient.notificationHistory.length - idx}
                                          </span>
                                          <span className="text-gray-400">
                                            {new Date(notif.timestamp).toLocaleString()}
                                          </span>
                                          <span className="text-blue-400 font-bold">{notif.type}</span>
                                        </div>
                                        <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                                      </button>

                                      {isExpanded && (
                                        <div className="bg-black p-3">
                                          <pre className="text-xs overflow-auto max-h-96 text-green-400 font-mono whitespace-pre-wrap break-words">
                                            {JSON.stringify(notif, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Registration Log Drill-Down */}
                        {listener.fcmClient.registrationLog && listener.fcmClient.registrationLog.length > 0 && (
                          <div className="border-t border-gray-700 pt-2 mt-2">
                            <button
                              onClick={() => toggleRegistrationLog(listener.userId)}
                              className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex flex-col gap-1"
                            >
                              <div className="flex justify-between items-center w-full">
                                <span className="font-bold text-yellow-400">
                                  🔧 FCM/Facepunch Registration Flow ({listener.fcmClient.registrationLog.length} steps)
                                </span>
                                <span className="text-xl">{showRegistrationLog.has(listener.userId) ? '▼' : '▶'}</span>
                              </div>
                              <div className="text-xs text-gray-400">
                                Shows: FCM credentials → Expo token → Facepunch API calls & responses
                              </div>
                            </button>

                            {/* Delete & Reset Button for Fresh Registration */}
                            <div className="mt-2 flex justify-end">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteUserFromDB(listener.userId, listener.steamId);
                                }}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs"
                                title="Delete user from DB and clear logs for fresh end-to-end registration test"
                              >
                                🗑️ Delete & Reset for Fresh Registration
                              </button>
                            </div>

                            {showRegistrationLog.has(listener.userId) && (
                              <div className="mt-2 space-y-2">
                                {listener.fcmClient.registrationLog.map((log, idx) => (
                                  <div key={idx} className={`p-3 rounded border ${
                                    log.step.includes('ERROR') || log.step.includes('FAILED')
                                      ? 'bg-red-950 border-red-600'
                                      : log.step.includes('SUCCESS')
                                      ? 'bg-green-950 border-green-600'
                                      : 'bg-gray-900 border-yellow-600'
                                  }`}>
                                    <div className="mb-2 text-xs flex justify-between">
                                      <span className="text-gray-400">
                                        {new Date(log.timestamp).toLocaleString()}
                                      </span>
                                      <span className={
                                        log.step.includes('ERROR') || log.step.includes('FAILED')
                                          ? 'text-red-400 font-bold'
                                          : log.step.includes('SUCCESS')
                                          ? 'text-green-400 font-bold'
                                          : 'text-yellow-400 font-bold'
                                      }>
                                        {log.step}
                                      </span>
                                    </div>
                                    <pre className="text-xs overflow-auto max-h-96 bg-black p-3 rounded text-green-400 font-mono whitespace-pre-wrap break-words">
                                      {JSON.stringify(log.data, null, 2)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Credentials */}
                    <div>
                      <h3 className="font-bold mb-2">FCM Credentials (from DB)</h3>
                      <div className="bg-gray-800 p-3 rounded border border-gray-600 space-y-1">
                        <div>Has Credentials: <span className={getStatusColor(listener.credentials.hasCredentials)}>{listener.credentials.hasCredentials ? 'Yes' : 'No'}</span></div>
                        {listener.credentials.androidId && (
                          <div>Android ID: <code className="bg-gray-700 px-1">{listener.credentials.androidId}</code></div>
                        )}
                        <div>Has FCM Token: <span className={getStatusColor(listener.credentials.hasFcmToken)}>{listener.credentials.hasFcmToken ? 'Yes' : 'No'}</span></div>
                        {listener.credentials.fcmTokenPreview && (
                          <div className="break-all">FCM Token: <code className="bg-gray-700 px-1">{listener.credentials.fcmTokenPreview}</code></div>
                        )}
                      </div>
                    </div>

                    {/* Expo Token */}
                    <div>
                      <h3 className="font-bold mb-2">Expo Push Token</h3>
                      <div className="bg-gray-800 p-3 rounded border border-gray-600 space-y-1">
                        <div>Has Token: <span className={getStatusColor(listener.expoToken.hasToken)}>{listener.expoToken.hasToken ? 'Yes' : 'No'}</span></div>
                        {listener.expoToken.token && (
                          <div className="break-all">Token: <code className="bg-gray-700 px-1">{listener.expoToken.token}</code></div>
                        )}
                      </div>
                    </div>

                    {/* Auth */}
                    <div>
                      <h3 className="font-bold mb-2">RustPlus Auth</h3>
                      <div className="bg-gray-800 p-3 rounded border border-gray-600 space-y-1">
                        <div>Has Auth Token: <span className={getStatusColor(listener.auth.hasRustPlusToken)}>{listener.auth.hasRustPlusToken ? 'Yes' : 'No'}</span></div>
                        {listener.auth.tokenPreview && (
                          <div className="break-all">Token Preview: <code className="bg-gray-700 px-1">{listener.auth.tokenPreview}</code></div>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div>
                      <h3 className="font-bold mb-2">Metadata</h3>
                      <div className="bg-gray-800 p-3 rounded border border-gray-600 space-y-1">
                        <div>User ID: <code className="bg-gray-700 px-1">{listener.userId}</code></div>
                        <div>Created At: {new Date(listener.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {data.listeners.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No active listeners found
          </div>
        )}

        {/* Comparison Diff Modal */}
        {showDiffModal && diffResults && (
          <div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-8 z-50"
            onClick={() => setShowDiffModal(false)}
          >
            <div
              className="bg-gray-900 rounded-lg border border-purple-500 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-purple-900 p-4 flex justify-between items-center border-b border-purple-500">
                <div>
                  <h2 className="text-xl font-bold text-white">Registration Flow Comparison</h2>
                  <p className="text-sm text-purple-200">
                    Comparing: {diffResults.user1.steamId} vs {diffResults.user2.steamId}
                  </p>
                </div>
                <button
                  onClick={() => setShowDiffModal(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold"
                >
                  Close
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Significant Differences Summary */}
                <div className="bg-yellow-950 border border-yellow-600 rounded p-4">
                  <h3 className="font-bold text-yellow-400 mb-2 text-lg">
                    🔍 Significant Differences Found: {diffResults.significantDifferences.length}
                  </h3>
                  <p className="text-sm text-yellow-200">
                    These are structural differences (not tokens/IDs). If both users should work the same,
                    these differences might explain why one works and the other doesn't.
                  </p>
                </div>

                {diffResults.significantDifferences.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-bold text-red-400 text-lg">⚠️ Structural Differences</h3>
                    {diffResults.significantDifferences.map((diff: any, idx: number) => (
                      <div key={idx} className="bg-red-950 border border-red-600 rounded p-4">
                        <div className="font-bold text-red-300 mb-2">
                          Path: <code className="bg-black px-2 py-1 rounded">{diff.path}</code>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-blue-400 font-bold mb-1">
                              User 1 ({diffResults.user1.steamId}):
                            </div>
                            <pre className="bg-black p-2 rounded overflow-auto max-h-48 text-green-400 font-mono">
                              {JSON.stringify(diff.user1Value, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-orange-400 font-bold mb-1">
                              User 2 ({diffResults.user2.steamId}):
                            </div>
                            <pre className="bg-black p-2 rounded overflow-auto max-h-48 text-green-400 font-mono">
                              {JSON.stringify(diff.user2Value, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-950 border border-green-600 rounded p-4">
                    <h3 className="font-bold text-green-400 text-lg">✅ No Structural Differences Found</h3>
                    <p className="text-green-200 text-sm mt-2">
                      Both users have the same structure in their registration flows and credentials.
                      Any differences are just tokens/IDs (which are expected to be different).
                    </p>
                  </div>
                )}

                {/* All Differences (Including Expected) */}
                <div className="border-t border-gray-700 pt-4">
                  <button
                    onClick={() => {
                      const elem = document.getElementById('all-diffs');
                      if (elem) {
                        elem.classList.toggle('hidden');
                      }
                    }}
                    className="w-full text-left px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded font-bold text-gray-300"
                  >
                    📋 Show All Differences (Including Tokens/IDs) - {diffResults.registrationLogDiffs.length + diffResults.structuralDiffs.length} total
                  </button>
                  <div id="all-diffs" className="hidden mt-4 space-y-2 max-h-96 overflow-y-auto">
                    {[...diffResults.registrationLogDiffs, ...diffResults.structuralDiffs].map((diff: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-3 rounded border ${
                          diff.isExpectedDiff
                            ? 'bg-gray-900 border-gray-600'
                            : 'bg-red-950 border-red-600'
                        }`}
                      >
                        <div className="text-xs mb-1">
                          <span className={diff.isExpectedDiff ? 'text-gray-400' : 'text-red-400'}>
                            {diff.isExpectedDiff ? '(Expected Difference)' : '⚠️ SIGNIFICANT'}
                          </span>
                          {' '}
                          <code className="bg-black px-1">{diff.path}</code>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-black p-2 rounded overflow-auto max-h-24">
                            <div className="text-blue-400 mb-1">User 1:</div>
                            <pre className="text-green-400 font-mono">
                              {JSON.stringify(diff.user1Value, null, 2)}
                            </pre>
                          </div>
                          <div className="bg-black p-2 rounded overflow-auto max-h-24">
                            <div className="text-orange-400 mb-1">User 2:</div>
                            <pre className="text-green-400 font-mono">
                              {JSON.stringify(diff.user2Value, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
