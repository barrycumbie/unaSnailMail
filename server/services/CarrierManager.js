/**
 * Carrier Manager Service
 * Central orchestrator for all carrier tracking services
 * Provides unified interface for carrier operations
 */

import { UPSService } from './UPSService.js';
import { USPSService } from './USPSService.js';
import { FedExService } from './FedExService.js';
import { AmazonService } from './AmazonService.js';
import { CONFIG } from '../config/environment.js';

export class CarrierManager {
  constructor() {
    // Initialize all carrier services
    this.carriers = {
      UPS: new UPSService(),
      USPS: new USPSService(),
      FEDEX: new FedExService(),
      AMAZON: new AmazonService()
    };

    // Carrier priority for auto-detection
    this.carrierPriority = ['UPS', 'FEDEX', 'USPS', 'AMAZON'];
  }

  /**
   * Auto-detect carrier from tracking number
   * @param {string} trackingNumber 
   * @returns {string|null} Carrier name or null if not detected
   */
  detectCarrier(trackingNumber) {
    if (!trackingNumber) return null;

    for (const carrierName of this.carrierPriority) {
      const carrier = this.carriers[carrierName];
      if (carrier && carrier.validateTrackingNumber(trackingNumber)) {
        return carrierName;
      }
    }

    return null;
  }

  /**
   * Track package across all carriers or specific carrier
   * @param {string} trackingNumber 
   * @param {string} carrierHint Optional carrier name
   * @returns {Promise<Object>} Unified tracking response
   */
  async trackPackage(trackingNumber, carrierHint = null) {
    try {
      // Use provided carrier hint first
      if (carrierHint && this.carriers[carrierHint.toUpperCase()]) {
        const carrier = this.carriers[carrierHint.toUpperCase()];
        if (carrier.validateTrackingNumber(trackingNumber)) {
          return await carrier.trackPackage(trackingNumber);
        }
      }

      // Auto-detect carrier
      const detectedCarrier = this.detectCarrier(trackingNumber);
      if (detectedCarrier) {
        const carrier = this.carriers[detectedCarrier];
        return await carrier.trackPackage(trackingNumber);
      }

      // If no carrier detected, try all carriers
      const results = await Promise.allSettled(
        Object.values(this.carriers).map(carrier => 
          carrier.trackPackage(trackingNumber)
        )
      );

      // Return first successful result
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          return result.value;
        }
      }

      // No carrier found tracking information
      return {
        success: false,
        error: 'Tracking number not found with any supported carrier',
        trackingNumber,
        supportedCarriers: Object.keys(this.carriers),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: `Carrier tracking failed: ${error.message}`,
        trackingNumber,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate tracking number format for specific carrier
   * @param {string} trackingNumber 
   * @param {string} carrier 
   * @returns {boolean}
   */
  validateTrackingNumber(trackingNumber, carrier) {
    const service = this.carriers[carrier.toUpperCase()];
    return service ? service.validateTrackingNumber(trackingNumber) : false;
  }

  /**
   * Get tracking URL for specific carrier
   * @param {string} trackingNumber 
   * @param {string} carrier 
   * @returns {string|null}
   */
  getTrackingUrl(trackingNumber, carrier) {
    const service = this.carriers[carrier.toUpperCase()];
    return service ? service.getTrackingUrl(trackingNumber) : null;
  }

  /**
   * Bulk track multiple packages
   * @param {Array<{trackingNumber: string, carrier?: string}>} packages 
   * @returns {Promise<Array<Object>>}
   */
  async bulkTrackPackages(packages) {
    const trackingPromises = packages.map(async (pkg) => {
      try {
        const result = await this.trackPackage(pkg.trackingNumber, pkg.carrier);
        return {
          ...result,
          originalRequest: pkg
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          trackingNumber: pkg.trackingNumber,
          originalRequest: pkg
        };
      }
    });

    return await Promise.all(trackingPromises);
  }

  /**
   * Get status of all carrier services
   * @returns {Object} Service health status
   */
  async getCarrierStatus() {
    const status = {};

    for (const [name, service] of Object.entries(this.carriers)) {
      try {
        // Test with a demo tracking number
        const testResult = await service.trackPackage('TEST123456789');
        status[name] = {
          available: true,
          isDemo: service.isDemo,
          hasApiKey: !!service.apiKey && service.apiKey !== 'demo-key',
          lastTest: new Date().toISOString()
        };
      } catch (error) {
        status[name] = {
          available: false,
          error: error.message,
          isDemo: service.isDemo,
          hasApiKey: !!service.apiKey && service.apiKey !== 'demo-key',
          lastTest: new Date().toISOString()
        };
      }
    }

    return status;
  }

  /**
   * Get supported carriers list
   * @returns {Array<Object>} Carrier information
   */
  getSupportedCarriers() {
    return Object.keys(this.carriers).map(name => {
      const service = this.carriers[name];
      return {
        name,
        displayName: this.getCarrierDisplayName(name),
        isDemo: service.isDemo,
        hasApiKey: !!service.apiKey && !service.apiKey.includes('demo'),
        trackingUrlTemplate: service.getTrackingUrl('{trackingNumber}')
      };
    });
  }

  /**
   * Get display name for carrier
   * @param {string} carrierCode 
   * @returns {string}
   */
  getCarrierDisplayName(carrierCode) {
    const displayNames = {
      UPS: 'UPS',
      USPS: 'United States Postal Service',
      FEDEX: 'FedEx',
      AMAZON: 'Amazon Logistics'
    };

    return displayNames[carrierCode] || carrierCode;
  }

  /**
   * Update carrier tracking information in database
   * @param {string} mailId MongoDB Mail document ID
   * @param {Object} trackingUpdate Update data
   */
  async updateMailTracking(mailId, trackingUpdate) {
    try {
      // Import Mail model dynamically to avoid circular imports
      const { default: Mail } = await import('../models/Mail.js');
      
      const updateData = {
        status: trackingUpdate.status,
        lastStatusUpdate: new Date(),
        carrierTrackingUrl: trackingUpdate.trackingUrl,
        estimatedDelivery: trackingUpdate.estimatedDelivery,
        currentLocation: trackingUpdate.location,
        originalCarrierData: trackingUpdate.originalData
      };

      // Remove undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const updatedMail = await Mail.findByIdAndUpdate(
        mailId,
        updateData,
        { new: true, runValidators: true }
      );

      return updatedMail;
    } catch (error) {
      console.error('Failed to update mail tracking:', error);
      throw error;
    }
  }

  /**
   * Refresh tracking for all active shipments
   * @returns {Promise<Object>} Refresh summary
   */
  async refreshAllTracking() {
    try {
      // Import Mail model dynamically
      const { default: Mail } = await import('../models/Mail.js');
      
      // Find all mail items that need tracking updates
      const activeShipments = await Mail.find({
        status: { $in: ['AWAITING_PICKUP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
        trackingNumber: { $exists: true, $ne: '' }
      }).select('_id trackingNumber carrier status');

      const refreshResults = {
        total: activeShipments.length,
        updated: 0,
        errors: 0,
        results: []
      };

      // Process in batches to avoid overwhelming carriers
      const batchSize = 10;
      for (let i = 0; i < activeShipments.length; i += batchSize) {
        const batch = activeShipments.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (mail) => {
          try {
            const trackingResult = await this.trackPackage(mail.trackingNumber, mail.carrier);
            
            if (trackingResult.success) {
              await this.updateMailTracking(mail._id, trackingResult);
              refreshResults.updated++;
            } else {
              refreshResults.errors++;
            }

            refreshResults.results.push({
              mailId: mail._id,
              trackingNumber: mail.trackingNumber,
              success: trackingResult.success,
              status: trackingResult.status
            });

          } catch (error) {
            refreshResults.errors++;
            refreshResults.results.push({
              mailId: mail._id,
              trackingNumber: mail.trackingNumber,
              success: false,
              error: error.message
            });
          }
        });

        await Promise.all(batchPromises);
        
        // Small delay between batches to be respectful to carrier APIs
        if (i + batchSize < activeShipments.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return refreshResults;
    } catch (error) {
      throw new Error(`Tracking refresh failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new CarrierManager();