var CONFIG = {
  SS_ID: "1cOrkam9VmF0m21gozVUJFAw6drLXeVym15csjLVpw5g",
  CALLINGS_SHEET: "Callings",
  UNITS_SHEET: "Units",
  ADMIN_SHEET: "Admin",
  ASSIGN_SHEET: "Assign",
  STATUS_SHEET: "Status",
  ARCHIVE_SHEET: "Archive",
  DEFAULT_STATUS: "",
  HEADERS: [
    "Timestamp",
    "Type",
    "Name",
    "Position",
    "Unit",
    "SP Approved",
    "SHC Sustained",
    "I/V Assigned",
    "I/V Complete",
    "Prev-Release",
    "SusAssigned",
    "SusUnit",
    "SA-Assign",
    "SA Done",
    "Status",
  ],
};

var SESSION_TTL_SECONDS = 10800;

function doGet(e) {
  var action = getAction_(e, "initialData");
  var params = (e && e.parameter) || {};

  if (action === "authOptions") {
    return responsePayload_(getAuthOptions(), e);
  }

  if (action === "login") {
    return responsePayload_(loginUser(params.name, params.password), e);
  }

  var authResult = authorizeRequest_(params);
  if (!authResult.success) {
    return responsePayload_(authResult, e);
  }

  if (action === "initialData") {
    return responsePayload_(getInitialData(), e);
  }

  if (action === "saveCalling") {
    return responsePayload_(saveCalling(params), e);
  }

  if (action === "toggleApproval") {
    return responsePayload_(
      toggleApproval(params.id, Number(params.colIndex), params.isChecked),
      e,
    );
  }

  if (action === "setInterviewAssignee") {
    var assigneeParams = (e && e.parameter) || {};
    return responsePayload_(
      setInterviewAssignee(assigneeParams.id, assigneeParams.assignee),
      e,
    );
  }

  if (action === "setPreviousReleased") {
    var previousReleasedParams = (e && e.parameter) || {};
    return responsePayload_(
      setPreviousReleased(
        previousReleasedParams.id,
        previousReleasedParams.isChecked,
      ),
      e,
    );
  }

  if (action === "setSustainingAssignee") {
    var susAssigneeParams = (e && e.parameter) || {};
    return responsePayload_(
      setSustainingAssignee(susAssigneeParams.id, susAssigneeParams.assignee),
      e,
    );
  }

  if (action === "setSustainingUnits") {
    var susUnitsParams = (e && e.parameter) || {};
    return responsePayload_(
      setSustainingUnits(susUnitsParams.id, susUnitsParams.units),
      e,
    );
  }

  if (action === "setSettingApartAssignee") {
    var saAssigneeParams = (e && e.parameter) || {};
    return responsePayload_(
      setSettingApartAssignee(saAssigneeParams.id, saAssigneeParams.assignee),
      e,
    );
  }

  if (action === "setStatus") {
    var statusParams = (e && e.parameter) || {};
    return responsePayload_(setStatus(statusParams.id, statusParams.status), e);
  }

  if (action === "archiveRow") {
    if (!authResult.user || authResult.user.role !== "admin") {
      return responsePayload_(
        {
          success: false,
          error: "Only admins can archive rows.",
        },
        e,
      );
    }
    var archiveParams = (e && e.parameter) || {};
    return responsePayload_(archiveRow(archiveParams.id), e);
  }

  return responsePayload_(
    {
      success: false,
      error: 'Unknown GET action: "' + action + '"',
    },
    e,
  );
}

function doPost(e) {
  var payload = parseRequestPayload_(e);
  var action = payload.action || "saveCalling";

  if (action === "login") {
    return jsonResponse_(loginUser(payload.name, payload.password));
  }

  var authResult = authorizeRequest_(payload);
  if (!authResult.success) {
    return jsonResponse_(authResult);
  }

  if (action === "initialData") {
    return jsonResponse_(getInitialData());
  }

  if (action === "saveCalling") {
    return jsonResponse_(saveCalling(payload));
  }

  if (action === "toggleApproval") {
    return jsonResponse_(
      toggleApproval(payload.id, Number(payload.colIndex), payload.isChecked),
    );
  }

  if (action === "setInterviewAssignee") {
    return jsonResponse_(setInterviewAssignee(payload.id, payload.assignee));
  }

  if (action === "setPreviousReleased") {
    return jsonResponse_(setPreviousReleased(payload.id, payload.isChecked));
  }

  if (action === "setSustainingAssignee") {
    return jsonResponse_(setSustainingAssignee(payload.id, payload.assignee));
  }

  if (action === "setSustainingUnits") {
    return jsonResponse_(setSustainingUnits(payload.id, payload.units));
  }

  if (action === "setSettingApartAssignee") {
    return jsonResponse_(setSettingApartAssignee(payload.id, payload.assignee));
  }

  if (action === "setStatus") {
    return jsonResponse_(setStatus(payload.id, payload.status));
  }

  if (action === "archiveRow") {
    if (!authResult.user || authResult.user.role !== "admin") {
      return jsonResponse_({
        success: false,
        error: "Only admins can archive rows.",
      });
    }
    return jsonResponse_(archiveRow(payload.id));
  }

  return jsonResponse_({
    success: false,
    error: 'Unknown POST action: "' + action + '"',
  });
}

function getInitialData() {
  try {
    var ss = getSpreadsheet_();
    var unitsSheet = ss.getSheetByName(CONFIG.UNITS_SHEET);
    var callingsSheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);
    var adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET);
    var assignSheet = ss.getSheetByName(CONFIG.ASSIGN_SHEET);

    if (!unitsSheet || !callingsSheet) {
      return {
        success: false,
        error:
          'Required sheet missing. Expected sheets named "' +
          CONFIG.UNITS_SHEET +
          '" and "' +
          CONFIG.CALLINGS_SHEET +
          '".',
      };
    }

    var statusSheet = ss.getSheetByName(CONFIG.STATUS_SHEET);

    return {
      success: true,
      units: getUnits_(unitsSheet),
      admins: getAdmins_(adminSheet),
      assigners: getAssigners_(assignSheet),
      statuses: getStatuses_(statusSheet),
      callings: getCallings_(callingsSheet),
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
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

    sheet.appendRow([
      timestamp,
      type,
      name,
      position,
      unit,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "In Progress",
    ]);

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

function loginUser(name, password) {
  try {
    var cleanedName = sanitizeValue_(name);
    var cleanedPassword = sanitizeValue_(password);

    if (!cleanedName || !cleanedPassword) {
      throw new Error("Name and password are required.");
    }

    var ss = getSpreadsheet_();
    var adminSheet = ss.getSheetByName(CONFIG.ADMIN_SHEET);
    var assignSheet = ss.getSheetByName(CONFIG.ASSIGN_SHEET);
    var admins = getAdmins_(adminSheet);
    var assigners = getAssigners_(assignSheet);
    var role = resolveUserRole_(cleanedName, admins, assigners);

    if (!role) {
      throw new Error("Selected user is not allowed to access this app.");
    }

    var expectedPassword = getPasswordForRole_(role);
    if (cleanedPassword !== expectedPassword) {
      throw new Error("Incorrect password.");
    }

    var token = createSessionToken_(cleanedName, role);
    return {
      success: true,
      token: token,
      user: {
        name: cleanedName,
        role: role,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
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
  var seen = {};
  return admins
    .concat(assigners)
    .filter(function (name) {
      if (!name || seen[name]) {
        return false;
      }
      seen[name] = true;
      return true;
    })
    .sort();
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
