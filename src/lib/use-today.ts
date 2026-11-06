import { useEffect, useState } from 'react'
import { todayInNewYork } from './dates'

/** Today in New York, updated when the date changes (checked every minute). */
export function useToday(): string {
  const [today, setToday] = useState(() => todayInNewYork())
  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(todayInNewYork())
    }, 60_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])
  return today
}
