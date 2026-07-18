function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthKeyFor(year, month) {
  return `${year}-${pad2(month + 1)}`;
}

function buildCalendar(db, monthParam) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    year = Number(monthParam.slice(0, 4));
    month = Number(monthParam.slice(5, 7)) - 1;
  }

  const monthKey = monthKeyFor(year, month);
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  const monthConcerts = db
    .prepare("SELECT id, title, date, slug FROM concerts WHERE date IS NOT NULL AND date != '' AND strftime('%Y-%m', date) = ?")
    .all(monthKey);
  const monthRehearsals = db
    .prepare("SELECT date FROM rehearsals WHERE date IS NOT NULL AND date != '' AND strftime('%Y-%m', date) = ?")
    .all(monthKey);

  const concertsByDate = {};
  monthConcerts.forEach((c) => {
    (concertsByDate[c.date] ||= []).push(c);
  });
  const rehearsalDates = new Set(monthRehearsals.map((r) => r.date));

  const weeks = [];
  let week = new Array(startDay).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
    week.push({
      day,
      iso,
      isToday: iso === todayIso,
      concerts: concertsByDate[iso] || [],
      hasRehearsal: rehearsalDates.has(iso),
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const prevDate = new Date(year, month - 1, 1);
  const nextDate = new Date(year, month + 1, 1);

  return {
    weeks,
    monthLabel: firstOfMonth.toLocaleString("en-US", { month: "long", year: "numeric" }),
    prevParam: monthKeyFor(prevDate.getFullYear(), prevDate.getMonth()),
    nextParam: monthKeyFor(nextDate.getFullYear(), nextDate.getMonth()),
  };
}

module.exports = { buildCalendar };
