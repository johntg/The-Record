function resolveFirstField(row, candidates, fallback) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return key;
    }
  }

  return fallback;
}

export function resolveSettingApartByField(row) {
  return resolveFirstField(
    row,
    ["setting_apart_by", "sa_assign", "set_apart_by"],
    "setting_apart_by",
  );
}

export function resolveSustainingByField(row) {
  return resolveFirstField(
    row,
    ["sustaining_by", "sus_assigned", "sus_assign", "sustain_by"],
    "sustaining_by",
  );
}

export function resolveSettingApartDoneField(row) {
  return resolveFirstField(
    row,
    ["set_apart", "setting_apart_done", "sa_done", "set_apart_done"],
    "set_apart",
  );
}

export function resolveLcrRecordedField(row) {
  return resolveFirstField(
    row,
    ["lcr_recorded", "recorded_in_lcr", "lcr_done"],
    "lcr_recorded",
  );
}

export function resolveReleaseAnnouncedUnitsField(row) {
  return resolveFirstField(
    row,
    [
      "units_release_announced",
      "units_announced",
      "units_released",
      "release_announced_units",
      "units_sustained",
    ],
    "units_release_announced",
  );
}

export function isCompletedValue(value) {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase().trim();
  return text !== "" && text !== "false" && text !== "0";
}

export function normalizeStatusOptions(rows) {
  if (!Array.isArray(rows)) return [];

  const values = rows
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      return (
        row.status ?? row.name ?? row.label ?? row.value ?? row.option ?? ""
      );
    })
    .map((value) => String(value).trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export function getAssignmentFieldCandidates() {
  return [
    "interview_by",
    "sustaining_by",
    "sus_assigned",
    "sus_assign",
    "sustain_by",
    "setting_apart_by",
    "sa_assign",
    "set_apart_by",
  ];
}

export function normalizeComparableName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
