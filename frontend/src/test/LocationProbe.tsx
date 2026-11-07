import { useLocation } from 'react-router-dom'

// Test-only: shows the current web address so tests can check what is (and isn't) in it.
export function LocationProbe() {
  const { pathname, search, hash } = useLocation()
  return <div data-testid="location">{pathname + search + hash}</div>
}
