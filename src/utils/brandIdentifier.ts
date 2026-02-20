import type { ItemData } from '../App'
import sizeGuidesCm from '../data/size_guides_cm.json'

// Derive brand names dynamically from the size guide
const SIZE_GUIDE_BRANDS = [...new Set(
  (sizeGuidesCm as { brands: { brand: string }[] }).brands.map(entry => entry.brand)
)]

// Full search list: size guide brands + "Duke University" (normalized to Duke)
const BRAND_SEARCH_LIST = [
  ...SIZE_GUIDE_BRANDS,
  'Duke University'
]

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Identifies the brand of an item by searching for "brand®" in the item name.
 *
 * 1. Search for each known brand name (from size guide) followed by ® in the item name
 * 2. If two brands found: one is always Duke/Duke University + another → return the non-Duke one
 * 3. If one brand found: return it
 * 4. If none found: default to Duke
 */
export function identifyBrand(item: ItemData): string {
  // Normalize smart/curly quotes in item name
  const name = item.name
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

  // Search for each known brand followed by ® in the item name
  const found: string[] = []

  for (const brand of BRAND_SEARCH_LIST) {
    const pattern = new RegExp(escapeRegex(brand) + '\\s*®', 'i')
    if (pattern.test(name)) {
      const normalized = (brand === 'Duke' || brand === 'Duke University') ? 'Duke' : brand
      if (!found.includes(normalized)) {
        found.push(normalized)
      }
    }
  }

  // Two brands: one is Duke + another → return the non-Duke one
  if (found.length >= 2) {
    const nonDuke = found.find(b => b !== 'Duke')
    if (nonDuke) return nonDuke
  }

  // One brand: return it
  if (found.length === 1) {
    return found[0]
  }

  // No brand found: default to Duke
  return 'Duke'
}
