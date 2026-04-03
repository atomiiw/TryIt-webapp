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
 * Generate an untucked version of the user's photo.
 * Only called when shirt_tucked is detected. Cached and used as avatar for all try-ons.
 */
export async function generateUntuckedImage(userImage: string): Promise<TryOnResult> {
  try {
    const { base64: avatarBase64, aspectRatio } = await processUserImage(userImage)

    const prompt = `Untuck this shirt.`

    const MAX_RETRIES = 5
    const TIMEOUT_MS = 35_000

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        const response = await fetch(`${BACKEND_URL}/api/gemini-tryon-duke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ avatarBase64, prompt, aspectRatio, keyIndex: 0 })
        })

        clearTimeout(timeout)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error((errorData as { error?: string }).error || `API error: ${response.status}`)
        }

        const data = await response.json() as Record<string, unknown>
        const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0]
        if (!candidate || candidate.finishReason === 'PROHIBITED_CONTENT' || candidate.finishReason === 'IMAGE_OTHER') {
          if (attempt < MAX_RETRIES - 1) continue
          throw new Error('Blocked by content filter after all retries')
        }

        const content = candidate.content as { parts: Array<Record<string, unknown>> }
        for (const part of content.parts) {
          const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined
          if (inlineData?.mimeType?.includes('image')) {
            return { imageDataUrl: `data:${inlineData.mimeType};base64,${inlineData.data}`, success: true }
          }
        }

        throw new Error('No image in response')
      } catch (e) {
        clearTimeout(timeout)
        if (attempt === MAX_RETRIES - 1) throw e
      }
    }

    throw new Error('All retries failed')
  } catch (err) {
    return { imageDataUrl: null, success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Generate fit-specific prompt for try-on
 */
function generateTryOnPrompt(clothingInfo: ClothingInfo, fitType: FitType, gender: string = 'unknown'): string {
  const itemType = clothingInfo.type || 'garment'
  const isTop = !isBottomType(itemType)

  if (isTop) {
    const first = `First: completely erase the person's original top — remove its color, its shape, its neckline, its sleeves, its graphics, everything. Imagine the person's bare upper body. Now dress them from scratch in the ${itemType} from Image 2. The new shirt's color, fit, neckline, sleeve style, graphics, and fabric all come exclusively from Image 2. Nothing from the original shirt carries over. The shirt hangs freely over the pants with the full hem visible.`
    const style = `Style: Photorealistic, natural lighting matching Image 1, background identical to Image 1.`
    const sleeves = `Sleeves: The sleeves are exactly as shown in Image 2. Completely ignore the sleeve style, sleeve length, and sleeve type from Image 1. If Image 2 shows short sleeves, the person wears short sleeves. If Image 2 shows long sleeves, the person wears long sleeves.`
    const mandatory = `Mandatory: The sleeve style, sleeve cut, and sleeve length come only from Image 2. Hem hanging freely over and outside the pants waistband. All body parts in correct anatomical proportion. The garment length — measured from shoulder to hem — is exactly as shown in Image 2. 100% garment length accuracy from Image 2.`
    switch (fitType) {
      case 'tight':
        if (gender === 'male') {
          return `${first} Virtual try-on. The person in Image 1 is wearing the ${itemType} from Image 2. ${style} Subject: The exact same person from Image 1 — identical face, body shape, body size, chest size, belly size, skin tone, hair, pose. The person's chest, belly, and overall body shape are exactly as in Image 1 with zero modification. Completely remove all original upper body clothing and replace with the ${itemType} from Image 2. ${sleeves} Composition: Straight-on mid-body framing. The virtual camera is pulled back far enough to show the person's full head, full torso, and the complete hem of the garment in frame. All body parts scale equally and uniformly. Fit: This man bought a shirt TWO sizes too small. The fabric is painfully tight — deep horizontal tension creases run across the entire chest. The fabric stretches so tight across the shoulders that the seams look like they might rip. The sleeves are like tourniquets around the upper arms, compressing the biceps visibly. The shirt sides are vacuum-sealed to the ribcage and waist with absolutely zero air gap — you can see every rib. The fabric between the buttons (if any) is pulling apart showing gaps. The overall look is someone who seriously outgrew this shirt. The garment length remains exactly as shown in Image 2. Prohibitions: Added chest or breast volume, added belly volume, altered body shape, ANY loose fabric anywhere, any original upper body clothing visible, jacket, hoodie, sweater, layering, disproportionate body parts, cropped or shortened shirt, shorter hemline than Image 2, tucked-in shirt, any part of shirt tucked into pants, sleeves from Image 1, any slack or wrinkle-free smooth fabric — the fabric MUST show strain. ${mandatory} The tightness affects width only.`
        }
        return `${first} Virtual try-on. The person in Image 1 is wearing the ${itemType} from Image 2. ${style} Subject: The exact same person from Image 1 — identical face, body shape, body size, chest size, belly size, skin tone, hair, pose. The person's chest, belly, and overall body shape are exactly as in Image 1 with zero modification. Completely remove all original upper body clothing and replace with the ${itemType} from Image 2. ${sleeves} Composition: Straight-on mid-body framing. The virtual camera is pulled back far enough to show the person's full head, full torso, and the complete hem of the garment in frame. All body parts scale equally and uniformly. Fit: Only the width changes — the fabric is stretched taut against the skin with 0mm air gap. The shape of the shoulders and hip bones is visible pressing through the material. Zero wrinkles, zero folds, zero bunching. Chest area lays flat and smooth. The garment is tight in width only. The garment length remains exactly as shown in Image 2. Prohibitions: Added chest or breast volume, added belly volume, altered body shape, loose fabric, any original upper body clothing visible, jacket, hoodie, sweater, layering, disproportionate body parts, cropped or shortened shirt, shorter hemline than Image 2, tucked-in shirt, any part of shirt tucked into pants, sleeves from Image 1, blending original shirt with new garment, original shirt color showing through, original shirt neckline shape, original shirt graphics visible, partial replacement of original shirt. ${mandatory} The tightness affects width only.`
      case 'comfortable':
        return `${first} Virtual try-on. The person in Image 1 is wearing the ${itemType} from Image 2. ${style} Subject: The exact same person from Image 1 — identical face, body shape, body size, skin tone, hair, pose. The person's chest, belly, and overall body shape are exactly as in Image 1 with zero modification. Completely remove all original upper body clothing and replace with the ${itemType} from Image 2. ${sleeves} Composition: Keep the exact same framing and camera distance as Image 1. The person's head and body remain the exact same size in the frame as in Image 1. If the garment hem extends beyond the bottom of the frame, let it be cropped off. Cutting off the bottom of the shirt is acceptable. Shrinking the person is not acceptable. Fit: Only the width is larger — the shirt is one full size wider than the person's body. 50mm of visible air gap between fabric and torso on each side. Shoulder seams drop 30mm past the natural shoulder bone. Sleeves visibly wider than the arms. 5-7 prominent vertical folds down the front. Body shape hidden by excess width. The shirt is wider, not longer. Prohibitions: Added chest or breast volume, added belly volume, altered body shape, fitted fabric, fabric touching torso sides, any original upper body clothing visible, jacket, hoodie, sweater, layering, shrinking torso independently of head, shrinking the person, disproportionate body parts, dress-like length, shorter hemline than Image 2, longer hemline than Image 2, tucked-in shirt, any part of shirt tucked into pants, sleeves from Image 1, blending original shirt with new garment, original shirt color showing through, original shirt neckline shape, original shirt graphics visible, partial replacement of original shirt. Mandatory: The sleeve style, sleeve cut, and sleeve length come only from Image 2. Hem hanging freely over and outside the pants waistband. All body parts in correct anatomical proportion. The shirt is wider, not longer. Body size in the frame is identical to Image 1. Preserving body proportion is more important than showing the full garment length.`
      default:
        return `${first} Virtual try-on. The person in Image 1 is wearing ONLY the ${itemType} from Image 2 on their upper body. Nothing else. ${style} Subject: The exact same person from Image 1 — identical face, body shape, body size, skin tone, hair, pose. The person's chest, belly, and overall body shape are exactly as in Image 1 with zero modification. Every single piece of original upper body clothing is destroyed and gone — the original shirt, jacket, hoodie, sweater, undershirt, everything. The person's upper body has ONLY the ${itemType} from Image 2 directly on skin. No layering. No original clothing peeking through at the collar, sleeves, or hem. ${sleeves} Composition: Straight-on mid-body framing. The virtual camera is pulled back far enough to show the person's full head, full torso, and the complete hem of the garment in frame. All body parts scale equally and uniformly. Fit: Standard retail fit. The fabric skims the body with approximately 10mm of space between skin and fabric. Shoulder seams sit exactly on the shoulder bone. A few natural creases at the waist. Body shape suggested but not defined through the fabric. Prohibitions: Added chest or breast volume, added belly volume, altered body shape, skin-tight fabric, oversized look, ANY trace of original clothing — no collar visible underneath, no sleeve cuff visible underneath, no hem visible underneath, no layering of any kind, jacket, hoodie, sweater, undershirt visible, disproportionate body parts, shorter hemline than Image 2, longer hemline than Image 2, tucked-in shirt, any part of shirt tucked into pants, sleeves from Image 1, blending original shirt with new garment, original shirt color showing through, original shirt neckline shape, original shirt graphics visible, partial replacement of original shirt. ${mandatory}`
    }
  } else {
    const base = `Virtual try-on. The person in Image 1 is wearing the ${itemType} from Image 2. The person has the exact same face, body shape, body size, skin tone, hair, pose, and top garment as in Image 1. The background and lighting are identical to Image 1. The ${itemType} matches the exact color, pattern, and leg length from Image 2.`
    const photo = 'Captured with natural soft-box lighting, full-body framing, clean e-commerce product photography style.'
    switch (fitType) {
      case 'tight':
        return `${base} The fabric wraps closely around the hips, thighs, and calves with zero loose material, following the natural contour of the legs. ${photo}`
      case 'comfortable':
        return `${base} The fabric drapes with generous room around the hips and legs, creating visible soft folds at the knees and thighs. The pant silhouette is noticeably wider than the legs. ${photo}`
      default:
        return `${base} The fabric lightly follows the leg shape with a slight air gap between skin and fabric. A few natural soft creases appear at the knees. ${photo}`
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
  untuckedImage?: string,
  gender: string = 'unknown'
): Promise<TryOnResult> {
  // Prepare images and prompt outside the queue (can run in parallel)
  try {
    const avatar = untuckedImage || userImage
    const { base64: avatarBase64, aspectRatio } = await processUserImage(avatar)
    const clothingBase64 = await imageUrlToBase64(clothingImageUrl)
    const prompt = generateTryOnPrompt(clothingInfo, fitType, gender)

    // Queue the actual API call per key to avoid rate limits
    return await enqueueForKey(keyIndex, async () => {
    const MAX_RETRIES = 5
    const TIMEOUT_MS = 35_000

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {

        const response = await fetch(`${BACKEND_URL}/api/gemini-tryon-duke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            avatarBase64,
            clothingBase64Images: [clothingBase64],
            prompt,
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
          console.log(`[TryOn] ${fitType} SUCCESS (attempt ${attempt + 1}/${MAX_RETRIES})`)
          return { imageDataUrl: watermarkedImage, analysisText, success: true }
        }

        throw new Error('No image in response')
      } catch (e) {
        clearTimeout(timeout)
        console.warn(`[TryOn] ${fitType} attempt ${attempt + 1}/${MAX_RETRIES} failed`)
        if (attempt === MAX_RETRIES - 1) throw e
      }
    }

    throw new Error('All retries failed')
    }) // end enqueueForKey

  } catch (err) {
    console.error(`[TryOn] ${fitType} FAILED after all attempts: ${err instanceof Error ? err.message : 'Unknown'}`)
    return {
      imageDataUrl: null,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
