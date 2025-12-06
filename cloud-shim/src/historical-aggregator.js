/**
 * Historical Aggregator Module
 *
 * Background job that aggregates buffered market observations into historical data.
 * Runs every 6 hours via cron job.
 *
 * Responsibilities:
 * - Aggregate buffered price observations into global statistics
 * - Update item_price_history table (min/max/avg/median)
 * - Update item_availability_stats (rarity scores)
 * - Calculate currency equivalency matrix
 * - Cleanup old data (90-day rolling window)
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase admin client (bypasses RLS)
// Uses same naming convention as config.js and rest of cloud-shim
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[HistoricalAggregator] ❌ Missing Supabase credentials');
  console.error('[HistoricalAggregator] Expected: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

class HistoricalAggregator {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    console.log('[HistoricalAggregator] ✅ Initialized');
  }

  /**
   * Main aggregation job - called by cron every 6 hours
   */
  async runAggregation(marketProcessor) {
    if (this.isRunning) {
      console.log('[HistoricalAggregator] ⏭️  Skipping - already running');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[HistoricalAggregator] 🚀 Starting aggregation job...');

      // Get buffered observations from market processor
      const observations = marketProcessor.getBufferedObservations();

      if (observations.length === 0) {
        console.log('[HistoricalAggregator] No new observations to process');
        this.isRunning = false;
        return;
      }

      console.log(`[HistoricalAggregator] Processing ${observations.length} observations`);

      // 1. Aggregate item price history
      await this.aggregateItemPriceHistory(observations);

      // 2. Update item availability stats (rarity)
      await this.updateItemAvailability(observations);

      // 3. Calculate currency equivalency (cross-currency intelligence)
      await this.calculateCurrencyEquivalency(observations);

      // 4. Cleanup old data (90-day retention)
      await this.cleanupOldData();

      // 5. Clear processed observations from buffer
      marketProcessor.clearBufferedObservations();

      const duration = Date.now() - startTime;
      this.lastRunTime = Date.now();

      console.log(`[HistoricalAggregator] ✅ Aggregation complete in ${duration}ms`);
    } catch (error) {
      console.error('[HistoricalAggregator] ❌ Error during aggregation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Aggregate price observations into item_price_history table
   */
  async aggregateItemPriceHistory(observations) {
    // Group observations by item + currency
    const priceGroups = {};

    for (const obs of observations) {
      const key = `${obs.itemId}_${obs.currencyId}`;

      if (!priceGroups[key]) {
        priceGroups[key] = {
          itemId: obs.itemId,
          currencyId: obs.currencyId,
          prices: []
        };
      }

      priceGroups[key].prices.push(obs.price);
    }

    console.log(`[HistoricalAggregator] Aggregating ${Object.keys(priceGroups).length} item-currency pairs`);

    // Process each group
    for (const key in priceGroups) {
      const group = priceGroups[key];
      const { itemId, currencyId, prices } = group;

      if (prices.length === 0) continue;

      // Calculate statistics
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const median = this.calculateMedian(prices);

      // Upsert into database
      const { error } = await supabase
        .from('item_price_history')
        .upsert({
          item_id: itemId,
          currency_id: currencyId,
          min_price: Math.round(min),
          max_price: Math.round(max),
          avg_price: parseFloat(avg.toFixed(2)),
          median_price: Math.round(median),
          observation_count: prices.length,
          last_seen_at: new Date().toISOString()
        }, {
          onConflict: 'item_id,currency_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`[HistoricalAggregator] Error upserting price history for item ${itemId}:`, error);
      }
    }

    console.log('[HistoricalAggregator] ✅ Item price history updated');
  }

  /**
   * Update item availability statistics (rarity calculation)
   */
  async updateItemAvailability(observations) {
    // Count item occurrences and stock levels
    const itemStats = {};

    for (const obs of observations) {
      if (!itemStats[obs.itemId]) {
        itemStats[obs.itemId] = {
          itemId: obs.itemId,
          timesSeen: 0,
          stockLevels: []
        };
      }

      itemStats[obs.itemId].timesSeen++;
      if (obs.stock > 0) {
        itemStats[obs.itemId].stockLevels.push(obs.stock);
      }
    }

    console.log(`[HistoricalAggregator] Updating availability for ${Object.keys(itemStats).length} items`);

    // Calculate rarity scores (0-100, lower = more rare)
    // Based on times seen relative to max
    const maxTimesSeen = Math.max(...Object.values(itemStats).map(s => s.timesSeen));

    for (const itemId in itemStats) {
      const stats = itemStats[itemId];
      const avgStock = stats.stockLevels.length > 0
        ? stats.stockLevels.reduce((a, b) => a + b, 0) / stats.stockLevels.length
        : 0;

      // Rarity score: inverted frequency (0 = ultra rare, 100 = very common)
      const rarityScore = maxTimesSeen > 0
        ? ((maxTimesSeen - stats.timesSeen) / maxTimesSeen) * 100
        : 50;

      // Upsert into database
      const { error } = await supabase
        .from('item_availability_stats')
        .upsert({
          item_id: parseInt(itemId),
          times_seen: stats.timesSeen,
          avg_stock_level: parseFloat(avgStock.toFixed(2)),
          rarity_score: parseFloat(rarityScore.toFixed(2)),
          last_seen_at: new Date().toISOString()
        }, {
          onConflict: 'item_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`[HistoricalAggregator] Error upserting availability for item ${itemId}:`, error);
      }
    }

    console.log('[HistoricalAggregator] ✅ Item availability stats updated');
  }

  /**
   * Calculate currency equivalency matrix
   *
   * Strategy: Find items sold for multiple currencies and infer exchange rates
   * Example: "AK-47 for 500 scrap" AND "AK-47 for 2 HQM" → 1 HQM ≈ 250 scrap
   */
  async calculateCurrencyEquivalency(observations) {
    // Group observations by item to find cross-currency trades
    const itemPrices = {};

    for (const obs of observations) {
      if (!itemPrices[obs.itemId]) {
        itemPrices[obs.itemId] = {};
      }

      if (!itemPrices[obs.itemId][obs.currencyId]) {
        itemPrices[obs.itemId][obs.currencyId] = [];
      }

      itemPrices[obs.itemId][obs.currencyId].push(obs.price);
    }

    // Calculate exchange rates between currencies
    const exchangeRates = {};

    for (const itemId in itemPrices) {
      const currencies = Object.keys(itemPrices[itemId]);

      // If item is sold in multiple currencies, calculate exchange rates
      if (currencies.length >= 2) {
        for (let i = 0; i < currencies.length; i++) {
          for (let j = i + 1; j < currencies.length; j++) {
            const currency1 = parseInt(currencies[i]);
            const currency2 = parseInt(currencies[j]);

            const prices1 = itemPrices[itemId][currency1];
            const prices2 = itemPrices[itemId][currency2];

            const avg1 = prices1.reduce((a, b) => a + b, 0) / prices1.length;
            const avg2 = prices2.reduce((a, b) => a + b, 0) / prices2.length;

            // Exchange rate: currency1 to currency2
            const rate12 = avg1 / avg2;
            const rate21 = avg2 / avg1;

            // Store bidirectional rates
            const key12 = `${currency1}_${currency2}`;
            const key21 = `${currency2}_${currency1}`;

            if (!exchangeRates[key12]) {
              exchangeRates[key12] = { from: currency1, to: currency2, rates: [] };
            }
            if (!exchangeRates[key21]) {
              exchangeRates[key21] = { from: currency2, to: currency1, rates: [] };
            }

            exchangeRates[key12].rates.push(rate12);
            exchangeRates[key21].rates.push(rate21);
          }
        }
      }
    }

    // Aggregate and upsert exchange rates
    console.log(`[HistoricalAggregator] Calculating ${Object.keys(exchangeRates).length} currency exchange rates`);

    for (const key in exchangeRates) {
      const { from, to, rates } = exchangeRates[key];

      if (rates.length === 0) continue;

      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      const confidence = Math.min(100, rates.length * 10); // More observations = higher confidence

      const { error } = await supabase
        .from('currency_equivalency')
        .upsert({
          from_currency_id: from,
          to_currency_id: to,
          exchange_rate: parseFloat(avgRate.toFixed(4)),
          confidence_score: parseFloat(confidence.toFixed(2)),
          observation_count: rates.length,
          last_updated_at: new Date().toISOString()
        }, {
          onConflict: 'from_currency_id,to_currency_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`[HistoricalAggregator] Error upserting currency equivalency ${from}->${to}:`, error);
      }
    }

    console.log('[HistoricalAggregator] ✅ Currency equivalency matrix updated');
  }

  /**
   * Cleanup old data (90-day retention)
   */
  async cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[HistoricalAggregator] Cleaning up data older than ${cutoffISO}`);

    // Clean up item_price_history
    const { data: deletedPrices, error: priceError } = await supabase
      .from('item_price_history')
      .delete()
      .lt('last_seen_at', cutoffISO);

    if (priceError) {
      console.error('[HistoricalAggregator] Error cleaning item_price_history:', priceError);
    }

    // Clean up item_availability_stats
    const { data: deletedAvailability, error: availError } = await supabase
      .from('item_availability_stats')
      .delete()
      .lt('last_seen_at', cutoffISO);

    if (availError) {
      console.error('[HistoricalAggregator] Error cleaning item_availability_stats:', availError);
    }

    // Clean up currency_equivalency
    const { data: deletedCurrency, error: currencyError } = await supabase
      .from('currency_equivalency')
      .delete()
      .lt('last_updated_at', cutoffISO);

    if (currencyError) {
      console.error('[HistoricalAggregator] Error cleaning currency_equivalency:', currencyError);
    }

    console.log('[HistoricalAggregator] ✅ Old data cleaned up (90-day retention)');
  }

  /**
   * Helper: Calculate median
   */
  calculateMedian(arr) {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Get last run statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      lastRunAgo: this.lastRunTime ? Date.now() - this.lastRunTime : null
    };
  }
}

// Export singleton instance
module.exports = new HistoricalAggregator();
