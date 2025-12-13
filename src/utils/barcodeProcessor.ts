/**
 * Barcode Processing Utility
 * Handles camera-based barcode scanning and SKU extraction
 * Uses @zxing/browser for barcode detection
 */

import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { Result, BarcodeFormat } from '@zxing/library'
import { lookupSKUByUPC } from './upcLookup'

// Scan result
export interface BarcodeScanResult {
  rawValue: string           // Raw barcode value
  sku: string                // Extracted/processed SKU
  format: string             // Barcode format (EAN_13, UPC_A, etc.)
  timestamp: number          // When the scan occurred
}

// Scanner options
export interface ScannerOptions {
  preferRearCamera?: boolean  // Try rear camera first (default: true)
  scanInterval?: number       // Time between scan attempts in ms (default: 100)
  onScan?: (result: BarcodeScanResult) => void  // Callback for each scan
  onError?: (error: Error) => void              // Error callback
}

/**
 * Barcode Processor Class
 * Manages camera access and continuous barcode scanning
 */
export class BarcodeProcessor {
  private reader: BrowserMultiFormatReader | null = null
  private controls: IScannerControls | null = null
  private stream: MediaStream | null = null
  private isRunning: boolean = false
  private lastScannedValue: string | null = null
  private lastScanTime: number = 0
  private scanCooldown: number = 2000 // Prevent duplicate scans for 2 seconds

  constructor() {
    this.reader = new BrowserMultiFormatReader()
  }

  /**
   * Start scanning from camera
   * @param videoElement - HTML video element to display camera feed
   * @param options - Scanner options
   * @returns Promise that resolves when scanner starts
   */
  async startScanning(
    videoElement: HTMLVideoElement,
    options: ScannerOptions = {}
  ): Promise<void> {
    const {
      preferRearCamera = true,
      onScan,
      onError
    } = options

    if (this.isRunning) {
      console.log('⚠️ Scanner already running')
      return
    }

    try {
      // Get camera constraints
      const constraints = this.getCameraConstraints(preferRearCamera)

      console.log('📷 Starting barcode scanner...')
      const startTime = Date.now()

      // Start continuous scanning
      this.controls = await this.reader!.decodeFromConstraints(
        constraints,
        videoElement,
        (result: Result | undefined, error: Error | undefined) => {
          if (result) {
            this.handleScanResult(result, onScan)
          }
          // Ignore errors during scanning (they happen when no barcode is visible)
          if (error && onError && error.name !== 'NotFoundException') {
            onError(error)
          }
        }
      )

      // Store stream for cleanup
      this.stream = videoElement.srcObject as MediaStream
      this.isRunning = true

      const initTime = Date.now() - startTime
      console.log(`✅ Barcode scanner started in ${initTime}ms`)

    } catch (err) {
      console.error('❌ Failed to start scanner:', err)

      // Try fallback to any camera
      if (preferRearCamera) {
        console.log('🔄 Retrying with any available camera...')
        try {
          this.controls = await this.reader!.decodeFromConstraints(
            { video: true },
            videoElement,
            (result: Result | undefined, error: Error | undefined) => {
              if (result) {
                this.handleScanResult(result, onScan)
              }
              if (error && onError && error.name !== 'NotFoundException') {
                onError(error)
              }
            }
          )
          this.stream = videoElement.srcObject as MediaStream
          this.isRunning = true
          console.log('✅ Scanner started with fallback camera')
        } catch (fallbackErr) {
          throw fallbackErr
        }
      } else {
        throw err
      }
    }
  }

  /**
   * Stop scanning and release camera
   */
  stopScanning(): void {
    console.log('🛑 Stopping barcode scanner...')

    // Stop scanner controls
    if (this.controls) {
      this.controls.stop()
      this.controls = null
    }

    // Stop all camera tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop()
        console.log(`📷 Stopped track: ${track.kind}`)
      })
      this.stream = null
    }

    this.isRunning = false
    this.lastScannedValue = null
    this.lastScanTime = 0

    console.log('✅ Scanner stopped')
  }

  /**
   * Check if scanner is currently running
   */
  isActive(): boolean {
    return this.isRunning
  }

  /**
   * Scan a single image for barcodes
   * @param imageSource - Image URL, File, or HTMLImageElement
   * @returns Scan result or null if no barcode found
   */
  async scanImage(imageSource: string | File | HTMLImageElement): Promise<BarcodeScanResult | null> {
    try {
      let result: Result

      if (typeof imageSource === 'string') {
        // URL or data URL
        result = await this.reader!.decodeFromImageUrl(imageSource)
      } else if (imageSource instanceof File) {
        // File object
        const url = URL.createObjectURL(imageSource)
        try {
          result = await this.reader!.decodeFromImageUrl(url)
        } finally {
          URL.revokeObjectURL(url)
        }
      } else {
        // HTMLImageElement
        result = await this.reader!.decodeFromImageElement(imageSource)
      }

      return await this.processResult(result)

    } catch (err) {
      console.log('No barcode found in image')
      return null
    }
  }

  /**
   * Get available cameras
   * @returns List of available video input devices
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'videoinput')
    } catch (err) {
      console.error('Failed to enumerate cameras:', err)
      return []
    }
  }

  /**
   * Handle scan result from continuous scanning
   */
  private async handleScanResult(
    result: Result,
    onScan?: (result: BarcodeScanResult) => void
  ): Promise<void> {
    const rawValue = result.getText()
    const now = Date.now()

    // Prevent duplicate scans
    if (rawValue === this.lastScannedValue && (now - this.lastScanTime) < this.scanCooldown) {
      return
    }

    this.lastScannedValue = rawValue
    this.lastScanTime = now

    const scanResult = await this.processResult(result)
    console.log(`📊 Barcode scanned: ${scanResult.sku} (${scanResult.format})`)

    if (onScan) {
      onScan(scanResult)
    }
  }

  /**
   * Process raw scan result into BarcodeScanResult
   */
  private async processResult(result: Result): Promise<BarcodeScanResult> {
    const rawValue = result.getText()
    const format = BarcodeFormat[result.getBarcodeFormat()]

    return {
      rawValue,
      sku: await this.extractSKU(rawValue, format),
      format,
      timestamp: Date.now()
    }
  }

  /**
   * Calculate EAN-13 check digit
   */
  private calculateEAN13CheckDigit(digits: string): string {
    let sum = 0
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(digits[i], 10)
      sum += i % 2 === 0 ? digit : digit * 3
    }
    const checkDigit = (10 - (sum % 10)) % 10
    return checkDigit.toString()
  }

  /**
   * Convert scanned middle section to full UPC (EAN-13 format)
   * Adds "01" prefix and calculates check digit
   * e.g., "9823790129" → "0198237901297"
   */
  private convertToFullUPC(middleSection: string): string {
    // Clean to digits only
    const cleaned = middleSection.replace(/\D/g, '')

    // Add "01" prefix
    const withPrefix = '01' + cleaned

    // Pad or trim to 12 digits (before check digit)
    let base12: string
    if (withPrefix.length < 12) {
      base12 = withPrefix.padEnd(12, '0')
    } else if (withPrefix.length > 12) {
      base12 = withPrefix.substring(0, 12)
    } else {
      base12 = withPrefix
    }

    // Calculate and append check digit
    const checkDigit = this.calculateEAN13CheckDigit(base12)
    return base12 + checkDigit
  }

  /**
   * Extract SKU from raw barcode value by looking up UPC in Duke API
   * Assumes scanned value is the middle section of a UPC barcode
   */
  private async extractSKU(rawValue: string, _format: string): Promise<string> {
    // Clean the raw value
    const cleaned = rawValue.trim()

    // Convert scanned middle section to full UPC
    const fullUPC = this.convertToFullUPC(cleaned)
    console.log(`🔄 Converted scanned "${cleaned}" to UPC: ${fullUPC}`)

    // Look up SKU from Duke API
    const lookupResult = await lookupSKUByUPC(fullUPC)

    if (lookupResult.success && lookupResult.sku) {
      console.log(`✅ Fetched SKU: ${lookupResult.sku}`)
      return lookupResult.sku
    }

    // Fallback: try with raw value as UPC directly
    console.log(`⚠️ UPC lookup failed, trying raw value as UPC...`)
    const fallbackResult = await lookupSKUByUPC(cleaned)

    if (fallbackResult.success && fallbackResult.sku) {
      console.log(`✅ Fetched SKU (fallback): ${fallbackResult.sku}`)
      return fallbackResult.sku
    }

    // Final fallback: return cleaned raw value
    console.log(`❌ Could not fetch SKU, returning raw value`)
    return cleaned.replace(/[^a-zA-Z0-9-]/g, '')
  }

  /**
   * Get camera constraints for scanning
   */
  private getCameraConstraints(preferRear: boolean): MediaStreamConstraints {
    if (preferRear) {
      return {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
    }
    return {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopScanning()
    this.reader = null
  }
}

// Singleton instance for convenience
let processorInstance: BarcodeProcessor | null = null

/**
 * Get shared BarcodeProcessor instance
 */
export function getBarcodeProcessor(): BarcodeProcessor {
  if (!processorInstance) {
    processorInstance = new BarcodeProcessor()
  }
  return processorInstance
}

/**
 * Quick scan function - starts scanning and returns first result
 * @param videoElement - Video element for camera display
 * @param timeout - Maximum time to wait for scan (default: 30 seconds)
 * @returns Promise resolving to scan result or null on timeout
 */
export async function quickScan(
  videoElement: HTMLVideoElement,
  timeout: number = 30000
): Promise<BarcodeScanResult | null> {
  const processor = getBarcodeProcessor()

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout>

    const cleanup = () => {
      clearTimeout(timeoutId)
      processor.stopScanning()
    }

    // Set timeout
    timeoutId = setTimeout(() => {
      console.log('⏰ Scan timeout reached')
      cleanup()
      resolve(null)
    }, timeout)

    // Start scanning
    processor.startScanning(videoElement, {
      preferRearCamera: true,
      onScan: (result) => {
        console.log('🎯 Quick scan result:', result)
        cleanup()
        resolve(result)
      },
      onError: (error) => {
        console.error('❌ Scan error:', error)
        cleanup()
        resolve(null)
      }
    }).catch((err) => {
      console.error('❌ Failed to start scanning:', err)
      cleanup()
      resolve(null)
    })
  })
}

/**
 * Scan image file for barcode
 * @param file - Image file to scan
 * @returns Promise resolving to scan result or null
 */
export async function scanImageFile(file: File): Promise<BarcodeScanResult | null> {
  const processor = getBarcodeProcessor()
  return processor.scanImage(file)
}

export default BarcodeProcessor
