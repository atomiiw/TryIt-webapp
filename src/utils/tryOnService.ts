/**
 * Try-On Service
 * Generates virtual try-on images using the Duke Gemini try-on backend endpoint
 *
 * Input:
 *   - avatarBase64: User's photo as base64
 *   - clothingImageUrl: URL of the clothing image
 *   - clothingInfo: Name, type, color, specificType of the clothing
 *   - fitType: 'tight', 'regular', or 'comfortable'
 */

import { chooseWatermark, getWatermarkLogoPath } from './chooseWatermark'

// Backend API endpoint
const BACKEND_URL = 'https://closai-backend.vercel.app'

// Fit type for try-on generation
export type FitType = 'tight' | 'regular' | 'comfortable'

// Clothing item info
export interface ClothingInfo {
  name: string
  type: string        // 'top', 'bottom', etc.
  color: string
  specificType?: string  // 'tee', 'hoodie', etc.
}

// Try-on result
export interface TryOnResult {
  imageDataUrl: string | null
  analysisText?: string
  success: boolean
  error?: string
}

/**
 * Extract base64 from data URL or return as-is if already base64
 */
function extractBase64(imageData: string): string {
  if (imageData.startsWith('data:')) {
    return imageData.split(',')[1]
  }
  return imageData
}

// Supported Gemini aspect ratios with fixed pixel sizes
const GEMINI_ASPECT_RATIOS = [
  { ratio: '1:1', value: 1, width: 1280, height: 1280 },
  { ratio: '2:3', value: 2/3, width: 853, height: 1280 },
  { ratio: '3:2', value: 3/2, width: 1280, height: 853 },
  { ratio: '3:4', value: 3/4, width: 960, height: 1280 },
  { ratio: '4:3', value: 4/3, width: 1280, height: 960 },
  { ratio: '4:5', value: 4/5, width: 1024, height: 1280 },
  { ratio: '5:4', value: 5/4, width: 1280, height: 1024 },
  { ratio: '9:16', value: 9/16, width: 720, height: 1280 },
  { ratio: '16:9', value: 16/9, width: 1280, height: 720 },
  { ratio: '21:9', value: 21/9, width: 1280, height: 549 }
]

/**
 * Find the closest Gemini-supported aspect ratio for given dimensions
 */
function findClosestAspectRatio(width: number, height: number): { ratio: string; width: number; height: number } {
  const imageRatio = width / height

  let closest = GEMINI_ASPECT_RATIOS[0]
  let minDiff = Math.abs(imageRatio - closest.value)

  for (const ar of GEMINI_ASPECT_RATIOS) {
    const diff = Math.abs(imageRatio - ar.value)
    if (diff < minDiff) {
      minDiff = diff
      closest = ar
    }
  }

  console.log(`📐 Image ratio: ${imageRatio.toFixed(3)}, closest Gemini ratio: ${closest.ratio} (${closest.width}x${closest.height})`)
  return { ratio: closest.ratio, width: closest.width, height: closest.height }
}

/**
 * Get image dimensions from a data URL
 */
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Crop and resize image to target aspect ratio and fixed pixel size (center crop)
 */
function cropAndResizeToTarget(dataUrl: string, targetRatio: string, targetWidth: number, targetHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const [ratioW, ratioH] = targetRatio.split(':').map(Number)
      const targetAspect = ratioW / ratioH
      const imgAspect = img.width / img.height

      let cropWidth = img.width
      let cropHeight = img.height
      let offsetX = 0
      let offsetY = 0

      if (imgAspect > targetAspect) {
        // Image is wider - crop sides
        cropWidth = img.height * targetAspect
        offsetX = (img.width - cropWidth) / 2
      } else if (imgAspect < targetAspect) {
        // Image is taller - crop top/bottom
        cropHeight = img.width / targetAspect
        offsetY = (img.height - cropHeight) / 2
      }

      // Create canvas at target fixed size
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      // Draw cropped region scaled to target size
      ctx.drawImage(img, offsetX, offsetY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

      console.log(`✂️ Cropped & resized image from ${img.width}x${img.height} to ${targetWidth}x${targetHeight} (${targetRatio})`)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Process user image: detect dimensions, find closest aspect ratio, crop and resize to fixed size
 */
async function processUserImage(imageData: string): Promise<{ base64: string; aspectRatio: string }> {
  // Ensure we have a data URL
  const dataUrl = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`

  // Get dimensions
  const { width, height } = await getImageDimensions(dataUrl)
  console.log(`📷 User image dimensions: ${width}x${height}`)

  // Find closest aspect ratio with target dimensions
  const { ratio: aspectRatio, width: targetWidth, height: targetHeight } = findClosestAspectRatio(width, height)

  // Crop and resize to fixed target size
  const processedDataUrl = await cropAndResizeToTarget(dataUrl, aspectRatio, targetWidth, targetHeight)

  // Extract base64
  const base64 = extractBase64(processedDataUrl)

  return { base64, aspectRatio }
}

/**
 * Download image from URL and convert to base64
 * Uses backend proxy for Duke store images to avoid CORS issues
 */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  // Use backend proxy for Duke store images to avoid CORS
  if (imageUrl.includes('shop.duke.edu/site/img/')) {
    const imagePath = imageUrl.split('shop.duke.edu/site/img/')[1]
    const proxyUrl = `${BACKEND_URL}/api/duke/image-proxy?path=${encodeURIComponent(imagePath)}`

    const response = await fetch(proxyUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image via proxy: ${response.status}`)
    }
    const data = await response.json()
    return data.base64
  }

  // For non-Duke images, fetch directly
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`)
  }
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      // Extract base64 from data URL
      const base64 = dataUrl.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Add watermark to image and return as data URL
 * Automatically chooses white or black logo based on background brightness
 */
async function addWatermark(imageSrc: string): Promise<string> {
  // Determine which watermark color to use based on the TryIt logo region
  const watermarkColor = await chooseWatermark(imageSrc)
  const logoPath = getWatermarkLogoPath(watermarkColor)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const logo = new Image()
      logo.crossOrigin = 'anonymous'
      logo.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        // Watermark settings: 100px height, 40px from right, 20px from bottom
        const logoHeight = 100
        const logoWidth = (logo.width / logo.height) * logoHeight
        const logoX = canvas.width - logoWidth - 40
        const logoY = canvas.height - logoHeight - 20

        ctx.globalAlpha = 0.6
        ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight)
        ctx.globalAlpha = 1

        resolve(canvas.toDataURL('image/png'))
      }
      logo.onerror = () => reject(new Error('Could not load logo'))
      logo.src = logoPath
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = imageSrc
  })
}

/**
 * Generate fit-specific prompt for try-on
 */
function generateTryOnPrompt(clothingInfo: ClothingInfo, fitType: FitType): string {
  const itemName = clothingInfo.name || 'clothing item'
  const itemType = clothingInfo.specificType || clothingInfo.type || 'garment'
  const itemColor = clothingInfo.color && clothingInfo.color !== 'N/A' ? clothingInfo.color : ''

  const colorDesc = itemColor ? `${itemColor} ` : ''

  // Determine if clothing is top or bottom for complementary piece
  const isTop = ['shirt', 't-shirt', 'tee', 'top', 'blouse', 'sweater', 'hoodie', 'jacket', 'coat', 'polo', 'tank'].some(
    t => itemType.toLowerCase().includes(t)
  )
  const complementaryPiece = isTop
    ? 'Add basic neutral pants or jeans as the bottom if needed.'
    : 'Add a basic neutral top/shirt if needed.'
  const removeJacketInstruction = isTop
    ? ' REMOVE any jacket, hoodie, or outer layer first.'
    : ''

  // Fit-specific prompts
  const prompts: Record<FitType, string> = {
    tight: `VIRTUAL TRY-ON: First remove all existing clothes from the person, then dress them in the ${colorDesc}${itemType} "${itemName}".${removeJacketInstruction}

FIT: The ${itemType} should show the body shape and slightly tightly wrap around the body. The fabric should gently hug the torso and hips, defining the person's silhouette. Wear in the most BASIC way - NO rolling hem, NO tucking, no rolling sleeves, no knots, just plain and simple.

CRITICAL: Do NOT layer clothes. If the new ${itemType} is short-sleeve, the person's arms must be BARE from the sleeve edge down - no long sleeves showing underneath. Remove ALL original clothing first.

RULES:
- Don't tuck shirt into pants - show full style and hem
- If person is wearing a DRESS: remove the entire dress and ${complementaryPiece.toLowerCase()}
- If person is wearing two pieces (top + bottom): ONLY replace the matching piece - keep their other piece unchanged
- Do NOT put the new ${itemType} on top of existing clothes - replace, don't layer
- NEVER show original sleeves under new sleeves - if new shirt is short-sleeve, arms are bare
- If the new ${itemType} is shorts but the person is wearing pants, show their bare legs
- Keep exact same color as the provided ${itemType}
- Any text, letters, or logos on the ${itemType} must match EXACTLY - same words, same spelling, same design
- Keep ALL colors the same including the colors of any words, letters, or graphics on the ${itemType}
- Keep person's pose, face, and background unchanged`,

    regular: `VIRTUAL TRY-ON: First remove all existing clothes from the person, then dress them in the ${colorDesc}${itemType} "${itemName}".${removeJacketInstruction}

FIT: The ${itemType} should be TRUE TO SIZE and fitting but comfortably fit instead of tightly fit. The garment fits the person correctly with some natural ease, not clinging or loose. Wear in the most BASIC way - NO rolling hem, NO tucking, no rolling sleeves, no knots, just plain and simple.

CRITICAL: Do NOT layer clothes. If the new ${itemType} is short-sleeve, the person's arms must be BARE from the sleeve edge down - no long sleeves showing underneath. Remove ALL original clothing first.

RULES:
- Don't tuck shirt into pants - show full style and hem
- If person is wearing a DRESS: remove the entire dress and ${complementaryPiece.toLowerCase()}
- If person is wearing two pieces (top + bottom): ONLY replace the matching piece - keep their other piece unchanged
- Do NOT put the new ${itemType} on top of existing clothes - replace, don't layer
- NEVER show original sleeves under new sleeves - if new shirt is short-sleeve, arms are bare
- If the new ${itemType} is shorts but the person is wearing pants, show their bare legs
- Keep exact same color as the provided ${itemType}
- Any text, letters, or logos on the ${itemType} must match EXACTLY - same words, same spelling, same design
- Keep ALL colors the same including the colors of any words, letters, or graphics on the ${itemType}
- Keep person's pose, face, and background unchanged`,

    comfortable: `VIRTUAL TRY-ON: First remove all existing clothes from the person, then dress them in the ${colorDesc}${itemType} "${itemName}".${removeJacketInstruction}

FIT: The ${itemType} should be SLIGHTLY LOOSE and SLIGHTLY OVERSIZED but still true to size. The garment has extra room around the body with relaxed drape, but is not excessively baggy or drowning the person. Wear in the most BASIC way - NO rolling hem, NO tucking, no rolling sleeves, no knots, just plain and simple.

CRITICAL: Do NOT layer clothes. If the new ${itemType} is short-sleeve, the person's arms must be BARE from the sleeve edge down - no long sleeves showing underneath. Remove ALL original clothing first.

RULES:
- Don't tuck shirt into pants - show full style and hem
- If person is wearing a DRESS: remove the entire dress and ${complementaryPiece.toLowerCase()}
- If person is wearing two pieces (top + bottom): ONLY replace the matching piece - keep their other piece unchanged
- Do NOT put the new ${itemType} on top of existing clothes - replace, don't layer
- NEVER show original sleeves under new sleeves - if new shirt is short-sleeve, arms are bare
- If the new ${itemType} is shorts but the person is wearing pants, show their bare legs
- Keep exact same color as the provided ${itemType}
- Any text, letters, or logos on the ${itemType} must match EXACTLY - same words, same spelling, same design
- Keep ALL colors the same including the colors of any words, letters, or graphics on the ${itemType}
- Keep person's pose, face, and background unchanged`
  }

  return prompts[fitType]
}

/**
 * Generate a virtual try-on image
 *
 * @param userImage - User's photo (base64 or data URL)
 * @param clothingImageUrl - URL of the clothing image
 * @param clothingInfo - Info about the clothing item
 * @param fitType - Fit type: 'tight', 'regular', or 'comfortable' (defaults to 'regular')
 * @returns Try-on result with generated image
 */
export async function generateTryOnImage(
  userImage: string,
  clothingImageUrl: string,
  clothingInfo: ClothingInfo,
  fitType: FitType = 'regular'
): Promise<TryOnResult> {
  const fitLabel = ` (${fitType} fit)`
  console.log(`🎨 Starting try-on generation for: ${clothingInfo.name}${fitLabel}...`)

  try {
    // Process user image: detect dimensions, find closest aspect ratio, crop if needed
    console.log('🔄 Processing user image...')
    const { base64: avatarBase64, aspectRatio } = await processUserImage(userImage)
    console.log(`✅ User image processed (aspect ratio: ${aspectRatio})`)

    // Download and convert clothing image to base64
    console.log('🔄 Fetching clothing image...')
    const clothingBase64 = await imageUrlToBase64(clothingImageUrl)
    console.log('✅ Clothing image fetched')

    // Generate fit-specific prompt
    const prompt = generateTryOnPrompt(clothingInfo, fitType)

    // Log the actual prompt for debugging
    console.log(`📝 ${fitType.toUpperCase()} PROMPT:\n`, prompt)

    // Call the Duke try-on endpoint
    console.log('📤 Calling Gemini try-on API (Duke endpoint)...')
    const startTime = Date.now()

    const response = await fetch(`${BACKEND_URL}/api/gemini-tryon-duke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        avatarBase64,
        clothingBase64Images: [clothingBase64],
        prompt,
        aspectRatio
      })
    })

    const generationTime = Date.now() - startTime
    console.log(`⏱️ Gemini API response time: ${generationTime}ms (${(generationTime / 1000).toFixed(2)}s)`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `API error: ${response.status}`)
    }

    const data = await response.json()

    // Parse Gemini response
    const candidate = data.candidates?.[0]
    if (candidate) {
      let imageDataUrl: string | null = null
      let analysisText: string | undefined

      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.mimeType?.includes('image')) {
          imageDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
        }
        if (part.text) {
          analysisText = part.text
        }
      }

      if (imageDataUrl) {
        console.log(`✅ Generated try-on image for: ${clothingInfo.name}${fitLabel}`)

        // Add watermark before returning
        console.log('🎨 Adding watermark...')
        const watermarkedImage = await addWatermark(imageDataUrl)
        console.log('✅ Watermark added')

        return {
          imageDataUrl: watermarkedImage,
          analysisText,
          success: true
        }
      }
    }

    throw new Error('No image in response')

  } catch (err) {
    console.error(`❌ Try-on generation failed:`, err)
    return {
      imageDataUrl: null,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
