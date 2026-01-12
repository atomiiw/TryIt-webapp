/**
 * Remove White Background Utility
 * Uses Canvas API to process images and make white/near-white background pixels transparent
 * Only removes white from edges (flood fill), preserving white content inside the product
 */

interface RemoveBackgroundOptions {
  /** Threshold for white detection (0-255). Higher = more aggressive. Default: 240 */
  threshold?: number;
  /** Tolerance for near-white colors. Default: 30 */
  tolerance?: number;
  /** Whether to use edge detection for smoother cutouts. Default: true */
  smoothEdges?: boolean;
}

// Cache processed images to avoid re-processing
const processedImageCache = new Map<string, string>();

/**
 * Load an image from URL and return as HTMLImageElement
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enable CORS for external images

    img.onload = () => resolve(img);
    img.onerror = () => {
      // If CORS fails, try without crossOrigin (will work for same-origin)
      const fallbackImg = new Image();
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      fallbackImg.src = url;
    };

    img.src = url;
  });
}

/**
 * Check if a pixel is white or near-white
 */
function isWhitePixel(
  r: number,
  g: number,
  b: number,
  threshold: number,
  tolerance: number
): boolean {
  // Check if all RGB values are above threshold (near white)
  if (r >= threshold && g >= threshold && b >= threshold) {
    return true;
  }

  // Check if color is close to white with tolerance
  // This catches off-white, light gray backgrounds
  const brightness = (r + g + b) / 3;
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

  return brightness >= threshold - tolerance && maxDiff <= tolerance;
}

/**
 * Flood fill from edges to find background pixels
 * Returns a Set of pixel indices that are part of the background
 */
function floodFillBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  tolerance: number
): Set<number> {
  const background = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [];

  // Helper to get pixel index from x, y
  const getIndex = (x: number, y: number) => (y * width + x) * 4;

  // Helper to check if pixel at index is white
  const isWhiteAt = (idx: number) => {
    return isWhitePixel(data[idx], data[idx + 1], data[idx + 2], threshold, tolerance);
  };

  // Add all edge pixels that are white to the queue
  // Top and bottom edges
  for (let x = 0; x < width; x++) {
    const topIdx = getIndex(x, 0);
    const bottomIdx = getIndex(x, height - 1);
    if (isWhiteAt(topIdx) && !visited.has(topIdx)) {
      queue.push(topIdx);
      visited.add(topIdx);
    }
    if (isWhiteAt(bottomIdx) && !visited.has(bottomIdx)) {
      queue.push(bottomIdx);
      visited.add(bottomIdx);
    }
  }

  // Left and right edges
  for (let y = 0; y < height; y++) {
    const leftIdx = getIndex(0, y);
    const rightIdx = getIndex(width - 1, y);
    if (isWhiteAt(leftIdx) && !visited.has(leftIdx)) {
      queue.push(leftIdx);
      visited.add(leftIdx);
    }
    if (isWhiteAt(rightIdx) && !visited.has(rightIdx)) {
      queue.push(rightIdx);
      visited.add(rightIdx);
    }
  }

  // Flood fill using BFS
  while (queue.length > 0) {
    const idx = queue.shift()!;
    background.add(idx);

    // Get x, y from index
    const pixelIdx = idx / 4;
    const x = pixelIdx % width;
    const y = Math.floor(pixelIdx / width);

    // Check 4 neighbors (up, down, left, right)
    const neighbors = [
      { nx: x, ny: y - 1 },     // up
      { nx: x, ny: y + 1 },     // down
      { nx: x - 1, ny: y },     // left
      { nx: x + 1, ny: y },     // right
    ];

    for (const { nx, ny } of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborIdx = getIndex(nx, ny);
        if (!visited.has(neighborIdx) && isWhiteAt(neighborIdx)) {
          visited.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
    }
  }

  return background;
}

/**
 * Find transparent pixels connected to edges (true background)
 * Returns a Set of pixel indices that are transparent AND connected to edges
 */
function floodFillTransparentFromEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Set<number> {
  const edgeConnected = new Set<number>();
  const visited = new Set<number>();
  const queue: number[] = [];

  const getIndex = (x: number, y: number) => (y * width + x) * 4;
  const isTransparent = (idx: number) => data[idx + 3] === 0;

  // Add all edge pixels that are transparent to the queue
  for (let x = 0; x < width; x++) {
    const topIdx = getIndex(x, 0);
    const bottomIdx = getIndex(x, height - 1);
    if (isTransparent(topIdx) && !visited.has(topIdx)) {
      queue.push(topIdx);
      visited.add(topIdx);
    }
    if (isTransparent(bottomIdx) && !visited.has(bottomIdx)) {
      queue.push(bottomIdx);
      visited.add(bottomIdx);
    }
  }

  for (let y = 0; y < height; y++) {
    const leftIdx = getIndex(0, y);
    const rightIdx = getIndex(width - 1, y);
    if (isTransparent(leftIdx) && !visited.has(leftIdx)) {
      queue.push(leftIdx);
      visited.add(leftIdx);
    }
    if (isTransparent(rightIdx) && !visited.has(rightIdx)) {
      queue.push(rightIdx);
      visited.add(rightIdx);
    }
  }

  // Flood fill through transparent pixels
  while (queue.length > 0) {
    const idx = queue.shift()!;
    edgeConnected.add(idx);

    const pixelIdx = idx / 4;
    const x = pixelIdx % width;
    const y = Math.floor(pixelIdx / width);

    const neighbors = [
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborIdx = getIndex(nx, ny);
        if (!visited.has(neighborIdx) && isTransparent(neighborIdx)) {
          visited.add(neighborIdx);
          queue.push(neighborIdx);
        }
      }
    }
  }

  return edgeConnected;
}

/**
 * Remove white background from an image
 * Only removes white pixels connected to the edges (background), preserving white content
 * Also fills in interior holes (transparent pixels not connected to edges)
 * @param imageUrl - URL of the image to process
 * @param options - Processing options
 * @returns Data URL of the processed image with transparent background
 */
export async function removeWhiteBackground(
  imageUrl: string,
  options: RemoveBackgroundOptions = {}
): Promise<string> {
  const {
    threshold = 245,
    tolerance = 25,
    smoothEdges = true
  } = options;

  // Check cache first
  const cacheKey = `${imageUrl}-${threshold}-${tolerance}-${smoothEdges}`;
  if (processedImageCache.has(cacheKey)) {
    return processedImageCache.get(cacheKey)!;
  }

  try {
    // Load the image
    const img = await loadImage(imageUrl);

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Set canvas size to image size
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    // Draw image to canvas
    ctx.drawImage(img, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Find background pixels using flood fill from edges
    const backgroundPixels = floodFillBackground(
      data,
      canvas.width,
      canvas.height,
      threshold,
      tolerance
    );

    // Only make background pixels transparent
    for (const idx of backgroundPixels) {
      if (smoothEdges) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        if (brightness >= threshold) {
          data[idx + 3] = 0;
        } else if (brightness >= threshold - 30) {
          data[idx + 3] = Math.round(((threshold - brightness) / 30) * 255);
        } else {
          data[idx + 3] = 0;
        }
      } else {
        data[idx + 3] = 0;
      }
    }

    // Post-process: find transparent pixels connected to edges
    const edgeConnectedTransparent = floodFillTransparentFromEdges(
      data,
      canvas.width,
      canvas.height
    );

    // Fill in interior holes (transparent pixels NOT connected to edges)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0 && !edgeConnectedTransparent.has(i)) {
        // This is an interior hole - fill with white
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A (fully opaque)
      }
    }

    // Put processed data back
    ctx.putImageData(imageData, 0, 0);

    // Convert to data URL
    const processedUrl = canvas.toDataURL('image/png');

    // Cache the result
    processedImageCache.set(cacheKey, processedUrl);

    return processedUrl;
  } catch (error) {
    console.warn('Failed to remove background, returning original:', error);
    return imageUrl; // Return original if processing fails
  }
}

/**
 * React hook for processing image with white background removal
 * Returns the processed image URL (or original while processing)
 */
export function useProcessedImage(
  imageUrl: string | undefined,
  options?: RemoveBackgroundOptions
): string | undefined {
  // This is a simple sync version that returns the cached result if available
  // For React, we'll handle this differently in the component
  if (!imageUrl) return undefined;

  const cacheKey = `${imageUrl}-${options?.threshold ?? 245}-${options?.tolerance ?? 25}-${options?.smoothEdges ?? true}`;
  return processedImageCache.get(cacheKey) || imageUrl;
}

/**
 * Clear the processed image cache
 */
export function clearImageCache(): void {
  processedImageCache.clear();
}

/**
 * Pre-process an image and add to cache
 */
export async function preProcessImage(
  imageUrl: string,
  options?: RemoveBackgroundOptions
): Promise<string> {
  return removeWhiteBackground(imageUrl, options);
}

export default removeWhiteBackground;
