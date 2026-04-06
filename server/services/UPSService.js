/**
 * UPS Tracking Service
 * Integrates with UPS Tracking API for real-time package tracking
 */

import { BaseCarrierService } from './BaseCarrierService.js';
import { CONFIG } from '../config/environment.js';

export class UPSService extends BaseCarrierService {
  constructor() {
    super('UPS', CONFIG.CARRIER_APIS.UPS_API);
    this.baseUrl = CONFIG.IS_LOCALHOST 
      ? 'https://wwwcie.ups.com/api' // UPS Customer Integration Environment (test)
      : 'https://onlinetools.ups.com/api'; // Production
    
    this.trackingEndpoint = '/track/v1/details';
  }

  /**
   * Validate UPS tracking number format
   * UPS tracking numbers are typically:
   * - 1Z + 8 alphanumeric + 8 numeric
   * - Or various other formats (18-34 characters)
   */
  validateTrackingNumber(trackingNumber) {
    if (!trackingNumber || typeof trackingNumber !== 'string') {
      return false;
    }

    // Remove spaces and convert to uppercase
    const clean = trackingNumber.replace(/\s+/g, '').toUpperCase();
    
    // UPS 1Z format: 1Z + 6 chars + 2 digits + 8 digits
    const upsRegex = /^1Z[A-Z0-9]{6}[0-9]{2}[0-9]{8}$/;
    
    // Alternative UPS formats
    const altRegex = /^[A-Z0-9]{7,34}$/;
    
    return upsRegex.test(clean) || altRegex.test(clean);
  }

  /**
   * Get UPS tracking URL for customer access
   */
  getTrackingUrl(trackingNumber) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
  }

  /**
   * Track package using UPS API
   */
  async trackPackage(trackingNumber) {
    try {
      // Return demo data in demo mode
      if (this.isDemo || !this.apiKey) {
        return this.generateDemoData(trackingNumber);
      }

      // Validate tracking number
      if (!this.validateTrackingNumber(trackingNumber)) {
        throw new Error('Invalid UPS tracking number format');
      }

      const response = await fetch(`${this.baseUrl}${this.trackingEndpoint}/${trackingNumber}`, {
        method: 'GET',
        headers: {
          ...this.baseHeaders,
          'Authorization': `Bearer ${this.apiKey}`,
          'transId': `una-snail-mail-${Date.now()}`,
          'transactionSrc': 'UNA-SnailMail'
        }
      });

      if (!response.ok) {
        throw new Error(`UPS API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseUPSResponse(data, trackingNumber);

    } catch (error) {
      return this.handleApiError(error, trackingNumber);
    }
  }

  /**
   * Parse UPS API response into standardized format
   */
  parseUPSResponse(upsData, trackingNumber) {
    try {
      const shipment = upsData.trackResponse?.shipment?.[0];
      if (!shipment) {
        throw new Error('No tracking information found');
      }

      const pkg = shipment.package?.[0];
      const currentStatus = pkg?.currentStatus;
      
      // Extract delivery information
      const deliveryDate = pkg?.deliveryDate?.[0];
      const estimatedDelivery = deliveryDate?.date;

      // Parse tracking events
      const events = pkg?.activity?.map(activity => ({
        timestamp: `${activity.date}T${activity.time}`,
        status: this.normalizeUPSStatus(activity.status?.description),
        location: this.formatLocation(activity.location),
        description: activity.status?.description || 'UPS tracking event'
      })) || [];

      return this.createTrackingResponse({
        status: currentStatus?.description,
        estimatedDelivery: estimatedDelivery,
        lastUpdate: events[0]?.timestamp,
        location: events[0]?.location,
        events: events.reverse() // Show chronological order
      }, trackingNumber);

    } catch (error) {
      throw new Error(`Failed to parse UPS response: ${error.message}`);
    }
  }

  /**
   * Normalize UPS-specific statuses to internal format
   */
  normalizeUPSStatus(upsStatus) {
    if (!upsStatus) return 'UNKNOWN';

    const statusMap = {
      'delivered': 'DELIVERED',
      'out for delivery': 'OUT_FOR_DELIVERY',
      'in transit': 'IN_TRANSIT',
      'origin scan': 'IN_TRANSIT',
      'departure scan': 'IN_TRANSIT',
      'arrival scan': 'IN_TRANSIT',
      'exception': 'EXCEPTION',
      'attempted delivery': 'DELIVERY_ATTEMPTED',
      'return to sender': 'RETURNED',
      'label created': 'AWAITING_PICKUP',
      'order processed': 'AWAITING_PICKUP'
    };

    const normalized = statusMap[upsStatus.toLowerCase()];
    return normalized || this.normalizeStatus(upsStatus);
  }

  /**
   * Format UPS location data
   */
  formatLocation(location) {
    if (!location) return 'Unknown Location';
    
    const parts = [
      location.address?.city,
      location.address?.stateProvinceCode,
      location.address?.countryCode
    ].filter(Boolean);
    
    return parts.join(', ') || 'Unknown Location';
  }

  /**
   * Get delivery time estimates from UPS
   */
  async getDeliveryEstimate(fromZip, toZip, serviceType = 'GROUND') {
    try {
      if (this.isDemo) {
        return {
          estimatedDays: Math.floor(Math.random() * 5) + 1,
          serviceType: serviceType,
          carrier: 'UPS'
        };
      }

      // UPS Time in Transit API call would go here
      // This is a more advanced feature that requires additional API setup
      
      return null;
    } catch (error) {
      console.error('UPS delivery estimate error:', error);
      return null;
    }
  }
}