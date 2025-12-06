/**
 * Price Alert Monitor Module
 *
 * Background job that checks user price alerts and sends FCM notifications
 * when items hit target prices.
 *
 * Features:
 * - Monitors shopping_lists table for alert_enabled items
 * - Compares current market prices with target_price
 * - Sends FCM push notifications when alerts trigger
 * - Prevents spam with cooldown mechanism (1 alert per item per hour)
 * - Batch processing for efficiency
 */

const logger = require('./logger');
const supabase = require('./supabase');

class PriceAlertMonitor {
    constructor() {
        this.isRunning = false;
        this.lastRunTime = null;
        this.alertCooldowns = new Map(); // Track last alert time per user+item
        this.COOLDOWN_PERIOD = 60 * 60 * 1000; // 1 hour cooldown
        logger.info('PriceAlertMonitor', '✅ Initialized');
    }

    /**
     * Main alert check job - called every 5 minutes by cron
     */
    async checkPriceAlerts(marketProcessor) {
        if (this.isRunning) {
            logger.debug('PriceAlertMonitor', 'Skipping - already running');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('PriceAlertMonitor', '🔔 Starting price alert check...');

            // Get all active alerts from database
            const { data: alerts, error } = await supabase
                .from('shopping_lists')
                .select(`
                    id,
                    user_id,
                    server_id,
                    item_id,
                    item_name,
                    target_price,
                    alert_enabled
                `)
                .eq('alert_enabled', true)
                .not('target_price', 'is', null);

            if (error) {
                logger.error('PriceAlertMonitor', 'Failed to fetch alerts', { error: error.message });
                return;
            }

            if (!alerts || alerts.length === 0) {
                logger.debug('PriceAlertMonitor', 'No active price alerts');
                return;
            }

            logger.info('PriceAlertMonitor', `Checking ${alerts.length} active alerts`);

            // Group alerts by server for efficient processing
            const alertsByServer = new Map();
            for (const alert of alerts) {
                if (!alertsByServer.has(alert.server_id)) {
                    alertsByServer.set(alert.server_id, []);
                }
                alertsByServer.get(alert.server_id).push(alert);
            }

            let triggeredCount = 0;

            // Process each server's alerts
            for (const [serverId, serverAlerts] of alertsByServer.entries()) {
                // Get current market data for this server
                const marketData = marketProcessor.getServerMarketData(serverId);

                if (!marketData || !marketData.itemPrices) {
                    logger.debug('PriceAlertMonitor', `No market data for server ${serverId}`);
                    continue;
                }

                // Check each alert
                for (const alert of serverAlerts) {
                    const itemKey = String(alert.item_id);
                    const priceData = marketData.itemPrices[itemKey];

                    if (!priceData) {
                        // Item not currently available
                        continue;
                    }

                    // Check if current min price is <= target price
                    if (priceData.min <= alert.target_price) {
                        // Check cooldown to prevent spam
                        const cooldownKey = `${alert.user_id}_${alert.item_id}`;
                        const lastAlertTime = this.alertCooldowns.get(cooldownKey);
                        const now = Date.now();

                        if (lastAlertTime && (now - lastAlertTime) < this.COOLDOWN_PERIOD) {
                            logger.debug('PriceAlertMonitor', `Alert on cooldown for ${alert.item_name}`);
                            continue;
                        }

                        // Trigger alert!
                        await this.sendPriceAlert(alert, priceData, serverId);
                        this.alertCooldowns.set(cooldownKey, now);
                        triggeredCount++;
                    }
                }
            }

            const duration = Date.now() - startTime;
            this.lastRunTime = Date.now();

            logger.info('PriceAlertMonitor', `✅ Alert check complete in ${duration}ms`, {
                totalAlerts: alerts.length,
                triggered: triggeredCount
            });
        } catch (error) {
            logger.error('PriceAlertMonitor', '❌ Error during alert check', { error: error.message });
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Send FCM price alert notification to user
     */
    async sendPriceAlert(alert, priceData, serverId) {
        try {
            logger.info('PriceAlertMonitor', `🔔 Triggering alert for ${alert.item_name}`, {
                userId: alert.user_id,
                targetPrice: alert.target_price,
                currentPrice: priceData.min
            });

            // Get user's FCM token
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('expo_push_token, fcm_token')
                .eq('id', alert.user_id)
                .single();

            if (userError || !user) {
                logger.warn('PriceAlertMonitor', `User ${alert.user_id} not found`);
                return;
            }

            const fcmToken = user.fcm_token || user.expo_push_token;

            if (!fcmToken) {
                logger.warn('PriceAlertMonitor', `User ${alert.user_id} has no FCM token`);
                return;
            }

            // Calculate savings
            const savings = alert.target_price - priceData.min;
            const savingsPercent = Math.round((savings / alert.target_price) * 100);

            // Get vendor with best price
            const bestVendor = priceData.vendors[0];

            // Construct FCM notification
            const notification = {
                to: fcmToken,
                title: `🔔 Price Alert: ${alert.item_name}`,
                body: `Now ${priceData.min} ${priceData.currencyName} (${savingsPercent}% below your target!)`,
                data: {
                    type: 'price_alert',
                    serverId: serverId,
                    itemId: alert.item_id,
                    itemName: alert.item_name,
                    targetPrice: alert.target_price,
                    currentPrice: priceData.min,
                    savings: savings,
                    savingsPercent: savingsPercent,
                    vendorId: bestVendor?.vendorId,
                    vendorName: bestVendor?.vendorName,
                    vendorLocation: bestVendor?.location,
                    currencyName: priceData.currencyName,
                    timestamp: Date.now()
                },
                sound: 'default',
                priority: 'high'
            };

            // Send via Expo Push API (used by app)
            if (user.expo_push_token) {
                await this.sendExpoNotification(notification);
            }

            // Log notification to database
            await supabase
                .from('notifications')
                .insert({
                    user_id: alert.user_id,
                    type: 'price_alert',
                    data: notification.data,
                    timestamp: new Date().toISOString(),
                    read: false
                });

            logger.info('PriceAlertMonitor', `✅ Price alert sent to user ${alert.user_id}`);
        } catch (error) {
            logger.error('PriceAlertMonitor', 'Failed to send price alert', {
                error: error.message,
                userId: alert.user_id,
                itemName: alert.item_name
            });
        }
    }

    /**
     * Send notification via Expo Push API
     */
    async sendExpoNotification(notification) {
        try {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(notification)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(`Expo API error: ${JSON.stringify(result)}`);
            }

            logger.debug('PriceAlertMonitor', 'Expo notification sent', { result });
        } catch (error) {
            logger.error('PriceAlertMonitor', 'Failed to send Expo notification', {
                error: error.message
            });
        }
    }

    /**
     * Cleanup old cooldowns to prevent memory leaks
     */
    cleanupCooldowns() {
        const now = Date.now();
        const cutoff = now - (this.COOLDOWN_PERIOD * 2); // Keep 2x cooldown period

        for (const [key, timestamp] of this.alertCooldowns.entries()) {
            if (timestamp < cutoff) {
                this.alertCooldowns.delete(key);
            }
        }

        logger.debug('PriceAlertMonitor', `Cleaned cooldowns, ${this.alertCooldowns.size} remaining`);
    }

    /**
     * Get monitor statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            lastRunTime: this.lastRunTime,
            activeCooldowns: this.alertCooldowns.size,
            lastRunAgo: this.lastRunTime ? Date.now() - this.lastRunTime : null
        };
    }
}

// Export singleton instance
module.exports = new PriceAlertMonitor();
