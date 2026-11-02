import { useEffect } from 'react'

// Sets the browser tab title so screen-reader users hear which page they are on.
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · SpendWise`
  }, [title])
}
