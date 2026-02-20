import { useState, useRef, useEffect, useMemo } from 'react'
import type { UserData } from '../App'
import type { SizeRecommendation } from '../utils/sizeIdentifier'
import { calculateDimension } from '../utils/sizeIdentifier'
import type { BodyComposition } from '../utils/personAnalyzer'
import type { SizeGuide } from '../utils/sizeCollector'
// Person analysis is now done in ShoppingPage and passed via userData.personAnalysis
import { identifySize } from '../utils/sizeIdentifier'
import { generateTryOnImage, type FitType as TryOnFitType } from '../utils/tryOnService'
import './ResultsSection.css'

// Cached analysis from parent
interface CachedAnalysis {
  sizeRec: {
    tight: string | null
    regular: string | null
    comfortable: string | null
  }
  measurements: Array<{ name: string; value: number }>
}

interface ResultsSectionProps {
  userData: UserData
  isVisible: boolean
  initialImages?: Partial<Record<FitType, string>>
  cachedAnalysis?: CachedAnalysis | null
  shouldAutoScroll?: boolean  // Only scroll when this is true (first time "Try it on" is clicked)
  onImageGenerated?: (fit: FitType, imageDataUrl: string) => void
  onAnalysisComplete?: (analysis: CachedAnalysis) => void
  onScrollComplete?: () => void  // Called after scrolling to clear the flag
}

type FitType = 'tight' | 'regular' | 'comfortable'

// Calculated measurement with value
interface CalculatedMeasurement {
  name: string
  value: number
}

// Size guide measurement for display under size cards
interface SizeGuideMeasurement {
  key: string
  label: string
  display: string
}

// Labels for body measurements
const MEASUREMENT_LABELS: Record<string, string> = {
  'chest': 'Chest',
  'waist': 'Waist',
  'hips': 'Hips',
  'body_length': 'Body Length',
  'shoulders': 'Shoulders',
  'inseam': 'Inseam',
  'thigh': 'Thigh'
}

// Standard order for measurements display
const MEASUREMENT_ORDER = ['chest', 'waist', 'hips', 'body_length', 'shoulders', 'inseam', 'thigh']

/**
 * Abbreviate size label to single letter format (S, M, L, XL, XXL, XS, etc.)
 */
function abbreviateSize(size: string): string {
  return size.toUpperCase().trim()
}

/**
 * Get measurements for a specific size from the size guide
 */
function getSizeGuideMeasurements(
  sizeLabel: string,
  sizeGuide: SizeGuide | null | undefined,
  useInches: boolean = false
): SizeGuideMeasurement[] {
  if (!sizeGuide) return []

  const sizeData = useInches && sizeGuide.inch?.length > 0 ? sizeGuide.inch : sizeGuide.cm
  if (!sizeData || sizeData.length === 0) return []

  const sizeEntry = sizeData.find(
    s => s.label.toLowerCase() === sizeLabel.toLowerCase()
  )
  if (!sizeEntry) return []

  const measurements: SizeGuideMeasurement[] = []
  const measurementKeys = Object.keys(sizeEntry.measurements)

  const priorityOrder = ['chest', 'waist', 'hips', 'body_length', 'shoulders', 'inseam', 'thigh']

  const sortedKeys = [...measurementKeys].sort((a, b) => {
    const aNorm = a.toLowerCase().replace(/\s+/g, '_')
    const bNorm = b.toLowerCase().replace(/\s+/g, '_')
    const aIndex = priorityOrder.indexOf(aNorm)
    const bIndex = priorityOrder.indexOf(bNorm)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })

  for (const key of sortedKeys) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '_')
    if (normalizedKey.includes('sleeve')) continue

    const label = MEASUREMENT_LABELS[normalizedKey]
    if (!label) continue

    const measurement = sizeEntry.measurements[key]
    if (!measurement) continue

    let display: string
    if (measurement.min !== undefined && measurement.max !== undefined) {
      display = `${measurement.min}-${measurement.max}`
    } else if (measurement.value !== undefined) {
      display = `${measurement.value}`
    } else {
      continue
    }

    measurements.push({ key: normalizedKey, label, display })
  }

  return measurements
}

// calculateDimension is now imported from sizeIdentifier

function calculateMeasurements(
  heightCm: number,
  weightKg: number,
  measurementKeys: string[],
  gender: 'male' | 'female' | 'unknown' = 'unknown',
  bodyComposition: BodyComposition = 'average'
): CalculatedMeasurement[] {
  if (measurementKeys.length === 0) return []

  const sortedKeys = [...measurementKeys].sort((a, b) => {
    const aNorm = a.toLowerCase().replace(/\s+/g, '_')
    const bNorm = b.toLowerCase().replace(/\s+/g, '_')
    const aIndex = MEASUREMENT_ORDER.indexOf(aNorm)
    const bIndex = MEASUREMENT_ORDER.indexOf(bNorm)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })

  const measurements: CalculatedMeasurement[] = []

  for (const key of sortedKeys) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '_')
    const label = MEASUREMENT_LABELS[normalizedKey]
    if (!label) continue

    const value = calculateDimension(heightCm, weightKg, normalizedKey, gender, bodyComposition)
    if (value === null) continue

    measurements.push({
      name: label,
      value: Math.round(value * 10) / 10
    })
  }

  return measurements
}

// Loading messages sequence
const LOADING_MESSAGES = [
  'Analyzing the photo…',
  'Reading measurements…',
  'Selecting best size…',
  'Creating try-on previews…'
]

// Type for generated images state
type GeneratedImages = Record<FitType, string | null>

function ResultsSection({ userData, isVisible, initialImages, cachedAnalysis, shouldAutoScroll, onImageGenerated, onAnalysisComplete, onScrollComplete }: ResultsSectionProps) {
  // If we have cached analysis, skip loading state
  const hasCachedData = !!cachedAnalysis
  const [isLoading, setIsLoading] = useState(!hasCachedData)
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0])
  const [error, setError] = useState<string | null>(null)
  const [sizeRec, setSizeRec] = useState<SizeRecommendation | null>(
    cachedAnalysis ? cachedAnalysis.sizeRec as SizeRecommendation : null
  )
  const [measurements, setMeasurements] = useState<CalculatedMeasurement[]>(
    cachedAnalysis ? cachedAnalysis.measurements : []
  )
  const [selectedFit, setSelectedFit] = useState<FitType>('regular')
  const [hasStarted, setHasStarted] = useState(hasCachedData) // Skip analysis if cached
  const [regeneratingFits, setRegeneratingFits] = useState<Set<FitType>>(new Set())
  const [generatedImages, setGeneratedImages] = useState<GeneratedImages>({
    tight: initialImages?.tight || null,
    regular: initialImages?.regular || null,
    comfortable: initialImages?.comfortable || null
  })
  const [generatingFits, setGeneratingFits] = useState<Set<FitType>>(new Set())
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharingFit, setSharingFit] = useState<FitType | null>(null)
  const [showInfoSheet, setShowInfoSheet] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const startedGeneratingRef = useRef<Set<FitType>>(new Set())

  // Cycle through loading messages
  useEffect(() => {
    if (!isLoading) return

    let messageIndex = 0
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length
      setLoadingMessage(LOADING_MESSAGES[messageIndex])
    }, 1500)

    return () => clearInterval(interval)
  }, [isLoading])

  const fitLabels: Record<FitType, string> = {
    tight: 'Fitted',
    regular: 'Standard',
    comfortable: 'Relaxed'
  }

  // Function to generate try-on image for a specific fit
  // Each fit runs completely independently
  const generateFitImage = async (fit: FitType) => {
    if (!userData.image || !userData.item?.imageUrl) return

    setGeneratingFits(prev => new Set(prev).add(fit))

    try {
      const result = await generateTryOnImage(
        userData.image,
        userData.item.imageUrl,
        {
          name: userData.item.name || 'Clothing item',
          type: userData.item.type || 'tops',
          color: userData.item.color || ''
        },
        fit as TryOnFitType
      )

      if (result.success && result.imageDataUrl) {
        setGeneratedImages(prev => ({ ...prev, [fit]: result.imageDataUrl }))
        // Notify parent of generated image
        onImageGenerated?.(fit, result.imageDataUrl)
      } else {
      }
    } catch (err) {
    } finally {
      setGeneratingFits(prev => {
        const next = new Set(prev)
        next.delete(fit)
        return next
      })
    }
  }

  // Run analysis when section becomes visible
  useEffect(() => {
    if (!isVisible || hasStarted) return
    setHasStarted(true)

    async function runAnalysis() {
      try {
        if (!userData.image) {
          setError('No photo uploaded')
          setIsLoading(false)
          return
        }

        // Get height in cm
        let heightCm = userData.height || 170
        if (userData.heightUnit === 'ft' && userData.height) {
          const feet = userData.height
          const inches = userData.heightInches || 0
          heightCm = (feet * 12 + inches) * 2.54
        }

        // Get weight in kg
        let weightKg = userData.weight || 70
        if (userData.weightUnit === 'lb' && userData.weight) {
          weightKg = userData.weight * 0.453592
        }

        // Use cached person analysis or wait for it
        let analysis = userData.personAnalysis
        if (!analysis) {
          // If analysis isn't ready yet, wait a bit and use default
          analysis = {
            gender: 'unknown' as const,
            age_range: 'adult' as const,
            body_composition: 'average' as const,
            confidence: 'low' as const,
            proportions: {}
          }
        } else {
        }

        // Get measurement keys from size guide
        const sizeGuide = userData.item?.sizeGuide
        const measurementKeys = sizeGuide?.cm?.[0]?.measurements
          ? Object.keys(sizeGuide.cm[0].measurements)
          : []

        // Calculate body measurements
        const calculatedMeasurements = calculateMeasurements(
          heightCm,
          weightKg,
          measurementKeys,
          analysis.gender,
          analysis.body_composition
        )
        setMeasurements(calculatedMeasurements)

        // Get size recommendation
        const recommendation = identifySize(
          {
            height: heightCm,
            weight: weightKg,
            gender: analysis.gender === 'unknown' ? 'unknown' : analysis.gender,
            bodyComposition: analysis.body_composition
          },
          userData.item?.sizeGuide || null,
          (userData.item?.gender as 'men' | 'women' | 'unisex') || 'unisex',
          userData.item?.availableSizes || []
        )

        setSizeRec(recommendation)

        // Cache analysis results in parent
        onAnalysisComplete?.({
          sizeRec: {
            tight: recommendation.tight,
            regular: recommendation.regular,
            comfortable: recommendation.comfortable
          },
          measurements: calculatedMeasurements
        })

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed')
      } finally {
        setIsLoading(false)
      }
    }

    runAnalysis()
  }, [isVisible, hasStarted, userData, onAnalysisComplete])

  // Scroll into view only when shouldAutoScroll is true (first time "Try it on" clicked)
  useEffect(() => {
    if (isVisible && shouldAutoScroll && sectionRef.current) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        onScrollComplete?.()  // Clear the flag after scrolling
      }, 100)
    }
  }, [isVisible, shouldAutoScroll, onScrollComplete])

  // Generate try-on images for all three fits regardless of size availability
  // Each fit is completely independent - uses ref to prevent duplicate triggers
  // Skip generation for fits that already have images from initialImages
  useEffect(() => {
    if (!userData.image || !userData.item?.imageUrl) return

    // Check each fit independently using ref to track what's already started
    const fits: FitType[] = ['tight', 'regular', 'comfortable']

    fits.forEach(fit => {
      // Generate for all fits, not just those with size recommendations
      const hasExistingImage = !!generatedImages[fit]
      if (!startedGeneratingRef.current.has(fit) && !hasExistingImage) {
        startedGeneratingRef.current.add(fit)
        generateFitImage(fit)
      }
    })
  }, [userData.image, userData.item?.imageUrl, generatedImages])

  // All three fit types are always available for image generation
  const availableFits = useMemo<FitType[]>(() => {
    return ['tight', 'regular', 'comfortable'] as FitType[]
  }, [])

  const GAP = 16
  const isScrollingProgrammatically = useRef(false)

  // Sync carousel scroll position to selectedFit on initial load
  useEffect(() => {
    if (!scrollContainerRef.current || availableFits.length <= 1) return
    const index = availableFits.indexOf(selectedFit)
    if (index < 0) return

    const cardWidth = scrollContainerRef.current.offsetWidth
    const targetScrollLeft = index * (cardWidth + GAP)

    // Only sync if scroll position doesn't match (avoids interfering with user scroll)
    const currentScrollLeft = scrollContainerRef.current.scrollLeft
    const tolerance = 10 // Allow small tolerance for rounding
    if (Math.abs(currentScrollLeft - targetScrollLeft) > tolerance) {
      isScrollingProgrammatically.current = true
      scrollContainerRef.current.scrollTo({
        left: targetScrollLeft,
        behavior: 'instant'
      })
      // Reset flag after scroll completes
      requestAnimationFrame(() => {
        isScrollingProgrammatically.current = false
      })
    }
  }, [selectedFit, availableFits])

  // Handle scroll to update selected fit (manual scroll only)
  const handleScroll = () => {
    if (!scrollContainerRef.current || availableFits.length <= 1) return
    if (isScrollingProgrammatically.current) return

    const container = scrollContainerRef.current
    const cardWidth = container.offsetWidth
    const scrollPosition = container.scrollLeft
    const index = Math.round(scrollPosition / (cardWidth + GAP))
    const newFit = availableFits[Math.max(0, Math.min(index, availableFits.length - 1))]

    if (newFit && newFit !== selectedFit) {
      setSelectedFit(newFit)
    }
  }

  // Scroll to fit when user clicks dot or size card
  const scrollToFit = (fit: FitType) => {
    if (!scrollContainerRef.current || availableFits.length <= 1) return
    const index = availableFits.indexOf(fit)
    if (index >= 0) {
      isScrollingProgrammatically.current = true
      const cardWidth = scrollContainerRef.current.offsetWidth
      scrollContainerRef.current.scrollTo({
        left: index * (cardWidth + GAP),
        behavior: 'smooth'
      })
      // Reset after animation completes
      setTimeout(() => {
        isScrollingProgrammatically.current = false
      }, 350)
    }
  }

  const handleCardClick = (fit: FitType) => {
    setSelectedFit(fit)
    scrollToFit(fit)
  }

  const handleRegenerate = async () => {
    const currentFit = selectedFit
    if (!userData.image || !userData.item?.imageUrl) return

    setRegeneratingFits(prev => new Set(prev).add(currentFit))

    try {
      const result = await generateTryOnImage(
        userData.image,
        userData.item.imageUrl,
        {
          name: userData.item.name || 'Clothing item',
          type: userData.item.type || 'tops',
          color: userData.item.color || ''
        },
        currentFit as TryOnFitType
      )

      if (result.success && result.imageDataUrl) {
        setGeneratedImages(prev => ({ ...prev, [currentFit]: result.imageDataUrl }))
        // Notify parent of regenerated image
        onImageGenerated?.(currentFit, result.imageDataUrl)
      } else {
      }
    } catch (err) {
    } finally {
      setRegeneratingFits(prev => {
        const next = new Set(prev)
        next.delete(currentFit)
        return next
      })
    }
  }

  // Convert data URL to blob
  const dataUrlToBlob = (dataUrl: string): Blob => {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  }

  // Share image with native share API
  const handleShareImage = async (fit: FitType) => {
    const imageSrc = generatedImages[fit]
    if (!imageSrc) return

    setSharingFit(fit)
    try {
      // Image already has watermark from tryOnService, just convert to blob
      const imageBlob = dataUrlToBlob(imageSrc)
      const file = new File([imageBlob], `tryit-${fit}-fit.png`, { type: 'image/png' })

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'TryIt - Virtual Try-On',
          text: `Check out my ${fitLabels[fit]} look!`
        })
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(imageBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tryit-${fit}-fit.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      // User cancelled share or error occurred
    } finally {
      setSharingFit(null)
    }
  }

  // Get fits that have generated images (for share modal)
  const sharableFits = availableFits.filter(fit => generatedImages[fit])

  // Get size guide measurements for each fit type
  const useInches = userData.heightUnit === 'ft'
  const sizeGuide = userData.item?.sizeGuide

  const getSizeMeasurements = (fit: FitType) => {
    const size = sizeRec?.[fit]
    if (!size) return []
    return getSizeGuideMeasurements(size, sizeGuide, useInches)
  }

  if (!isVisible) return null

  if (isLoading) {
    return (
      <div ref={sectionRef} className="results-demo results-section">
        <div className="image-carousel-container">
          <div className="image-carousel-wrapper">
            <div className="image-frame loading-frame">
              {userData.image && (
                <div
                  className="loading-blur-background"
                  style={{ backgroundImage: `url(${userData.image})` }}
                />
              )}
              <div className="loading">
                <div className="spinner"></div>
                <p>{loadingMessage}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div ref={sectionRef} className="results-demo results-section">
        <div className="error">
          <p>Error: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={sectionRef} className="results-demo results-section">

      {/* Image carousel container */}
      <div className="image-carousel-container">
        <div className="image-carousel-wrapper">
          <div
            ref={scrollContainerRef}
            className={`image-carousel ${availableFits.length <= 1 ? 'no-scroll' : ''}`}
            onScroll={handleScroll}
          >
            {availableFits.map((fit) => {
              const isGenerating = generatingFits.has(fit) || regeneratingFits.has(fit)
              const hasImage = !!generatedImages[fit]

              return (
                <div key={fit} className="carousel-slide">
                  {isGenerating || !hasImage ? (
                    <div className="image-frame loading-frame">
                      {generatedImages[fit] ? (
                        <div
                          className="loading-blur-background"
                          style={{ backgroundImage: `url(${generatedImages[fit]})` }}
                        />
                      ) : userData.image ? (
                        <div
                          className="loading-blur-background"
                          style={{ backgroundImage: `url(${userData.image})` }}
                        />
                      ) : null}
                      <div className="loading">
                        <div className="spinner"></div>
                        <p>{regeneratingFits.has(fit) ? 'Regenerating the fit...' : 'Generating try-on...'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="image-frame">
                      <div
                        className="blur-background"
                        style={{ backgroundImage: `url(${generatedImages[fit]})` }}
                      />
                      <img
                        src={generatedImages[fit]!}
                        alt={`${fitLabels[fit]} preview`}
                        className="fit-image"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* Regenerate button - fixed position over carousel */}
          {generatedImages[selectedFit] && !regeneratingFits.has(selectedFit) && !generatingFits.has(selectedFit) && (
            <button
              className="regenerate-button"
              onClick={handleRegenerate}
            >
              <svg className="regenerate-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.51 15C4.15839 16.8404 5.38734 18.4202 7.01166 19.5014C8.63598 20.5826 10.5677 21.1066 12.5157 20.9945C14.4637 20.8824 16.3226 20.1402 17.8121 18.8798C19.3017 17.6193 20.3413 15.909 20.7742 14.0064C21.2072 12.1037 21.0101 10.1139 20.2126 8.33122C19.4152 6.54852 18.0605 5.06909 16.3528 4.11573C14.6451 3.16237 12.6769 2.78706 10.7447 3.04599C8.81245 3.30493 7.02091 4.18374 5.64 5.56L1 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              regenerate
            </button>
          )}
        </div>

        {/* Dot indicators - only show if multiple fits available */}
        {availableFits.length > 1 && (
          <div className="carousel-dots">
            {availableFits.map((fit) => (
              <button
                key={fit}
                className={`dot ${selectedFit === fit ? 'active' : ''}`}
                onClick={() => handleCardClick(fit)}
                aria-label={fitLabels[fit]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Size cards picker - all three fits always available */}
      <div className="size-picker-container">
        <div className="size-picker">
          {(['tight', 'regular', 'comfortable'] as FitType[]).map((fit) => {
            const isSelected = selectedFit === fit

            return (
              <button
                key={fit}
                className={`size-picker-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleCardClick(fit)}
              >
                <span className="size-picker-label">{fitLabels[fit]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Suggested size section */}
      <div className="suggested-size-section">
        <h3 className="results-section-title">Suggested size to bring to the fitting room</h3>
        <p className="suggested-size-subtitle">Or use as a reference when shopping for someone else.</p>
        <div className="suggested-size-row">
          {sizeRec?.[selectedFit] ? (
            <span className="suggested-size-value">{abbreviateSize(sizeRec[selectedFit]!)}</span>
          ) : (
            <span className="suggested-size-value out-of-range">Out of range</span>
          )}
          <button className="info-icon-button" onClick={() => setShowInfoSheet(true)} aria-label="Size info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 9V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Info Bottom Sheet */}
      {showInfoSheet && (
        <div className="info-sheet-overlay" onClick={() => setShowInfoSheet(false)}>
          <div className="info-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="info-sheet-handle" />
            <div className="info-sheet-content">
              <h3 className="info-sheet-title">How size is estimated</h3>
              <p className="info-sheet-text">
                This estimate is based on height, weight, and this item's size guide.
              </p>
              {(() => {
                const sizeMeasurements = getSizeMeasurements(selectedFit)
                const selectedSize = sizeRec?.[selectedFit] || ''
                const displaySelectedSize = selectedSize ? abbreviateSize(selectedSize) : ''
                const unit = userData.heightUnit === 'ft' ? 'in' : 'cm'

                if (measurements.length === 0) return null

                return (
                  <div className="info-sheet-comparison">
                    <div className="info-sheet-comparison-header">
                      <span>Measurement</span>
                      <span>Estimated body</span>
                      <span>Size {displaySelectedSize}</span>
                    </div>
                    {measurements.map((m) => {
                      const userValue = userData.heightUnit === 'ft'
                        ? Math.round(m.value / 2.54 * 10) / 10
                        : m.value
                      const normalizedName = m.name.toLowerCase().replace(/\s+/g, '_')
                      const sizeM = sizeMeasurements.find(sm => sm.key === normalizedName)
                      const sizeValue = sizeM?.display || '—'

                      return (
                        <div key={m.name} className="info-sheet-comparison-row">
                          <span>{m.name} ({unit})</span>
                          <span>{userValue}</span>
                          <span>{sizeValue}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              <p className="info-sheet-disclaimer">
                Fit may vary by style. Trying on in store is recommended when available.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Share button - only show when at least one image is generated */}
      {sharableFits.length > 0 && (
        <button className="share-button" onClick={() => setShowShareModal(true)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="16,6 12,2 8,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="share-modal-overlay" onClick={() => { setShowShareModal(false); setSharingFit(null); }}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-modal-header">
              <h3>Share your look</h3>
              <button className="share-modal-close" onClick={() => { setShowShareModal(false); setSharingFit(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="share-modal-images">
              {sharableFits.map((fit) => (
                <button
                  key={fit}
                  className={`share-image-option ${sharingFit === fit ? 'sharing' : ''}`}
                  onClick={() => handleShareImage(fit)}
                  disabled={sharingFit === fit}
                >
                  <img src={generatedImages[fit]!} alt={fitLabels[fit]} />
                  <span className="share-image-label">{fitLabels[fit]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResultsSection
