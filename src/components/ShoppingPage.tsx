import { useState, useEffect, useRef } from 'react'
import { track } from '@vercel/analytics'
import type { UserData } from '../App'
import PhotoUpload from './PhotoUpload'
import MeasurementPickers from './MeasurementPickers'
import BarcodeScanner from './BarcodeScanner'
import ResultsSection, { clearGenerationTracking } from './ResultsSection'
import ResultsSectionDemo from './ResultsSectionDemo'
import { analyzePersonPhoto } from '../utils/personAnalyzer'
import './ShoppingPage.css'

/**
 * Compress image for API calls (reduce size to avoid 413 errors)
 */
async function compressImageForAnalysis(imageBase64: string, maxWidth = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      // Scale down if too large
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height)
        // Use JPEG with 0.7 quality for smaller size
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      } else {
        resolve(imageBase64)
      }
    }
    img.onerror = () => resolve(imageBase64)
    img.src = imageBase64
  })
}

interface ShoppingPageProps {
  userData: UserData
  onUpdate: (updates: Partial<UserData>) => void
}

// Spacing config - adjust these values to match visual spacing
const BUTTON_SPACING = {
  scanner: 12,   // marginTop when BarcodeScanner is shown
  itemCard: 26,   // marginTop when ItemCard is shown
}

// Toggle this to switch between Normal and Demo results
const USE_DEMO_MODE = false


// Generated images by fit type
type FitType = 'tight' | 'regular' | 'comfortable'
type GeneratedImages = Partial<Record<FitType, string>>

// Cached analysis results
interface CachedAnalysis {
  sizeRec: {
    tight: string | null
    regular: string | null
    comfortable: string | null
  }
  measurements: Array<{ name: string; value: number }>
}

// Per-item state for "try it on" results
interface ItemTryOnState {
  showResults: boolean
  resultsKey: number
  generatedImages: GeneratedImages
  cachedAnalysis: CachedAnalysis | null
  shouldAutoScroll: boolean  // Only true when "Try it on" is clicked, not when switching cards
  generatedData: {
    image: string | null
    weight: number | null
    weightUnit: string
    height: number | null
    heightUnit: string
    heightInches: number | null
  } | null
}

// State is now keyed by item ID
type TryOnStateByItem = Record<string, ItemTryOnState>

// Start fresh on every page load — no persisted try-on state
const initialShoppingState: TryOnStateByItem = {}

function ShoppingPage({ userData, onUpdate }: ShoppingPageProps) {
  // Per-item try-on state
  const [tryOnState, setTryOnState] = useState<TryOnStateByItem>(initialShoppingState)




  // Track which image we've already analyzed
  const analyzedImageRef = useRef<string | null>(null)

  // Run person analysis in background when image changes
  useEffect(() => {
    // Skip if no image or if we've already analyzed this image
    if (!userData.image || userData.image === analyzedImageRef.current) {
      return
    }

    // Skip if we already have analysis for this image
    if (userData.personAnalysis && analyzedImageRef.current === userData.image) {
      return
    }

    // Mark this image as being analyzed
    const imageToAnalyze = userData.image
    analyzedImageRef.current = imageToAnalyze

    // Clear old analysis when image changes
    if (userData.personAnalysis) {
      onUpdate({ personAnalysis: null })
    }

    // Compress image first to avoid 413 errors
    compressImageForAnalysis(imageToAnalyze)
      .then(compressedImage => analyzePersonPhoto(compressedImage, 'unknown'))
      .then(analysis => {
        if (analyzedImageRef.current === imageToAnalyze) {
          onUpdate({ personAnalysis: analysis })
        }
      })
      .catch(_error => {
      })
  }, [userData.image])

  // Get current item's state (or default)
  const currentItemId = userData.item?.id || ''

  // Debounced item ID for ResultsSection - prevents flashing through intermediate cards
  const [debouncedItemId, setDebouncedItemId] = useState(currentItemId)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    if (currentItemId !== debouncedItemId) {
      setIsTransitioning(true)
      const timer = setTimeout(() => {
        setDebouncedItemId(currentItemId)
        // Small delay before removing transition class for fade-in
        setTimeout(() => setIsTransitioning(false), 50)
      }, 150) // Debounce delay
      return () => clearTimeout(timer)
    }
  }, [currentItemId, debouncedItemId])

  const displayItemId = debouncedItemId || currentItemId
  const currentItemState = tryOnState[displayItemId] || {
    showResults: false,
    resultsKey: 0,
    generatedImages: {},
    cachedAnalysis: null,
    shouldAutoScroll: false,
    generatedData: null
  }


  // Check if we have enough data to try on
  const hasRequiredData = userData.image && userData.item
  const hasScannedItems = (userData.items?.length || 0) > 0

  // Check if data has changed since last generation for THIS item
  const lastGenerated = currentItemState.generatedData
  const hasDataChanged = !lastGenerated ||
    lastGenerated.image !== userData.image ||
    lastGenerated.weight !== userData.weight ||
    lastGenerated.weightUnit !== userData.weightUnit ||
    lastGenerated.height !== userData.height ||
    lastGenerated.heightUnit !== userData.heightUnit ||
    lastGenerated.heightInches !== userData.heightInches

  // Can only try it on if we have data AND (haven't generated yet OR data changed)
  const canTryIt = hasRequiredData && hasDataChanged

  // Hide results for current item if required data is removed (but keep cached images)
  useEffect(() => {
    if (!hasRequiredData && currentItemState.showResults && currentItemId) {
      setTryOnState(prev => ({
        ...prev,
        [currentItemId]: {
          ...prev[currentItemId],
          showResults: false,
          shouldAutoScroll: false
        }
      }))
    }
  }, [hasRequiredData, currentItemState.showResults, currentItemId])

  const handleTryIt = () => {
    if (!canTryIt || !currentItemId) return

    track('tryon_click', {
      itemName: userData.item?.name || 'unknown',
      brand: userData.item?.brand || 'unknown'
    })

    // Log size guide status for current item
    const item = userData.item
    if (item) {
      const brand = item.brand || 'unknown'
      const guide = item.sizeGuide
      console.log(`Size guide for "${item.name}" (brand: ${brand}): ${guide ? `found — ${guide.clothing_type}, ${guide.gender}` : 'NOT FOUND'}`)
    }

    // Clear generation tracking so new generations can start
    if (userData.item?.imageUrl) clearGenerationTracking(userData.item.imageUrl)

    // Keep old images visible while new ones generate
    setTryOnState(prev => ({
      ...prev,
      [currentItemId]: {
        showResults: true,
        resultsKey: (prev[currentItemId]?.resultsKey || 0) + 1,
        generatedImages: {},
        cachedAnalysis: null,
        shouldAutoScroll: true,
        generatedData: {
          image: userData.image,
          weight: userData.weight,
          weightUnit: userData.weightUnit,
          height: userData.height,
          heightUnit: userData.heightUnit,
          heightInches: userData.heightInches
        }
      }
    }))
  }

  // Handlers accept itemId so they always save to the correct item
  const handleImageGenerated = (fit: FitType, imageDataUrl: string) => {
    if (!currentItemId) return
    setTryOnState(prev => ({
      ...prev,
      [currentItemId]: {
        ...prev[currentItemId],
        generatedImages: {
          ...prev[currentItemId]?.generatedImages,
          [fit]: imageDataUrl
        }
      }
    }))
  }

  const handleAnalysisComplete = (analysis: CachedAnalysis) => {
    if (!currentItemId) return
    setTryOnState(prev => ({
      ...prev,
      [currentItemId]: {
        ...prev[currentItemId],
        cachedAnalysis: analysis
      }
    }))
  }

  const handleScrollComplete = () => {
    if (!currentItemId) return
    setTryOnState(prev => ({
      ...prev,
      [currentItemId]: {
        ...prev[currentItemId],
        shouldAutoScroll: false
      }
    }))
  }

  return (
    <div className="tryit-container">
      {/* Section 1: Photo Upload */}
      <section className="section">
        <h2 className="section-title">Who's wearing it?</h2>
        <PhotoUpload
          image={userData.image}
          onImageChange={(image) => onUpdate({ image })}
        />
      </section>

      {/* Section 2: Weight & Height */}
      <section className="section">
        <MeasurementPickers
          weight={userData.weight}
          weightUnit={userData.weightUnit}
          height={userData.height}
          heightUnit={userData.heightUnit}
          heightInches={userData.heightInches}
          onUpdate={onUpdate}
        />
      </section>

      {/* Section 3: Barcode Scanner / Item Card - uses gap for spacing to button */}
      <div className="scanner-button-group">
        <section className="section-scanner">
          <h2 className="section-title">What's the item?</h2>
          <BarcodeScanner
            item={userData.item}
            items={userData.items || []}
            onItemScanned={(item) => onUpdate({ item })}
            onItemsChange={(items) => onUpdate({ items })}
          />
        </section>

        <button
          className={`tryit-button ${canTryIt ? 'active' : (currentItemState.showResults && hasRequiredData ? 'generated' : 'disabled')}`}
          style={{ marginTop: hasScannedItems ? BUTTON_SPACING.itemCard : BUTTON_SPACING.scanner }}
          onClick={handleTryIt}
          disabled={!canTryIt}
        >
          Try it on!
        </button>
      </div>

      {/* Results Sections — one per item, kept alive, only the active one is visible */}
      {Object.entries(tryOnState).map(([itemId, itemState]) => {
        if (!itemState.showResults) return null
        const isActive = itemId === displayItemId
        const item = userData.items?.find(i => i.id === itemId)
        if (!item) return null

        return (
          <div
            key={itemId}
            className={`results-transition-wrapper ${isTransitioning && isActive ? 'transitioning' : ''}`}
            style={{ display: isActive ? 'block' : 'none' }}
          >
            {USE_DEMO_MODE ? (
              <ResultsSectionDemo
                userData={{ ...userData, item }}
                isVisible={isActive}
              />
            ) : (
              <ResultsSection
                userData={{ ...userData, item }}
                isVisible={isActive}
                initialImages={itemState.generatedImages}
                cachedAnalysis={itemState.cachedAnalysis}
                shouldAutoScroll={isActive && itemState.shouldAutoScroll}
                resultsKey={itemState.resultsKey}
                onImageGenerated={handleImageGenerated}
                onAnalysisComplete={handleAnalysisComplete}
                onScrollComplete={handleScrollComplete}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ShoppingPage
