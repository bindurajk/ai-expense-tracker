import { formatIsoDate, formatPence, parsePoundsToPence, todayInLondon } from './money'

describe('parsePoundsToPence', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['£1,234.56', 123456],
    [' 7.05 ', 705],
    ['999999.99', 99_999_999],
    ['0.10', 10],
  ])('reads %s as %i pence', (input, pence) => {
    expect(parsePoundsToPence(input)).toBe(pence)
  })

  it.each(['', '0', '0.00', '-5', '1.234', 'abc', '12..5', '1000000', '1e3', '.5'])(
    'rejects %s',
    (input) => {
      expect(parsePoundsToPence(input)).toBeNull()
    },
  )
})

describe('formatting', () => {
  it('formats pence as pounds', () => {
    expect(formatPence(1250)).toBe('£12.50')
    expect(formatPence(123456)).toBe('£1,234.56')
  })

  it('formats dates the UK way', () => {
    expect(formatIsoDate('2026-11-08')).toBe('8 Nov 2026')
  })

  it("uses London's date, not the computer's", () => {
    // 23:30 UTC on 30 June is already 1 July in London (summer time).
    expect(todayInLondon(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01')
    // In winter London matches UTC.
    expect(todayInLondon(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31')
  })
})
