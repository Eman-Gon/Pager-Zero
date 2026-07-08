/**
 * Tax owed on an amount at a given rate.
 * BUG CLASS: wrong arithmetic operator (add vs. multiply).
 */
export function computeTax(amount: number, rate: number): number {
  return amount * rate;
}

/** Grand total for an invoice line: subtotal plus its tax. */
export function invoiceTotal(subtotal: number, rate: number): number {
  return subtotal + computeTax(subtotal, rate);
}

/** Human-readable receipt line. */
export function renderInvoice(subtotal: number, rate: number): string {
  return `Total due: $${invoiceTotal(subtotal, rate).toFixed(2)}`;
}
