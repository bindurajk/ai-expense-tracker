import { usePageTitle } from '../usePageTitle'

// Calculation definitions come straight from PRD section 4.
// Finalised in X01; the wording here is a draft.
export function Help() {
  usePageTitle('Help')
  return (
    <article className="page prose">
      <h1>Help</h1>
      <p className="placeholder-note">Draft. Final wording will be added in feature X01.</p>

      <h2>How totals are calculated</h2>
      <dl className="definitions">
        <dt>Gross spending</dt>
        <dd>All expenses you recorded in the month.</dd>
        <dt>Refunds</dt>
        <dd>Money returned to you for purchases. Refunds reduce spending; they are not income.</dd>
        <dt>Net spending</dt>
        <dd>Expenses minus refunds.</dd>
        <dt>Recorded surplus</dt>
        <dd>
          Income minus expenses plus refunds. It is based on your entries; it is not your bank
          balance. A negative value means you recorded more spending than income.
        </dd>
        <dt>Budget remaining</dt>
        <dd>
          Your limit for a category minus that category&apos;s net spending. It can be negative if
          you go over.
        </dd>
      </dl>

      <h2>Recording refunds and transfers</h2>
      <p>
        Record a refund in the same expense category as the original purchase. Moving money between
        your own accounts is not income or spending, so do not record it.
      </p>

      <h2>Months and dates</h2>
      <p>
        A month runs from the 1st to its last day, using UK (London) dates. Entries cannot be dated
        in the future.
      </p>
    </article>
  )
}
