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

interface ShoppingState {
  showResults: boolean
  resultsKey: number
  lastGeneratedData: {
    image: string | null
    weight: number | null
    weightUnit: string
    height: number | null
    heightUnit: string
    heightInches: number | null
    itemId: string | null
  } | null
}

function loadShoppingState(): ShoppingState {
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
  return { showResults: false, resultsKey: 0, lastGeneratedData: null }
}

// Load initial state once (outside component to avoid re-running on each render)
const initialShoppingState = loadShoppingState()

function ShoppingPage({ userData, onUpdate }: ShoppingPageProps) {
  const [showResults, setShowResults] = useState(initialShoppingState.showResults)
  const [resultsKey, setResultsKey] = useState(initialShoppingState.resultsKey)
  const [lastGeneratedData, setLastGeneratedData] = useState<{
    image: string | null
    weight: number | null
    weightUnit: string
    height: number | null
    heightUnit: string
    heightInches: number | null
    itemId: string | null
  } | null>(initialShoppingState.lastGeneratedData)

  // Persist shopping state to sessionStorage
  useEffect(() => {
    try {
      const state: ShoppingState = { showResults, resultsKey, lastGeneratedData }
      sessionStorage.setItem(SHOPPING_STATE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('Failed to save shopping state:', e)
    }
  }, [showResults, resultsKey, lastGeneratedData])

  // Check if we have enough data to try on
  const hasRequiredData = userData.image && userData.item
  const hasScannedItems = (userData.items?.length || 0) > 0

  // Check if data has changed since last generation
  const hasDataChanged = !lastGeneratedData ||
    lastGeneratedData.image !== userData.image ||
    lastGeneratedData.weight !== userData.weight ||
    lastGeneratedData.weightUnit !== userData.weightUnit ||
    lastGeneratedData.height !== userData.height ||
    lastGeneratedData.heightUnit !== userData.heightUnit ||
    lastGeneratedData.heightInches !== userData.heightInches ||
    lastGeneratedData.itemId !== userData.item?.id

  // Can only try it on if we have data AND (haven't generated yet OR data changed)
  const canTryIt = hasRequiredData && hasDataChanged

  // Hide results if required data is removed
  useEffect(() => {
    if (!hasRequiredData && showResults) {
      setShowResults(false)
      setLastGeneratedData(null)
    }
  }, [hasRequiredData, showResults])

  const handleTryIt = () => {
    if (!canTryIt) return

    // Save the current data state
    setLastGeneratedData({
      image: userData.image,
      weight: userData.weight,
      weightUnit: userData.weightUnit,
      height: userData.height,
      heightUnit: userData.heightUnit,
      heightInches: userData.heightInches,
      itemId: userData.item?.id || null
    })

    // Increment key to force ResultsSection to remount and reprocess
    setResultsKey(prev => prev + 1)
    setShowResults(true)
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
          className={`tryit-button ${canTryIt ? 'active' : (showResults && hasRequiredData ? 'generated' : 'disabled')}`}
          style={{ marginTop: hasScannedItems ? BUTTON_SPACING.itemCard : BUTTON_SPACING.scanner }}
          onClick={handleTryIt}
          disabled={!canTryIt}
        >
          Try it on!
        </button>
      </div>

      {/* Results Section - appears below when Try it on is clicked */}
      {USE_DEMO_MODE ? (
        <ResultsSectionDemo
          key={resultsKey}
          userData={userData}
          isVisible={showResults}
        />
      ) : (
        <ResultsSection
          key={resultsKey}
          userData={userData}
          isVisible={showResults}
        />
      )}
    </div>
  )
}

export default ShoppingPage
