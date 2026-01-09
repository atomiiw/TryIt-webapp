/**
 * UPC to SKU Lookup Utility
 * Looks up product SKU from UPC barcode using local JSON lookup table
 */

// Import local UPC to SKU mapping
import upcToSkuData from '../data/upcToSku.json'

// Type the imported JSON
const upcToSku: Record<string, string> = upcToSkuData

export interface UPCLookupResult {
  success: boolean
  sku: string | null
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
      error: 'UPC code is required'
    }
  }

  console.log(`🔍 Looking up UPC: ${cleaned} (${cleaned.length} digits)`)

  // Try multiple variations to handle check digit / leading zero differences
  const variations: string[] = [
    cleaned,                    // Full scanned value (12-13 digits)
    cleaned.slice(0, -1),       // Remove check digit (11-12 digits)
    cleaned.slice(1),           // Remove leading zero (11-12 digits)
    cleaned.slice(1, -1),       // Remove both (10-11 digits)
  ]

  for (const variation of variations) {
    if (!variation) continue

    const sku = upcToSku[variation]
    if (sku) {
      console.log(`✅ Found SKU: ${sku} (matched UPC: ${variation})`)
      return {
        success: true,
        sku
      }
    }
  }

  // Not found in lookup table
  console.log(`❌ UPC not found in lookup table: ${cleaned}`)
  return {
    success: false,
    sku: null,
    error: `UPC not found: ${cleaned}`
  }
}

export default lookupSKUByUPC
