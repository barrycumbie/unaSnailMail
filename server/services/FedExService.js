/**
 * FedEx Tracking Service  
 * Integrates with FedEx Tracking API for real-time package tracking
 */

import { BaseCarrierService } from './BaseCarrierService.js';
import { CONFIG } from '../config/environment.js';

export class FedExService extends BaseCarrierService {
  constructor() {
    super('FEDEX', CONFIG.CARRIER_APIS.FEDEX_API);
    this.baseUrl = CONFIG.IS_LOCALHOST
      ? 'https://apis-sandbox.fedex.com' // FedEx Test Environment
      : 'https://apis.fedex.com'; // Production
    
    this.trackingEndpoint = '/track/v1/trackingnumbers';
    this.authToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Validate FedEx tracking number format
   * FedEx tracking numbers:
   * - 12 digits (most common): 1234 5678 9012  
   * - 14 digits: 1234 5678 9012 34
   * - Express: starts with 1001, 1234, etc.
   * - Ground: various formats
   */
  validateTrackingNumber(trackingNumber) {
    if (!trackingNumber || typeof trackingNumber !== 'string') {
      return false;
    }

    const clean = trackingNumber.replace(/\s+/g, '').toUpperCase();
    
    // FedEx tracking number patterns
    const patterns = [
      /^[0-9]{12}$/, // 12 digit format
      /^[0-9]{14}$/, // 14 digit format  
      /^[0-9]{15}$/, // 15 digit format
      /^[0-9]{20}$/, // 20 digit format
      /^9611[0-9]{16}$/, // FedEx SmartPost
      /^1001[0-9]{8}$/, // Express format
    ];

    return patterns.some(pattern => pattern.test(clean));
  }

  /**
   * Get FedEx tracking URL for customer access
   */
  getTrackingUrl(trackingNumber) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
  }

  /**
   * Get OAuth token for FedEx API
   */
  async getAuthToken() {
    try {
      // Return cached token if still valid
      if (this.authToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.authToken;
      }

      if (this.isDemo || !this.apiKey) {
        return 'demo-fedex-token';
      }

      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          ...this.baseHeaders,
          'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${process.env.FEDEX_SECRET}`).toString('base64')}`
        },
        body: new URLSearchParams({
          'grant_type': 'client_credentials'
        })
      });

      if (!response.ok) {
        throw new Error(`FedEx Auth Error: ${response.status}`);
      }

      const data = await response.json();
      this.authToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // 1 minute buffer

      return this.authToken;

    } catch (error) {
      console.error('FedEx authentication failed:', error);
      throw error;
    }
  }

  /**
   * Track package using FedEx API
   */
  async trackPackage(trackingNumber) {
    try {
      // Return demo data in demo mode
      if (this.isDemo || !this.apiKey) {
        return this.generateDemoData(trackingNumber);
      }

      // Validate tracking number
      if (!this.validateTrackingNumber(trackingNumber)) {
        throw new Error('Invalid FedEx tracking number format');
      }

      // Get authentication token
      const token = await this.getAuthToken();

      const requestBody = {
        includeDetailedScans: true,
        trackingInfo: [
          {
            trackingNumberInfo: {
              trackingNumber: trackingNumber
            }
          }
        ]
      };

      const response = await fetch(`${this.baseUrl}${this.trackingEndpoint}`, {
        method: 'POST',
        headers: {
          ...this.baseHeaders,
          'Authorization': `Bearer ${token}`,
          'X-locale': 'en_US'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`FedEx API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseFedExResponse(data, trackingNumber);

    } catch (error) {
      return this.handleApiError(error, trackingNumber);
    }
  }

  /**
   * Parse FedEx API response into standardized format
   */
  parseFedExResponse(fedexData, trackingNumber) {
    try {
      const output = fedexData.output;
      if (!output?.completeTrackResults?.[0]) {
        throw new Error('No tracking information found');
      }

      const trackResult = output.completeTrackResults[0];
      const trackResults = trackResult.trackResults?.[0];
      
      if (!trackResults) {
        throw new Error('Invalid tracking data structure');
      }

      // Extract current status
      const latestStatus = trackResults.latestStatusDetail;
      const scanEvents = trackResults.scanEvents || [];

      // Parse delivery information  
      const deliveryDetails = trackResults.deliveryDetails;
      const estimatedDelivery = deliveryDetails?.estimatedDeliveryTimeWindow?.window?.ends ||
                               deliveryDetails?.commitmentTimeWindow?.window?.ends;

      // Parse tracking events
      const events = scanEvents.map(event => ({
        timestamp: event.date || new Date().toISOString(),
        status: this.normalizeFedExStatus(event.eventDescription),
        location: this.formatFedExLocation(event.scanLocation),
        description: event.eventDescription || 'FedEx tracking event'
      }));

      // Add current status as most recent event if not already included
      if (latestStatus && !events.find(e => e.description === latestStatus.description)) {
        events.unshift({
          timestamp: latestStatus.scanEventDate || new Date().toISOString(),
          status: this.normalizeFedExStatus(latestStatus.description),
          location: this.formatFedExLocation(latestStatus.scanLocation),
          description: latestStatus.description
        });
      }

      return this.createTrackingResponse({
        status: latestStatus?.description,
        estimatedDelivery: estimatedDelivery,
        lastUpdate: events[0]?.timestamp,
        location: events[0]?.location,
        events: events
      }, trackingNumber);

    } catch (error) {
      throw new Error(`Failed to parse FedEx response: ${error.message}`);
    }
  }

  /**
   * Normalize FedEx-specific statuses to internal format
   */
  normalizeFedExStatus(fedexStatus) {
    if (!fedexStatus) return 'UNKNOWN';

    const status = fedexStatus.toLowerCase();

    const statusMap = {
      'delivered': 'DELIVERED',
      'on fedex vehicle for delivery': 'OUT_FOR_DELIVERY',
      'out for delivery': 'OUT_FOR_DELIVERY',
      'at local fedex facility': 'IN_TRANSIT',
      'in transit': 'IN_TRANSIT',
      'departed fedex location': 'IN_TRANSIT',
      'arrived at fedex location': 'IN_TRANSIT',
      'picked up': 'IN_TRANSIT',
      'shipment exception': 'EXCEPTION',
      'delivery exception': 'EXCEPTION',
      'attempted delivery': 'DELIVERY_ATTEMPTED',
      'customer not available': 'DELIVERY_ATTEMPTED',
      'return to sender': 'RETURNED',
      'shipment information sent': 'AWAITING_PICKUP',
      'label created': 'AWAITING_PICKUP'
    };

    // Find matching status
    for (const [key, value] of Object.entries(statusMap)) {
      if (status.includes(key)) {
        return value;
      }
    }

    return this.normalizeStatus(status);
  }

  /**
   * Format FedEx location data
   */
  formatFedExLocation(location) {
    if (!location) return 'Unknown Location';
    
    const parts = [
      location.city,
      location.stateOrProvinceCode,
      location.countryCode
    ].filter(Boolean);
    
    return parts.join(', ') || 'Unknown Location';
  }

  /**
   * Get FedEx pickup availability
   */
  async getPickupAvailability(address, date) {
    try {
      if (this.isDemo) {
        return {
          available: true,
          timeWindows: ['09:00-12:00', '13:00-17:00'],
          carrier: 'FEDEX'
        };
      }

      // FedEx Pickup Availability API would go here
      return null;
    } catch (error) {
      console.error('FedEx pickup availability error:', error);
      return null;
    }
  }

  /**
   * Calculate shipping rates (additional service)
   */
  async getShippingRates(origin, destination, packageInfo) {
    try {
      if (this.isDemo) {
        return [
          { service: 'FEDEX_GROUND', rate: 12.50, days: 3 },
          { service: 'FEDEX_2_DAY', rate: 25.75, days: 2 },
          { service: 'STANDARD_OVERNIGHT', rate: 45.20, days: 1 }
        ];
      }

      // FedEx Rate API would go here
      return null;
    } catch (error) {
      console.error('FedEx shipping rates error:', error);
      return null;
    }
  }
}