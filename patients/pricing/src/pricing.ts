/**
 * Apply a percentage discount to a price. `pct` is a whole percentage,
 * e.g. 20 means 20% off.
 * BUG CLASS: percentage-vs-fraction mismatch (treating 20 as 0.20 → 20.0).
 */
export function applyDiscount(price: number, pct: number): number {
  return price * (1 - pct / 100);
}

/** Sum a cart of line prices, then apply a cart-wide discount. */
export function cartTotal(prices: number[], pct: number): number {
  let subtotal = 0;
  for (const p of prices) subtotal += p;
  return applyDiscount(subtotal, pct);
}

/** Checkout summary line. */
export function checkout(prices: number[], pct: number): string {
  return `Charged $${cartTotal(prices, pct).toFixed(2)}`;
}
