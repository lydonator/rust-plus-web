/**
 * Market Processor Module
 *
 * Core intelligence engine for the shopping/market feature.
 * Processes raw vending machine data into actionable market intelligence.
 *
 * Responsibilities:
 * - Build price indexes (min/max/avg per item)
 * - Rank vendors by price competitiveness
 * - Calculate value scores and deal alerts
 * - Maintain wipe-level statistics in memory
 * - Infer wipe stage from market signals
 * - Buffer observations for historical aggregation
 */

const rustItems = require('../../lib/rust-items.json');

class MarketProcessor {
  constructor() {
    // Wipe-level cache: serverId -> { itemPrices, vendors, wipeStart }
    this.wipeData = new Map();

    // Observation buffer for historical aggregation
    this.observationBuffer = [];
    this.MAX_BUFFER_SIZE = 10000;

    // Item categories for wipe-stage inference
    this.ITEM_CATEGORIES = this.buildItemCategories();

    // Currency IDs (Rust constants)
    this.CURRENCIES = {
      SCRAP: -51,
      SULFUR: -1414529671,
      HQM: 688032252,
      METAL_FRAGS: 69511070
    };

    console.log('[MarketProcessor] ✅ Initialized - Ready to process market data');
  }

  /**
   * Main entry point - Process vending machine markers into market intelligence
   *
   * @param {string} serverId - Server ID
   * @param {Array} markers - Raw map markers from RustPlus API
   * @param {Object} serverInfo - Server info (wipeTime, etc.)
   * @returns {Object} Processed market data
   */
  async processMarkers(serverId, markers, serverInfo) {
    try {
      const startTime = Date.now();

      // Filter vending machines only (type 3)
      const vendingMachines = markers.filter(m =>
        (m.type === 3 || m.type === 'VendingMachine') &&
        m.sellOrders &&
        m.sellOrders.length > 0
      );

      if (vendingMachines.length === 0) {
        console.log(`[MarketProcessor] No vending machines found for server ${serverId}`);
        return this.getEmptyMarketData();
      }

      console.log(`[MarketProcessor] Processing ${vendingMachines.length} vending machines for server ${serverId}`);

      // 1. Build item price index
      const itemPrices = this.buildPriceIndex(vendingMachines);

      // 2. Rank vendors for each item
      const rankedVendors = this.rankVendors(vendingMachines, itemPrices);

      // 3. Identify top deals (price significantly below average)
      const topDeals = this.findTopDeals(itemPrices, rankedVendors);

      // 4. Infer wipe stage from market signals
      const wipeStage = this.inferWipeStage(serverId, {
        vendors: vendingMachines,
        itemPrices,
        rankedVendors
      }, serverInfo);

      // 5. Update wipe-level cache
      this.updateWipeCache(serverId, {
        itemPrices,
        rankedVendors,
        topDeals,
        wipeStage,
        vendorCount: vendingMachines.length
      }, serverInfo);

      // 6. Buffer observations for historical aggregation
      this.bufferObservations(serverId, itemPrices, serverInfo);

      const processingTime = Date.now() - startTime;
      console.log(`[MarketProcessor] ✅ Processed in ${processingTime}ms - ${Object.keys(itemPrices).length} unique items, ${topDeals.length} deals`);

      return {
        itemPrices,
        rankedVendors,
        topDeals,
        wipeStage,
        wipeStats: this.getWipeStats(serverId),
        vendorCount: vendingMachines.length,
        processingTime
      };
    } catch (error) {
      console.error('[MarketProcessor] ❌ Error processing markers:', error);
      return this.getEmptyMarketData();
    }
  }

  /**
   * Build price index: Map itemId -> { min, max, avg, vendors[] }
   */
  buildPriceIndex(vendors) {
    const index = {};

    for (const vendor of vendors) {
      if (!vendor.sellOrders) continue;

      for (const order of vendor.sellOrders) {
        // Skip items with no stock
        if (order.amountInStock === 0) continue;

        const itemId = order.itemId;
        const key = String(itemId); // Use string keys for consistency

        if (!index[key]) {
          index[key] = {
            itemId,
            itemName: this.getItemName(itemId),
            prices: [],
            vendors: [],
            currencyId: order.currencyId,
            currencyName: this.getCurrencyName(order.currencyId)
          };
        }

        const itemData = index[key];

        // Calculate price per unit
        const pricePerUnit = order.costPerItem / order.quantity;

        itemData.prices.push(pricePerUnit);
        itemData.vendors.push({
          vendorId: vendor.id,
          vendorName: vendor.name || 'Unnamed Shop',
          location: { x: vendor.x, y: vendor.y },
          price: pricePerUnit,
          quantity: order.quantity,
          stock: order.amountInStock,
          costPerItem: order.costPerItem
        });
      }
    }

    // Calculate statistics for each item
    for (const key in index) {
      const data = index[key];
      if (data.prices.length === 0) continue;

      data.min = Math.min(...data.prices);
      data.max = Math.max(...data.prices);
      data.avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
      data.median = this.calculateMedian(data.prices);
      data.vendorCount = data.vendors.length;

      // Clean up temporary prices array
      delete data.prices;
    }

    return index;
  }

  /**
   * Rank vendors for each item (cheapest first)
   */
  rankVendors(vendors, itemPrices) {
    const rankings = {};

    for (const key in itemPrices) {
      const priceData = itemPrices[key];

      // Sort vendors by price (cheapest first)
      const sorted = [...priceData.vendors].sort((a, b) => a.price - b.price);

      // Add ranking metadata
      sorted.forEach((vendor, idx) => {
        vendor.rank = idx + 1;
        vendor.percentile = ((sorted.length - idx) / sorted.length) * 100;

        // Calculate savings vs average
        vendor.savings = priceData.avg > 0
          ? ((priceData.avg - vendor.price) / priceData.avg) * 100
          : 0;

        // Deal quality classification
        if (vendor.savings >= 30) {
          vendor.dealQuality = 'excellent';
        } else if (vendor.savings >= 15) {
          vendor.dealQuality = 'good';
        } else if (vendor.savings >= 0) {
          vendor.dealQuality = 'average';
        } else {
          vendor.dealQuality = 'overpriced';
        }
      });

      rankings[key] = sorted;
    }

    return rankings;
  }

  /**
   * Find top deals (items with 20%+ savings)
   */
  findTopDeals(itemPrices, rankedVendors) {
    const deals = [];

    for (const key in rankedVendors) {
      const vendors = rankedVendors[key];
      const cheapest = vendors[0];
      const priceData = itemPrices[key];

      // Deal threshold: at least 20% below average
      if (cheapest.savings >= 20) {
        deals.push({
          itemId: priceData.itemId,
          itemName: priceData.itemName,
          vendor: cheapest,
          savings: Math.round(cheapest.savings),
          // Store actual trade details (don't round to integers - causes display issues)
          tradeQuantity: cheapest.quantity, // How many items in this trade lot
          tradeCost: cheapest.costPerItem, // Total cost for the entire lot
          // Also store price-per-unit for internal calculations
          pricePerUnit: cheapest.price,
          avgPricePerUnit: priceData.avg,
          // Legacy fields (keep for backward compatibility, but these round to 0 for bulk trades)
          avgPrice: Math.round(priceData.avg),
          dealPrice: Math.round(cheapest.price),
          currencyId: priceData.currencyId,
          currencyName: priceData.currencyName,
          dealQuality: cheapest.dealQuality
        });
      }
    }

    // Sort by savings percentage (best deals first)
    deals.sort((a, b) => b.savings - a.savings);

    // Return top 20
    return deals.slice(0, 20);
  }

  /**
   * Infer wipe stage from market signals (adaptive algorithm)
   */
  inferWipeStage(serverId, marketData, serverInfo) {
    if (!serverInfo || !serverInfo.wipeTime) {
      return 'unknown';
    }

    const wipeTime = new Date(serverInfo.wipeTime);
    const daysSinceWipe = (Date.now() - wipeTime.getTime()) / (1000 * 60 * 60 * 24);

    // Calculate market signals
    const signals = {
      vendorCount: marketData.vendors.length,
      buildingMaterialsRatio: this.calculateItemCategoryRatio(marketData.itemPrices, 'building'),
      explosivesRatio: this.calculateItemCategoryRatio(marketData.itemPrices, 'explosives'),
      highTierWeaponsRatio: this.calculateItemCategoryRatio(marketData.itemPrices, 'weapons_tier3'),
      scrapAvailability: this.getItemAvailability(marketData.itemPrices, this.CURRENCIES.SCRAP),
      sulfurAvailability: this.getItemAvailability(marketData.itemPrices, this.CURRENCIES.SULFUR)
    };

    // Weighted scoring (adjustable over time)
    let earlyScore = 0;
    let midScore = 0;
    let lateScore = 0;

    // Early wipe signals: high building materials, low explosives, lots of scrap
    if (signals.buildingMaterialsRatio > 0.3) earlyScore += 30;
    if (signals.explosivesRatio < 0.1) earlyScore += 20;
    if (signals.scrapAvailability > signals.sulfurAvailability) earlyScore += 25;
    if (daysSinceWipe <= 3) earlyScore += 25;

    // Mid wipe signals: balanced items, explosives appearing, vendor density high
    if (signals.explosivesRatio > 0.15 && signals.explosivesRatio < 0.35) midScore += 35;
    if (signals.vendorCount > 20) midScore += 25;
    if (daysSinceWipe > 3 && daysSinceWipe <= 7) midScore += 40;

    // Late wipe signals: high tier items, fewer vendors, sulfur/HQM dominant
    if (signals.highTierWeaponsRatio > 0.2) lateScore += 30;
    if (signals.vendorCount < 15) lateScore += 20;
    if (signals.sulfurAvailability > signals.scrapAvailability) lateScore += 25;
    if (daysSinceWipe > 7) lateScore += 25;

    const maxScore = Math.max(earlyScore, midScore, lateScore);

    let inferredStage = 'unknown';
    if (maxScore === earlyScore) inferredStage = 'early';
    else if (maxScore === midScore) inferredStage = 'mid';
    else if (maxScore === lateScore) inferredStage = 'late';

    console.log(`[MarketProcessor] Wipe stage inference for ${serverId}: ${inferredStage} (${daysSinceWipe.toFixed(1)} days since wipe)`);
    console.log(`[MarketProcessor] Scores - Early: ${earlyScore}, Mid: ${midScore}, Late: ${lateScore}`);
    console.log(`[MarketProcessor] Signals:`, signals);

    return inferredStage;
  }

  /**
   * Update wipe-level cache
   */
  updateWipeCache(serverId, data, serverInfo) {
    const wipeStart = serverInfo && serverInfo.wipeTime
      ? new Date(serverInfo.wipeTime).getTime()
      : Date.now();

    this.wipeData.set(serverId, {
      ...data,
      wipeStart,
      lastUpdate: Date.now()
    });
  }

  /**
   * Get wipe statistics for a server
   */
  getWipeStats(serverId) {
    const cached = this.wipeData.get(serverId);
    if (!cached) return null;

    const daysSinceWipe = (Date.now() - cached.wipeStart) / (1000 * 60 * 60 * 24);

    return {
      wipeStage: cached.wipeStage,
      daysSinceWipe: Math.round(daysSinceWipe * 10) / 10,
      vendorCount: cached.vendorCount,
      uniqueItems: Object.keys(cached.itemPrices).length,
      topDealsCount: cached.topDeals.length,
      lastUpdate: cached.lastUpdate
    };
  }

  /**
   * Buffer price observations for historical aggregation
   */
  bufferObservations(serverId, itemPrices, serverInfo) {
    const timestamp = Date.now();

    for (const key in itemPrices) {
      const data = itemPrices[key];

      // Add each vendor observation to buffer
      for (const vendor of data.vendors) {
        this.observationBuffer.push({
          serverId,
          itemId: data.itemId,
          currencyId: data.currencyId,
          price: vendor.price,
          stock: vendor.stock,
          quantity: vendor.quantity,
          timestamp,
          wipeTime: serverInfo && serverInfo.wipeTime
            ? new Date(serverInfo.wipeTime).getTime()
            : null
        });
      }
    }

    // Trim buffer if exceeds max size
    if (this.observationBuffer.length > this.MAX_BUFFER_SIZE) {
      console.log(`[MarketProcessor] ⚠️  Buffer exceeded ${this.MAX_BUFFER_SIZE} observations, trimming oldest 50%`);
      this.observationBuffer = this.observationBuffer.slice(-Math.floor(this.MAX_BUFFER_SIZE / 2));
    }
  }

  /**
   * Get buffered observations (for historical aggregator to consume)
   */
  getBufferedObservations() {
    return this.observationBuffer;
  }

  /**
   * Clear buffered observations (after historical aggregator processes them)
   */
  clearBufferedObservations() {
    const count = this.observationBuffer.length;
    this.observationBuffer = [];
    console.log(`[MarketProcessor] Cleared ${count} buffered observations`);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate median of an array
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
   * Get item name from rust-items.json
   */
  getItemName(itemId) {
    const item = rustItems[String(itemId)];
    return item ? item.name : `Unknown Item (${itemId})`;
  }

  /**
   * Get currency name
   */
  getCurrencyName(currencyId) {
    switch (currencyId) {
      case this.CURRENCIES.SCRAP: return 'Scrap';
      case this.CURRENCIES.SULFUR: return 'Sulfur';
      case this.CURRENCIES.HQM: return 'High Quality Metal';
      case this.CURRENCIES.METAL_FRAGS: return 'Metal Fragments';
      default: return this.getItemName(currencyId);
    }
  }

  /**
   * Calculate ratio of items in a category
   */
  calculateItemCategoryRatio(itemPrices, category) {
    const totalItems = Object.keys(itemPrices).length;
    if (totalItems === 0) return 0;

    const categoryItems = this.ITEM_CATEGORIES[category] || [];
    let count = 0;

    for (const key in itemPrices) {
      const itemId = itemPrices[key].itemId;
      const itemName = this.getItemName(itemId).toLowerCase();

      // Check if item matches category (by ID or name pattern)
      if (categoryItems.some(pattern =>
        String(itemId) === String(pattern) || itemName.includes(pattern.toLowerCase())
      )) {
        count++;
      }
    }

    return count / totalItems;
  }

  /**
   * Get item availability (count of unique items using this currency)
   */
  getItemAvailability(itemPrices, currencyId) {
    let count = 0;

    for (const key in itemPrices) {
      if (itemPrices[key].currencyId === currencyId) {
        count++;
      }
    }

    return count;
  }

  /**
   * Build item categories for wipe-stage inference
   */
  buildItemCategories() {
    return {
      // Building materials
      building: [
        'wood', 'stone', 'metal', 'fragment', 'twig', 'armored',
        'wall', 'floor', 'roof', 'door', 'foundation', 'pillar'
      ],

      // Explosives
      explosives: [
        'c4', 'explosive', 'rocket', 'satchel', 'survey', 'grenade',
        'launcher', 'timed', 'charge'
      ],

      // High-tier weapons
      weapons_tier3: [
        'ak', 'lr', 'm249', 'l96', 'bolt', 'm39', 'mp5', 'm92'
      ]
    };
  }

  /**
   * Get empty market data structure
   */
  getEmptyMarketData() {
    return {
      itemPrices: {},
      rankedVendors: {},
      topDeals: [],
      wipeStage: 'unknown',
      wipeStats: null,
      vendorCount: 0,
      processingTime: 0
    };
  }

  /**
   * Get cached market data for a specific server (for price alert checking)
   */
  getServerMarketData(serverId) {
    return this.marketCache.get(serverId) || null;
  }

  /**
   * Clear wipe cache for a server (called when wipe detected)
   */
  clearWipeCache(serverId) {
    console.log(`[MarketProcessor] 🔄 Clearing wipe cache for server ${serverId}`);
    this.wipeData.delete(serverId);
  }
}

// Export singleton instance
module.exports = new MarketProcessor();
