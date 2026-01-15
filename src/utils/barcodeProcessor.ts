/**
 * Barcode Processing Utility
 * Handles camera-based barcode scanning and SKU extraction
 * Uses @zxing/browser for barcode detection
 */

import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { Result, BarcodeFormat, DecodeHintType } from '@zxing/library'
import Tesseract from 'tesseract.js'
import { lookupSKUByUPC } from './upcLookup'

// Scan result
export interface BarcodeScanResult {
  rawValue: string           // Raw barcode value
  sku: string | null         // Extracted SKU (null if not found in lookup table)
  internalId: string | null  // Duke API internal ID for direct lookup
  matchedUpc: string | null  // The UPC variation that matched
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
  private onScanCallback?: (result: BarcodeScanResult) => void
  private lastErrorLogTime: number = 0 // For throttling debug logs

  // OCR fallback scanning
  private videoElement: HTMLVideoElement | null = null
  private ocrCanvas: HTMLCanvasElement | null = null
  private ocrCtx: CanvasRenderingContext2D | null = null
  private ocrInterval: ReturnType<typeof setInterval> | null = null
  private ocrWorker: Tesseract.Worker | null = null
  private isOcrScanning: boolean = false

  constructor() {
    // Configure hints for better barcode detection
    const hints = new Map()

    // Enable common 1D barcode formats - Code 128 first for priority
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
    ])

    // Try harder to find barcodes
    hints.set(DecodeHintType.TRY_HARDER, true)

    this.reader = new BrowserMultiFormatReader(hints)

    // Create canvas for OCR
    this.ocrCanvas = document.createElement('canvas')
    this.ocrCtx = this.ocrCanvas.getContext('2d')

    console.log('📊 Barcode scanner initialized with formats: CODE_128, CODE_39, UPC_A, UPC_E, EAN_13, EAN_8')
    console.log('📊 OCR fallback enabled for reading printed numbers')
  }

  /**
   * Initialize Tesseract OCR worker
   */
  private async initOcrWorker(): Promise<void> {
    if (this.ocrWorker) return

    console.log('🔤 Initializing OCR worker...')
    this.ocrWorker = await Tesseract.createWorker('eng')
    // Optimize for digits only
    await this.ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789',
    })
    console.log('✅ OCR worker ready')
  }

  /**
   * Start OCR fallback scanning
   */
  private startOcrScanning(): void {
    if (this.ocrInterval || !this.videoElement) return

    // Run OCR every 500ms
    this.ocrInterval = setInterval(async () => {
      if (!this.isRunning || !this.videoElement || this.isOcrScanning) return

      this.isOcrScanning = true
      try {
        await this.performOcrScan()
      } catch (err) {
        // OCR failed, continue
      }
      this.isOcrScanning = false
    }, 500)
  }

  /**
   * Perform OCR scan on current video frame
   */
  private async performOcrScan(): Promise<void> {
    if (!this.videoElement || !this.ocrCanvas || !this.ocrCtx || !this.ocrWorker) return

    const video = this.videoElement
    if (video.videoWidth === 0 || video.videoHeight === 0) return

    // Capture frame
    this.ocrCanvas.width = video.videoWidth
    this.ocrCanvas.height = video.videoHeight
    this.ocrCtx.drawImage(video, 0, 0)

    // Run OCR
    const result = await this.ocrWorker.recognize(this.ocrCanvas)
    const text = result.data.text

    // Extract potential UPC codes (exactly 12 digits for UPC-A)
    const matches = text.match(/\b\d{12}\b/g)
    if (matches) {
      for (const match of matches) {
        console.log(`🔤 OCR detected number: ${match}`)

        // Check if it looks like a valid UPC and exists in our lookup
        const lookupResult = this.lookupUPC(match)
        if (lookupResult.sku) {
          console.log(`✅ OCR found valid UPC: ${match} -> SKU: ${lookupResult.sku}`)

          // Create scan result
          const scanResult: BarcodeScanResult = {
            rawValue: match,
            sku: lookupResult.sku,
            internalId: lookupResult.internalId,
            matchedUpc: lookupResult.matchedUpc,
            format: 'OCR',
            timestamp: Date.now()
          }

          // Prevent duplicates
          const now = Date.now()
          if (match !== this.lastScannedValue || (now - this.lastScanTime) >= this.scanCooldown) {
            this.lastScannedValue = match
            this.lastScanTime = now

            if (this.onScanCallback) {
              this.onScanCallback(scanResult)
            }
          }
          return
        }
      }
    }
  }

  /**
   * Stop OCR scanning
   */
  private stopOcrScanning(): void {
    if (this.ocrInterval) {
      clearInterval(this.ocrInterval)
      this.ocrInterval = null
    }
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

    this.onScanCallback = onScan
    this.videoElement = videoElement

    // Initialize OCR worker in background
    this.initOcrWorker().catch(err => console.error('OCR init failed:', err))

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
            console.log(`✅ Detected barcode type: ${BarcodeFormat[result.getBarcodeFormat()]}`)
            this.handleScanResult(result)
          }
          // Log all errors for debugging (NotFoundException is normal when no barcode visible)
          if (error) {
            // Only log occasionally to avoid spam (every 2 seconds)
            const now = Date.now()
            if (!this.lastErrorLogTime || now - this.lastErrorLogTime > 2000) {
              this.lastErrorLogTime = now
              if (error.name.startsWith('NotFoundException')) {
                console.log('🔍 Scanning... (no barcode detected in current frame)')
              } else {
                console.log(`⚠️ Scanner error: ${error.name}: ${error.message}`)
                if (onError) onError(error)
              }
            }
          }
        }
      )

      // Store stream for cleanup
      this.stream = videoElement.srcObject as MediaStream
      this.isRunning = true

      // Start OCR fallback scanning
      this.startOcrScanning()

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
                console.log(`✅ Detected barcode type: ${BarcodeFormat[result.getBarcodeFormat()]}`)
                this.handleScanResult(result)
              }
              if (error) {
                const now = Date.now()
                if (!this.lastErrorLogTime || now - this.lastErrorLogTime > 2000) {
                  this.lastErrorLogTime = now
                  if (error.name.startsWith('NotFoundException')) {
                    console.log('🔍 Scanning... (no barcode detected in current frame)')
                  } else {
                    console.log(`⚠️ Scanner error: ${error.name}: ${error.message}`)
                    if (onError) onError(error)
                  }
                }
              }
            }
          )
          this.stream = videoElement.srcObject as MediaStream
          this.isRunning = true
          this.startOcrScanning()
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

    // Stop OCR scanning
    this.stopOcrScanning()

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
    this.onScanCallback = undefined
    this.videoElement = null

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

      return this.processResult(result)

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
  private handleScanResult(result: Result): void {
    const rawValue = result.getText()
    const now = Date.now()

    // Only accept 12-digit UPC-A or 13-digit EAN codes
    // Silently ignore 8-digit UPC-E, EAN-8, or other formats
    const cleaned = rawValue.trim().replace(/\D/g, '')
    if (cleaned.length !== 12 && cleaned.length !== 13) {
      console.log(`🔕 Ignoring non-UPC barcode: ${cleaned} (${cleaned.length} digits)`)
      return
    }

    // Prevent duplicate scans
    if (rawValue === this.lastScannedValue && (now - this.lastScanTime) < this.scanCooldown) {
      return
    }

    this.lastScannedValue = rawValue
    this.lastScanTime = now

    const scanResult = this.processResult(result)
    console.log(`📊 Barcode scanned: ${scanResult.sku ?? 'NOT FOUND'} (${scanResult.format})`)

    if (this.onScanCallback) {
      this.onScanCallback(scanResult)
    }
  }

  /**
   * Process raw scan result into BarcodeScanResult
   */
  private processResult(result: Result): BarcodeScanResult {
    const rawValue = result.getText()
    const format = BarcodeFormat[result.getBarcodeFormat()]
    const lookupResult = this.lookupUPC(rawValue)

    return {
      rawValue,
      sku: lookupResult.sku,
      internalId: lookupResult.internalId,
      matchedUpc: lookupResult.matchedUpc,
      format,
      timestamp: Date.now()
    }
  }

  /**
   * Look up SKU from raw barcode value using local UPC lookup table
   * Returns sku and matchedUpc (both null if not found)
   */
  private lookupUPC(rawValue: string): { sku: string | null; internalId: string | null; matchedUpc: string | null } {
    // Clean the raw value - digits only
    const cleaned = rawValue.trim().replace(/\D/g, '')

    // Only process 12-digit UPC-A codes (or 13-digit EAN with leading 0)
    if (cleaned.length !== 12 && cleaned.length !== 13) {
      // Silently skip non-standard lengths
      return { sku: null, internalId: null, matchedUpc: null }
    }

    console.log(`🔍 Scanned barcode: "${cleaned}" (${cleaned.length} digits)`)

    // Use the lookup function which already tries multiple variations
    const lookupResult = lookupSKUByUPC(cleaned)

    if (lookupResult.success && lookupResult.sku) {
      return {
        sku: lookupResult.sku,
        internalId: lookupResult.internalId,
        matchedUpc: lookupResult.matchedUpc || null
      }
    }

    // Not found
    console.log(`❌ UPC not found in lookup table`)
    return { sku: null, internalId: null, matchedUpc: null }
  }

  /**
   * Get camera constraints for scanning
   * Higher resolution helps with Code 128 which has denser bars
   */
  private getCameraConstraints(preferRear: boolean): MediaStreamConstraints {
    if (preferRear) {
      return {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      }
    }
    return {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.stopScanning()
    this.reader = null

    // Terminate OCR worker
    if (this.ocrWorker) {
      await this.ocrWorker.terminate()
      this.ocrWorker = null
    }
    this.ocrCanvas = null
    this.ocrCtx = null
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
