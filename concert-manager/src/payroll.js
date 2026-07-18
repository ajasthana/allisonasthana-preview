function parseFee(value) {
  if (!value) return 0;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

function formatCurrency(amount) {
  return "$" + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { parseFee, formatCurrency };
