/**
 * Base Carrier Service
 * Provides common functionality for all carrier tracking APIs
 */

import { CONFIG } from '../config/environment.js';

export class BaseCarrierService {
  constructor(carrierName, apiKey) {
    this.carrierName = carrierName;
    this.apiKey = apiKey;
    this.isDemo = CONFIG.IS_DEMO;
    this.baseHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'UNA-SnailMail/1.0.0'
    };
  }

  /**
   * Validate tracking number format for specific carrier
   * @param {string} trackingNumber 
   * @returns {boolean}
   */
  validateTrackingNumber(trackingNumber) {
    throw new Error('validateTrackingNumber must be implemented by carrier service');
  }

  /**
   * Track package using carrier API
   * @param {string} trackingNumber 
   * @returns {Promise<Object>} Tracking information
   */
  async trackPackage(trackingNumber) {
    throw new Error('trackPackage must be implemented by carrier service');
  }

  /**
   * Generate carrier tracking URL for customer access
   * @param {string} trackingNumber 
   * @returns {string} Public tracking URL
   */
  getTrackingUrl(trackingNumber) {
    throw new Error('getTrackingUrl must be implemented by carrier service');
  }

  /**
   * Normalize tracking status from carrier-specific to our internal format
   * @param {string} carrierStatus 
   * @returns {string} Internal status
   */
  normalizeStatus(carrierStatus) {
    const statusMap = {
      // Common mappings - can be overridden by specific carriers
      'delivered': 'DELIVERED',
      'in-transit': 'IN_TRANSIT',
      'out-for-delivery': 'OUT_FOR_DELIVERY', 
      'pending': 'AWAITING_PICKUP',
      'exception': 'EXCEPTION',
      'returned': 'RETURNED'
    };

    const normalized = statusMap[carrierStatus.toLowerCase()];
    return normalized || 'UNKNOWN';
  }

  /**
   * Handle API errors consistently
   * @param {Error} error 
   * @param {string} trackingNumber 
   */
  handleApiError(error, trackingNumber) {
    console.error(`${this.carrierName} API Error for ${trackingNumber}:`, error.message);
    
    return {
      success: false,
      error: error.message,
      carrier: this.carrierName,
      trackingNumber,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create standardized tracking response
   * @param {Object} carrierData 
   * @param {string} trackingNumber 
   */
  createTrackingResponse(carrierData, trackingNumber) {
    return {
      success: true,
      carrier: this.carrierName,
      trackingNumber,
      status: this.normalizeStatus(carrierData.status || 'unknown'),
      estimatedDelivery: carrierData.estimatedDelivery,
      lastUpdate: carrierData.lastUpdate || new Date().toISOString(),
      location: carrierData.location,
      trackingUrl: this.getTrackingUrl(trackingNumber),
      events: carrierData.events || [],
      originalData: carrierData
    };
  }

  /**
   * Generate demo tracking data for testing
   * @param {string} trackingNumber 
   */
  generateDemoData(trackingNumber) {
    const demoStatuses = ['AWAITING_PICKUP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const randomStatus = demoStatuses[Math.floor(Math.random() * demoStatuses.length)];
    
    return {
      success: true,
      carrier: this.carrierName,
      trackingNumber,
      status: randomStatus,
      estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastUpdate: new Date().toISOString(),
      location: 'Demo Location, AL 35630',
      trackingUrl: this.getTrackingUrl(trackingNumber),
      events: [
        {
          timestamp: new Date().toISOString(),
          status: randomStatus,
          location: 'Demo Location, AL 35630',
          description: `Demo ${randomStatus.toLowerCase().replace('_', ' ')} event`
        }
      ],
      originalData: { demo: true, carrier: this.carrierName }
    };
  }
}