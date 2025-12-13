/**
 * Person Feature Extraction from Photo
 * Uses OpenAI vision API to analyze body composition for size recommendations
 */

// Age range categories
export type AgeRange = 'children' | 'teenager' | 'adult' | 'elderly'

// Gender categories
export type Gender = 'male' | 'female' | 'unknown'

// Body composition categories (replaces individual proportions)
export type BodyComposition = 'lean' | 'average' | 'soft'

// Body composition factor for formulas
export const BODY_COMPOSITION_FACTOR: Record<BodyComposition, number> = {
  'lean': 0.85,      // Athletic/lean build
  'average': 1.00,   // Normal/average build
  'soft': 1.25       // Overweight/soft build
}

// Legacy type for backwards compatibility
export type Proportion = 'small' | 'regular' | 'large'

// Legacy interface for backwards compatibility
export interface BodyProportions {
  chest?: Proportion
  waist?: Proportion
  hips?: Proportion
  body_length?: Proportion
  sleeve_length?: Proportion
  inseam?: Proportion
  shoulders?: Proportion
}

// Full analysis result
export interface PersonAnalysis {
  gender: Gender
  age_range: AgeRange
  body_composition: BodyComposition
  confidence: 'high' | 'medium' | 'low'
  notes?: string
  // Legacy field for backwards compatibility
  proportions: BodyProportions
}

// Clothing type categories
export type ClothingType = 'shirt' | 'pants' | 'jacket' | 'dress' | 'unknown'

// Measurements relevant to each clothing type
const MEASUREMENTS_BY_CLOTHING_TYPE: Record<ClothingType, string[]> = {
  shirt: ['chest', 'body_length', 'sleeve_length', 'shoulders'],
  pants: ['waist', 'hips', 'inseam', 'thigh'],
  jacket: ['chest', 'body_length', 'sleeve_length', 'shoulders'],
  dress: ['chest', 'waist', 'hips', 'body_length'],
  unknown: ['chest', 'waist', 'hips', 'body_length', 'sleeve_length']
}

// API endpoint
const API_ENDPOINT = 'https://closai-backend.vercel.app/api/openai-analyze-image'

/**
 * Get relevant measurements for a clothing type
 */
export function getMeasurementsForClothingType(clothingType: ClothingType): string[] {
  return MEASUREMENTS_BY_CLOTHING_TYPE[clothingType] || MEASUREMENTS_BY_CLOTHING_TYPE.unknown
}

/**
 * Build the prompt for OpenAI vision analysis
 * Now focuses on overall body composition instead of individual measurements
 */
function buildAnalysisPrompt(): string {
  return `Analyze this photo of a person for clothing size recommendations.

Determine:
1. Gender: "male" or "female" (only use "unknown" if truly impossible to tell)
   - Look for: facial features (jawline, brow ridge), body shape (shoulder-to-hip ratio, chest), hair style, clothing style
   - Male indicators: broader shoulders, angular jaw, facial hair, Adam's apple, flatter chest
   - Female indicators: wider hips relative to waist, breasts, softer facial features, typically longer hair
   - Make your best guess - most photos will clearly show male or female. Only say "unknown" if the person is completely obscured.

2. Age range: "children" (under 12), "teenager" (12-18), "adult" (18-65), or "elderly" (65+)

3. Body composition - classify the person's overall build as ONE of:
   - "lean": Athletic, slim, muscular, or skinny build. Visible muscle definition, slender frame, or underweight.
   - "average": Normal/typical build. This includes most people - slightly overweight is still "average".
   - "soft": Significantly overweight, obese, or very large build. Reserve this ONLY for clearly heavy/fat individuals.

IMPORTANT: Most people should be classified as "average". Only use "soft" for people who are clearly obese or significantly overweight.

Respond ONLY with valid JSON in this exact format:
{
  "gender": "male" | "female" | "unknown",
  "age_range": "children" | "teenager" | "adult" | "elderly",
  "body_composition": "lean" | "average" | "soft",
  "confidence": "high" | "medium" | "low",
  "notes": "optional brief note about analysis"
}`
}


/**
 * Analyze a person's photo for body composition
 *
 * @param imageBase64 - Base64 encoded image data (with or without data URL prefix)
 * @param _clothingType - Unused, kept for backwards compatibility
 * @returns PersonAnalysis object with gender, age range, and body composition
 */
export async function analyzePersonPhoto(
  imageBase64: string,
  _clothingType: ClothingType = 'unknown'
): Promise<PersonAnalysis> {
  // Ensure image has proper data URL format
  let imageData = imageBase64
  if (!imageData.startsWith('data:')) {
    // Assume JPEG if no prefix
    imageData = `data:image/jpeg;base64,${imageData}`
  }

  const prompt = buildAnalysisPrompt()

  console.log('🔍 Analyzing person photo for body composition...')

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: imageData.replace(/^data:image\/\w+;base64,/, ''),
        prompt: prompt
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`API request failed: ${response.status} - ${errorData.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const content = data.analysis || data.content || data.result || ''

    // Parse JSON response from OpenAI
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response')
    }

    const rawAnalysis = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!rawAnalysis.age_range) {
      throw new Error('Missing required fields in analysis')
    }

    // Validate gender - must be male, female, or unknown
    const validGenders: Gender[] = ['male', 'female', 'unknown']
    const gender: Gender = validGenders.includes(rawAnalysis.gender)
      ? rawAnalysis.gender
      : 'unknown'

    // Validate body_composition
    const validCompositions: BodyComposition[] = ['lean', 'average', 'soft']
    const bodyComposition: BodyComposition = validCompositions.includes(rawAnalysis.body_composition)
      ? rawAnalysis.body_composition
      : 'average'

    const analysis: PersonAnalysis = {
      gender,
      age_range: rawAnalysis.age_range,
      body_composition: bodyComposition,
      confidence: rawAnalysis.confidence || 'medium',
      notes: rawAnalysis.notes,
      // Legacy field - empty since we no longer use individual proportions
      proportions: {}
    }

    console.log('✅ Person analysis complete:', {
      gender: analysis.gender,
      age_range: analysis.age_range,
      body_composition: analysis.body_composition,
      confidence: analysis.confidence
    })

    return analysis

  } catch (error) {
    console.error('❌ Person photo analysis failed:', error)

    // Return default analysis on failure
    return {
      gender: 'unknown',
      age_range: 'adult',
      body_composition: 'average',
      proportions: {},
      confidence: 'low',
      notes: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Analyze person photo using clothing type from a size guide
 * Convenience function that uses the size guide's clothing_type
 */
export async function analyzePersonForSizeGuide(
  imageBase64: string,
  sizeGuide: { clothing_type?: string }
): Promise<PersonAnalysis> {
  const clothingType = (sizeGuide.clothing_type || 'unknown') as ClothingType
  return analyzePersonPhoto(imageBase64, clothingType)
}
