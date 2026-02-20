/**
 * Watermark Color Chooser
 * Analyzes the exact TryIt logo placement region in the bottom-right corner
 * to determine whether to use a white or black watermark for optimal visibility
 */

export type WatermarkColor = 'white' | 'black'

// TryIt watermark placement constants (must match addWatermark functions)
const LOGO_HEIGHT = 100
const MARGIN_RIGHT = 40
const MARGIN_BOTTOM = 20

/**
 * Analyze the TryIt watermark region of an image and determine the best watermark color
 * Only analyzes the exact bottom-right region where the TryIt logo will be placed
 *
 * @param imageSrc - Image source (data URL or URL)
 * @returns Promise resolving to 'white' or 'black' watermark recommendation
 */
export function chooseWatermark(imageSrc: string): Promise<WatermarkColor> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        resolve('white')
        return
      }

      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      // Calculate exact TryIt logo region
      // Logo aspect ratio ~2:1 (width is approximately 2x height)
      const logoWidth = LOGO_HEIGHT * 2
      const logoX = img.width - logoWidth - MARGIN_RIGHT
      const logoY = img.height - LOGO_HEIGHT - MARGIN_BOTTOM

      // Ensure we don't sample outside image bounds
      const sampleX = Math.max(0, logoX)
      const sampleY = Math.max(0, logoY)
      const sampleWidth = Math.min(logoWidth, img.width - sampleX)
      const sampleHeight = Math.min(LOGO_HEIGHT, img.height - sampleY)

      // Get pixel data from the TryIt logo region only
      let imageData: ImageData
      try {
        imageData = ctx.getImageData(sampleX, sampleY, sampleWidth, sampleHeight)
      } catch {
        resolve('white')
        return
      }

      const data = imageData.data
      let totalBrightness = 0
      let pixelCount = 0

      // Sample every 4th pixel for performance
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]

        // Skip transparent pixels
        if (a < 128) continue

        // Calculate perceived brightness using luminance formula
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b)
        totalBrightness += brightness
        pixelCount++
      }

      if (pixelCount === 0) {
        resolve('white')
        return
      }

      const avgBrightness = totalBrightness / pixelCount

      // Higher threshold (180) = more likely to use white watermark
      // Only use black watermark for very light backgrounds
      const watermarkColor: WatermarkColor = avgBrightness > 180 ? 'black' : 'white'


      resolve(watermarkColor)
    }

    img.onerror = () => {
      resolve('white')
    }

    img.src = imageSrc
  })
}

/**
 * Get the logo path based on the watermark color
 *
 * @param color - 'white' or 'black'
 * @returns Path to the appropriate logo file
 */
export function getWatermarkLogoPath(color: WatermarkColor): string {
  return color === 'white' ? '/logo-white.png' : '/logo-black.png'
}
