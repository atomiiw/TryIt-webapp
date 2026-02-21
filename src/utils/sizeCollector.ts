import type { ItemData } from '../App'
import sizeGuidesCm from '../../size_guides/size_guides_cm.json'
import sizeGuidesInch from '../../size_guides/size_guides_inch.json'

// Types for size guide data
interface Measurement {
  value?: number
  min?: number
  max?: number
}

interface SizeEntry {
  label: string
  measurements: Record<string, Measurement>
}

interface BrandEntry {
  brand: string
  clothing_type: string
  gender: string
  sizes: SizeEntry[]
}

interface SizeGuideData {
  brands: BrandEntry[]
  last_updated: string
}

export interface SizeGuide {
  brand: string
  clothing_type: string
  gender: string
  cm: SizeEntry[]
  inch: SizeEntry[]
}

export interface ClothingCombo {
  clothing_type: string
  gender: string
}

/**
 * Normalize size label to a standard format for comparison
 * Maps various size names to a canonical form
 */
function normalizeSize(size: string): string {
  const s = size.toLowerCase().trim()

  // Map common variations to standard labels
  const mappings: Record<string, string> = {
    // Extra small
    'xs': 'xs',
    'x-small': 'xs',
    'xsmall': 'xs',
    'extra small': 'xs',
    'extra-small': 'xs',
    // Small
    's': 's',
    'small': 's',
    'sm': 's',
    // Medium
    'm': 'm',
    'medium': 'm',
    'med': 'm',
    // Large
    'l': 'l',
    'large': 'l',
    'lg': 'l',
    // Extra large
    'xl': 'xl',
    'x-large': 'xl',
    'xlarge': 'xl',
    'extra large': 'xl',
    'extra-large': 'xl',
    // 2XL
    '2xl': '2xl',
    'xxl': '2xl',
    '2x': '2xl',
    'xx-large': '2xl',
    'xxlarge': '2xl',
    '2x-large': '2xl',
    'xx large': '2xl',
    // 3XL
    '3xl': '3xl',
    'xxxl': '3xl',
    '3x': '3xl',
    'xxx-large': '3xl',
    'xxxlarge': '3xl',
    '3x-large': '3xl',
    // 4XL
    '4xl': '4xl',
    'xxxxl': '4xl',
    '4x': '4xl',
    // Youth sizes
    'ys': 'ys',
    'youth small': 'ys',
    'youth s': 'ys',
    'ym': 'ym',
    'youth medium': 'ym',
    'youth m': 'ym',
    'yl': 'yl',
    'youth large': 'yl',
    'youth l': 'yl',
    'yxl': 'yxl',
    'youth xl': 'yxl',
    'youth x-large': 'yxl',
  }

  return mappings[s] || s
}

/**
 * Lululemon women's numerical-to-letter size mapping
 * Source: lululemon.com/help/size-guide/womens
 */
const lululemonWomensNumToLetter: Record<string, string> = {
  '0': 'xxxs',
  '2': 'xxs',
  '4': 'xs',
  '6': 's',
  '8': 'm',
  '10': 'l',
  '12': 'xl',
  '14': 'xl',
  '16': '1x',
  '18': '1x',
  '20': '2x',
}

/**
 * Filter size entries to only include available sizes
 * Optionally accepts brand/gender for brand-specific numerical-to-letter mapping
 */
function filterSizesByAvailability(
  sizes: SizeEntry[],
  availableSizes: string[],
  brand?: string,
  gender?: string
): SizeEntry[] {
  const isLululemonWomens = brand?.toLowerCase() === 'lululemon' &&
    gender?.toLowerCase() === 'women'

  // Normalize all available sizes, applying brand-specific mapping if needed
  const normalizedAvailable = new Set(
    availableSizes.map(s => {
      const normalized = normalizeSize(s)
      if (isLululemonWomens && lululemonWomensNumToLetter[normalized]) {
        return lululemonWomensNumToLetter[normalized]
      }
      return normalized
    })
  )

  // Filter size entries that match available sizes
  return sizes.filter(entry => {
    const normalizedLabel = normalizeSize(entry.label)
    return normalizedAvailable.has(normalizedLabel)
  })
}

/**
 * Get all available clothing combos for a brand
 */
export function getAvailableCombos(brand: string): ClothingCombo[] {
  const data = sizeGuidesCm as SizeGuideData
  const combos: ClothingCombo[] = []

  for (const entry of data.brands) {
    if (entry.brand.toLowerCase() === brand.toLowerCase()) {
      combos.push({
        clothing_type: entry.clothing_type,
        gender: entry.gender
      })
    }
  }

  return combos
}

/**
 * Get size guide entry for a specific brand, clothing type, and gender
 */
function getSizeGuideEntry(
  brand: string,
  clothingType: string,
  gender: string,
  data: SizeGuideData
): BrandEntry | null {
  return data.brands.find(
    entry =>
      entry.brand.toLowerCase() === brand.toLowerCase() &&
      entry.clothing_type.toLowerCase() === clothingType.toLowerCase() &&
      entry.gender.toLowerCase() === gender.toLowerCase()
  ) || null
}

/**
 * Rule-based combo selection using keyword matching
 * Analyzes item fields and descriptions to determine clothing type and gender
 */
function selectCombo(
  item: ItemData & { brand: string },
  availableCombos: ClothingCombo[]
): ClothingCombo {
  // Determine target clothing type: tops, bottoms, or sweater
  let targetType = isBottomType(item.type || '') ? 'bottoms' : 'tops'

  // For Duke brand, check if item name contains "sweater" to use sweater size guide
  const brandLower = item.brand.toLowerCase()
  if ((brandLower === 'duke' || brandLower === 'duke university') && targetType === 'tops') {
    const nameLower = (item.name || '').toLowerCase()
    if (nameLower.includes('sweater')) {
      targetType = 'sweater'
    }
  }

  // Determine target gender
  let targetGender = 'unisex' // default
  const itemGender = (item.gender || '').toLowerCase()

  if (itemGender === 'mens' || itemGender === 'men') {
    targetGender = 'men'
  } else if (itemGender === 'womens' || itemGender === 'women') {
    targetGender = 'women'
  }

  // Priority 1: Exact match (type + gender)
  let match = availableCombos.find(
    c => c.clothing_type === targetType && c.gender === targetGender
  )
  if (match) return match

  // Priority 2: Match type with unisex gender
  match = availableCombos.find(
    c => c.clothing_type === targetType && c.gender === 'unisex'
  )
  if (match) return match

  // Priority 3: Match type with men (fallback)
  match = availableCombos.find(
    c => c.clothing_type === targetType && c.gender === 'men'
  )
  if (match) return match

  // Priority 4: Match type with any gender
  match = availableCombos.find(c => c.clothing_type === targetType)
  if (match) return match

  // Priority 5: Match gender with tops
  match = availableCombos.find(
    c => c.clothing_type === 'tops' && c.gender === targetGender
  )
  if (match) return match

  // Priority 6: Any tops
  match = availableCombos.find(c => c.clothing_type === 'tops')
  if (match) return match

  // Last resort: first available combo
  return availableCombos[0]
}

/**
 * Average two Measurement values. Handles min/max ranges and single values.
 */
function avgMeasurement(a: Measurement, b: Measurement): Measurement {
  const aMin = a.min ?? a.value
  const aMax = a.max ?? a.value
  const bMin = b.min ?? b.value
  const bMax = b.max ?? b.value

  if (aMin !== undefined && aMax !== undefined && bMin !== undefined && bMax !== undefined) {
    const min = Math.round(((aMin + bMin) / 2) * 10) / 10
    const max = Math.round(((aMax + bMax) / 2) * 10) / 10
    return min === max ? { value: min } : { min, max }
  }
  // Fallback: use whichever has data
  return a.value !== undefined || a.min !== undefined ? a : b
}

/**
 * Build unisex size entries by averaging men's and women's guides.
 * For sizes in both: average all shared measurements.
 * For sizes in only one: use that guide's values directly.
 */
function buildUnisexSizes(menSizes: SizeEntry[], womenSizes: SizeEntry[]): SizeEntry[] {
  // Index by normalized label
  const menByLabel = new Map<string, SizeEntry>()
  for (const s of menSizes) menByLabel.set(normalizeSize(s.label), s)

  const womenByLabel = new Map<string, SizeEntry>()
  for (const s of womenSizes) womenByLabel.set(normalizeSize(s.label), s)

  // Collect all unique labels in canonical order
  const SIZE_ORDER = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl']
  const allLabels = new Set<string>()
  for (const s of menSizes) allLabels.add(normalizeSize(s.label))
  for (const s of womenSizes) allLabels.add(normalizeSize(s.label))

  const sortedLabels = [...allLabels].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a)
    const ib = SIZE_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return 0
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  const result: SizeEntry[] = []
  for (const label of sortedLabels) {
    const men = menByLabel.get(label)
    const women = womenByLabel.get(label)

    if (men && women) {
      // Average all measurement keys from both
      const allKeys = new Set([
        ...Object.keys(men.measurements),
        ...Object.keys(women.measurements)
      ])
      const measurements: Record<string, Measurement> = {}
      for (const key of allKeys) {
        const mVal = men.measurements[key]
        const wVal = women.measurements[key]
        if (mVal && wVal) {
          measurements[key] = avgMeasurement(mVal, wVal)
        } else {
          measurements[key] = mVal || wVal
        }
      }
      result.push({ label: men.label, measurements })
    } else {
      // Only one gender has this size — use it as-is
      result.push(men || women!)
    }
  }
  return result
}

/**
 * Collect size guide data for an item
 * Returns size measurements in both cm and inch, filtered by available sizes
 *
 * For unisex items: dynamically averages men's and women's guides
 * instead of using precomputed unisex data.
 *
 * @param item - Item with brand identified (must have availableSizes)
 */
export function collectSizeGuide(
  item: ItemData & { brand: string }
): SizeGuide | null {
  const availableSizes = item.availableSizes || []
  const availableCombos = getAvailableCombos(item.brand)

  if (availableCombos.length === 0) {
    return null
  }

  // Select the best combo using rule-based keyword matching (determines clothing type)
  const selectedCombo = selectCombo(item, availableCombos)
  const clothingType = selectedCombo.clothing_type

  // Determine effective gender from item
  const itemGender = (item.gender || '').toLowerCase()
  const isUnisex = itemGender !== 'men' && itemGender !== 'mens' &&
    itemGender !== 'women' && itemGender !== 'womens'

  const cmData = sizeGuidesCm as SizeGuideData
  const inchData = sizeGuidesInch as SizeGuideData

  let cmSizes: SizeEntry[]
  let inchSizes: SizeEntry[]
  let effectiveGender: string

  if (isUnisex) {
    // Dynamically build unisex by averaging men's and women's guides
    const menCm = getSizeGuideEntry(item.brand, clothingType, 'men', cmData)
    const womenCm = getSizeGuideEntry(item.brand, clothingType, 'women', cmData)
    const menInch = getSizeGuideEntry(item.brand, clothingType, 'men', inchData)
    const womenInch = getSizeGuideEntry(item.brand, clothingType, 'women', inchData)

    if (!menCm && !womenCm) return null
    cmSizes = buildUnisexSizes(menCm?.sizes || [], womenCm?.sizes || [])
    inchSizes = buildUnisexSizes(menInch?.sizes || [], womenInch?.sizes || [])
    effectiveGender = 'unisex'
  } else {
    const gender = (itemGender === 'mens' || itemGender === 'men') ? 'men' : 'women'
    const cmEntry = getSizeGuideEntry(item.brand, clothingType, gender, cmData)
    const inchEntry = getSizeGuideEntry(item.brand, clothingType, gender, inchData)
    if (!cmEntry && !inchEntry) return null
    cmSizes = cmEntry?.sizes || []
    inchSizes = inchEntry?.sizes || []
    effectiveGender = gender
  }

  // Filter by available sizes if provided
  let filteredCm = cmSizes
  let filteredInch = inchSizes

  if (availableSizes.length > 0) {
    filteredCm = filterSizesByAvailability(cmSizes, availableSizes, item.brand, item.gender)
    filteredInch = filterSizesByAvailability(inchSizes, availableSizes, item.brand, item.gender)
  }

  return {
    brand: item.brand,
    clothing_type: clothingType,
    gender: effectiveGender,
    cm: filteredCm,
    inch: filteredInch
  }
}

/**
 * Convert a letter size recommendation back to lululemon women's numerical size.
 * Only converts when the item's available sizes are actually numerical.
 * Returns the original size if no conversion applies.
 */
export function convertSizeForDisplay(
  size: string,
  brand?: string,
  gender?: string,
  availableSizes?: string[]
): string {
  if (!size) return size

  // Normalize short-form size labels (2X → 2XL, 3X → 3XL, etc.)
  const shortFormMap: Record<string, string> = {
    '2X': '2XL',
    '3X': '3XL',
    '4X': '4XL',
  }
  const upper = size.toUpperCase().trim()
  if (shortFormMap[upper]) {
    size = shortFormMap[upper]
  }

  if (brand?.toLowerCase() !== 'lululemon' || gender?.toLowerCase() !== 'women') return size

  // Only convert if the item's available sizes are numerical
  const hasNumericalSizes = availableSizes?.some(s => /^\d+$/.test(s.trim()))
  if (!hasNumericalSizes) return size

  // Reverse mapping: letter → smallest numerical equivalent
  const letterToNum: Record<string, string> = {
    'xxxs': '0',
    'xxs': '2',
    'xs': '4',
    's': '6',
    'm': '8',
    'l': '10',
    'xl': '12',
    '1x': '16',
    '2x': '20',
  }

  const normalized = size.toLowerCase().trim()
  return letterToNum[normalized] || size
}

/**
 * Detect whether a clothing type string refers to bottoms
 */
export function isBottomType(type: string): boolean {
  const t = (type || '').toLowerCase()
  return t === 'bottoms' || t === 'bottom'
}

export type { SizeEntry, Measurement }
