import {
  getAssignmentFieldCandidates,
  isCompletedValue,
  resolveReleaseAnnouncedUnitsField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
} from "../utils/app-utils.js";

const STAKE_BUSINESS_STRINGS = {
  en: {
    reportTitle: "Stake Business - in units",
    stakeHeading: "STAKE BUSINESS",
    noItems:
      "No members require sustaining, setting apart, or release at this time.",
    releases: "RELEASES",
    releasedFrom:
      "The following have been released from their positions in the Stake:",
    voteOfThanks:
      "It is proposed they be given a vote of thanks for their service.",
    inFavour: "Those in favour manifest it by the uplifted hand.",
    sustainings: "SUSTAININGS",
    calledToServe:
      "The following have been called to serve in positions in the Stake:",
    proposed: "It is proposed that they be sustained.",
    opposed: "Those opposed, if any, by the same sign.",
  },
  sm: {
    reportTitle: "Pisinisi a le Siteki - i iunite",
    stakeHeading: "PISINISI A LE SITEKI",
    noItems:
      "E leai se tagata e mana'omia le fa'atuatua, fa'ate'a, pe tu'usao i lenei taimi.",
    releases: "FA'ATE'AGA",
    releasedFrom:
      "O i latou o lo'o fa'ailo i lalo na fa'ate'a mai o latou tulaga i le Siteki:",
    voteOfThanks:
      "E tatau ona foa'i atu se vōte o fa'afetai mo lo latou tautua.",
    inFavour: "O i latou e finafinau fa'ailoa mai i le lima seia.",
    sustainings: "FA'ATUATUA",
    calledToServe:
      "O i latou o lo'o fa'ailo i lalo na valaaulia e tautua i tulaga i le Siteki:",
    proposed: "E tatau ona fa'atuatuaina i latou.",
    opposed: "O i latou e tetee, afai e iai, i le faailoga lava lea.",
  },
  to: {
    reportTitle: "Pisinisi ʻa e Steiki - ʻi he ngaahi ʻiuniti",
    stakeHeading: "PISINISI ʻA E STEIKI",
    noItems:
      "ʻOku ʻikai ha kau mēmipa ʻoku fie poupouʻi, tānaki, pe tukuange ʻi he taimi ni.",
    releases: "TUKUANGE",
    releasedFrom:
      "Ko e kakai ʻoku hā ʻi lalo naʻe tukuange mei honau ngāue ʻi he Steiki:",
    voteOfThanks:
      "ʻOku fakafofongaʻi ke foaki ha vouti fakamālohi ki honau ngāue.",
    inFavour: "Ko kinautolu ʻoku tui ke fakaʻasi ʻaki ʻa e nima hake.",
    sustainings: "POUPOU",
    calledToServe:
      "Ko e kakai ʻoku hā ʻi lalo naʻe ui ke ngāue ʻi he ngāue ʻi he Steiki:",
    proposed: "ʻOku fakafofongaʻi ke poupouʻi kinautolu.",
    opposed:
      "Ko kinautolu ʻoku fakaʻikai, kapau ʻoku ai, ʻaki ʻa e fakaʻilonga tatau.",
  },
};

function formatReportHeader(title, count) {
  return `${title}\n${"=".repeat(title.length)}\nItems: ${count}`;
}

function formatNameList(names) {
  return names.length ? names.join(", ") : "None";
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
    return `${formatReportHeader("Awaiting HC Sustaining", 0)}\n\nNo calls are currently awaiting High Council sustaining.`;
  }

  const body = awaiting
    .map((row, index) => {
      const itemType = String(row.type || "CALL").toUpperCase();

      if (
        !hcVotingTableAvailable ||
        typeof getHighCouncilVoteSummary !== "function"
      ) {
        return `${index + 1}. [${itemType}] ${row.name || "(No name)"} — ${row.position || "(No position)"} (${row.unit || "No unit"})\n   - HC voting participation: unavailable`;
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
    { label: "Interview", fields: ["interview_by"], appliesTo: () => true },
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
      if (!items.length) return `${step.label} (0)\n  - None`;

      const lines = items.map((item) => `  - ${item}`).join("\n");
      return `${step.label} (${items.length})\n${lines}`;
    })
    .join("\n\n");

  return `${formatReportHeader("Assignments Not Yet Made", totalMissing)}\n\n${sections}`;
}

function buildUnitSection(unitTitle, releases, toSustain, lang = "en") {
  const t = STAKE_BUSINESS_STRINGS[lang] || STAKE_BUSINESS_STRINGS.en;
  const lines = [];

  lines.push(unitTitle);
  lines.push("=".repeat(unitTitle.length));
  lines.push("");

  if (releases.length > 0) {
    lines.push(t.releases);
    lines.push("");
    lines.push(t.releasedFrom);
    lines.push("");

    releases.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}`,
      );
    });

    lines.push("");
    lines.push(t.voteOfThanks);
    lines.push(t.inFavour);
    lines.push("");
  }

  if (toSustain.length > 0) {
    lines.push(t.sustainings);
    lines.push("");
    lines.push(t.calledToServe);
    lines.push("");

    toSustain.forEach((row, index) => {
      lines.push(
        `  ${index + 1}. ${row.name || "(No name)"} — ${row.position || "(No position)"}`,
      );
    });

    lines.push("");
    lines.push(t.proposed);
    lines.push(t.inFavour);
    lines.push(t.opposed);
    lines.push("");
  }

  return lines.join("\n");
}

function buildSustainSetApartReleaseReport(rows, lang = "en") {
  const unitsSet = new Set(rows.map((row) => row.unit).filter(Boolean));
  const units = Array.from(unitsSet).sort();
  const isInProgress = (row) =>
    String(row.status || "").trim() === "In Progress";

  const hasBeenAnnouncedInAnyUnit = (row) => {
    const releaseAnnouncedUnitsField = resolveReleaseAnnouncedUnitsField(row);
    const announcedUnits = Array.isArray(row[releaseAnnouncedUnitsField])
      ? row[releaseAnnouncedUnitsField]
      : [];

    return announcedUnits
      .map((unit) =>
        String(unit || "")
          .toLowerCase()
          .trim(),
      )
      .some(Boolean);
  };

  const releases = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() === "RELEASE" &&
      isInProgress(row) &&
      isCompletedValue(row.interviewed) &&
      !hasBeenAnnouncedInAnyUnit(row),
  );

  const toSustain = rows.filter(
    (row) =>
      String(row.type || "").toUpperCase() !== "RELEASE" &&
      isInProgress(row) &&
      isCompletedValue(row.interviewed) &&
      (isCompletedValue(row.sp_approved) || isCompletedValue(row.hc_sustained)),
  );
  const reportSections = [];

  const stakeReleases = releases.filter((row) => row.unit === "Stake");
  const stakeToSustain = toSustain.filter((row) => row.unit === "Stake");

  const t = STAKE_BUSINESS_STRINGS[lang] || STAKE_BUSINESS_STRINGS.en;

  if (stakeReleases.length > 0 || stakeToSustain.length > 0) {
    reportSections.push(
      buildUnitSection(t.stakeHeading, stakeReleases, stakeToSustain, lang),
    );
  }

  for (const unit of units) {
    if (unit === "Stake") continue;

    const unitReleases = releases.filter((row) => row.unit === unit);
    const unitToSustain = toSustain.filter((row) => row.unit === unit);

    if (unitReleases.length > 0 || unitToSustain.length > 0) {
      reportSections.push(
        buildUnitSection(unit.toUpperCase(), unitReleases, unitToSustain, lang),
      );
    }
  }

  const totalItems = releases.length + toSustain.length;

  if (reportSections.length === 0) {
    return `${formatReportHeader(t.reportTitle, 0)}\n\n${t.noItems}`;
  }

  return `${formatReportHeader(t.reportTitle, totalItems)}\n\n${reportSections.join("\n\n")}`;
}

function formatArchiveDate(value) {
  if (!value) return "Unknown date";

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Unknown date";
  }

  return new Date(timestamp).toLocaleDateString();
}

function getRowDateValue(row, candidates) {
  for (const key of candidates) {
    const value = row?.[key];
    if (!value) continue;

    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return value;
    }
  }

  return null;
}

function getArchiveSortDate(row) {
  return (
    getRowDateValue(row, [
      "archived_at",
      "updated_at",
      "created_at",
      "release_date",
      "released_at",
      "date_released",
      "released_on",
      resolveSettingApartDoneField(row),
    ]) || ""
  );
}

function buildArchiveItemsReport(archiveRows, reportContext = {}) {
  const pageSize =
    Number(reportContext.pageSize) > 0 ? reportContext.pageSize : 25;
  const rows = Array.isArray(archiveRows) ? [...archiveRows] : [];

  rows.sort((a, b) => {
    const aTime = new Date(getArchiveSortDate(a) || 0).getTime();
    const bTime = new Date(getArchiveSortDate(b) || 0).getTime();
    return bTime - aTime;
  });

  if (!rows.length) {
    return `${formatReportHeader("Archive Items", 0)}\n\nNo archived items found.`;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pages = [];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const start = pageIndex * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const lines = [];

    lines.push(`Page ${pageIndex + 1} of ${totalPages}`);
    lines.push("-".repeat(20));

    pageRows.forEach((row, idx) => {
      const itemNumber = start + idx + 1;
      const isRelease = String(row.type || "").toUpperCase() === "RELEASE";
      const name = row.name || "(No name)";
      const calling = row.position || "(No calling)";

      if (isRelease) {
        const releaseDate =
          getRowDateValue(row, [
            "release_date",
            "released_at",
            "date_released",
            "released_on",
            "updated_at",
            "archived_at",
            "created_at",
          ]) || "";

        lines.push(
          `${itemNumber}. ${name} — ${calling}\n   Release date: ${formatArchiveDate(releaseDate)}`,
        );
        return;
      }

      const setApartDate = getRowDateValue(row, [
        resolveSettingApartDoneField(row),
        "set_apart_date",
        "setting_apart_date",
      ]);
      const setApartByField = resolveSettingApartByField(row);
      const setApartBy =
        String(row?.[setApartByField] || "").trim() || "(Not recorded)";

      lines.push(
        `${itemNumber}. ${name} — ${calling}\n   Set apart: ${formatArchiveDate(setApartDate)}\n   Set apart by: ${setApartBy}`,
      );
    });

    pages.push(lines.join("\n"));
  }

  return `${formatReportHeader("Archive Items", rows.length)}\n\n${pages.join("\n\n")}`;
}

export function generateReport(type, rows, reportContext = {}) {
  if (type === "archive-items") {
    return buildArchiveItemsReport(reportContext.archivedRows, reportContext);
  }

  if (type === "sustain-setapart-release") {
    return buildSustainSetApartReleaseReport(
      rows,
      reportContext.language || "en",
    );
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
