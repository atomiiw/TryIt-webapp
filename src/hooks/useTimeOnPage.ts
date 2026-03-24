import { useEffect } from 'react'
import { track } from '@vercel/analytics'

export function useTimeOnPage(pageName: string) {
  useEffect(() => {
    const start = Date.now()

    const sendTime = () => {
      const seconds = Math.round((Date.now() - start) / 1000)
      if (seconds > 0) {
        track('time_on_page', { page: pageName, seconds })
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sendTime()
      }
    }

    window.addEventListener('beforeunload', sendTime)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      sendTime()
      window.removeEventListener('beforeunload', sendTime)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pageName])
}
