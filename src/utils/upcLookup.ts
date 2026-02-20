/**
 * UPC Lookup Utility
 * Looks up product SKU and internalId from UPC barcode using local JSON lookup table
 */

// Import local UPC lookup mapping
import upcLookupData from '../data/upcLookup.json'

// Type the imported JSON
const upcLookup: Record<string, { sku: string; internalId: string }> = upcLookupData

export interface UPCLookupResult {
  success: boolean
  sku: string | null
  internalId: string | null
  matchedUpc?: string  // The UPC variation that matched
  error?: string
}

/**
 * Look up product SKU from UPC barcode using local JSON table
 * Tries multiple UPC format variations to handle different digit lengths
 * @param upc - The UPC barcode value
 * @returns Lookup result with SKU or error
 */
export function lookupSKUByUPC(upc: string): UPCLookupResult {
  // Clean the UPC - digits only
  const cleaned = upc.trim().replace(/\D/g, '')

  if (!cleaned) {
    return {
      success: false,
      sku: null,
      internalId: null,
      error: 'UPC code is required'
    }
  }


  // Try multiple variations to handle check digit / leading zero differences
  const variations: string[] = [
    cleaned,                    // Full scanned value (12-13 digits)
    cleaned.slice(0, -1),       // Remove check digit (11-12 digits)
    cleaned.slice(1),           // Remove leading zero (11-12 digits)
    cleaned.slice(1, -1),       // Remove both (10-11 digits)
  ]

  for (const variation of variations) {
    if (!variation) continue

    const result = upcLookup[variation]
    if (result) {
      return {
        success: true,
        sku: result.sku,
        internalId: result.internalId,
        matchedUpc: variation
      }
    }
  }

  // Not found in lookup table
  return {
    success: false,
    sku: null,
    internalId: null,
    error: `UPC not found: ${cleaned}`
  }
}

export default lookupSKUByUPC
