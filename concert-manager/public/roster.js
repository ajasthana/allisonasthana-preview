(function () {
  const table = document.getElementById("roster-table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  const headers = table.querySelectorAll("th[data-sort]");
  let currentSort = { key: null, direction: 1 };

  headers.forEach((th) => {
    th.classList.add("sortable");
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      const type = th.dataset.type || "text";
      const direction = currentSort.key === key ? -currentSort.direction : 1;
      currentSort = { key, direction };

      headers.forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(direction === 1 ? "sort-asc" : "sort-desc");

      const rows = Array.from(tbody.querySelectorAll("tr")).filter((row) => row.dataset[key] !== undefined);
      rows.sort((a, b) => {
        const aVal = type === "number" ? Number(a.dataset[key]) : a.dataset[key];
        const bVal = type === "number" ? Number(b.dataset[key]) : b.dataset[key];
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });

      rows.forEach((row) => tbody.appendChild(row));
    });
  });

  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");

      const filter = chip.dataset.filter;
      tbody.querySelectorAll("tr[data-musician_type]").forEach((row) => {
        const matches = filter === "all" || row.dataset.musician_type === filter;
        row.style.display = matches ? "" : "none";
      });
    });
  });
})();
