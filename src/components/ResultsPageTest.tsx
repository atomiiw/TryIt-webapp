import { useState, useEffect } from 'react'
import type { UserData } from '../App'
import type { SizeRecommendation } from '../utils/sizeIdentifier'
import type { PersonAnalysis, BodyComposition } from '../utils/personAnalyzer'
import type { SizeGuide } from '../utils/sizeCollector'
import { analyzePersonPhoto, BODY_COMPOSITION_FACTOR } from '../utils/personAnalyzer'
import { identifySize } from '../utils/sizeIdentifier'
import { identifyBrand } from '../utils/brandIdentifier'
import { generateTryOnImage } from '../utils/tryOnService'
import './ResultsPageTest.css'

// Calculated measurement with value
interface CalculatedMeasurement {
  name: string
  value: number
}

// Size guide measurement for display under size cards
interface SizeGuideMeasurement {
  key: string
  label: string
  display: string  // e.g., "88-92" or "90"
}

/**
 * Get measurements for a specific size from the size guide
 * Uses cm or inch based on user's height unit preference
 */
function getSizeGuideMeasurements(
  sizeLabel: string,
  sizeGuide: SizeGuide | null | undefined,
  useInches: boolean = false
): SizeGuideMeasurement[] {
  if (!sizeGuide) return []

  // Choose cm or inch based on user preference
  const sizeData = useInches && sizeGuide.inch?.length > 0 ? sizeGuide.inch : sizeGuide.cm
  if (!sizeData || sizeData.length === 0) return []

  // Find the size entry
  const sizeEntry = sizeData.find(
    s => s.label.toLowerCase() === sizeLabel.toLowerCase()
  )
  if (!sizeEntry) return []

  const measurements: SizeGuideMeasurement[] = []
  const measurementKeys = Object.keys(sizeEntry.measurements)

  // Priority order for measurements (same order as MEASUREMENT_LABELS / estimated measurements)
  const priorityOrder = ['chest', 'waist', 'hips', 'body_length', 'shoulders', 'inseam', 'thigh']

  // Sort measurement keys by priority, keeping original keys for lookup
  const sortedKeys = [...measurementKeys].sort((a, b) => {
    const aNorm = a.toLowerCase().replace(/\s+/g, '_')
    const bNorm = b.toLowerCase().replace(/\s+/g, '_')
    const aIndex = priorityOrder.indexOf(aNorm)
    const bIndex = priorityOrder.indexOf(bNorm)
    // If both in priority list, sort by priority; otherwise put priority items first
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return 0
  })

  // Take all measurements from the size guide (no limit), excluding sleeve
  for (const key of sortedKeys) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '_')

    // Skip sleeve measurements (no longer supported)
    if (normalizedKey.includes('sleeve')) continue

    const label = MEASUREMENT_LABELS[normalizedKey]
    // Skip if we don't have a label for this measurement (unsupported)
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

/**
 * Calculate a body dimension using improved anthropometric formulas
 * Uses body composition factor (F) to adjust for lean/average/soft builds
 */
function calculateDimension(
  H: number,  // height in cm
  W: number,  // weight in kg
  measurementKey: string,
  gender: 'male' | 'female' | 'unknown' = 'unknown',
  bodyComposition: BodyComposition = 'average'
): number | null {
  const F = BODY_COMPOSITION_FACTOR[bodyComposition]

  if (gender === 'male') {
    return calculateMaleDimension(H, W, measurementKey, F)
  } else if (gender === 'female') {
    return calculateFemaleDimension(H, W, measurementKey, F)
  } else {
    const male = calculateMaleDimension(H, W, measurementKey, F)
    const female = calculateFemaleDimension(H, W, measurementKey, F)
    if (male === null || female === null) return null
    return (male + female) / 2
  }
}

/**
 * Male body dimension formulas with body composition factor
 * H = height in cm, W = weight in kg, F = body composition factor (0.85/1.00/1.25)
 */
function calculateMaleDimension(H: number, W: number, key: string, F: number): number | null {
  switch (key) {
    case 'chest':
      return (0.32 * H + 0.31 * W + 24) * (0.89 + 0.11 * F)
    case 'waist':
      return (0.28 * H + 0.70 * W - 69) * (0.85 + 0.15 * F)
    case 'hips':
      return (0.31 * H + 0.37 * W + 10) * (0.91 + 0.09 * F)
    case 'body_length':
      return 0.405 * H
    case 'shoulders':
      return (0.40 * H + 0.18 * W + 10) * (0.94 + 0.06 * F)
    case 'inseam':
      return 0.45 * H * (0.99 + 0.01 * F)
    case 'thigh':
      return (0.12 * H + 0.13 * W + 13) * (0.90 + 0.10 * F)
    default:
      return null
  }
}

/**
 * Female body dimension formulas with body composition factor
 * H = height in cm, W = weight in kg, F = body composition factor (0.85/1.00/1.25)
 */
function calculateFemaleDimension(H: number, W: number, key: string, F: number): number | null {
  switch (key) {
    case 'chest':
      return (0.30 * H + 0.35 * W + 15) * (0.90 + 0.10 * F)
    case 'waist':
      return (0.22 * H + 0.70 * W - 48) * (0.87 + 0.13 * F)
    case 'hips':
      return (0.34 * H + 0.48 * W + 3) * (0.89 + 0.11 * F)
    case 'body_length':
      return 0.385 * H
    case 'shoulders':
      return (0.35 * H + 0.15 * W + 13) * (0.94 + 0.06 * F)
    case 'inseam':
      return 0.46 * H * (0.99 + 0.01 * F)
    case 'thigh':
      return (0.10 * H + 0.18 * W + 13) * (0.88 + 0.12 * F)
    default:
      return null
  }
}

// Standard order for measurements display
const MEASUREMENT_ORDER = ['chest', 'waist', 'hips', 'body_length', 'shoulders', 'inseam', 'thigh']

/**
 * Calculate measurements for display
 * Only calculates measurements that exist in the size guide
 * If no size guide, returns empty array
 */
function calculateMeasurements(
  heightCm: number,
  weightKg: number,
  measurementKeys: string[],
  gender: 'male' | 'female' | 'unknown' = 'unknown',
  bodyComposition: BodyComposition = 'average'
): CalculatedMeasurement[] {
  if (measurementKeys.length === 0) return []

  // Sort measurement keys by standard order
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

interface ResultsPageProps {
  userData: UserData
  onBack: () => void
}

function ResultsPageTest({ userData, onBack }: ResultsPageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [personAnalysis, setPersonAnalysis] = useState<PersonAnalysis | null>(null)
  const [sizeRec, setSizeRec] = useState<SizeRecommendation | null>(null)
  const [measurements, setMeasurements] = useState<CalculatedMeasurement[]>([])
  const [timing, setTiming] = useState<{ analysis: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Try-on state
  const [tryOnImage, setTryOnImage] = useState<string | null>(null)
  const [tryOnLoading, setTryOnLoading] = useState(false)
  const [tryOnError, setTryOnError] = useState<string | null>(null)

  useEffect(() => {
    async function runAnalysis() {
      const startTime = Date.now()

      try {
        // Check if we have an image
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

        // Step 1: Analyze the person's photo
        console.log('🔍 Starting person analysis...')
        const analysisStart = Date.now()

        const clothingType = userData.item?.specificType === 'tee' ? 'shirt' : 'unknown'
        const analysis = await analyzePersonPhoto(userData.image, clothingType as any)

        const analysisTime = Date.now() - analysisStart
        console.log(`✅ Analysis complete in ${analysisTime}ms`)

        setPersonAnalysis(analysis)

        // Get measurement keys from size guide (only calculate what the guide asks for)
        const sizeGuide = userData.item?.sizeGuide
        const measurementKeys = sizeGuide?.cm?.[0]?.measurements
          ? Object.keys(sizeGuide.cm[0].measurements)
          : []

        // Calculate body measurements (only for measurements in size guide)
        const calculatedMeasurements = calculateMeasurements(
          heightCm,
          weightKg,
          measurementKeys,
          analysis.gender,
          analysis.body_composition
        )
        setMeasurements(calculatedMeasurements)
        console.log('📐 Calculated measurements:', calculatedMeasurements)

        // Step 2: Identify brand
        const brand = userData.item ? identifyBrand(userData.item) : 'Unknown'
        console.log('🏷️ Identified brand:', brand)

        // Step 3: Get size recommendation
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

        const totalTime = Date.now() - startTime
        setTiming({ analysis: analysisTime, total: totalTime })

        console.log('🎯 Size recommendation:', recommendation)
        console.log(`⏱️ Total time: ${totalTime}ms`)

        // Start try-on generation for regular fit if we have item and image
        if (userData.item?.imageUrl && userData.image && recommendation.regular) {
          setTryOnLoading(true)
          generateTryOnImage(
            userData.image,
            userData.item.imageUrl,
            {
              name: userData.item.name || 'Clothing item',
              type: userData.item.type || 'top',
              color: userData.item.color || '',
              specificType: userData.item.specificType
            }
          ).then((result) => {
            if (result.success && result.imageDataUrl) {
              setTryOnImage(result.imageDataUrl)
            } else {
              setTryOnError(result.error || 'Failed to generate try-on image')
            }
          }).catch((err) => {
            setTryOnError(err instanceof Error ? err.message : 'Try-on generation failed')
          }).finally(() => {
            setTryOnLoading(false)
          })
        }

      } catch (err) {
        console.error('Analysis failed:', err)
        setError(err instanceof Error ? err.message : 'Analysis failed')
      } finally {
        setIsLoading(false)
      }
    }

    runAnalysis()
  }, [userData])

  if (isLoading) {
    return (
      <div className="results-page">
        <div className="loading">
          <div className="spinner"></div>
          <p>Analyzing photo...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="results-page">
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onBack}>Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="results-page">
      <h2>Size Recommendations</h2>

      {/* Timing info (for debugging) */}
      {timing && (
        <div className="timing-info">
          <p>AI Analysis: {timing.analysis}ms</p>
          <p>Total: {timing.total}ms</p>
        </div>
      )}

      {/* Person Analysis */}
      {personAnalysis && (
        <div className="analysis-section">
          <h3>Person Analysis</h3>
          <div className="analysis-grid">
            <div className="analysis-item">
              <span className="analysis-label">Gender</span>
              <span className="analysis-value">{personAnalysis.gender}</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Age</span>
              <span className="analysis-value">{personAnalysis.age_range}</span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Build</span>
              <span className={`analysis-value body-composition ${personAnalysis.body_composition}`}>
                {personAnalysis.body_composition}
              </span>
            </div>
            <div className="analysis-item">
              <span className="analysis-label">Confidence</span>
              <span className="analysis-value">{personAnalysis.confidence}</span>
            </div>
          </div>
          {personAnalysis.notes && <p className="analysis-notes">Notes: {personAnalysis.notes}</p>}
        </div>
      )}

      {/* Calculated Measurements */}
      {measurements.length > 0 && (
        <div className="measurements-section">
          <h3>Estimated Measurements</h3>
          <div className="measurements-grid">
            {measurements.map((m) => {
              // Convert to inches if user entered height in feet
              const displayValue = userData.heightUnit === 'ft'
                ? Math.round(m.value / 2.54 * 10) / 10
                : m.value
              const displayUnit = userData.heightUnit === 'ft' ? 'in' : 'cm'
              return (
                <div key={m.name} className="measurement-row">
                  <span className="measurement-name">{m.name}</span>
                  <span className="measurement-value">{displayValue} {displayUnit}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Size Recommendations */}
      {sizeRec && (() => {
        const sizeGuide = userData.item?.sizeGuide
        const useInches = userData.heightUnit === 'ft'
        const tightMeasurements = sizeRec.tight ? getSizeGuideMeasurements(sizeRec.tight, sizeGuide, useInches) : []
        const regularMeasurements = sizeRec.regular ? getSizeGuideMeasurements(sizeRec.regular, sizeGuide, useInches) : []
        const comfortableMeasurements = sizeRec.comfortable ? getSizeGuideMeasurements(sizeRec.comfortable, sizeGuide, useInches) : []
        const unit = useInches ? 'in' : 'cm'

        return (
          <div className="sizes-section">
            <h3>Recommended Sizes</h3>
            <div className="size-cards">
              <div className={`size-card tight ${!sizeRec.tight ? 'empty' : ''}`}>
                <span className="size-label">Tight Fit</span>
                <span className="size-value">{sizeRec.tight || '—'}</span>
                {tightMeasurements.length > 0 && (
                  <div className="size-measurements">
                    {tightMeasurements.map(m => (
                      <div key={m.key} className="size-measurement">
                        <span className="sm-label">{m.label}</span>
                        <span className="sm-value">{m.display}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`size-card regular ${!sizeRec.regular ? 'empty' : ''}`}>
                <span className="size-label">Regular Fit</span>
                <span className="size-value">{sizeRec.regular || '—'}</span>
                {regularMeasurements.length > 0 && (
                  <div className="size-measurements">
                    {regularMeasurements.map(m => (
                      <div key={m.key} className="size-measurement">
                        <span className="sm-label">{m.label}</span>
                        <span className="sm-value">{m.display}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`size-card comfortable ${!sizeRec.comfortable ? 'empty' : ''}`}>
                <span className="size-label">Comfortable</span>
                <span className="size-value">{sizeRec.comfortable || '—'}</span>
                {comfortableMeasurements.length > 0 && (
                  <div className="size-measurements">
                    {comfortableMeasurements.map(m => (
                      <div key={m.key} className="size-measurement">
                        <span className="sm-label">{m.label}</span>
                        <span className="sm-value">{m.display}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="method">Method: {sizeRec.method} ({sizeRec.confidence} confidence)</p>
            {sizeRec.notes && <p className="notes">{sizeRec.notes}</p>}
          </div>
        )
      })()}

      {/* Virtual Try-On Section */}
      {(tryOnLoading || tryOnImage || tryOnError) && (
        <div className="tryon-section">
          <h3>Virtual Try-On</h3>

          {tryOnLoading && (
            <div className="tryon-loading">
              <div className="spinner"></div>
              <p>Generating try-on image...</p>
              <p className="tryon-loading-hint">This may take a minute</p>
            </div>
          )}

          {tryOnError && !tryOnLoading && (
            <div className="tryon-error">
              <p>Could not generate try-on image: {tryOnError}</p>
            </div>
          )}

          {tryOnImage && !tryOnLoading && (
            <div className="tryon-result">
              <img src={tryOnImage} alt="Virtual try-on result" />
            </div>
          )}
        </div>
      )}

      <button className="back-button" onClick={onBack}>
        ← Back
      </button>
    </div>
  )
}

export default ResultsPageTest
