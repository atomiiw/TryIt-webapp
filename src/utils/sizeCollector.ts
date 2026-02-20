import type { ItemData } from '../App'
import sizeGuidesCm from '../data/size_guides_cm.json'
import sizeGuidesInch from '../data/size_guides_inch.json'

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
 * Filter size entries to only include available sizes
 */
function filterSizesByAvailability(
  sizes: SizeEntry[],
  availableSizes: string[]
): SizeEntry[] {
  // Normalize all available sizes
  const normalizedAvailable = new Set(
    availableSizes.map(s => normalizeSize(s))
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
  const itemType = (item.type || '').toLowerCase()
  let targetType = (itemType === 'bottoms') ? 'bottoms' : 'tops'

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
 * Collect size guide data for an item
 * Returns size measurements in both cm and inch, filtered by available sizes
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

  // Select the best combo using rule-based keyword matching
  const selectedCombo = selectCombo(item, availableCombos)


  // Get size data from both cm and inch guides
  const cmData = sizeGuidesCm as SizeGuideData
  const inchData = sizeGuidesInch as SizeGuideData

  const cmEntry = getSizeGuideEntry(
    item.brand,
    selectedCombo.clothing_type,
    selectedCombo.gender,
    cmData
  )

  const inchEntry = getSizeGuideEntry(
    item.brand,
    selectedCombo.clothing_type,
    selectedCombo.gender,
    inchData
  )

  if (!cmEntry && !inchEntry) {
    return null
  }

  // Get raw size data
  const cmSizes = cmEntry?.sizes || []
  const inchSizes = inchEntry?.sizes || []

  // Filter by available sizes if provided
  let filteredCm = cmSizes
  let filteredInch = inchSizes

  if (availableSizes.length > 0) {
    filteredCm = filterSizesByAvailability(cmSizes, availableSizes)
    filteredInch = filterSizesByAvailability(inchSizes, availableSizes)
  }

  return {
    brand: item.brand,
    clothing_type: selectedCombo.clothing_type,
    gender: selectedCombo.gender,
    cm: filteredCm,
    inch: filteredInch
  }
}

export type { SizeEntry, Measurement }
