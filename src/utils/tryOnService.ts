/**
 * Try-On Service
 * Generates virtual try-on images using the Duke Gemini try-on backend endpoint
 *
 * Input:
 *   - avatarBase64: User's photo as base64
 *   - clothingImageUrl: URL of the clothing image
 *   - clothingInfo: Name, type, color of the clothing
 *   - fitType: 'tight', 'regular', or 'comfortable'
 */

import { chooseWatermark, getWatermarkLogoPath } from './chooseWatermark'
import { isBottomType } from './sizeCollector'

// Backend API endpoint
const BACKEND_URL = 'https://closai-backend.vercel.app'

// Fit type for try-on generation
export type FitType = 'tight' | 'regular' | 'comfortable'

// Per-key queue to prevent concurrent requests on the same API key
// Key 0 = tight, Key 1 = regular, Key 2 = comfortable
const keyQueues: Record<number, Promise<unknown>> = { 0: Promise.resolve(), 1: Promise.resolve(), 2: Promise.resolve() }

function enqueueForKey<T>(keyIndex: number, fn: () => Promise<T>): Promise<T> {
  const prev = keyQueues[keyIndex] || Promise.resolve()
  const next = prev.then(fn, fn) // run fn even if previous failed
  keyQueues[keyIndex] = next
  return next
}

// Clothing item info
export interface ClothingInfo {
  name: string
  type: string        // 'tops', 'bottoms'
  color: string
  fitSentence?: string  // Personalized fit description from fitDescriber
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
function generateTryOnPrompt(clothingInfo: ClothingInfo, fitType: FitType, gender: string = 'unknown'): string {
  const itemType = clothingInfo.type || 'garment'
  const isTop = !isBottomType(itemType)
  const isMale = gender === 'male'
  const nameLC = (clothingInfo.name || '').toLowerCase()
  const isStructured = /jacket|coat|blazer|hoodie|fleece|windbreaker|parka|vest|quarter.zip|half.zip|pullover|shell|anorak/.test(nameLC)

  if (isTop) {
    const itemName = clothingInfo.name || itemType
    const itemColor = clothingInfo.color || ''

    const base = `GENERATE A REALISTIC VIRTUAL TRY-ON IMAGE. You will receive 2 images: 1) Person/avatar, 2) Top clothing item (${itemName}). Show the person from the first image wearing the top from the second image. CRITICAL: You MUST generate and return a new image, not just text. IMPORTANT: COMPLETELY REMOVE and DISCARD any existing upper body clothing, then PUT ON the ${itemColor} ${itemType}. Do not layer over existing clothes. The new garment's color, fit, neckline, sleeve style, graphics, and fabric all come exclusively from Image 2. The sleeve style, sleeve length come ONLY from Image 2 — completely ignore sleeves from Image 1. The shirt hangs freely over the pants, not tucked in. PRESERVE EXACTLY: the person's face, facial expression, body shape, body size, chest size, belly size, body pose, body position, background, lighting, camera angle from the original avatar image. Zero body modification — no added chest volume, no added belly, no altered body shape. Color: pixel-accurate to Image 2 — exact hue, saturation, brightness.`

    const quality = `Generate a high-resolution, sharp, detailed, photorealistic image. Keep the person in the exact same position, pose, and framing as the original avatar image. Do not crop, zoom, or reposition the person. Only replace the clothing for try-on while keeping everything else identical.`

    switch (fitType) {
      case 'tight': {
        let fitDesc: string
        if (isStructured) {
          fitDesc = `The ${itemName} is one size too small. The zipper or buttons strain to close — visible pulling and gapping at the chest. Sleeves end above the wrist, too short. The torso section is visibly too narrow, sides pull tight. The silhouette is noticeably smaller than the person's frame.`
        } else if (isMale) {
          fitDesc = `This man bought a shirt one size too small. Visible horizontal tension creases across the chest and upper back. The sleeves grip the upper arms like a compression sleeve, stretched around the biceps. The shirt sides cling to the ribcage with zero air gap. Shoulder seams pulled inward past natural shoulder. Looks like an athletic undershirt — clearly too small for this body.`
        } else {
          fitDesc = `The fabric is stretched taut against the skin with 0mm air gap. Shoulders and hip bones visible pressing through material. Zero wrinkles, zero folds. Chest flat and smooth. Tight in width only.`
        }

        return `${base} FIT: TIGHT. ${fitDesc} The garment length remains exactly as shown in Image 2 — tightness affects width only, not length. ${quality} Prohibitions: loose fabric, added chest/breast volume, added belly volume, altered body shape, original clothing visible, layering, tucked-in shirt, sleeves from Image 1, color shift from Image 2, cropped shirt, shorter hemline than Image 2.`
      }
      case 'comfortable': {
        const comfortFit = isStructured
          ? `The ${itemName} is one full size too large. Shoulders drop 40mm past the natural shoulder bone. Sleeves extend well past the wrists, partially covering hands. Torso section is boxy and wide with 60mm air gap on each side. Hangs like a borrowed ${itemName} from someone much bigger. Zipper or front closure has excessive overlap.`
          : `The shirt is one full size wider than the person's body. 60mm visible air gap between fabric and torso on each side. Shoulder seams drop 35mm past shoulder bone. Sleeves visibly wider than arms. 5-7 prominent vertical folds down the front. Body shape hidden by excess width.`

        return `${base} FIT: COMFORTABLE — WIDER, NOT LONGER. ${comfortFit} The garment length remains exactly as shown in Image 2. The shirt is wider, not longer. ${quality} Keep the person the same size in frame — crop the garment hem at the frame edge rather than shrinking the person. Prohibitions: fitted fabric, fabric touching torso sides, shrinking person, added chest/breast volume, added belly volume, altered body shape, original clothing visible, layering, tucked-in shirt, sleeves from Image 1, color shift from Image 2, dress-like length, shorter hemline than Image 2, longer hemline than Image 2.`
      }
      default: { // regular
        const regularFit = isStructured
          ? `Standard retail fit. The ${itemName} closes comfortably with no strain. Shoulder seams on the shoulder bone. Sleeves end at the wrist. 15mm space between torso and garment shell. Holds its structured shape without pulling or excess bulk.`
          : `Standard retail fit. 15mm space between skin and fabric. Shoulder seams on the shoulder bone. Few natural creases at waist. Body shape suggested, not defined. Not clinging, not baggy.`

        return `${base} FIT: REGULAR. ${regularFit} The garment length remains exactly as shown in Image 2. ${quality} Prohibitions: skin-tight fabric, oversized look, added chest/breast volume, added belly volume, altered body shape, ANY trace of original clothing, layering, collar/sleeve/hem visible underneath, tucked-in shirt, sleeves from Image 1, color shift from Image 2, shorter hemline than Image 2, longer hemline than Image 2.`
      }
    }
  } else {
    const base = `The person's original bottom does not exist. Start from bare legs, dress in the ${itemType} from Image 2.

Virtual try-on. The person in Image 1 wears the ${itemType} from Image 2.

Style: Photorealistic, lighting and background identical to Image 1.

Subject: Same person from Image 1 — identical face, body shape, body size, skin tone, hair, pose, top garment. Zero body modification. All original lower body clothing fully replaced by ${itemType} from Image 2.

Color: Pixel-accurate to Image 2 — exact hue, saturation, brightness.

Composition: Full-body framing, lighting matching Image 1.`

    const sharedProhibitions = `original lower clothing visible, original bottom blending through, color shift from Image 2, altered body shape, added belly volume, disproportionate body parts`

    switch (fitType) {
      case 'tight':
        return `${base}

Fit: 0mm air gap. Fabric wraps hips, thighs, calves with zero loose material. Leg shape clearly defined through fabric.

Prohibitions: Loose fabric, ${sharedProhibitions}, shorter leg than Image 2.

Mandatory: Exact color, pattern, leg length from Image 2. 100% length and color accuracy from Image 2.`
      case 'comfortable':
        return `${base}

Fit: 50mm air gap between fabric and thighs each side. Generous room around hips and legs. Soft folds at knees and thighs. Pant silhouette noticeably wider than legs. Leg shape hidden. Wider, not longer.

Prohibitions: Fitted fabric, fabric touching thighs, ${sharedProhibitions}, shorter leg than Image 2, longer leg than Image 2.

Mandatory: Exact color, pattern, leg length from Image 2. Wider not longer. 100% length and color accuracy from Image 2.`
      default: // regular
        return `${base}

Fit: Standard retail. 15mm air gap. Fabric follows leg shape lightly. Few creases at knees. Not clinging, not baggy.

Prohibitions: Skin-tight fabric, oversized look, ${sharedProhibitions}, shorter leg than Image 2, longer leg than Image 2.

Mandatory: Exact color, pattern, leg length from Image 2. 100% length and color accuracy from Image 2.`
    }
  }
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
  fitType: FitType = 'regular',
  keyIndex: number = 0,
  gender: string = 'unknown'
): Promise<TryOnResult> {
  try {
    const { base64: avatarBase64, aspectRatio } = await processUserImage(userImage)
    const clothingBase64 = await imageUrlToBase64(clothingImageUrl)
    const prompt = generateTryOnPrompt(clothingInfo, fitType, gender)

    // Queue the actual API call per key to avoid rate limits
    return await enqueueForKey(keyIndex, async () => {
    const MAX_RETRIES = 10
    const TIMEOUT_MS = 35_000

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {

        // Add random seed on retries so content filter sees a "different" request
        const retryPrompt = attempt === 0 ? prompt : `${prompt}\n[Session ${Date.now()}]`

        const response = await fetch(`${BACKEND_URL}/api/gemini-tryon-duke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            avatarBase64,
            clothingBase64Images: [clothingBase64],
            prompt: retryPrompt,
            aspectRatio,
            keyIndex
          })
        })

        clearTimeout(timeout)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error((errorData as { error?: string }).error || `API error: ${response.status}`)
        }

        const data = await response.json() as Record<string, unknown>


        // Check for content block — retry if so
        const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0]
        if (!candidate || candidate.finishReason === 'PROHIBITED_CONTENT' || candidate.finishReason === 'IMAGE_OTHER') {

          if (attempt < MAX_RETRIES - 1) continue
          throw new Error('Blocked by content filter after all retries')
        }

        // Parse image from response
        let imageDataUrl: string | null = null
        let analysisText: string | undefined
        const content = candidate.content as { parts: Array<Record<string, unknown>> }

        for (const part of content.parts) {
          const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined
          if (inlineData?.mimeType?.includes('image')) {
            imageDataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`
          }
          if (part.text) {
            analysisText = part.text as string
          }
        }

        if (imageDataUrl) {
          const watermarkedImage = await addWatermark(imageDataUrl)
          console.log(`[TryOn] ${clothingInfo.name} — ${fitType} SUCCESS (attempt ${attempt + 1}/${MAX_RETRIES})`)
          return { imageDataUrl: watermarkedImage, analysisText, success: true }
        }

        throw new Error('No image in response')
      } catch (e) {
        clearTimeout(timeout)
        console.warn(`[TryOn] ${clothingInfo.name} — ${fitType} attempt ${attempt + 1}/${MAX_RETRIES} failed`)
        if (attempt === MAX_RETRIES - 1) throw e
      }
    }

    throw new Error('All retries failed')
    }) // end enqueueForKey

  } catch (err) {
    console.error(`[TryOn] ${clothingInfo.name} — ${fitType} FAILED after all attempts: ${err instanceof Error ? err.message : 'Unknown'}`)
    return {
      imageDataUrl: null,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
