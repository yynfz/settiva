export class AmountError extends Error {
  readonly status = 422;
  readonly details = undefined;
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parseExactAmountToAtomic(
  amountStr: string,
  decimals: number,
): { atomic: string; display: string } {
  const trimmed = amountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AmountError(
      "invalid_amount",
      "Amount must be a positive decimal number",
    );
  }

  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  if (fractionalPart.length > decimals) {
    throw new AmountError(
      "invalid_decimals",
      `Amount cannot have more than ${decimals} decimal places`,
    );
  }

  const paddedFraction = fractionalPart.padEnd(decimals, "0");
  const fullAtomicStr = integerPart + paddedFraction;
  const atomicBigInt = BigInt(fullAtomicStr.replace(/^0+/, "") || "0");

  if (atomicBigInt <= 0n) {
    throw new AmountError(
      "invalid_amount",
      "Amount must be strictly greater than zero",
    );
  }

  // Normalized display format
  const normalizedDisplay = fractionalPart
    ? `${integerPart}.${fractionalPart}`
    : `${integerPart}.00`;

  return {
    atomic: atomicBigInt.toString(),
    display: normalizedDisplay,
  };
}

export function computeItemTotal(
  quantity: string,
  unitPriceStr: string,
  decimals: number,
): { totalDisplay: string; totalAtomic: string } {
  const { atomic: unitAtomic } = parseExactAmountToAtomic(
    unitPriceStr,
    decimals,
  );
  const quantityText = String(quantity);
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(quantityText)) {
    throw new AmountError(
      "invalid_quantity",
      "Quantity must be an exact positive number with at most four decimal places.",
    );
  }
  const [whole, fraction = ""] = quantityText.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const product = BigInt(unitAtomic) * BigInt(whole + fraction);
  if (product % denominator !== 0n)
    throw new AmountError(
      "subatomic_total",
      "Item total has a fraction of one token atomic unit. Adjust quantity or unit price.",
    );
  const totalAtomicBigInt = product / denominator;

  if (totalAtomicBigInt <= 0n) {
    throw new AmountError(
      "invalid_total",
      "Item total must be greater than zero",
    );
  }

  const atomicStr = totalAtomicBigInt.toString();
  const len = atomicStr.length;
  let display: string;
  if (decimals === 0) {
    display = atomicStr;
  } else if (len <= decimals) {
    const frac = atomicStr.padStart(decimals, "0");
    display = `0.${frac}`.replace(/0+$/, "").replace(/\.$/, ".00");
  } else {
    const intPart = atomicStr.slice(0, len - decimals);
    const fracPart = atomicStr.slice(len - decimals).replace(/0+$/, "");
    display = fracPart ? `${intPart}.${fracPart}` : `${intPart}.00`;
  }

  return {
    totalDisplay: display,
    totalAtomic: atomicStr,
  };
}
