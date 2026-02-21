/**
 * Fit Describer
 * Compares user body measurements against a size guide entry
 * and produces short fit phrases for the image model.
 */

import type { SizeEntry, Measurement } from './sizeCollector'

type FitType = 'tight' | 'regular' | 'comfortable'
type ClothingCategory = 'tops' | 'bottoms'

function calculateFitRatio(userValue: number, measurement: Measurement): number {
  let min: number
  let max: number

  if (measurement.min !== undefined && measurement.max !== undefined) {
    min = measurement.min
    max = measurement.max
  } else if (measurement.value !== undefined) {
    min = measurement.value - 2
    max = measurement.value + 2
  } else {
    return 0.5
  }

  if (max === min) {
    if (userValue < min) return -0.5
    if (userValue > max) return 1.5
    return 0.5
  }

  return (userValue - min) / (max - min)
}

// 5 levels: loose (0), slightly loose (1), normal (2), slightly tight (3), tight (4)
function ratioToTierIndex(ratio: number): number {
  if (ratio < -0.5) return 0    // much smaller → loose
  if (ratio < -0.05) return 1   // smaller → slightly loose
  if (ratio <= 1.05) return 2   // within range → normal
  if (ratio <= 1.5) return 3    // bigger → slightly tight
  return 4                       // much bigger → tight
}

const TOP_DESCRIPTORS: Record<string, string[]> = {
  'chest':     ['chest visibly loose', 'chest slightly loose', 'chest normal', 'chest slightly tight', 'chest visibly tight'],
  'waist':     ['waist visibly loose', 'waist slightly loose', 'waist normal', 'waist slightly tight', 'waist visibly tight'],
  'shoulder':  ['shoulders visibly wide', 'shoulders slightly wide', 'shoulders normal', 'shoulders slightly narrow', 'shoulders visibly narrow'],
}

const BOTTOM_DESCRIPTORS: Record<string, string[]> = {
  'hips_thighs': ['legs visibly loose', 'legs slightly loose', 'legs normal', 'legs slightly tight', 'legs visibly tight'],
}

// Hardcoded per fit type — not ratio-based
const BOTTOM_WAIST_POSITION: Record<FitType, string> = {
  tight: 'waistband pulled up high at the natural waist',
  regular: 'waistband at mid-hip level',
  comfortable: 'waistband dropped low, sitting on the hips',
}

const TOP_LENGTH: Record<FitType, string> = {
  tight: 'runs small',
  regular: 'runs normal',
  comfortable: 'runs large',
}

export function describeFit(
  userMeasurements: { name: string; value: number }[],
  sizeGuideEntry: SizeEntry,
  fitType: FitType,
  intensityShift: number = 0,
  clothingCategory: ClothingCategory = 'tops',
  clothingType: string = '',
  clothingName: string = ''
): string {
  const nameToKey: Record<string, string> = {
    'Chest': 'chest',
    'Waist': 'waist',
    'Hips': 'hips',
    'Shoulders': 'shoulder',
    'Thigh': 'thigh',
  }

  const isBottoms = clothingCategory === 'bottoms'
  const descriptorMap = isBottoms ? BOTTOM_DESCRIPTORS : TOP_DESCRIPTORS
  const skipKeys = new Set(['length', 'body_length', 'sleeve', 'inseam'])

  const parts: string[] = []
  const usedKeys = new Set<string>()

  // For bottoms, always start with the hardcoded waist position
  if (isBottoms) {
    parts.push(BOTTOM_WAIST_POSITION[fitType])
  }

  for (const m of userMeasurements) {
    const sizeKey = nameToKey[m.name]
    if (!sizeKey) continue
    if (skipKeys.has(sizeKey)) continue

    // For bottoms, skip waist (hardcoded above) and merge hips+thigh
    if (isBottoms) {
      if (sizeKey === 'waist') continue
      if (sizeKey === 'hips' || sizeKey === 'thigh') {
        if (usedKeys.has('hips_thighs')) continue
        const measurement = sizeGuideEntry.measurements[sizeKey]
        if (!measurement) continue
        const ratio = calculateFitRatio(m.value, measurement)
        let tierIndex = ratioToTierIndex(ratio)
        tierIndex = Math.max(0, Math.min(4, tierIndex + intensityShift))
        parts.push(BOTTOM_DESCRIPTORS['hips_thighs'][tierIndex])
        usedKeys.add('hips_thighs')
        continue
      }
    }

    const measurement = sizeGuideEntry.measurements[sizeKey]
    if (!measurement) continue
    if (!descriptorMap[sizeKey]) continue

    const ratio = calculateFitRatio(m.value, measurement)
    let tierIndex = ratioToTierIndex(ratio)
    tierIndex = Math.max(0, Math.min(4, tierIndex + intensityShift))

    usedKeys.add(sizeKey)
    parts.push(descriptorMap[sizeKey][tierIndex])
  }

  // For tops, always end with the hardcoded length (skip for dresses)
  const isDress = clothingType.toLowerCase().includes('dress') || clothingName.toLowerCase().includes('dress')
  if (!isBottoms && !isDress) {
    parts.push(TOP_LENGTH[fitType])
  }

  if (parts.length === 0) return ''

  return parts.join('. ') + '.'
}
