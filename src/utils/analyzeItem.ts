import type { ItemData } from '../App'
import { identifyBrand } from './brandIdentifier'
import { collectSizeGuide } from './sizeCollector'

/**
 * Analyze item: normalize sizes, identify brand, and collect size guide.
 * Pure function — no component state dependency.
 */
export async function analyzeItem(rawItem: ItemData): Promise<ItemData> {
  // Normalize availableSizes to abbreviations (S, M, L, XL, 2XL, etc.)
  if (rawItem.availableSizes) {
    const sizeMap: Record<string, string> = {
      'x-small': 'XS', 'xsmall': 'XS', 'extra small': 'XS', 'x small': 'XS',
      'small': 'S', 'sm': 'S',
      'medium': 'M', 'med': 'M',
      'large': 'L', 'lg': 'L',
      'x-large': 'XL', 'xlarge': 'XL', 'extra large': 'XL', 'x large': 'XL',
      'xx-large': '2XL', 'xxlarge': '2XL', 'xxl': '2XL', 'xx large': '2XL', '2x': '2XL',
      'xxx-large': '3XL', 'xxxlarge': '3XL', 'xxxl': '3XL', '3x': '3XL',
      'xxxx-large': '4XL', 'xxxxlarge': '4XL', 'xxxxl': '4XL', '4x': '4XL',
      'youth small': 'YS', 'youth s': 'YS',
      'youth medium': 'YM', 'youth m': 'YM',
      'youth large': 'YL', 'youth l': 'YL',
      'youth x-large': 'YXL', 'youth xl': 'YXL',
    }
    const normalized = rawItem.availableSizes.map(s =>
      sizeMap[s.toLowerCase().trim()] || s.toUpperCase().trim()
    )

    // Sort by canonical size order so formatSizeRange displays correct range
    const canonicalOrder = [
      '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20',
      'XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL',
      'YS', 'YM', 'YL', 'YXL',
    ]
    normalized.sort((a, b) => {
      const idxA = canonicalOrder.indexOf(a)
      const idxB = canonicalOrder.indexOf(b)
      // Unknown sizes go to the end, preserving relative order
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })

    rawItem = { ...rawItem, availableSizes: normalized }
  }

  // Step 1: Identify brand
  let brand: string
  try {
    brand = identifyBrand(rawItem)
  } catch (brandErr) {
    brand = 'Duke' // fallback
  }

  // Step 2: Infer gender — priority: title > description (raw HTML) > backend value (commercecategory)
  let gender = rawItem.gender
  const nameLower = rawItem.name.toLowerCase()
  const descLower = (rawItem.fullDescription || '').toLowerCase()

  // Source 1 (highest priority): Title
  if (nameLower.includes("women's") || nameLower.includes('womens')) {
    gender = 'women'
  } else if (nameLower.includes("men's") || nameLower.includes('mens')) {
    gender = 'men'
  }
  // Source 2: Description text (includes preserved link URLs from backend)
  else if (/\bwomen'?s\b/.test(descLower) || descLower.includes('size-guide/womens') || descLower.includes('size_guide/womens')) {
    gender = 'women'
  } else if (/\bmen'?s\b/.test(descLower) || descLower.includes('size-guide/mens') || descLower.includes('size_guide/mens')) {
    gender = 'men'
  }
  // Source 3: fall through to rawItem.gender (backend's commercecategory-based value)

  // Step 2b: Infer type from item name if backend defaulted to 'top'
  let type = rawItem.type
  if (!type || type === 'top') {
    const bottomKeywords = /\b(pant|pants|jogger|joggers|shorts|legging|leggings|tight|tights)\b/
    if (bottomKeywords.test(nameLower)) {
      type = 'bottom'
    }
  }

  // Step 3: Collect size guide (rule-based keyword matching)
  const itemWithBrand = { ...rawItem, brand, gender, type }
  const sizeGuide = collectSizeGuide(itemWithBrand)

  // Return item with brand, gender, and size guide
  return {
    ...rawItem,
    brand,
    gender,
    type,
    sizeGuide: sizeGuide || undefined
  }
}
