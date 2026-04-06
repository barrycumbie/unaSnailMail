/**
 * USPS Tracking Service
 * Integrates with USPS Tracking API for postal service package tracking
 */

import { BaseCarrierService } from './BaseCarrierService.js';
import { CONFIG } from '../config/environment.js';

export class USPSService extends BaseCarrierService {
  constructor() {
    super('USPS', CONFIG.CARRIER_APIS.USPS_API);
    this.baseUrl = CONFIG.IS_LOCALHOST
      ? 'https://secure.shippingapis.com/ShippingAPITest.dll' // USPS Test Environment
      : 'https://secure.shippingapis.com/ShippingAPI.dll'; // Production
  }

  /**
   * Validate USPS tracking number format
   * USPS tracking numbers have various formats:
   * - 20-22 digit format (most common)
   * - Priority Mail: 9400 1000 0000 0000 0000 00
   * - Express Mail: EA 000 000 000 US
   */
  validateTrackingNumber(trackingNumber) {
    if (!trackingNumber || typeof trackingNumber !== 'string') {
      return false;
    }

    const clean = trackingNumber.replace(/\s+/g, '').toUpperCase();
    
    // USPS formats
    const patterns = [
      /^[0-9]{20,22}$/, // Standard 20-22 digit format
      /^9[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2}$/, // Priority Mail
      /^[A-Z]{2}[0-9]{9}US$/, // Express Mail
      /^7[0-9]{19}$/, // Certified Mail
      /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/, // International formats
    ];

    return patterns.some(pattern => pattern.test(clean));
  }

  /**
   * Get USPS tracking URL for customer access
   */
  getTrackingUrl(trackingNumber) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`;
  }

  /**
   * Track package using USPS API
   */
  async trackPackage(trackingNumber) {
    try {
      // Return demo data in demo mode
      if (this.isDemo || !this.apiKey) {
        return this.generateDemoData(trackingNumber);
      }

      // Validate tracking number
      if (!this.validateTrackingNumber(trackingNumber)) {
        throw new Error('Invalid USPS tracking number format');
      }

      // USPS uses XML API format
      const xmlRequest = this.buildTrackingXML(trackingNumber);
      const response = await fetch(`${this.baseUrl}?API=TrackV2&XML=${encodeURIComponent(xmlRequest)}`, {
        method: 'GET',
        headers: {
          ...this.baseHeaders,
          'Content-Type': 'text/xml'
        }
      });

      if (!response.ok) {
        throw new Error(`USPS API Error: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseUSPSXMLResponse(xmlText, trackingNumber);

    } catch (error) {
      return this.handleApiError(error, trackingNumber);
    }
  }

  /**
   * Build USPS XML tracking request
   */
  buildTrackingXML(trackingNumber) {
    return `<?xml version="1.0" encoding="UTF-8" ?>
      <TrackRequest USERID="${this.apiKey}">
        <TrackID ID="${trackingNumber}"></TrackID>
      </TrackRequest>`;
  }

  /**
   * Parse USPS XML response into standardized format
   */
  parseUSPSXMLResponse(xmlText, trackingNumber) {
    try {
      // Simple XML parsing (in production, use a proper XML parser like xml2js)
      const summary = this.extractXMLValue(xmlText, 'TrackSummary');
      const details = this.extractXMLArray(xmlText, 'TrackDetail');
      
      if (!summary && details.length === 0) {
        throw new Error('No tracking information found');
      }

      // Parse events from summary and details
      const events = [];
      
      if (summary) {
        events.push(this.parseUSPSEvent(summary));
      }

      details.forEach(detail => {
        events.push(this.parseUSPSEvent(detail));
      });

      // Get current status from most recent event
      const currentStatus = events[0]?.status || 'UNKNOWN';
      const lastUpdate = events[0]?.timestamp || new Date().toISOString();

      return this.createTrackingResponse({
        status: currentStatus,
        lastUpdate: lastUpdate,
        location: events[0]?.location,
        events: events
      }, trackingNumber);

    } catch (error) {
      throw new Error(`Failed to parse USPS response: ${error.message}`);
    }
  }

  /**
   * Parse individual USPS tracking event
   */
  parseUSPSEvent(eventText) {
    // Extract date, time, and event description
    // USPS format: "Event description, Date Time, LOCATION, ZIP"
    const dateMatch = eventText.match(/(\w+,?\s+\w+\s+\d+,?\s+\d+)/);
    const timeMatch = eventText.match(/(\d{1,2}:\d{2}\s*(am|pm))/i);
    const locationMatch = eventText.match(/,\s*([A-Z\s]+),\s*(\d{5})/);

    const rawDate = dateMatch ? dateMatch[1] : '';
    const rawTime = timeMatch ? timeMatch[1] : '12:00 pm';
    const location = locationMatch ? `${locationMatch[1].trim()}, ${locationMatch[2]}` : 'Unknown Location';

    // Convert to ISO timestamp
    let timestamp = new Date().toISOString();
    try {
      if (rawDate) {
        timestamp = new Date(`${rawDate} ${rawTime}`).toISOString();
      }
    } catch (e) {
      // Keep default timestamp if parsing fails
    }

    return {
      timestamp,
      status: this.normalizeUSPSStatus(eventText),
      location,
      description: eventText.trim()
    };
  }

  /**
   * Normalize USPS-specific statuses to internal format
   */
  normalizeUSPSStatus(uspsEvent) {
    if (!uspsEvent) return 'UNKNOWN';

    const event = uspsEvent.toLowerCase();
    
    const statusMap = {
      'delivered': 'DELIVERED',
      'out for delivery': 'OUT_FOR_DELIVERY',
      'arrival at post office': 'IN_TRANSIT',
      'departure from post office': 'IN_TRANSIT',
      'in transit': 'IN_TRANSIT',
      'processed through facility': 'IN_TRANSIT',
      'arrived at facility': 'IN_TRANSIT',
      'departed facility': 'IN_TRANSIT',
      'acceptance': 'IN_TRANSIT',
      'picked up': 'IN_TRANSIT',
      'attempted delivery': 'DELIVERY_ATTEMPTED',
      'notice left': 'DELIVERY_ATTEMPTED',
      'available for pickup': 'AWAITING_PICKUP',
      'exception': 'EXCEPTION',
      'return to sender': 'RETURNED',
      'forwarded': 'IN_TRANSIT'
    };

    // Find matching status
    for (const [key, value] of Object.entries(statusMap)) {
      if (event.includes(key)) {
        return value;
      }
    }

    return this.normalizeStatus(event);
  }

  /**
   * Extract value from XML text (simple implementation)
   */
  extractXMLValue(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'g');
    const match = regex.exec(xml);
    return match ? match[1] : null;
  }

  /**
   * Extract array of values from XML text
   */
  extractXMLArray(xml, tag) {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'g');
    const matches = [];
    let match;
    
    while ((match = regex.exec(xml)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  /**
   * Verify address with USPS (additional service)
   */
  async verifyAddress(address) {
    if (this.isDemo) {
      return {
        valid: true,
        standardized: address,
        carrier: 'USPS'
      };
    }

    // USPS Address Validation API would go here
    return null;
  }
}