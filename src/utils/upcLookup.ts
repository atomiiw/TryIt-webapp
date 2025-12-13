/**
 * UPC to SKU Lookup Utility
 * Looks up product SKU from UPC barcode using Duke NetSuite API
 */

// NetSuite API configuration
const DUKE_API_BASE = 'https://shop.duke.edu/api/items'
const COMPANY_ID = '4811716'

// API response types
interface MatrixChildItem {
  itemid: string
  internalid: number
  custitem_duke_size?: string
  custitem_duke_color?: string
  isinstock?: boolean
  quantityavailable?: number
}

interface ItemResponse {
  itemid: string
  internalid: number
  displayname?: string
  storedisplayname2?: string
  matrixchilditems_detail?: MatrixChildItem[]
  itemimages_detail?: {
    urls: Array<{ url: string; altimagetext?: string }>
  }
}

interface APIResponse {
  items?: ItemResponse[]
}

export interface UPCLookupResult {
  success: boolean
  sku: string | null
  itemid: string | null
  displayName: string | null
  internalId: number | null
  imageUrl: string | null
  error?: string
}

/**
 * Extract the numeric SKU prefix from an itemid
 * e.g., "29088-ROY-S" → "29088", "29088" → "29088"
 */
function extractSKU(itemid: string): string {
  const match = itemid.match(/^(\d+)/)
  return match ? match[1] : itemid
}

/**
 * Look up product SKU from UPC barcode
 * @param upc - The UPC barcode value (e.g., "0198237901297")
 * @returns Promise resolving to lookup result with SKU
 */
export async function lookupSKUByUPC(upc: string): Promise<UPCLookupResult> {
  // Clean the UPC - remove any whitespace
  const cleanUPC = upc.trim()

  if (!cleanUPC) {
    return {
      success: false,
      sku: null,
      itemid: null,
      displayName: null,
      internalId: null,
      imageUrl: null,
      error: 'UPC code is required'
    }
  }

  const url = `${DUKE_API_BASE}?c=${COMPANY_ID}&upc=${encodeURIComponent(cleanUPC)}&fieldset=details`

  try {
    console.log(`🔍 Looking up UPC: ${cleanUPC}`)

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    const data: APIResponse = await response.json()

    // Check if we got any items
    if (!data.items || data.items.length === 0) {
      console.log(`❌ No product found for UPC: ${cleanUPC}`)
      return {
        success: false,
        sku: null,
        itemid: null,
        displayName: null,
        internalId: null,
        imageUrl: null,
        error: 'No product found for this UPC'
      }
    }

    // Get the first matching item (parent item)
    const item = data.items[0]
    const sku = extractSKU(item.itemid)
    const imageUrl = item.itemimages_detail?.urls?.[0]?.url || null

    console.log(`✅ Found SKU: ${sku} for UPC: ${cleanUPC}`)

    return {
      success: true,
      sku,
      itemid: item.itemid,
      displayName: item.storedisplayname2 || item.displayname || null,
      internalId: item.internalid,
      imageUrl
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error(`❌ UPC lookup failed: ${errorMessage}`)

    return {
      success: false,
      sku: null,
      itemid: null,
      displayName: null,
      internalId: null,
      imageUrl: null,
      error: errorMessage
    }
  }
}

/**
 * Batch lookup multiple UPCs
 * @param upcs - Array of UPC codes
 * @returns Promise resolving to array of lookup results
 */
export async function batchLookupSKUs(upcs: string[]): Promise<UPCLookupResult[]> {
  const results = await Promise.all(upcs.map(upc => lookupSKUByUPC(upc)))
  return results
}

export default lookupSKUByUPC
