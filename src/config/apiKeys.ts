// API Keys Configuration
// Replace with your actual API keys

export const API_KEYS = {
  // Anthropic Claude API key
  // Get yours at: https://console.anthropic.com/
  ANTHROPIC: import.meta.env.VITE_ANTHROPIC_API_KEY || '',
}

// Check if API keys are configured
export function isAnthropicConfigured(): boolean {
  return API_KEYS.ANTHROPIC.length > 0
}
