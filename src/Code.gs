import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bbnfkvlttmhrwslgeotx.supabase.co";
const supabaseKey = "YOUR_PUBLISHABLE_KEY";
export const supabase = createClient(supabaseUrl, supabaseKey);

var SESSION_TTL_SECONDS = 10800;

async function getInitialData() {
  const [callings, units, statuses] = await Promise.all([
    supabase.from("callings").select("*"),
    supabase.from("units").select("name"),
    supabase.from("status_options").select("*"), // If using a lookup table
  ]);

  return {
    callings: callings.data,
    units: units.data.map((u) => u.name),
    statuses: statuses.data,
  };
}

async function saveCalling(payload) {
  const { error } = await supabase.from("callings").insert([
    {
      type: payload.type,
      name: payload.name,
      position: payload.position,
      unit: payload.unit,
      status: "In Progress",
    },
  ]);

  return !error;
}
async function toggleApproval(id, columnName, isChecked) {
  const value = isChecked ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("callings")
    .update({ [columnName]: value }) // e.g., SP_Approved: '2026-04-10...'
    .eq("id", id);

  return !error;
}
async function archiveRow(id) {
  const { error } = await supabase
    .from("callings")
    .update({ status: "Archived" }) // Or move to an archive table
    .eq("id", id);
}

function listReports() {
  try {
    var ss = getSpreadsheet_();
    var reportsSheet = ensureReportsSheet_(ss);
    return {
      success: true,
      reports: getReports_(reportsSheet),
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function generateReport(reportType, generatedBy) {
  try {
    var cleanedReportType = sanitizeValue_(reportType);
    if (
      cleanedReportType !== CONFIG.REPORT_TYPES.OPEN_BY_UNIT &&
      cleanedReportType !== CONFIG.REPORT_TYPES.ASSIGNMENTS_BY_PERSON
    ) {
      throw new Error("Unknown report type.");
    }

    var ss = getSpreadsheet_();
    var callingsSheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);
    var reportsSheet = ensureReportsSheet_(ss);

    if (!callingsSheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var callings = getCallings_(callingsSheet);
    var summary =
      cleanedReportType === CONFIG.REPORT_TYPES.OPEN_BY_UNIT
        ? buildApprovedAwaitingSustainReport_(callings)
        : buildAssignmentsByPersonReport_(callings);

    var generatedAt = Utilities.formatDate(
      new Date(),
      ss.getSpreadsheetTimeZone(),
      "dd/MM/yyyy HH:mm",
    );

    deleteReportsByType_(reportsSheet, cleanedReportType);

    reportsSheet.appendRow([
      generatedAt,
      cleanedReportType,
      sanitizeValue_(generatedBy) || "Unknown",
      summary,
    ]);

    return {
      success: true,
      reports: getReports_(reportsSheet),
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function deleteReports() {
  try {
    var ss = getSpreadsheet_();
    var reportsSheet = ss.getSheetByName(CONFIG.REPORTS_SHEET);

    if (!reportsSheet) {
      return {
        success: true,
        reports: [],
      };
    }

    if (reportsSheet.getLastRow() > 1) {
      reportsSheet.deleteRows(2, reportsSheet.getLastRow() - 1);
    }

    return {
      success: true,
      reports: [],
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function deleteReportsByType_(sheet, reportType) {
  if (!sheet || sheet.getLastRow() <= 1) {
    return;
  }

  var targetType = sanitizeValue_(reportType);
  var values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 4)
    .getDisplayValues();

  for (var i = values.length - 1; i >= 0; i--) {
    var rowType = sanitizeValue_(values[i][1]);
    if (rowType === targetType) {
      sheet.deleteRow(i + 2);
    }
  }
}

function ensureReportsSheet_(ss) {
  var reportsSheet = ss.getSheetByName(CONFIG.REPORTS_SHEET);
  if (!reportsSheet) {
    reportsSheet = ss.insertSheet(CONFIG.REPORTS_SHEET);
  }

  if (reportsSheet.getLastRow() === 0) {
    reportsSheet.appendRow(CONFIG.REPORT_HEADERS);
    return reportsSheet;
  }

  var header = reportsSheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
  if (sanitizeValue_(header[0]).toLowerCase() !== "generated at") {
    reportsSheet.insertRowBefore(1);
    reportsSheet.getRange(1, 1, 1, 4).setValues([CONFIG.REPORT_HEADERS]);
  }

  return reportsSheet;
}

function getReports_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }

  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 4)
    .getDisplayValues()
    .filter(function (row) {
      return row.some(function (value) {
        return sanitizeValue_(value) !== "";
      });
    })
    .map(function (row) {
      return {
        generatedAt: sanitizeValue_(row[0]),
        reportType: sanitizeValue_(row[1]),
        generatedBy: sanitizeValue_(row[2]),
        summary: sanitizeValue_(row[3]),
      };
    });

  return rows.reverse();
}

function buildApprovedAwaitingSustainReport_(callings) {
  if (!callings || callings.length <= 1) {
    return "No callings found.";
  }

  var peopleAwaitingSustain = [];

  for (var i = 1; i < callings.length; i++) {
    var row = callings[i];
    var isApprovedByStakePresidency = sanitizeValue_(row[5]) !== "";
    var isSustainedByHighCouncil = sanitizeValue_(row[6]) !== "";

    if (!isApprovedByStakePresidency || isSustainedByHighCouncil) {
      continue;
    }

    var name = sanitizeValue_(row[2]) || "(Unknown Name)";
    var position = sanitizeValue_(row[3]);
    var unit = sanitizeValue_(row[4]);
    var details = [name];

    if (position) {
      details.push("— " + position);
    }

    if (unit) {
      details.push("(" + unit + ")");
    }

    var votesRaw = sanitizeValue_(row[11]);
    var voteBlock = buildHighCouncilVoteBlock_(votesRaw);

    peopleAwaitingSustain.push(
      details.join(" ") + "\n  High Council votes: " + voteBlock,
    );
  }

  if (peopleAwaitingSustain.length === 0) {
    return "No people are currently awaiting High Council sustaining.";
  }

  return ["Awaiting HC sustain (" + peopleAwaitingSustain.length + ")", ""]
    .concat(peopleAwaitingSustain)
    .join("\n\n");
}

function buildHighCouncilVoteBlock_(votesRaw) {
  var votes = sanitizeValue_(votesRaw)
    .split(",")
    .map(sanitizeValue_)
    .filter(String);

  if (votes.indexOf("High Council") !== -1) {
    return "High Council meeting vote";
  }

  var countedVotes = votes.filter(function (vote) {
    return sanitizeValue_(vote).toLowerCase() !== "high council";
  });

  if (countedVotes.length === 0) {
    return "0/" + CONFIG.HIGH_COUNCIL_VOTE_DISPLAY_TOTAL;
  }

  return (
    countedVotes.length +
    "/" +
    CONFIG.HIGH_COUNCIL_VOTE_DISPLAY_TOTAL +
    " (" +
    countedVotes.join(", ") +
    ")"
  );
}

function buildAssignmentsByPersonReport_(callings) {
  if (!callings || callings.length <= 1) {
    return "No callings found.";
  }

  var byUnit = {};
  var stakeUnitKey = "stake";

  for (var i = 1; i < callings.length; i++) {
    var row = callings[i];
    var unit = sanitizeValue_(row[4]);
    var name = sanitizeValue_(row[2]);
    var position = sanitizeValue_(row[3]);
    var interviewComplete = sanitizeValue_(row[8]) !== "";
    var status = sanitizeValue_(row[14]).toLowerCase();

    if (!unit || !name || !position) {
      continue;
    }

    if (!interviewComplete || status !== "in progress") {
      continue;
    }

    var unitKey = unit.toLowerCase();
    if (!byUnit[unitKey]) {
      byUnit[unitKey] = {
        unitName: unit,
        people: [],
      };
    }

    byUnit[unitKey].people.push(name + " — " + position);
  }

  var unitKeys = Object.keys(byUnit);
  if (unitKeys.length === 0) {
    return "No interviewed in-progress sustaining items found.";
  }

  unitKeys.forEach(function (unitKey) {
    byUnit[unitKey].people.sort();
  });

  var allPeople = [];

  if (byUnit[stakeUnitKey]) {
    byUnit[stakeUnitKey].people.forEach(function (person) {
      allPeople.push(person);
    });
  }

  unitKeys
    .filter(function (unitKey) {
      return unitKey !== stakeUnitKey;
    })
    .sort(function (a, b) {
      return byUnit[a].unitName.localeCompare(byUnit[b].unitName);
    })
    .forEach(function (unitKey) {
      byUnit[unitKey].people.forEach(function (person) {
        allPeople.push(person);
      });
    });

  var intro = "The following have been called to positions in the Stake:";
  var lines = allPeople.map(function (entry) {
    return "- " + entry;
  });
  var closing =
    "It is proposed they be sustained. All in favour indicate by raising the right hand. Any opposed by a like sign.";

  return [intro].concat(lines).concat([closing]).join("\n");
}

function buildSustainingSection_(unitName, people) {
  var intro =
    unitName.toLowerCase() === "stake"
      ? "The following have been called to positions in the Stake:"
      : "The following have been called to positions in the " + unitName + ":";

  var lines = people.map(function (entry) {
    return "- " + entry;
  });

  var closing =
    "It is proposed they be sustained. All in favour indicate by raising the right hand. Any opposed by a like sign.";

  return [intro].concat(lines).concat([closing]).join("\n");
}

function setInterviewAssignee(id, assignee) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedAssignee = sanitizeValue_(assignee);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 8).setValue(cleanedAssignee);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setPreviousReleased(id, isChecked) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var checked = parseBoolean_(isChecked);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 10).setValue(checked);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setSustainingAssignee(id, assignee) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedAssignee = sanitizeValue_(assignee);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 11).setValue(cleanedAssignee);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setSustainingUnits(id, units) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedUnits = sanitizeValue_(units);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 12).setValue(cleanedUnits);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setSettingApartAssignee(id, assignee) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedAssignee = sanitizeValue_(assignee);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 13).setValue(cleanedAssignee);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setStatus(id, status) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedStatus = sanitizeValue_(status);
    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 15).setValue(cleanedStatus);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setName(id, name) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedName = sanitizeValue_(name);
    if (!cleanedName) {
      throw new Error("Name cannot be empty.");
    }

    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 3).setValue(cleanedName);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function setPosition(id, position) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var cleanedPosition = sanitizeValue_(position);
    if (!cleanedPosition) {
      throw new Error("Position cannot be empty.");
    }

    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        sheet.getRange(rowIndex + 1, 4).setValue(cleanedPosition);
        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function archiveRow(id) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    var ss = getSpreadsheet_();
    var callingsSheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);
    var archiveSheet = ss.getSheetByName(CONFIG.ARCHIVE_SHEET);

    if (!callingsSheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    if (!archiveSheet) {
      archiveSheet = ss.insertSheet(CONFIG.ARCHIVE_SHEET);
    }

    var data = callingsSheet.getDataRange().getDisplayValues();
    var rowToArchive = null;
    var rowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === String(id)) {
        rowToArchive = data[i];
        rowIndex = i;
        break;
      }
    }

    if (!rowToArchive) {
      throw new Error("Row ID not found: " + id);
    }

    archiveSheet.appendRow(rowToArchive);
    callingsSheet.deleteRow(rowIndex + 1);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function saveCalling(payload) {
  try {
    var timestamp = sanitizeValue_(payload.timestamp || "");
    var type = sanitizeValue_(payload.type);
    var name = sanitizeValue_(payload.name);
    var position = sanitizeValue_(payload.position);
    var unit = sanitizeValue_(payload.unit);

    if (!timestamp || !type || !name || !position || !unit) {
      throw new Error(
        "Timestamp, type, name, position, and unit are all required.",
      );
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var newRow = [
      timestamp,
      type,
      name,
      position,
      unit,
      "", // SP Approved
      "", // SHC Sustained
      "", // I/V Assigned
      "", // I/V Complete
      "", // Prev-Release
      "", // SusAssigned
      "", // SusUnit
      "", // SA-Assign
      "", // SA Done
      "In Progress", // Status
    ];

    sheet.appendRow(newRow);

    // Log for debugging
    Logger.log("Appended row with status: " + newRow[14]);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function toggleApproval(id, colIndex, isChecked) {
  try {
    if (!id) {
      throw new Error("Missing row ID.");
    }

    if (!colIndex || colIndex < 6 || colIndex > 14) {
      throw new Error("Invalid column index for approval toggle.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    var data = sheet.getDataRange().getDisplayValues();
    for (var rowIndex = 1; rowIndex < data.length; rowIndex++) {
      if (data[rowIndex][0] === String(id)) {
        var cell = sheet.getRange(rowIndex + 1, colIndex);
        if (parseBoolean_(isChecked)) {
          cell.setValue(
            Utilities.formatDate(
              new Date(),
              ss.getSpreadsheetTimeZone(),
              "dd/MM/yyyy HH:mm",
            ),
          );
        } else {
          cell.clearContent();
        }

        return { success: true };
      }
    }

    throw new Error("Row ID not found: " + id);
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function getSpreadsheet_() {
  return CONFIG.SS_ID
    ? SpreadsheetApp.openById(CONFIG.SS_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getAuthOptions() {
  try {
    var ss = getSpreadsheet_();
    var adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET);
    var assignSheet = ss.getSheetByName(CONFIG.ASSIGN_SHEET);
    var admins = getAdmins_(adminSheet);
    var assigners = getAssigners_(assignSheet);
    var allUsers = getAllowedUsers_(admins, assigners);

    if (allUsers.length === 0) {
      return {
        success: false,
        error:
          "No sign-in names found. Add names in column A of the Admin and/or Assign sheets.",
      };
    }

    return {
      success: true,
      users: allUsers,
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}
async function login(password) {
  let email = "";

  if (password === "YourAdminPassword") {
    email = "admin@stake.com";
  } else if (password === "YourStakePassword") {
    email = "user@stake.com";
  } else {
    alert("Incorrect Password");
    return;
  }

  // This replaces your entire "loginUser" Apps Script function
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password, // You'll set this password in the Supabase Users tab
  });

  if (error) {
    alert("Login failed: " + error.message);
  } else {
    console.log("Logged in as:", email);
    // Redirect to dashboard
  }
}

function authorizeRequest_(payload) {
  var action = payload && payload.action ? payload.action : "initialData";
  if (action === "authOptions" || action === "login") {
    return { success: true };
  }

  var token = sanitizeValue_(payload && payload.token);
  if (!token) {
    return {
      success: false,
      authRequired: true,
      error: "Authentication required.",
    };
  }

  var session = getSession_(token);
  if (!session) {
    return {
      success: false,
      authRequired: true,
      error: "Your session has expired. Please sign in again.",
    };
  }

  return {
    success: true,
    user: session,
  };
}

function getUnits_(sheet) {
  if (sheet.getLastRow() <= 1) {
    return [];
  }

  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat()
    .map(sanitizeValue_)
    .filter(String);
}

function getAdmins_(sheet) {
  return getNamedValues_(sheet, {
    admin: true,
    admins: true,
    name: true,
    names: true,
  });
}

function getAssigners_(sheet) {
  return getNamedValues_(sheet, {
    assign: true,
    assignee: true,
    assignees: true,
    interviewer: true,
    interviewers: true,
    name: true,
    names: true,
  });
}

function getStatuses_(sheet) {
  return getNamedValues_(sheet, {
    status: true,
    statuses: true,
  });
}

function getNamedValues_(sheet, headerLike) {
  if (!sheet || sheet.getLastRow() === 0) {
    return [];
  }

  var values = sheet
    .getRange(1, 1, sheet.getLastRow(), 1)
    .getDisplayValues()
    .flat()
    .map(sanitizeValue_)
    .filter(String);

  if (values.length === 0) {
    return [];
  }

  var first = values[0].toLowerCase();
  if (headerLike[first]) {
    return values.slice(1);
  }

  return values;
}

function getAllowedUsers_(admins, assigners) {
  var ordered = [];
  var seen = {};

  function addName(name) {
    var cleaned = sanitizeValue_(name);
    if (!cleaned) {
      return;
    }

    var key = cleaned.toLowerCase();
    if (seen[key]) {
      return;
    }

    seen[key] = true;
    ordered.push(cleaned);
  }

  function findByAliases(aliases) {
    var aliasLookup = {};
    aliases.forEach(function (alias) {
      aliasLookup[sanitizeValue_(alias).toLowerCase()] = true;
    });

    var groups = [admins, assigners];
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].length; i++) {
        var cleaned = sanitizeValue_(groups[g][i]);
        if (cleaned && aliasLookup[cleaned.toLowerCase()]) {
          return cleaned;
        }
      }
    }

    return "";
  }

  // 1) Priority names first
  [
    ["President Pongia"],
    ["President Gardiner"],
    ["President Satele", "President Satale"],
  ].forEach(function (aliases) {
    addName(findByAliases(aliases));
  });

  // 2) Assign list in spreadsheet order (seniority)
  assigners.forEach(addName);

  // 3) Remaining admin names in spreadsheet order
  admins.forEach(addName);

  return ordered;
}

function resolveUserRole_(name, admins, assigners) {
  if (admins.indexOf(name) !== -1) {
    return "admin";
  }

  if (assigners.indexOf(name) !== -1) {
    return "assign";
  }

  return "";
}

function getPasswordForRole_(role) {
  var properties = PropertiesService.getScriptProperties();
  var key = role === "admin" ? "ADMIN_PASSWORD" : "ASSIGN_PASSWORD";
  var password = sanitizeValue_(properties.getProperty(key));

  if (!password) {
    throw new Error(
      "Missing Apps Script property: " +
        key +
        ". Add it in Project Settings → Script properties.",
    );
  }

  return password;
}

function createSessionToken_(name, role) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    getSessionCacheKey_(token),
    JSON.stringify({ name: name, role: role }),
    SESSION_TTL_SECONDS,
  );
  return token;
}

function getSession_(token) {
  var raw = CacheService.getScriptCache().get(getSessionCacheKey_(token));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function getSessionCacheKey_(token) {
  return "stake-callings-session:" + token;
}

function getCallings_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    return [CONFIG.HEADERS];
  }

  return sheet.getDataRange().getDisplayValues();
}

function parseRequestPayload_(e) {
  var payload = {};

  if (e && e.parameter) {
    for (var key in e.parameter) {
      if (Object.prototype.hasOwnProperty.call(e.parameter, key)) {
        payload[key] = e.parameter[key];
      }
    }
  }

  if (e && e.postData && e.postData.contents) {
    var contents = e.postData.contents;
    if (contents && contents.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(contents);
        for (var parsedKey in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, parsedKey)) {
            payload[parsedKey] = parsed[parsedKey];
          }
        }
      } catch (error) {
        throw new Error("Unable to parse JSON request body.");
      }
    }
  }

  return payload;
}

function getAction_(e, fallback) {
  return (e && e.parameter && e.parameter.action) || fallback;
}

function sanitizeValue_(value) {
  return value == null ? "" : String(value).trim();
}

function parseBoolean_(value) {
  return value === true || value === "true" || value === "on";
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function responsePayload_(payload, e) {
  var callback = e && e.parameter ? e.parameter.callback : "";

  if (callback && isValidCallbackName_(callback)) {
    return ContentService.createTextOutput(
      callback + "(" + JSON.stringify(payload) + ");",
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse_(payload);
}

function isValidCallbackName_(name) {
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(name);
}
