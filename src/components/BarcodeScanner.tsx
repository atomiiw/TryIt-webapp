import { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { getBarcodeProcessor } from '../utils/barcodeProcessor'
import type { BarcodeScanResult } from '../utils/barcodeProcessor'
import barcodeBackground from '../assets/Barcode.jpeg'
import dukeLogo from '../assets/Duke Logo.png'
import type { ItemData } from '../App'
import { identifyBrand } from '../utils/brandIdentifier'
import { collectSizeGuide } from '../utils/sizeCollector'
import sampleItemData from '../data/sampleItem.json'
import './BarcodeScanner.css'

// Demo mode flag - set to true for demo, false for production
// When true: Uses sample item data after 3 seconds (no real scanning)
// When false: Uses real barcode scanning with barcodeProcessor
const DEMO_MODE = false

interface BarcodeScannerProps {
  item: ItemData | null
  onItemScanned: (item: ItemData | null) => void
}

/**
 * Format availableSizes array into display string
 * e.g., ["Small", "Medium", "Large", "XL", "2XL"] => "S - 2XL"
 */
function formatSizeRange(sizes: string[]): string {
  if (!sizes || sizes.length === 0) return 'One Size'
  if (sizes.length === 1) return sizes[0]

  // Map full names to abbreviations for display
  const abbrev: Record<string, string> = {
    'small': 'S',
    'medium': 'M',
    'large': 'L',
    'xl': 'XL',
    '2xl': '2XL',
    '3xl': '3XL',
    'youth small': 'YS',
    'youth medium': 'YM',
    'youth large': 'YL',
    'youth x-large': 'YXL'
  }

  const firstSize = sizes[0]
  const lastSize = sizes[sizes.length - 1]

  const firstAbbrev = abbrev[firstSize.toLowerCase()] || firstSize
  const lastAbbrev = abbrev[lastSize.toLowerCase()] || lastSize

  return `${firstAbbrev} - ${lastAbbrev}`
}

function BarcodeScanner({ item, onItemScanned }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedSku, setDetectedSku] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'scanning' | 'detected' | 'not_found' | 'error' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Demo mode refs (using BrowserMultiFormatReader directly)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Production mode flag to prevent duplicate scans
  const hasScannedRef = useRef<boolean>(false)

  /**
   * Start scanner - uses different approaches for demo vs production
   */
  const startScanner = async () => {
    setError(null)
    setDetectedSku(null)
    setScanStatus('scanning')
    setIsScanning(true)
    hasScannedRef.current = false

    if (DEMO_MODE) {
      // DEMO MODE: Use BrowserMultiFormatReader with 3-second auto-detect
      await startDemoScanner()
    } else {
      // PRODUCTION MODE: Use barcodeProcessor for real scanning
      await startProductionScanner()
    }
  }

  /**
   * Demo mode scanner - shows camera but auto-detects after 3 seconds
   */
  const startDemoScanner = async () => {
    try {
      // Initialize ZXing reader
      codeReaderRef.current = new BrowserMultiFormatReader()

      // Wait for video element to be in DOM
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!videoRef.current) {
        throw new Error('Video element not found')
      }

      // Try rear camera first, fallback to any camera
      const constraints = { video: { facingMode: { ideal: 'environment' } } }

      try {
        await codeReaderRef.current.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result) => {
            // In demo mode, we ignore real scans and wait for timeout
            if (result) {
              console.log('📷 [Demo] Real barcode detected but ignoring:', result.getText())
            }
          }
        )
      } catch (cameraErr) {
        // Fallback to any available camera
        console.log('Rear camera failed, trying any camera...')
        await codeReaderRef.current.decodeFromConstraints(
          { video: true },
          videoRef.current,
          () => {} // Ignore results in demo mode
        )
      }

      // Store stream for cleanup
      streamRef.current = videoRef.current.srcObject as MediaStream

      // Auto-detect after 3 seconds (simulates finding the lemur shirt)
      timeoutRef.current = setTimeout(() => {
        console.log('🎭 Demo: Simulating barcode detection after 3 seconds')
        handleDetectedBarcode('29042', true) // isDemo = true
      }, 3000)

    } catch (err) {
      console.error('Camera error:', err)
      setError('Camera access denied')
      setIsScanning(false)
    }
  }

  /**
   * Production mode scanner - uses barcodeProcessor for real barcode detection
   */
  const startProductionScanner = async () => {
    try {
      // Wait for video element to be in DOM
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!videoRef.current) {
        throw new Error('Video element not found')
      }

      const processor = getBarcodeProcessor()

      console.log('📷 Starting production barcode scanner...')
      const startTime = Date.now()

      await processor.startScanning(videoRef.current, {
        preferRearCamera: true,
        onScan: (result: BarcodeScanResult) => {
          // Prevent duplicate scans
          if (hasScannedRef.current) {
            console.log('📷 Ignoring duplicate scan:', result.rawValue)
            return
          }
          hasScannedRef.current = true

          const scanTime = Date.now() - startTime
          console.log(`📷 Barcode scanned in ${scanTime}ms:`, result)
          console.log(`   Raw value: ${result.rawValue}`)
          console.log(`   SKU: ${result.sku ?? 'NOT FOUND'}`)
          console.log(`   Format: ${result.format}`)

          // Check if SKU was found in lookup table
          if (result.sku === null) {
            // UPC not found in lookup table
            setDetectedSku(result.rawValue)
            setScanStatus('not_found')
            setError(`UPC not found: ${result.rawValue}`)
            stopScanner()
            return
          }

          // Update detected SKU state
          setDetectedSku(result.sku)
          setScanStatus('detected')

          // Process the detected barcode
          handleDetectedBarcode(result.sku, false) // Real scan, isDemo = false
        },
        onError: (err: Error) => {
          console.error('Scanner error:', err)
          // Don't show NotFoundException errors (normal when no barcode visible)
          if (err.name !== 'NotFoundException') {
            setError('Scanner error')
          }
        }
      })

      // Store stream for cleanup (get it from video element)
      streamRef.current = videoRef.current.srcObject as MediaStream

    } catch (err) {
      console.error('Camera error:', err)
      setError('Camera access denied')
      setIsScanning(false)
    }
  }

  /**
   * Stop scanner - handles both demo and production modes
   */
  const stopScanner = () => {
    // Clear the demo timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Stop barcodeProcessor if in production mode
    if (!DEMO_MODE) {
      const processor = getBarcodeProcessor()
      if (processor.isActive()) {
        processor.stopScanning()
      }
    }

    // Stop all camera tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    // Clear reader reference (demo mode)
    codeReaderRef.current = null

    setIsScanning(false)
  }

  /**
   * Analyze item: identify brand and collect size guide
   */
  const analyzeItem = async (rawItem: ItemData): Promise<ItemData> => {
    console.log('🔍 Analyzing item:', rawItem.name)

    // Step 1: Identify brand
    let brand: string
    try {
      brand = identifyBrand(rawItem)
      console.log('🏷️ Identified brand:', brand)
    } catch (brandErr) {
      console.error('❌ Brand identification failed:', brandErr)
      brand = 'Duke' // fallback
    }

    // Step 2: Collect size guide (rule-based keyword matching)
    const itemWithBrand = { ...rawItem, brand }
    const sizeGuide = collectSizeGuide(itemWithBrand)

    console.log('========== SIZE GUIDE LOOKUP ==========')
    console.log('Brand identified:', brand)
    console.log('Size guide found:', sizeGuide ? 'YES' : 'NO')
    if (sizeGuide) {
      console.log('  - Clothing type:', sizeGuide.clothing_type)
      console.log('  - Gender:', sizeGuide.gender)
      console.log('  - Sizes available:', sizeGuide.cm.map(s => s.label).join(', '))
    }
    console.log('========================================')

    // Return item with brand and size guide
    return {
      ...rawItem,
      brand,
      sizeGuide: sizeGuide || undefined
    }
  }

  /**
   * Fetch item data - uses sample data in demo mode, backend API in production
   */
  const fetchItemData = async (sku: string, isDemo: boolean): Promise<ItemData> => {
    if (isDemo) {
      // Demo mode: use sample item data from JSON file
      console.log('🎭 Demo mode: using sample item data')
      return sampleItemData as ItemData
    }

    // Production mode: fetch from backend (proxies to Duke API)
    console.log('📡 Fetching item for SKU:', sku)
    const response = await fetch(`https://closai-backend.vercel.app/api/duke/item?sku=${sku}`)

    if (response.ok) {
      const data = await response.json()
      return data.item as ItemData
    }

    throw new Error(`Item not found: ${sku}`)
  }

  const handleDetectedBarcode = async (barcode: string, isDemo: boolean = false) => {
    console.log('🚀 handleDetectedBarcode called, barcode:', barcode, 'isDemo:', isDemo)
    stopScanner()
    setIsAnalyzing(true)
    setError(null)
    setDetectedSku(barcode)
    setScanStatus('detected')

    try {
      // Step 1: Get raw item data (from sample file or API)
      console.log('📡 Step 1: Fetching item data...')
      const rawItem = await fetchItemData(barcode, isDemo)
      console.log('📦 Got item data:', rawItem.name)

      // Step 2: Analyze item (identify brand + collect size guide)
      console.log('🔬 Step 2: Analyzing item...')
      const analyzedItem = await analyzeItem(rawItem)
      console.log('✅ Analysis complete:', {
        name: analyzedItem.name,
        brand: analyzedItem.brand,
        hasSizeGuide: !!analyzedItem.sizeGuide
      })

      // Done - show the item (keep detectedSku for display)
      setIsAnalyzing(false)
      setScanStatus('detected')
      // Keep detectedSku so it displays permanently
      console.log('📤 Calling onItemScanned with analyzed item')
      onItemScanned(analyzedItem)

    } catch (err) {
      console.error('❌ Failed to process item:', err)
      if (err instanceof Error) {
        console.error('Error message:', err.message)
        console.error('Error stack:', err.stack)
      }
      // Check if it's a "not found" error
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('not found') || errorMessage.includes('Item not found')) {
        setScanStatus('not_found')
        setError(`Item not found for SKU: ${barcode}`)
      } else {
        setScanStatus('error')
        setError(`Failed to process item: ${errorMessage}`)
      }
      setIsAnalyzing(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear demo timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // Stop barcodeProcessor if in production mode
      if (!DEMO_MODE) {
        const processor = getBarcodeProcessor()
        if (processor.isActive()) {
          processor.stopScanning()
        }
      }
      // Stop camera tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const handleRemoveItem = () => {
    onItemScanned(null)
  }

  // Debug: log item prop on every render
  console.log('🎨 BarcodeScanner render, item:', item ? item.name : 'null', 'isAnalyzing:', isAnalyzing, 'isScanning:', isScanning)

  // Item card view
  if (item) {
    return (
      <div className="barcode-scanner">
        {/* Permanently display detected SKU */}
        {detectedSku && (
          <div className="scan-status detected">
            SKU: {detectedSku}
          </div>
        )}
        <div className="product-card">
          <div className="product-header">
            <span className="product-badge">ITEM ADDED</span>
            <button className="remove-btn" onClick={handleRemoveItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="product-info">
            <div className="product-thumbnail">
              <img src={item.imageUrl} alt={item.name} />
            </div>
            <div className="product-details">
              <div className="product-name">{item.name}</div>
              <div className="product-sizes">Sizes: {formatSizeRange(item.availableSizes)}</div>
            </div>
            <img src={dukeLogo} alt="Duke" className="product-logo" />
          </div>
        </div>
      </div>
    )
  }

  // Analyzing state - show loading with detected SKU
  if (isAnalyzing) {
    return (
      <div className="barcode-scanner">
        <div className="scanner-window analyzing">
          <div className="analyzing-spinner" />
          <div className="analyzing-text">
            {detectedSku ? (
              <>Detected SKU: <strong>{detectedSku}</strong><br />Fetching item...</>
            ) : (
              'Analyzing item...'
            )}
          </div>
        </div>
      </div>
    )
  }

  // Get status message for display
  const getStatusMessage = () => {
    if (scanStatus === 'scanning') {
      return 'Scanning for barcode...'
    }
    if (scanStatus === 'detected' && detectedSku) {
      return `Detected: ${detectedSku}`
    }
    if (scanStatus === 'not_found' && detectedSku) {
      return `Not found: ${detectedSku}`
    }
    if (scanStatus === 'error') {
      return 'Scan error'
    }
    return null
  }

  const statusMessage = getStatusMessage()

  // Scanner view
  return (
    <div className="barcode-scanner">
      {/* Status display - shows under "What's the item?" */}
      {statusMessage && !isScanning && (
        <div className={`scan-status ${scanStatus}`}>
          {statusMessage}
        </div>
      )}

      {isScanning ? (
        <div className="scanner-window camera-active" onClick={stopScanner}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="scanner-video"
          />
          <div className="scanner-line" />
          <div className="scanner-hint">
            {scanStatus === 'scanning' ? 'Looking for barcode...' : 'Tap to cancel'}
          </div>
        </div>
      ) : (
        <div className="scanner-window inactive" onClick={startScanner}>
          <div
            className="scanner-background"
            style={{ backgroundImage: `url(${barcodeBackground})` }}
          />
          <div className="scanner-placeholder">
            {error ? (
              <span className="scanner-error">{error}</span>
            ) : (
              <span>Tap to scan</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BarcodeScanner
