/**
 * Size Identifier
 * Determines recommended clothing sizes based on user measurements and body analysis
 */

import type { SizeGuide, Measurement } from './sizeCollector'
import type { BodyComposition } from './personAnalyzer'
import { BODY_COMPOSITION_FACTOR } from './personAnalyzer'

// Size order for standard sizing (smallest to largest)
const SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '1X', '2XL', '3XL', '4XL']

// Size recommendation result
export interface SizeRecommendation {
  regular: string           // Best fit size (empty if too small/large for all sizes)
  comfortable: string       // One size up for loose fit (empty if person too small)
  tight: string            // One size down for fitted look (empty if person too large)
  confidence: 'high' | 'medium' | 'low'
  method: 'size_guide' | 'estimation'
  notes?: string
}

// User measurements input
export interface UserMeasurements {
  height: number           // in cm
  weight: number           // in kg
  gender: 'male' | 'female' | 'teenager' | 'unknown'
  bodyComposition?: BodyComposition
}

/**
 * Normalize size label to standard format
 */
function normalizeSize(size: string): string {
  const s = size.toUpperCase().trim()
  const mappings: Record<string, string> = {
    'XSMALL': 'XS', 'X-SMALL': 'XS', 'EXTRA SMALL': 'XS',
    'SMALL': 'S', 'SM': 'S',
    'MEDIUM': 'M', 'MED': 'M',
    'LARGE': 'L', 'LG': 'L',
    'XLARGE': 'XL', 'X-LARGE': 'XL', 'EXTRA LARGE': 'XL',
    'XXLARGE': '2XL', 'XX-LARGE': '2XL', 'XXL': '2XL', '2X': '2XL',
    'XXXLARGE': '3XL', 'XXX-LARGE': '3XL', 'XXXL': '3XL', '3X': '3XL',
    'XXXXLARGE': '4XL', 'XXXX-LARGE': '4XL', 'XXXXL': '4XL', '4X': '4XL'
  }
  return mappings[s] || s
}

/**
 * Get size index in SIZE_ORDER array
 */
function getSizeIndex(size: string): number {
  const normalized = normalizeSize(size)
  const index = SIZE_ORDER.indexOf(normalized)
  return index >= 0 ? index : SIZE_ORDER.indexOf('M') // Default to M
}

/**
 * Edge case type for size recommendations
 */
type EdgeCase = 'too_small' | 'too_large' | 'normal'

/**
 * Get adjacent sizes (one up, one down) from available sizes
 * Handles edge cases where person is too small or too large for available sizes
 */
function getAdjacentSizes(
  regularSize: string,
  availableSizes: string[],
  edgeCase: EdgeCase = 'normal'
): { comfortable: string; tight: string; regular: string } {
  const sortedSizes = [...availableSizes].sort((a, b) => getSizeIndex(a) - getSizeIndex(b))

  // Edge case: person is too small for even the smallest size
  if (edgeCase === 'too_small') {
    const smallestSize = sortedSizes[0]
    return {
      regular: '',
      tight: '',
      comfortable: smallestSize  // Only comfortable fit with smallest size
    }
  }

  // Edge case: person is too large for even the largest size
  if (edgeCase === 'too_large') {
    const largestSize = sortedSizes[sortedSizes.length - 1]
    return {
      regular: '',
      comfortable: '',
      tight: largestSize  // Only tight fit with largest size
    }
  }

  const regularIndex = sortedSizes.findIndex(s => normalizeSize(s) === normalizeSize(regularSize))

  if (regularIndex === -1) {
    return { comfortable: regularSize, tight: regularSize, regular: regularSize }
  }

  // Check if regular is the smallest - no tight available
  const tightIndex = regularIndex - 1
  const tight = tightIndex >= 0 ? sortedSizes[tightIndex] : ''

  // Check if regular is the largest - no comfortable available
  const comfortableIndex = regularIndex + 1
  const comfortable = comfortableIndex < sortedSizes.length ? sortedSizes[comfortableIndex] : ''

  return {
    regular: regularSize,
    comfortable,
    tight
  }
}

/**
 * Calculate a single body dimension using improved anthropometric formulas
 * Uses body composition factor (F) to adjust for lean/average/soft builds
 *
 * F values: lean = 0.85, average = 1.00, soft = 1.25
 */
export function calculateDimension(
  height: number,
  weight: number,
  measurementKey: string,
  gender: 'male' | 'female' | 'teenager' | 'unknown' = 'unknown',
  bodyComposition: BodyComposition = 'average'
): number | null {
  const normalizedKey = measurementKey.toLowerCase().replace(/\s+/g, '_')
  const F = BODY_COMPOSITION_FACTOR[bodyComposition]

  // Use gender-specific formulas
  if (gender === 'male') {
    return calculateMaleDimension(height, weight, normalizedKey, F)
  } else if (gender === 'female') {
    return calculateFemaleDimension(height, weight, normalizedKey, F)
  } else if (gender === 'teenager') {
    // Teenager uses female formulas by default
    return calculateFemaleDimension(height, weight, normalizedKey, F)
  } else {
    // Unknown: average of male and female
    const male = calculateMaleDimension(height, weight, normalizedKey, F)
    const female = calculateFemaleDimension(height, weight, normalizedKey, F)
    if (male === null || female === null) return null
    return (male + female) / 2
  }
}

/**
 * Male body dimension formulas with body composition factor
 * H = height in cm, W = weight in kg, F = body composition factor (0.85/1.00/1.25)
 *
 * Chest formula is BMI-based for better accuracy across different body types:
 * - Base chest at BMI 23 (normal male BMI): 96cm
 * - Each BMI point adds/subtracts ~2.2cm
 * - Height adjustment: 0.18cm per cm above/below 175cm average
 */
function calculateMaleDimension(H: number, W: number, key: string, F: number): number | null {
  let result: number | null = null
  let formula = ''

  switch (key) {
    case 'chest':
      // C_m = 0.24*H + 0.76*W (no body composition adjustment for male chest)
      result = 0.24 * H + 0.76 * W
      formula = `0.24×${H} + 0.76×${W} = ${result.toFixed(1)}`
      break
    case 'waist':
      // Waist = 0.16*H + 0.68*W - linear formula based on height and weight
      result = 0.16 * H + 0.68 * W
      formula = `0.16×${H} + 0.68×${W} = ${result.toFixed(1)}`
      break
    case 'hips':
      result = (0.28 * H + 0.40 * W + 20) * (0.93 + 0.07 * F)
      formula = `(0.28×${H} + 0.40×${W} + 20) × (0.93 + 0.07×${F}) = ${result.toFixed(1)}`
      break
    case 'length':
      result = 0.405 * H
      formula = `0.405 × ${H} = ${result.toFixed(1)}`
      break
    case 'shoulder':
      result = (0.45 * H + 0.30 * (W - 70) + 30) * (0.92 + 0.08 * F)
      formula = `(0.45×${H} + 0.30×(${W}-70) + 30) × (0.92 + 0.08×${F}) = ${result.toFixed(1)}`
      break
    case 'inseam':
      result = 0.45 * H * (0.99 + 0.01 * F)
      formula = `0.45 × ${H} × (0.99 + 0.01×${F}) = ${result.toFixed(1)}`
      break
    case 'thigh':
      result = (0.25 * H + 0.12 * (W - 70) + 10) * (0.90 + 0.10 * F)
      formula = `(0.25×${H} + 0.12×(${W}-70) + 10) × (0.90 + 0.10×${F}) = ${result.toFixed(1)}`
      break
    default:
      return null
  }

  return result
}

/**
 * Female body dimension formulas with body composition factor
 * H = height in cm, W = weight in kg, F = body composition factor (0.85/1.00/1.25)
 *
 * Chest formula is BMI-based for better accuracy across different body types:
 * - Base chest at BMI 22 (normal female BMI): 88cm
 * - Each BMI point adds/subtracts ~2cm
 * - Height adjustment: 0.15cm per cm above/below 163cm average
 */
function calculateFemaleDimension(H: number, W: number, key: string, F: number): number | null {
  let result: number | null = null
  let formula = ''

  switch (key) {
    case 'chest':
      // C_f = 0.16*H + 1.08*W + 1 + Δ(F) where Δ: lean=-5, normal=0, soft=+1
      const femaleChestDelta = F === 0.85 ? -5 : F === 1.25 ? 1 : 0
      result = 0.16 * H + 1.08 * W + 1 + femaleChestDelta
      formula = `0.16×${H} + 1.08×${W} + 1 + ${femaleChestDelta} = ${result.toFixed(1)}`
      break
    case 'waist':
      // Waist = 0.225*H + 0.61*W - linear formula based on height and weight
      result = 0.225 * H + 0.61 * W
      formula = `0.225×${H} + 0.61×${W} = ${result.toFixed(1)}`
      break
    case 'hips':
      result = (0.30 * H + 0.50 * W + 22) * (0.91 + 0.09 * F)
      formula = `(0.30×${H} + 0.50×${W} + 22) × (0.91 + 0.09×${F}) = ${result.toFixed(1)}`
      break
    case 'length':
      result = 0.385 * H
      formula = `0.385 × ${H} = ${result.toFixed(1)}`
      break
    case 'shoulder':
      result = (0.42 * H + 0.20 * (W - 60) + 22) * (0.93 + 0.07 * F)
      formula = `(0.42×${H} + 0.20×(${W}-60) + 22) × (0.93 + 0.07×${F}) = ${result.toFixed(1)}`
      break
    case 'inseam':
      result = 0.46 * H * (0.99 + 0.01 * F)
      formula = `0.46 × ${H} × (0.99 + 0.01×${F}) = ${result.toFixed(1)}`
      break
    case 'thigh':
      result = (0.24 * H + 0.15 * (W - 60) + 12) * (0.88 + 0.12 * F)
      formula = `(0.24×${H} + 0.15×(${W}-60) + 12) × (0.88 + 0.12×${F}) = ${result.toFixed(1)}`
      break
    default:
      return null
  }

  return result
}


/**
 * Check if user measurement is within, smaller than, or larger than size range
 * Returns: 'in_range' | 'smaller' | 'larger'
 */
function getMeasurementFit(
  userValue: number,
  measurement: Measurement,
  measurementKey?: string
): 'in_range' | 'smaller' | 'larger' {
  const normalizedKey = measurementKey?.toLowerCase().replace(/\s+/g, '_')

  // For length: shirt longer than person is OK (in_range), shorter is bad (larger means user needs bigger)
  if (normalizedKey === 'length') {
    if (measurement.min !== undefined) {
      if (userValue <= measurement.min) return 'in_range'  // Shirt is long enough
      return 'larger'  // User body is longer than shirt - needs bigger size
    } else if (measurement.value !== undefined) {
      if (userValue <= measurement.value) return 'in_range'
      return 'larger'
    }
    return 'in_range'
  }

  // Standard measurements (chest, waist, etc.)
  if (measurement.min !== undefined && measurement.max !== undefined) {
    if (userValue < measurement.min) return 'smaller'
    if (userValue > measurement.max) return 'larger'
    return 'in_range'
  } else if (measurement.value !== undefined) {
    // Single value: use ±2cm tolerance
    if (userValue < measurement.value - 2) return 'smaller'
    if (userValue > measurement.value + 2) return 'larger'
    return 'in_range'
  }
  return 'in_range'
}

/**
 * Identify size WITH size guide
 * Logic: Size up until all measurements are either in_range or user is smaller than range.
 * Never recommend a size where user is larger than range (too tight).
 * Optimal: all in_range. Acceptable: mix of in_range and smaller. Bad: any larger.
 */
export function identifySizeWithGuide(
  user: UserMeasurements,
  sizeGuide: SizeGuide
): SizeRecommendation {
  const availableSizes = sizeGuide.cm.map(s => s.label)

  if (availableSizes.length === 0) {
    return {
      regular: 'M',
      comfortable: 'L',
      tight: 'S',
      confidence: 'low',
      method: 'size_guide',
      notes: 'Empty size guide'
    }
  }

  // Get measurement keys from size guide
  const measurementKeys = Object.keys(sizeGuide.cm[0].measurements)
  const bodyComp = user.bodyComposition || 'average'

  // Sort sizes from smallest to largest
  const sortedSizes = [...sizeGuide.cm].sort((a, b) => getSizeIndex(a.label) - getSizeIndex(b.label))

  // Analyze each size
  type SizeAnalysis = {
    label: string
    inRangeCount: number
    smallerCount: number
    largerCount: number
    totalCount: number
    hasAnyLarger: boolean  // User is larger than range for at least one measurement
    allInRange: boolean    // All measurements in range (optimal)
  }

  const sizeAnalyses: SizeAnalysis[] = []

  for (const sizeEntry of sortedSizes) {
    let inRangeCount = 0
    let smallerCount = 0
    let largerCount = 0
    let totalCount = 0

    for (const key of measurementKeys) {
      const measurement = sizeEntry.measurements[key] as Measurement
      if (!measurement) continue

      const userDimension = calculateDimension(user.height, user.weight, key, user.gender, bodyComp)
      if (userDimension === null) continue

      const fit = getMeasurementFit(userDimension, measurement, key)
      totalCount++

      if (fit === 'in_range') inRangeCount++
      else if (fit === 'smaller') smallerCount++
      else if (fit === 'larger') largerCount++

      const displayRange = measurement.value ?? `${measurement.min}-${measurement.max}`
    }

    sizeAnalyses.push({
      label: sizeEntry.label,
      inRangeCount,
      smallerCount,
      largerCount,
      totalCount,
      hasAnyLarger: largerCount > 0,
      allInRange: totalCount > 0 && inRangeCount === totalCount
    })
  }

  // Find best size:
  // 1. First priority: All measurements in range (optimal)
  // 2. Second priority: Majority vote — half or fewer measurements are larger (standard fit)
  // 3. Fallback: Largest available size (user is too large for all)

  let bestSize = sortedSizes[sortedSizes.length - 1].label  // Default to largest
  let confidence: 'high' | 'medium' | 'low' = 'low'
  let edgeCase: EdgeCase = 'normal'

  // Try to find optimal (all in range)
  const optimalSize = sizeAnalyses.find(s => s.allInRange)
  if (optimalSize) {
    bestSize = optimalSize.label
    confidence = 'high'
  } else {
    // Find smallest size where half or fewer measurements are larger (majority vote)
    const acceptableSize = sizeAnalyses.find(s => s.largerCount * 2 <= s.totalCount)
    if (acceptableSize) {
      bestSize = acceptableSize.label
      confidence = acceptableSize.largerCount === 0 ? 'medium' : 'medium'
    } else {
      // User is larger than even the largest size
      edgeCase = 'too_large'
      confidence = 'low'
    }
  }

  // Check if user is smaller than smallest size
  const smallestAnalysis = sizeAnalyses[0]
  if (smallestAnalysis && smallestAnalysis.smallerCount === smallestAnalysis.totalCount) {
    edgeCase = 'too_small'
    bestSize = smallestAnalysis.label
    confidence = 'low'
  }

  // Build notes
  let notes = `Matched using ${sizeGuide.brand} ${sizeGuide.clothing_type} size guide`
  if (edgeCase === 'too_small') {
    notes = `Person is smaller than available sizes. ${bestSize} will fit loosely.`
  } else if (edgeCase === 'too_large') {
    notes = `Person is larger than available sizes. ${bestSize} will fit tightly.`
  }

  const { regular, comfortable, tight } = getAdjacentSizes(bestSize, availableSizes, edgeCase)


  return {
    regular,
    comfortable,
    tight,
    confidence,
    method: 'size_guide',
    notes
  }
}

// Chest size lookup tables for different clothing categories
// Key = upper bound of chest measurement in cm, Value = size
// Thresholds are set at midpoints between size ranges for more accurate matching
// For between-sizes (like "XS-S"), lean people size down, regular/soft size up
const CHEST_SIZES: Record<string, Record<number, string>> = {
  'men':    { 83.5: 'XS', 88.5: 'XS-S', 95: 'S', 103: 'M', 112: 'L', 122: 'XL', 999: '2XL' },
  'women':  { 83.5: 'XS', 88.5: 'S', 95: 'S-M', 103: 'M-L', 112: 'L-XL', 122: 'XL-2XL', 999: '2XL' },
  'unisex': { 83.5: 'XS', 88.5: 'XS-S', 95: 'S', 103: 'M', 112: 'L', 122: 'XL', 999: '2XL' }
}

/**
 * Look up size from chest measurement using the lookup table
 */
function lookupSizeFromChest(
  chest: number,
  clothingGender: 'men' | 'women' | 'unisex',
  bodyComposition: BodyComposition = 'average'
): string {
  const table = CHEST_SIZES[clothingGender] || CHEST_SIZES['unisex']
  const thresholds = Object.keys(table).map(Number).sort((a, b) => a - b)

  let rawSize = table[999] // Default to largest
  for (const threshold of thresholds) {
    if (chest < threshold) {
      rawSize = table[threshold]
      break
    }
  }


  // Handle between-sizes based on body composition
  // lean = size down, average/soft = size up
  if (rawSize.includes('-')) {
    const [smaller, larger] = rawSize.split('-')
    if (bodyComposition === 'lean') {
      return smaller
    } else {
      return larger
    }
  }

  return rawSize
}

/**
 * Identify size WITHOUT size guide - uses chest measurement lookup
 */
export function identifySizeWithoutGuide(
  user: UserMeasurements,
  clothingGender: 'men' | 'women' | 'unisex',
  availableSizes: string[]
): SizeRecommendation {
  const { height, weight, gender, bodyComposition } = user
  const comp = bodyComposition || 'average'


  // Calculate chest size using the formulas (no body type factor for chest)
  let chest: number
  if (gender === 'male') {
    chest = (weight * 240) / height
  } else if (gender === 'female') {
    chest = (weight * 260) / height
  } else {
    // Unknown gender: average of male and female formulas
    const maleChest = (weight * 240) / height
    const femaleChest = (weight * 260) / height
    chest = (maleChest + femaleChest) / 2
  }

  // Look up size from chest measurement
  const regularSize = lookupSizeFromChest(chest, clothingGender, comp)

  // Find closest available size and detect edge cases
  const sizesToUse = availableSizes.length > 0 ? availableSizes : SIZE_ORDER
  const sortedAvailable = [...sizesToUse].sort((a, b) => getSizeIndex(a) - getSizeIndex(b))
  const smallestAvailable = sortedAvailable[0]
  const largestAvailable = sortedAvailable[sortedAvailable.length - 1]


  // Check if recommended size is available
  const regularIndex = getSizeIndex(regularSize)
  const smallestIndex = getSizeIndex(smallestAvailable)
  const largestIndex = getSizeIndex(largestAvailable)

  let finalRegularSize = regularSize
  let edgeCase: EdgeCase = 'normal'
  let notes = `Estimated from chest ${chest.toFixed(1)}cm (height: ${height}cm, weight: ${weight}kg, build: ${comp})`

  // Check if user's ideal size is smaller than the smallest available
  if (regularIndex < smallestIndex) {
    edgeCase = 'too_small'
    finalRegularSize = smallestAvailable
    notes = `Person is smaller than available sizes. ${smallestAvailable} will fit loosely.`
  }
  // Check if user's ideal size is larger than the largest available
  else if (regularIndex > largestIndex) {
    edgeCase = 'too_large'
    finalRegularSize = largestAvailable
    notes = `Person is larger than available sizes. ${largestAvailable} will fit tightly.`
  }
  // Normal case: find closest available size if exact match not found
  else if (availableSizes.length > 0 && !sortedAvailable.some(s => normalizeSize(s) === normalizeSize(regularSize))) {
    let closestDiff = Infinity
    for (const size of sortedAvailable) {
      const diff = Math.abs(getSizeIndex(size) - regularIndex)
      if (diff < closestDiff) {
        closestDiff = diff
        finalRegularSize = size
      }
    }
  }

  const { regular, comfortable, tight } = getAdjacentSizes(finalRegularSize, sizesToUse, edgeCase)


  return {
    regular,
    comfortable,
    tight,
    confidence: 'medium',
    method: 'estimation',
    notes
  }
}

/**
 * Main function to identify recommended sizes
 * Automatically chooses method based on whether size guide is available
 */
export function identifySize(
  user: UserMeasurements,
  sizeGuide: SizeGuide | null | undefined,
  clothingGender: 'men' | 'women' | 'unisex' = 'unisex',
  availableSizes: string[] = []
): SizeRecommendation {

  if (sizeGuide && sizeGuide.cm.length > 0) {
    return identifySizeWithGuide(user, sizeGuide)
  } else {
    return identifySizeWithoutGuide(user, clothingGender, availableSizes)
  }
}
