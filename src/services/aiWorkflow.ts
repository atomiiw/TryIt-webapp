import type { UserData } from '../types'

/**
 * Placeholder for future AI processing
 * Currently just logs and stores the data
 */
export function processUserData(userData: UserData): void {
  console.log('User data received:', {
    gender: userData.gender,
    height: userData.height,
    heightUnit: userData.heightUnit,
    weight: userData.weight,
    weightUnit: userData.weightUnit,
    hasImage: !!userData.image
  })
}
