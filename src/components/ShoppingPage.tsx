import { useState, useEffect } from 'react'
import type { UserData } from '../App'
import PhotoUpload from './PhotoUpload'
import MeasurementPickers from './MeasurementPickers'
import BarcodeScanner from './BarcodeScanner'
import ResultsSection from './ResultsSection'
import ResultsSectionDemo from './ResultsSectionDemo'
import './ShoppingPage.css'

interface ShoppingPageProps {
  userData: UserData
  onUpdate: (updates: Partial<UserData>) => void
}

// Spacing config - adjust these values to match visual spacing
const BUTTON_SPACING = {
  scanner: 8,   // marginTop when BarcodeScanner is shown
  itemCard: 20,   // marginTop when ItemCard is shown
}

// Toggle this to switch between Normal and Demo results
const USE_DEMO_MODE = false

// Session storage keys
const SHOPPING_STATE_KEY = 'tryit_shopping_state'

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

function loadShoppingState(): TryOnStateByItem {
  try {
    const stored = sessionStorage.getItem(SHOPPING_STATE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      console.log('📂 Restored shopping state from sessionStorage')
      return parsed
    }
  } catch (e) {
    console.warn('Failed to load shopping state:', e)
  }
  return {}
}

// Load initial state once (outside component to avoid re-running on each render)
const initialShoppingState = loadShoppingState()

function ShoppingPage({ userData, onUpdate }: ShoppingPageProps) {
  // Per-item try-on state
  const [tryOnState, setTryOnState] = useState<TryOnStateByItem>(initialShoppingState)

  // Get current item's state (or default)
  const currentItemId = userData.item?.id || ''
  const currentItemState = tryOnState[currentItemId] || {
    showResults: false,
    resultsKey: 0,
    generatedImages: {},
    cachedAnalysis: null,
    generatedData: null
  }

  // Persist shopping state to sessionStorage (excluding large image data)
  useEffect(() => {
    try {
      // Strip out generatedImages before saving - they're too large for sessionStorage
      const stateToSave: TryOnStateByItem = {}
      for (const [itemId, state] of Object.entries(tryOnState)) {
        stateToSave[itemId] = {
          ...state,
          generatedImages: {} // Don't persist images - they'll regenerate if needed
        }
      }
      sessionStorage.setItem(SHOPPING_STATE_KEY, JSON.stringify(stateToSave))
    } catch (e) {
      console.warn('Failed to save shopping state:', e)
    }
  }, [tryOnState])

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

  // Hide results for current item if required data is removed
  useEffect(() => {
    if (!hasRequiredData && currentItemState.showResults && currentItemId) {
      setTryOnState(prev => ({
        ...prev,
        [currentItemId]: {
          showResults: false,
          resultsKey: prev[currentItemId]?.resultsKey || 0,
          generatedImages: {},
          cachedAnalysis: null,
          generatedData: null
        }
      }))
    }
  }, [hasRequiredData, currentItemState.showResults, currentItemId])

  const handleTryIt = () => {
    if (!canTryIt || !currentItemId) return

    // Update this item's state - clear images and analysis if data changed
    setTryOnState(prev => ({
      ...prev,
      [currentItemId]: {
        showResults: true,
        resultsKey: (prev[currentItemId]?.resultsKey || 0) + 1,
        generatedImages: {}, // Clear images when re-trying with new data
        cachedAnalysis: null, // Clear analysis too
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

  // Handler for when ResultsSection generates an image
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

  // Handler for when ResultsSection completes analysis
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

      {/* Results Section - appears below when Try it on is clicked for current item */}
      {USE_DEMO_MODE ? (
        <ResultsSectionDemo
          key={`${currentItemId}-${currentItemState.resultsKey}`}
          userData={userData}
          isVisible={currentItemState.showResults}
        />
      ) : (
        <ResultsSection
          key={`${currentItemId}-${currentItemState.resultsKey}`}
          userData={userData}
          isVisible={currentItemState.showResults}
          initialImages={currentItemState.generatedImages}
          cachedAnalysis={currentItemState.cachedAnalysis}
          onImageGenerated={handleImageGenerated}
          onAnalysisComplete={handleAnalysisComplete}
        />
      )}
    </div>
  )
}

export default ShoppingPage
