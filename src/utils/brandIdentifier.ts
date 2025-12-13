import type { ItemData } from '../App'

// Known brands to search for in descriptions (case-insensitive)
const KNOWN_BRANDS = [
  'Champion',
  'Lululemon',
  'League',
  'Nike',
  "'47",
  'Johnnie-O',
  'Cutter & Buck',
  'Columbia',
  'Playa Society'
]

/**
 * Extracts brand from item name by finding words followed by ®
 * @param name - The item name string
 * @returns Array of brand names found (without ®)
 */
function extractBrandsFromName(name: string): string[] {
  const brands: string[] = []

  // Match word(s) immediately before ® symbol
  // Handles cases like "Duke®", "Cutter & Buck®", "'47®"
  const regex = /(['"]?\w+(?:\s*&\s*\w+)?)\s*®/g
  let match

  while ((match = regex.exec(name)) !== null) {
    const brand = match[1].trim()
    if (brand) {
      brands.push(brand)
    }
  }

  return brands
}

/**
 * Searches for known brands in text (case-insensitive)
 * @param text - Text to search in
 * @returns First matching brand or null
 */
function findKnownBrandInText(text: string): string | null {
  const lowerText = text.toLowerCase()

  for (const brand of KNOWN_BRANDS) {
    if (lowerText.includes(brand.toLowerCase())) {
      return brand
    }
  }

  return null
}

/**
 * Identifies the brand of an item using the following logic:
 * 1. Look for ® in name to find brands
 * 2. If two brands found, return the one that's not 'Duke'
 * 3. If one brand found, return it
 * 4. If no ® brands, search descriptions for known brands
 * 5. If still no brand, default to 'Duke'
 *
 * @param item - The ItemData object
 * @returns The identified brand name
 */
export function identifyBrand(item: ItemData): string {
  // Step 1: Look for ® in name
  const brandsInName = extractBrandsFromName(item.name)

  if (brandsInName.length > 0) {
    // Step 2: If two brands, pick the non-Duke one
    if (brandsInName.length >= 2) {
      const nonDukeBrand = brandsInName.find(
        brand => brand.toLowerCase() !== 'duke'
      )
      if (nonDukeBrand) {
        return nonDukeBrand
      }
    }

    // Step 3: If one brand (or all are Duke), return the first
    return brandsInName[0]
  }

  // Step 4: No ® in name, search descriptions for known brands
  const textToSearch = `${item.shortDescription} ${item.fullDescription}`
  const foundBrand = findKnownBrandInText(textToSearch)

  if (foundBrand) {
    return foundBrand
  }

  // Step 5: Default to Duke
  return 'Duke'
}

/**
 * Adds brand property to an item
 * @param item - The ItemData object
 * @returns ItemData with brand property added
 */
export function addBrandToItem(item: ItemData): ItemData & { brand: string } {
  const brand = identifyBrand(item)
  return {
    ...item,
    brand
  }
}

// Type for item with brand
export type ItemDataWithBrand = ItemData & { brand: string }
