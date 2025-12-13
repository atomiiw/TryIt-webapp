/**
 * Try-On Service (Demo Version)
 * Calls gemini-tryon backend API and adds watermark
 * Returns fully processed images ready for display
 */

import { chooseWatermark, getWatermarkLogoPath } from './chooseWatermark'

// Backend API endpoint
const BACKEND_URL = 'https://closai-backend.vercel.app'
const GEMINI_TRYON_API = `${BACKEND_URL}/api/gemini-tryon`

// Fit type for try-on generation
export type FitType = 'tight' | 'regular' | 'comfortable'

// Clothing item info
export interface ClothingInfo {
  name: string
  type: string
  color: string
  specificType?: string
}

// Clothing item for API
interface ClothingItemForAPI {
  name: string
  type: string
  color: string
}

// Try-on result
export interface TryOnResult {
  imageDataUrl: string | null
  success: boolean
  error?: string
}

// Supported Gemini aspect ratios with fixed pixel sizes
const GEMINI_ASPECT_RATIOS = [
  { ratio: '1:1', value: 1, width: 1024, height: 1024 },
  { ratio: '3:4', value: 3/4, width: 768, height: 1024 },
  { ratio: '4:3', value: 4/3, width: 1024, height: 768 },
  { ratio: '9:16', value: 9/16, width: 576, height: 1024 },
  { ratio: '16:9', value: 16/9, width: 1024, height: 576 }
]

/**
 * Find the closest Gemini-supported aspect ratio
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
 * Crop and resize image to target dimensions
 */
function cropAndResizeImage(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const targetAspect = targetWidth / targetHeight
      const imgAspect = img.width / img.height

      let cropWidth = img.width
      let cropHeight = img.height
      let offsetX = 0
      let offsetY = 0

      if (imgAspect > targetAspect) {
        cropWidth = img.height * targetAspect
        offsetX = (img.width - cropWidth) / 2
      } else if (imgAspect < targetAspect) {
        cropHeight = img.width / targetAspect
        offsetY = (img.height - cropHeight) / 2
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, offsetX, offsetY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Process image to Gemini-compatible size
 */
async function processImageForGemini(imageData: string): Promise<string> {
  const dataUrl = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`
  const { width, height } = await getImageDimensions(dataUrl)
  const { width: targetWidth, height: targetHeight } = findClosestAspectRatio(width, height)
  const processedDataUrl = await cropAndResizeImage(dataUrl, targetWidth, targetHeight)
  return processedDataUrl.split(',')[1] // Return base64 only
}

/**
 * Convert image URL to base64
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
      resolve(dataUrl.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Generate fit-specific prompt
 */
function generateFitPrompt(clothingInfo: ClothingInfo, fitType: FitType): string {
  const itemName = clothingInfo.name || 'clothing item'
  const itemType = clothingInfo.specificType || clothingInfo.type || 'garment'
  const itemColor = clothingInfo.color && clothingInfo.color !== 'N/A' ? clothingInfo.color : ''
  const colorDesc = itemColor ? `${itemColor} ` : ''

  const fitDescriptions: Record<FitType, string> = {
    tight: 'true-to-size, following the body shape naturally without being skin-tight',
    regular: 'slightly spacious with a little breathing room but NOT draping or baggy',
    comfortable: 'oversized but wearable, loose and roomy like one size up'
  }

  return `VIRTUAL TRY-ON: Replace the person's current shirt with the ${colorDesc}${itemType} "${itemName}".
FIT: The ${itemType} should fit ${fitDescriptions[fitType]}.
RULES:
- REMOVE all current clothing and replace with ONLY the provided ${itemType}
- Keep exact same color as the provided ${itemType}
- Keep person's pose, face, and background unchanged`
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
 * Generate a virtual try-on image with watermark
 * Returns fully processed image only when complete
 *
 * @param userImage - User's photo (base64 or data URL)
 * @param clothingImageUrl - URL of the clothing image
 * @param clothingInfo - Info about the clothing item
 * @param fitType - Fit type: 'tight', 'regular', or 'comfortable'
 * @returns Try-on result with watermarked image
 */
export async function generateTryOnImageDemo(
  userImage: string,
  clothingImageUrl: string,
  clothingInfo: ClothingInfo,
  fitType: FitType = 'regular'
): Promise<TryOnResult> {
  console.log(`🎨 [DEMO] Starting try-on generation for: ${clothingInfo.name} (${fitType} fit)...`)

  try {
    // Step 1: Process user image
    console.log('🔄 [DEMO] Processing user image...')
    const avatarBase64 = await processImageForGemini(userImage)

    // Step 2: Get clothing image
    const clothingBase64 = await imageUrlToBase64(clothingImageUrl)

    // Step 3: Build request
    const clothingItems: ClothingItemForAPI[] = [{
      name: clothingInfo.name,
      type: clothingInfo.specificType || clothingInfo.type,
      color: clothingInfo.color
    }]
    const prompt = generateFitPrompt(clothingInfo, fitType)

    // Step 4: Call backend API
    console.log('📤 [DEMO] Calling gemini-tryon API...')
    const startTime = Date.now()

    const response = await fetch(GEMINI_TRYON_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatarBase64,
        clothingBase64Images: [clothingBase64],
        clothingItems,
        prompt
      })
    })

    const generationTime = Date.now() - startTime
    console.log(`⏱️ [DEMO] API response time: ${(generationTime / 1000).toFixed(2)}s`)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('[DEMO] API error:', response.status, errorData)
      return { imageDataUrl: null, success: false, error: `API error: ${response.status}` }
    }

    const data = await response.json()

    // Step 5: Extract image from response
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const rawImageDataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`

          // Step 6: Add watermark
          console.log('🎨 [DEMO] Adding watermark...')
          const watermarkedImage = await addWatermark(rawImageDataUrl)

          console.log(`✅ [DEMO] Generation complete for: ${clothingInfo.name} (${fitType} fit)`)
          return { imageDataUrl: watermarkedImage, success: true }
        }
      }
    }

    return { imageDataUrl: null, success: false, error: 'No image in response' }

  } catch (err) {
    console.error('[DEMO] Try-on generation failed:', err)
    return {
      imageDataUrl: null,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
