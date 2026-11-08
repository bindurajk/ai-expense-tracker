import '@testing-library/jest-dom/vitest'

// Tests replace fetch with a fake (see src/test/fakeAuth.tsx); put the real one back afterwards.
afterEach(() => {
  vi.unstubAllGlobals()
})
