function formatTime12h(value) {
  if (!value) return "";
  const [hStr, mStr] = String(value).split(":");
  let hour = parseInt(hStr, 10);
  if (Number.isNaN(hour)) return value;

  const minute = (mStr || "00").padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${period}`;
}

module.exports = { formatTime12h };
