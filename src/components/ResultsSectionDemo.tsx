import { useState, useRef, useEffect, useMemo } from 'react'
import type { UserData } from '../App'
import type { SizeRecommendation } from '../utils/sizeIdentifier'
import { calculateDimension } from '../utils/sizeIdentifier'
import type { BodyComposition } from '../utils/personAnalyzer'
import type { SizeGuide } from '../utils/sizeCollector'
import { analyzePersonPhoto } from '../utils/personAnalyzer'
import { identifySize } from '../utils/sizeIdentifier'
import { generateTryOnImageDemo } from '../utils/tryOnService-demo'
import type { FitType } from '../utils/tryOnService-demo'
import './ResultsSection.css'

// ============================================================
// THIS IS THE DEMO VERSION - Uses tryOnService-demo
// Returns fully processed images with watermark
// ============================================================

interface ResultsSectionDemoProps {
  userData: UserData
  isVisible: boolean
}

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

// ============================================================
// COMPONENT
// ============================================================

function ResultsSectionDemo({ userData, isVisible }: ResultsSectionDemoProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0])
  const [error, setError] = useState<string | null>(null)
  const [sizeRec, setSizeRec] = useState<SizeRecommendation | null>(null)
  const [measurements, setMeasurements] = useState<CalculatedMeasurement[]>([])
  const [selectedFit, setSelectedFit] = useState<FitType>('regular')
  const [hasStarted, setHasStarted] = useState(false)
  const [regeneratingFits, setRegeneratingFits] = useState<Set<FitType>>(new Set())
  const [generatedImages, setGeneratedImages] = useState<GeneratedImages>({
    tight: null,
    regular: null,
    comfortable: null
  })
  const [generatingFits, setGeneratingFits] = useState<Set<FitType>>(new Set())
  const [showShareModal, setShowShareModal] = useState(false)
  const [isClosingModal, setIsClosingModal] = useState(false)
  const [sharingFit, setSharingFit] = useState<FitType | null>(null)

  // Close modal with animation
  const closeShareModal = () => {
    setIsClosingModal(true)
    setTimeout(() => {
      setShowShareModal(false)
      setIsClosingModal(false)
      setSharingFit(null)
    }, 250) // Match animation duration
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

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
    tight: 'Tight Fit',
    regular: 'Regular Fit',
    comfortable: 'Comfortable'
  }

  // Function to generate try-on image for a specific fit
  // Uses tryOnService-demo which returns fully processed image with watermark
  const generateFitImage = async (fit: FitType) => {
    if (!userData.image || !userData.item?.imageUrl) return

    setGeneratingFits(prev => new Set(prev).add(fit))

    try {
      // Service returns fully processed image with watermark
      const result = await generateTryOnImageDemo(
        userData.image,
        userData.item.imageUrl,
        {
          name: userData.item.name || 'Clothing item',
          type: userData.item.type || 'tops',
          color: userData.item.color || ''
        },
        fit
      )

      if (result.success && result.imageDataUrl) {
        setGeneratedImages(prev => ({ ...prev, [fit]: result.imageDataUrl }))
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

        // Analyze the person's photo
        const clothingType = userData.item?.type || 'tops'
        const analysis = await analyzePersonPhoto(userData.image, clothingType as any)

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

        // Set initial selected fit to the first available
        if (recommendation.regular) {
          setSelectedFit('regular')
        } else if (recommendation.comfortable) {
          setSelectedFit('comfortable')
        } else if (recommendation.tight) {
          setSelectedFit('tight')
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed')
      } finally {
        setIsLoading(false)
      }
    }

    runAnalysis()
  }, [isVisible, hasStarted, userData])

  // Scroll into view when section becomes visible
  useEffect(() => {
    if (isVisible && sectionRef.current) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [isVisible])

  // Generate try-on images when size recommendation is available
  useEffect(() => {
    if (!sizeRec || !userData.image || !userData.item?.imageUrl) return

    // Generate images for all available fits
    const fitsToGenerate: FitType[] = []
    if (sizeRec.tight && !generatedImages.tight) fitsToGenerate.push('tight')
    if (sizeRec.regular && !generatedImages.regular) fitsToGenerate.push('regular')
    if (sizeRec.comfortable && !generatedImages.comfortable) fitsToGenerate.push('comfortable')


    // Generate all fit images in parallel
    // Service handles watermark internally, so no race conditions
    fitsToGenerate.forEach(fit => {
      generateFitImage(fit)
    })
  }, [sizeRec, userData.image, userData.item?.imageUrl])

  // Get available fit types (those with actual sizes)
  // Memoized to prevent scroll effect from running on every re-render
  const availableFits = useMemo<FitType[]>(() => {
    return sizeRec
      ? (['tight', 'regular', 'comfortable'] as FitType[]).filter(fit => sizeRec[fit])
      : []
  }, [sizeRec])

  const GAP = 16
  const isScrollingProgrammatically = useRef(false)

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
    if (sizeRec && sizeRec[fit]) {
      setSelectedFit(fit)
      scrollToFit(fit)
    }
  }

  const handleRegenerate = async () => {
    const currentFit = selectedFit
    if (!userData.image || !userData.item?.imageUrl) return

    setRegeneratingFits(prev => new Set(prev).add(currentFit))

    try {
      // Service returns fully processed image with watermark
      const result = await generateTryOnImageDemo(
        userData.image,
        userData.item.imageUrl,
        {
          name: userData.item.name || 'Clothing item',
          type: userData.item.type || 'tops',
          color: userData.item.color || ''
        },
        currentFit
      )

      if (result.success && result.imageDataUrl) {
        setGeneratedImages(prev => ({ ...prev, [currentFit]: result.imageDataUrl }))
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

  // Convert data URL to blob for sharing (watermark already applied by service)
  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl)
    return response.blob()
  }

  // Share image with native share API
  const handleShareImage = async (fit: FitType) => {
    const imageSrc = generatedImages[fit]
    if (!imageSrc) return

    setSharingFit(fit)
    try {
      // Images already have watermark from service, just convert to blob
      const blob = await dataUrlToBlob(imageSrc)
      const file = new File([blob], `tryit-${fit}-fit.png`, { type: 'image/png' })

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'TryIt - Virtual Try-On',
          text: `Check out my ${fitLabels[fit]} look!`
        })
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob)
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

      {/* Size cards picker */}
      <div className="size-picker-container">
        <div className="size-picker">
          {(['tight', 'regular', 'comfortable'] as FitType[]).map((fit) => {
            const size = sizeRec?.[fit]
            const isAvailable = !!size
            const isSelected = selectedFit === fit
            const displaySize = size ? abbreviateSize(size) : '—'

            return (
              <button
                key={fit}
                className={`size-picker-card ${isSelected ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''}`}
                onClick={() => handleCardClick(fit)}
                disabled={!isAvailable}
              >
                <span className="size-picker-label">{fitLabels[fit]}</span>
                <span className="size-picker-value">{displaySize}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Combined Fit Comparison - Their measurements vs Size Guide */}
      {(() => {
        const sizeMeasurements = getSizeMeasurements(selectedFit)
        const selectedSize = sizeRec?.[selectedFit] || ''
        const displaySelectedSize = selectedSize ? abbreviateSize(selectedSize) : ''

        if (measurements.length === 0 && sizeMeasurements.length === 0) return null

        return (
          <div className="fit-comparison-section">
            <h3 className="results-section-title">
              Body vs Size {displaySelectedSize}
            </h3>
            <div className="measurements-grid">
              {measurements.map((m) => {
                const userValue = userData.heightUnit === 'ft'
                  ? Math.round(m.value / 2.54 * 10) / 10
                  : m.value
                // Find matching size guide measurement
                const normalizedName = m.name.toLowerCase().replace(/\s+/g, '_')
                const sizeM = sizeMeasurements.find(sm => sm.key === normalizedName)
                const sizeValue = sizeM?.display || '—'
                const unit = userData.heightUnit === 'ft' ? 'in' : 'cm'

                return (
                  <div key={m.name} className="measurement-row comparison">
                    <span className="measurement-name">{m.name} ({unit})</span>
                    <span className="measurement-value user-value">{userValue}</span>
                    <span className="measurement-value size-value">{sizeValue}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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
        <div className={`share-modal-overlay ${isClosingModal ? 'closing' : ''}`} onClick={closeShareModal}>
          <div className={`share-modal ${isClosingModal ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="share-modal-header">
              <h3>Share your look</h3>
              <button className="share-modal-close" onClick={closeShareModal}>
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

export default ResultsSectionDemo
