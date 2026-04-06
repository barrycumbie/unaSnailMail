/**
 * Internal Package Service
 * Generates tracking codes and manages internal UNA mail delivery
 * Handles campus mail, inter-department packages, and special deliveries
 */

import crypto from 'crypto';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

class InternalPackageService {
  constructor() {
    this.prefixes = {
      CAMPUS_MAIL: 'UNA-CM',      // Campus mail between buildings
      INTER_DEPT: 'UNA-ID',       // Inter-department packages
      SPECIAL: 'UNA-SP',          // Special handling items
      RUSH: 'UNA-RU',            // Rush/urgent delivery
      FREIGHT: 'UNA-FR',         // Large freight items
      CONFIDENTIAL: 'UNA-CF',    // Confidential documents
      LABORATORY: 'UNA-LB',      // Lab samples/equipment
      MAINTENANCE: 'UNA-MN',     // Maintenance parts/supplies
      STUDENT: 'UNA-ST',         // Student mail/packages
      FACULTY: 'UNA-FC'          // Faculty mail/packages
    };
    
    this.locations = {
      // Main Campus Buildings
      MAIN: { code: 'MN', name: 'Main Building' },
      LIBRARY: { code: 'LB', name: 'Collier Library' },
      SCIENCE: { code: 'SC', name: 'Science Building' },
      BUSINESS: { code: 'BS', name: 'Business Building' },
      EDUCATION: { code: 'ED', name: 'Education Building' },
      NURSING: { code: 'NS', name: 'Nursing Building' },
      STUDENT_CENTER: { code: 'ST', name: 'Student Center' },
      ADMIN: { code: 'AD', name: 'Administrative Building' },
      FACILITIES: { code: 'FC', name: 'Facilities Management' },
      ATHLETICS: { code: 'AT', name: 'Athletics Center' },
      DORMITORIES: { code: 'DR', name: 'Residence Halls' }
    };
    
    this.priorities = {
      STANDARD: { level: 1, name: 'Standard', deliveryTime: '2-3 business days' },
      EXPRESS: { level: 2, name: 'Express', deliveryTime: '1 business day' },
      URGENT: { level: 3, name: 'Urgent', deliveryTime: 'Same day' },
      CRITICAL: { level: 4, name: 'Critical', deliveryTime: 'Immediate' }
    };
  }

  /**
   * Generate internal tracking number
   */
  generateTrackingNumber(options = {}) {
    const {
      type = 'CAMPUS_MAIL',
      fromLocation = 'MAIN',
      toLocation = 'MAIN',
      priority = 'STANDARD',
      department = null,
      isConfidential = false
    } = options;

    // Start with prefix based on type
    let prefix = this.prefixes[type] || this.prefixes.CAMPUS_MAIL;
    
    // Add confidential marker if needed
    if (isConfidential) {
      prefix = this.prefixes.CONFIDENTIAL;
    }

    // Get location codes
    const fromCode = this.locations[fromLocation]?.code || 'XX';
    const toCode = this.locations[toLocation]?.code || 'XX';
    
    // Generate date component (YYYYMMDD)
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Generate random component (4 digits)
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    
    // Generate checksum digit
    const baseNumber = `${fromCode}${toCode}${dateStr}${randomNum}`;
    const checksum = this._calculateChecksum(baseNumber);
    
    // Build final tracking number
    const trackingNumber = `${prefix}-${fromCode}${toCode}-${dateStr}-${randomNum}${checksum}`;
    
    return {
      trackingNumber,
      metadata: {
        type,
        fromLocation: this.locations[fromLocation],
        toLocation: this.locations[toLocation],
        priority: this.priorities[priority],
        department,
        isConfidential,
        generatedAt: new Date(),
        estimatedDelivery: this._calculateDeliveryDate(priority)
      }
    };
  }

  /**
   * Generate multiple tracking numbers for bulk operations
   */
  generateBulkTrackingNumbers(packages = []) {
    return packages.map(pkg => this.generateTrackingNumber(pkg));
  }

  /**
   * Validate internal tracking number format
   */
  validateTrackingNumber(trackingNumber) {
    const pattern = /^UNA-[A-Z]{2}-[A-Z]{4}-\d{8}-\d{5}$/;
    
    if (!pattern.test(trackingNumber)) {
      return {
        valid: false,
        error: 'Invalid UNA internal tracking number format'
      };
    }

    // Extract components for validation
    const parts = trackingNumber.split('-');
    const [prefix, type, locations, date, numberWithChecksum] = parts;
    
    // Validate checksum
    const baseNumber = locations + date + numberWithChecksum.slice(0, -1);
    const providedChecksum = numberWithChecksum.slice(-1);
    const calculatedChecksum = this._calculateChecksum(baseNumber);
    
    if (providedChecksum !== calculatedChecksum) {
      return {
        valid: false,
        error: 'Invalid checksum - tracking number may be corrupted'
      };
    }

    return {
      valid: true,
      components: {
        prefix,
        type,
        fromLocation: locations.slice(0, 2),
        toLocation: locations.slice(2, 4),
        date,
        number: numberWithChecksum.slice(0, -1),
        checksum: providedChecksum
      }
    };
  }

  /**
   * Generate QR code for tracking number
   */
  async generateQRCode(trackingNumber, options = {}) {
    const {
      size = 200,
      format = 'png',
      errorCorrectionLevel = 'M'
    } = options;

    try {
      const trackingUrl = `https://mail.una.edu/track/${trackingNumber}`;
      
      const qrOptions = {
        width: size,
        height: size,
        errorCorrectionLevel,
        type: format,
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      };

      if (format === 'svg') {
        return await QRCode.toString(trackingUrl, { ...qrOptions, type: 'svg' });
      } else {
        return await QRCode.toDataURL(trackingUrl, qrOptions);
      }
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate shipping label PDF
   */
  async generateShippingLabel(packageData, options = {}) {
    const {
      includeQR = true,
      includeBarcode = true,
      template = 'standard'
    } = options;

    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      
      return new Promise(async (resolve, reject) => {
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });

        doc.on('error', reject);

        // Header with UNA branding
        doc.fontSize(20)
           .fillColor('#003366')
           .text('University of North Alabama', 50, 50)
           .fontSize(14)
           .fillColor('#666666')
           .text('Internal Mail Service', 50, 75);

        // Tracking number (large and prominent)
        doc.fontSize(24)
           .fillColor('#000000')
           .text('Tracking Number:', 50, 120);
        
        doc.fontSize(20)
           .font('Courier')
           .text(packageData.trackingNumber, 50, 145);

        // QR Code
        if (includeQR) {
          const qrCode = await this.generateQRCode(packageData.trackingNumber, { size: 150 });
          const qrBuffer = Buffer.from(qrCode.split(',')[1], 'base64');
          doc.image(qrBuffer, 400, 120, { width: 150 });
        }

        // Package details
        const detailsY = 200;
        doc.fontSize(12)
           .fillColor('#000000')
           .text('FROM:', 50, detailsY)
           .text(`${packageData.senderName || 'N/A'}`, 50, detailsY + 15)
           .text(`${packageData.fromLocation?.name || 'Unknown Location'}`, 50, detailsY + 30)
           .text(`Department: ${packageData.department || 'N/A'}`, 50, detailsY + 45);

        doc.text('TO:', 50, detailsY + 80)
           .text(`${packageData.recipientName}`, 50, detailsY + 95)
           .text(`${packageData.toLocation?.name || 'Unknown Location'}`, 50, detailsY + 110)
           .text(`${packageData.deliveryAddress?.building || ''} ${packageData.deliveryAddress?.room || ''}`, 50, detailsY + 125);

        // Package info
        doc.text('PACKAGE INFO:', 300, detailsY)
           .text(`Type: ${packageData.type}`, 300, detailsY + 15)
           .text(`Priority: ${packageData.priority?.name || 'Standard'}`, 300, detailsY + 30)
           .text(`Weight: ${packageData.weight || 'N/A'} lbs`, 300, detailsY + 45)
           .text(`Size: ${packageData.size || 'N/A'}`, 300, detailsY + 60);

        // Delivery info
        doc.text('DELIVERY INFO:', 300, detailsY + 80)
           .text(`Expected: ${packageData.estimatedDelivery || 'TBD'}`, 300, detailsY + 95)
           .text(`Generated: ${new Date().toLocaleDateString()}`, 300, detailsY + 110);

        // Special handling instructions
        if (packageData.isConfidential) {
          doc.fontSize(14)
             .fillColor('#CC0000')
             .text('⚠️ CONFIDENTIAL', 50, detailsY + 160);
        }

        if (packageData.priority?.level > 2) {
          doc.fontSize(14)
             .fillColor('#FF6600')
             .text('🚨 URGENT DELIVERY', 200, detailsY + 160);
        }

        // Footer
        doc.fontSize(10)
           .fillColor('#666666')
           .text('UNA Mail Services - Generated by Internal Package System', 50, 700)
           .text(`Track online: https://mail.una.edu/track/${packageData.trackingNumber}`, 50, 715);

        doc.end();
      });
    } catch (error) {
      throw new Error(`Failed to generate shipping label: ${error.message}`);
    }
  }

  /**
   * Get delivery route for internal packages
   */
  calculateDeliveryRoute(fromLocation, toLocation, options = {}) {
    const { priority = 'STANDARD', includeStops = false } = options;

    const from = this.locations[fromLocation];
    const to = this.locations[toLocation];
    
    if (!from || !to) {
      throw new Error('Invalid location codes');
    }

    // Simple route calculation (can be enhanced with real routing)
    const route = {
      from: from,
      to: to,
      distance: this._calculateDistance(fromLocation, toLocation),
      estimatedTime: this._calculateDeliveryTime(fromLocation, toLocation, priority),
      priority: this.priorities[priority],
      stops: includeStops ? this._calculateIntermediateStops(fromLocation, toLocation) : []
    };

    return route;
  }

  /**
   * Private helper methods
   */
  _calculateChecksum(str) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) {
      sum += str.charCodeAt(i);
    }
    return (sum % 10).toString();
  }

  _calculateDeliveryDate(priority) {
    const now = new Date();
    const businessDays = this.priorities[priority]?.level === 4 ? 0 : 
                        this.priorities[priority]?.level === 3 ? 0 :
                        this.priorities[priority]?.level === 2 ? 1 : 2;
    
    // Add business days (skip weekends)
    let deliveryDate = new Date(now);
    let addedDays = 0;
    
    while (addedDays < businessDays) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);
      const dayOfWeek = deliveryDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        addedDays++;
      }
    }
    
    return deliveryDate;
  }

  _calculateDistance(from, to) {
    // Simple distance calculation - in reality would use campus map
    const distances = {
      'MAIN-LIBRARY': 0.2,
      'MAIN-SCIENCE': 0.3,
      'LIBRARY-SCIENCE': 0.1,
      // Add more realistic distances
    };
    
    const key = `${from}-${to}`;
    return distances[key] || distances[`${to}-${from}`] || 0.5; // Default 0.5 miles
  }

  _calculateDeliveryTime(from, to, priority) {
    const baseTime = this._calculateDistance(from, to) * 10; // 10 minutes per mile
    const priorityMultiplier = this.priorities[priority]?.level === 4 ? 0.25 : 
                              this.priorities[priority]?.level === 3 ? 0.5 :
                              this.priorities[priority]?.level === 2 ? 0.75 : 1;
    
    return Math.round(baseTime * priorityMultiplier);
  }

  _calculateIntermediateStops(from, to) {
    // In a real implementation, this would calculate optimal route stops
    return [
      { location: 'MAIL_CENTER', estimatedTime: 5, purpose: 'Processing' },
      { location: 'TRANSIT_HUB', estimatedTime: 10, purpose: 'Distribution' }
    ];
  }
}

export default new InternalPackageService();