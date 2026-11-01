export function normalizeBarcode(value: string) {
  const digits = value.trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits))
    throw new Error("Use an EAN-8, UPC-A, EAN-13 or GTIN-14 barcode.");
  let sum = 0;
  for (
    let i = digits.length - 2, weight = 3;
    i >= 0;
    i--, weight = weight === 3 ? 1 : 3
  )
    sum += Number(digits[i]) * weight;
  if ((10 - (sum % 10)) % 10 !== Number(digits.at(-1)))
    throw new Error("Barcode check digit is invalid.");
  return digits.padStart(14, "0");
}
