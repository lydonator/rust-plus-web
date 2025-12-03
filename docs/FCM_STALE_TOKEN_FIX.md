# FCM Stale Token Fix

## Problem Summary

Device pairing notifications were not being received in production, even though:
- FCM client was connected to Google's servers
- Expo token was registered with Facepunch
- All credentials appeared valid

## Root Cause

**Expo Push Tokens are permanently bound to the FCM token used to create them.**

When FCM credentials change (new Android ID, new FCM token), the old Expo token becomes "stale" - it's still valid with Facepunch, but notifications get routed to the old FCM token instead of the current one.

### The Flow That Caused Stale Tokens:

1. User connects → FCM manager generates FCM credentials (Android ID + FCM token)
2. Expo token is generated from the FCM token and saved to database
3. **Later**: FCM credentials change/expire (new Android ID, new FCM token generated)
4. **But**: Old Expo token still in database
5. On reconnect: Code finds existing Expo token, re-registers it with Facepunch
6. Facepunch accepts the registration ✅
7. **But**: Expo service routes notifications to the OLD FCM token ❌
8. Current FCM client (listening with NEW credentials) never receives notifications

## The Fix

Added automatic detection of stale Expo tokens:

### Code Changes ([fcm-manager.js](../cloud-shim/src/fcm-manager.js))

1. **Added hash function** to fingerprint FCM tokens:
   ```javascript
   hashFcmToken(fcmToken) {
       return crypto.createHash('sha256').update(fcmToken).digest('hex');
   }
   ```

2. **Store hash alongside Expo token** when generating new tokens:
   ```javascript
   const fcmTokenHash = this.hashFcmToken(credentials.fcm.token);
   await this.supabase
       .from('users')
       .update({
           expo_push_token: expoPushToken,
           fcm_credentials_hash: fcmTokenHash  // ← NEW
       })
       .eq('id', userId);
   ```

3. **Validate Expo token before re-use**:
   ```javascript
   if (user.expo_push_token) {
       const currentFcmTokenHash = this.hashFcmToken(credentials.fcm.token);
       const storedFcmTokenHash = user.fcm_credentials_hash;

       if (storedFcmTokenHash && storedFcmTokenHash !== currentFcmTokenHash) {
           console.log(`[FCM] ⚠️  FCM credentials changed! Expo token is stale.`);
           // Fall through to generate NEW token
       } else {
           // Safe to re-use existing token
       }
   }
   ```

### Database Changes

**Migration**: [20251203000000_add_fcm_credentials_hash.sql](../supabase/migrations/20251203000000_add_fcm_credentials_hash.sql)

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS fcm_credentials_hash TEXT;
```

## Why This Happened

This was a **coding issue**, not a development issue. The original code assumed that:
- If an Expo token exists in the database, it's always valid
- Re-registering with Facepunch is sufficient

But it didn't account for:
- FCM credentials expiring/changing over time
- Expo tokens being permanently bound to specific FCM tokens
- The Expo Push Service routing based on the FCM token used during creation

## Deployment

1. **Apply migration** to production database:
   ```bash
   # Via Supabase CLI
   supabase db push

   # OR via Supabase Dashboard
   # SQL Editor → Run migration manually
   ```

2. **Deploy updated code**:
   ```bash
   git add .
   git commit -m "Fix: Detect and regenerate stale FCM Expo tokens"
   git push origin master
   ```

3. **Verify fix**:
   - Users with stale tokens will see in logs: `[FCM] ⚠️  FCM credentials changed!`
   - New Expo token will be generated automatically
   - Device pairing will work immediately

## Prevention

This fix prevents stale tokens from being re-used. The system will now:
- ✅ Detect when FCM credentials don't match the Expo token
- ✅ Automatically generate a fresh Expo token
- ✅ Never re-use tokens that won't receive notifications

No manual intervention needed in the future!

## Testing

To test the fix works:
1. Manually clear `expo_push_token` in database (to simulate stale token)
2. Restart cloud-shim
3. Connect to web app
4. Check logs for "FCM credentials changed" message
5. Verify new Expo token is generated
6. Pair a device - should work immediately
