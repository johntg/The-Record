import {
  getAssignmentFieldCandidates,
  isCompletedValue,
} from "../utils/app-utils.js";

function formatReportHeader(title, count) {
  return `${title}\n${"=".repeat(title.length)}\nItems: ${count}`;
}

function formatNameList(names) {
  return names.length ? names.join(", ") : "None";
}

function formatBypassLabel(row) {
  return row?.hc_sustained_bypass === true ? " [PASS (Admin Bypass)]" : "";
}

function buildAwaitingShcReport(rows, reportContext = {}) {
  const { getHighCouncilVoteSummary = null, hcVotingTableAvailable = true } =
    reportContext;

  const awaiting = rows.filter(
    (row) =>
      isCompletedValue(row.sp_approved) &&
      !isCompletedValue(row.hc_sustained) &&
      String(row.status || "")
        .toLowerCase()
        .trim() !== "archived",
  );

  if (!awaiting.length) {
    return `${formatReportHeader("Awaiting HC Sustaining", 0)}\n\nNo calls or releases are currently awaiting High Council sustaining.`;
  }

  const body = awaiting
    .map((row, index) => {
      const itemType = String(row.type || "CALL").toUpperCase();

      if (
        !hcVotingTableAvailable ||
        typeof getHighCouncilVoteSummary !== "function"
      ) {
        return `${index + 1}. [${itemType}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})\n   - HC voting participation: unavailable (database voting table not configured)`;
      }

      const voteSummary = getHighCouncilVoteSummary(row.id);
      const votedNames = [
        ...(voteSummary?.sustainVoters || []),
        ...(voteSummary?.concernVoters || []),
      ];

      return `${index + 1}. [${itemType}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})\n   - Voted (${votedNames.length}/${voteSummary?.eligibleCount || 0}): ${formatNameList(votedNames)}\n   - Not voted (${voteSummary?.pendingCount || 0}): ${formatNameList(voteSummary?.pendingVoters || [])}`;
    })
    .join("\n");

  return `${formatReportHeader("Awaiting HC Sustaining", awaiting.length)}\n\n${body}`;
}

function buildAssignmentsByPersonReport(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    getAssignmentFieldCandidates().forEach((field) => {
      const person = String(row[field] || "").trim();
      if (!person) return;

      const existing = grouped.get(person) || [];
      existing.push(
        `${row.name || "(No name)"} — ${row.position || "(No position)"} [${field}]`,
      );
      grouped.set(person, existing);
    });
  });

  if (!grouped.size) {
    return `${formatReportHeader("Assignments by Person", 0)}\n\nNo assignments found.`;
  }

  const sections = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([person, items]) => {
      const lines = items.map((item) => `  - ${item}`).join("\n");
      return `${person}\n${lines}`;
    })
    .join("\n\n");

  return `${formatReportHeader("Assignments by Person", grouped.size)}\n\n${sections}`;
}

function buildStatusSummaryReport(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const status = String(row.status || "In Progress").trim() || "In Progress";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const lines = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `- ${status}: ${count}`)
    .join("\n");

  return `${formatReportHeader("Status Summary", rows.length)}\n\n${lines || "No callings found."}`;
}

function buildUnassignedAssignmentsReport(rows) {
  const steps = [
    {
      label: "Interview",
      fields: ["interview_by"],
      appliesTo: () => true,
    },
    {
      label: "Sustaining",
      fields: ["sustaining_by", "sus_assigned", "sus_assign", "sustain_by"],
      appliesTo: (row) => String(row.type || "").toUpperCase() !== "RELEASE",
    },
    {
      label: "Setting Apart",
      fields: ["setting_apart_by", "sa_assign", "set_apart_by"],
      appliesTo: (row) => String(row.type || "").toUpperCase() !== "RELEASE",
    },
  ];

  const grouped = new Map();
  steps.forEach((step) => grouped.set(step.label, []));

  rows.forEach((row) => {
    steps.forEach((step) => {
      if (!step.appliesTo(row)) return;

      const hasAssignment = step.fields.some((field) =>
        String(row[field] || "").trim(),
      );

      if (!hasAssignment) {
        grouped
          .get(step.label)
          .push(
            `[${String(row.type || "CALL").toUpperCase()}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})`,
          );
      }
    });
  });

  const totalMissing = [...grouped.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );

  if (!totalMissing) {
    return `${formatReportHeader("Assignments Not Yet Made", 0)}\n\nAll applicable assignments have been made.`;
  }

  const sections = steps
    .map((step) => {
      const items = grouped.get(step.label) || [];
      if (!items.length) {
        return `${step.label} (0)\n  - None`;
      }

      const lines = items.map((item) => `  - ${item}`).join("\n");
      return `${step.label} (${items.length})\n${lines}`;
    })
    .join("\n\n");

  return `${formatReportHeader("Assignments Not Yet Made", totalMissing)}\n\n${sections}`;
}

function buildUnitSection(unitTitle, releases, toSustain) {
  const lines = [];
  lines.push(`${unitTitle}`);
  lines.push("-".repeat(unitTitle.length));

  if (releases.length > 0) {
    lines.push(
      "RELEASE - The following have been released from positions in the Stake: ",
    );
    releases.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}`,
      );
    });
    lines.push("");
    lines.push(
      "It is proposed they be given a vote of thanks for their service. Those in favour manifest it by the uplifted hand.",
    );
    lines.push("");
  }

  if (toSustain.length > 0) {
    lines.push("The following have been called to positions in the Stake:");
    toSustain.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}${formatBypassLabel(row)}`,
      );
    });
    lines.push(
      "It is proposed they be sustained. Those in favour manifest it by the uplifted hand. Any opposed by the same sign",
    );
  }

  return lines.join("\n");
}

function buildSustainSetApartReleaseReport(rows) {
  const unitsSet = new Set(rows.map((row) => row.unit).filter(Boolean));
  const units = Array.from(unitsSet).sort();

  const releases = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() === "RELEASE" &&
      String(row.status || "")
        .toLowerCase()
        .trim() !== "archived",
  );

  const toSustain = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() !== "RELEASE" &&
      String(row.status || "").trim() === "In Progress" &&
      isCompletedValue(row.interviewed) &&
      (isCompletedValue(row.sp_approved) || isCompletedValue(row.hc_sustained)),
  );

  const reportSections = [];

  const stakeReleases = releases.filter((row) => row.unit === "Stake");
  const stakeToSustain = toSustain.filter((row) => row.unit === "Stake");

  if (stakeReleases.length > 0 || stakeToSustain.length > 0) {
    reportSections.push(
      buildUnitSection("STAKE BUSINESS", stakeReleases, stakeToSustain),
    );
  }

  for (const unit of units) {
    if (unit === "Stake") continue;

    const unitReleases = releases.filter((row) => row.unit === unit);
    const unitToSustain = toSustain.filter((row) => row.unit === unit);

    if (unitReleases.length > 0 || unitToSustain.length > 0) {
      reportSections.push(
        buildUnitSection(unit.toUpperCase(), unitReleases, unitToSustain),
      );
    }
  }

  const totalItems = releases.length + toSustain.length;
  if (reportSections.length === 0) {
    return `${formatReportHeader("Stake Business - in wards", 0)}\n\nNo members require sustaining, setting apart, or release at this time.`;
  }

  return `${formatReportHeader("Stake Business - in wards", totalItems)}\n\n${reportSections.join("\n\n")}`;
}

export function generateReport(type, rows, reportContext = {}) {
  if (type === "sustain-setapart-release") {
    return buildSustainSetApartReleaseReport(rows);
  }

  if (type === "unassigned-assignments") {
    return buildUnassignedAssignmentsReport(rows);
  }

  if (type === "assignments-by-person") {
    return buildAssignmentsByPersonReport(rows);
  }

  if (type === "status-summary") {
    return buildStatusSummaryReport(rows);
  }

  return buildAwaitingShcReport(rows, reportContext);
}
