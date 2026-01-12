import { useState, useEffect, useRef } from 'react'
import { getBarcodeProcessor } from '../utils/barcodeProcessor'
import type { BarcodeScanResult } from '../utils/barcodeProcessor'
import barcodeBackground from '../assets/Barcode.jpeg'
import type { ItemData } from '../App'
import { identifyBrand } from '../utils/brandIdentifier'
import { collectSizeGuide } from '../utils/sizeCollector'
import sampleItemData from '../data/sampleItem.json'
import StackedCards from './StackedCards'
import type { ClothingItem } from './StackedCards'
import './BarcodeScanner.css'

// Demo mode detection via URL parameter
// Add ?demo=true to URL to enable demo mode (auto-detects after 3 seconds)
// Production mode (default): Uses real barcode scanning with barcodeProcessor
const getDemoMode = (): boolean => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('demo') === 'true'
}
const DEMO_MODE = getDemoMode()

interface BarcodeScannerProps {
  item: ItemData | null
  items: ItemData[]
  onItemScanned: (item: ItemData | null) => void
  onItemsChange: (items: ItemData[]) => void
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

function BarcodeScanner({ item, items, onItemScanned, onItemsChange }: BarcodeScannerProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [navigationTrigger, setNavigationTrigger] = useState(0);
  const [isScanning, setIsScanning] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedSku, setDetectedSku] = useState<string | null>(null)
  const [_matchedUpc, setMatchedUpc] = useState<string | null>(null)
  const [_detectedInternalId, setDetectedInternalId] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<'scanning' | 'detected' | 'not_found' | 'error' | null>(null)
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
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
    setMatchedUpc(null)
    setScanStatus('scanning')
    setCapturedFrame(null)
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
   * Demo mode scanner - shows camera briefly then auto-skips to item card
   */
  const startDemoScanner = async () => {
    try {
      // Wait for video element to be in DOM
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!videoRef.current) {
        throw new Error('Video element not found')
      }

      // Get camera stream directly for demo mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      })

      videoRef.current.srcObject = stream
      streamRef.current = stream

      // Auto-skip to item card after 3 seconds
      timeoutRef.current = setTimeout(() => {
        console.log('🎭 Demo: Auto-skipping to item card')
        handleDetectedBarcode('29042', null, true) // isDemo = true
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
          console.log(`   Matched UPC: ${result.matchedUpc ?? 'N/A'}`)
          console.log(`   Format: ${result.format}`)

          // Check if SKU was found in lookup table
          if (result.sku === null) {
            // UPC not found in lookup table
            setDetectedSku(result.rawValue)
            setMatchedUpc(null)
            setScanStatus('not_found')
            setError(`UPC not found: ${result.rawValue}`)
            stopScanner()
            return
          }

          // Update detected SKU, UPC, and internalId state
          setDetectedSku(result.sku)
          setMatchedUpc(result.matchedUpc)
          setDetectedInternalId(result.internalId)
          setScanStatus('detected')

          // Process the detected barcode with internalId for direct Duke API lookup
          handleDetectedBarcode(result.sku, result.internalId, false) // Real scan, isDemo = false
        },
        onError: (err: Error) => {
          // Don't log or show NotFoundException errors (normal when no barcode visible)
          if (!err.name.startsWith('NotFoundException')) {
            console.error('Scanner error:', err)
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
   * Capture current video frame as data URL
   */
  const captureVideoFrame = (): string | null => {
    // Try to get Quagga's video element first, then fall back to our ref
    const container = videoRef.current?.parentElement
    const video = container?.querySelector('video') || videoRef.current

    if (!video) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  }

  /**
   * Stop scanner - handles both demo and production modes
   */
  const stopScanner = () => {
    // Capture frame before stopping
    const frame = captureVideoFrame()
    if (frame) {
      setCapturedFrame(frame)
    }
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

    // Clean up Quagga elements from container
    if (videoRef.current?.parentElement) {
      const container = videoRef.current.parentElement
      // Remove Quagga's video and canvas elements
      const quaggaVideo = container.querySelector('video:not([data-original])')
      const quaggaCanvas = container.querySelector('canvas')
      if (quaggaVideo && quaggaVideo !== videoRef.current) {
        quaggaVideo.remove()
      }
      if (quaggaCanvas) {
        quaggaCanvas.remove()
      }
    }

    // Show and clear original video element
    if (videoRef.current) {
      videoRef.current.style.display = ''
      videoRef.current.srcObject = null
    }

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
  const fetchItemData = async (sku: string, internalId: string | null, isDemo: boolean): Promise<ItemData> => {
    if (isDemo) {
      // Demo mode: use sample item data from JSON file
      console.log('🎭 Demo mode: using sample item data')
      return sampleItemData as ItemData
    }

    // Production mode: fetch from backend using internalId for direct Duke API lookup
    console.log('📡 Fetching item with internalId:', internalId)
    const response = await fetch(`https://closai-backend.vercel.app/api/duke/item?id=${internalId}`)

    if (response.ok) {
      const data = await response.json()
      return data.item as ItemData
    }

    throw new Error(`Item not found: ${sku}`)
  }

  const handleDetectedBarcode = async (barcode: string, internalId: string | null, isDemo: boolean = false) => {
    console.log('🚀 handleDetectedBarcode called, barcode:', barcode, 'isDemo:', isDemo)
    stopScanner()
    setIsAnalyzing(true)
    setError(null)
    setDetectedSku(barcode)
    setScanStatus('detected')

    try {
      // Step 1: Get raw item data (from sample file or API)
      console.log('📡 Step 1: Fetching item data...')
      const rawItem = await fetchItemData(barcode, internalId, isDemo)
      console.log('📦 Got item data:', rawItem.name)

      // Step 2: Analyze item (identify brand + collect size guide)
      console.log('🔬 Step 2: Analyzing item...')
      const analyzedItem = await analyzeItem(rawItem)
      console.log('✅ Analysis complete:', {
        name: analyzedItem.name,
        brand: analyzedItem.brand,
        hasSizeGuide: !!analyzedItem.sizeGuide
      })

      // Done - check for duplicates or add to items array
      setIsAnalyzing(false)
      setScanStatus('detected')

      // Check if item already exists (by matching base ID)
      const existingIndex = items.findIndex(existingItem =>
        existingItem.id.startsWith(analyzedItem.id)
      )

      if (existingIndex !== -1) {
        // Item already exists - jump to it instead of adding duplicate
        console.log('📍 Item already exists, jumping to card', existingIndex + 1)
        onItemScanned(items[existingIndex])
        setCurrentCardIndex(existingIndex)
        setNavigationTrigger(prev => prev + 1) // Force navigation even if index same
      } else {
        // New item - add to array
        console.log('📤 Adding item to items array')

        // Add unique id with timestamp
        const itemWithUniqueId = {
          ...analyzedItem,
          id: `${analyzedItem.id}-${Date.now()}`
        }

        // Add to items array
        const newItems = [...items, itemWithUniqueId]
        onItemsChange(newItems)

        // Set as current active item and focus on the new card
        onItemScanned(itemWithUniqueId)
        setCurrentCardIndex(newItems.length - 1)
      }

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

  const handleRemoveItem = (_itemToRemove: ClothingItem, index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    onItemsChange(newItems)

    // Update current active item
    if (newItems.length === 0) {
      onItemScanned(null)
      setCurrentCardIndex(0)
    } else {
      // Set the new active item (previous one or first)
      const newIndex = Math.min(index, newItems.length - 1)
      setCurrentCardIndex(newIndex)
      onItemScanned(newItems[newIndex])
    }
  }

  const handleItemSelect = (_selectedItem: ClothingItem, index: number) => {
    // Find the corresponding ItemData and set as active
    const itemData = items[index]
    if (itemData) {
      onItemScanned(itemData)
      setCurrentCardIndex(index)
    }
  }

  // Convert ItemData to ClothingItem for StackedCards
  const clothingItems: ClothingItem[] = items.map(item => ({
    id: item.id,
    name: item.name,
    brand: item.brand || 'Duke',
    imageUrl: item.imageUrl,
    price: `$${item.price.toFixed(2)}`,
    size: formatSizeRange(item.availableSizes)
  }))

  // Debug: log item prop on every render
  console.log('🎨 BarcodeScanner render, item:', item ? item.name : 'null', 'isAnalyzing:', isAnalyzing, 'isScanning:', isScanning)

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

  // Combined view: scanner always on top, item card below when present
  return (
    <div className="barcode-scanner">
      {/* Status display - shows under "What's the item?" */}
      {statusMessage && !isScanning && !item && (
        <div className={`scan-status ${scanStatus}`}>
          {statusMessage}
        </div>
      )}

      {/* Scanner - always visible */}
      {isAnalyzing ? (
        <div className="scanner-window analyzing">
          {capturedFrame && (
            <div
              className="analyzing-blur-background"
              style={{ backgroundImage: `url(${capturedFrame})` }}
            />
          )}
          <div className="analyzing-content">
            <div className="spinner" />
            <p>Fetching item...</p>
          </div>
        </div>
      ) : isScanning ? (
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
              <span>{items.length > 0 ? 'Tap to add another' : 'Tap to scan'}</span>
            )}
          </div>
        </div>
      )}

      {/* Stacked cards - shown below scanner when items exist */}
      {items.length > 0 && (
        <StackedCards
          items={clothingItems}
          onItemSelect={handleItemSelect}
          onRemoveItem={handleRemoveItem}
          initialIndex={currentCardIndex}
          navigationTrigger={navigationTrigger}
        />
      )}
    </div>
  )
}

export default BarcodeScanner
