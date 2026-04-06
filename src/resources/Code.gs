var CONFIG = {
  SS_ID: "1cOrkam9VmF0m21gozVUJFAw6drLXeVym15csjLVpw5g",
  CALLINGS_SHEET: "Callings",
  UNITS_SHEET: "Units",
  ASSIGN_SHEET: "Assign",
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

function doGet(e) {
  var action = getAction_(e, "initialData");

  if (action === "initialData") {
    return responsePayload_(getInitialData(), e);
  }

  if (action === "saveCalling") {
    return responsePayload_(saveCalling((e && e.parameter) || {}), e);
  }

  if (action === "toggleApproval") {
    var params = (e && e.parameter) || {};
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

    return {
      success: true,
      units: getUnits_(unitsSheet),
      assigners: getAssigners_(assignSheet),
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

function saveCalling(payload) {
  try {
    var type = sanitizeValue_(payload.type);
    var name = sanitizeValue_(payload.name);
    var position = sanitizeValue_(payload.position);
    var unit = sanitizeValue_(payload.unit);

    if (!type || !name || !position || !unit) {
      throw new Error("Type, name, position, and unit are all required.");
    }

    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(CONFIG.CALLINGS_SHEET);

    if (!sheet) {
      throw new Error('Sheet not found: "' + CONFIG.CALLINGS_SHEET + '".');
    }

    sheet.appendRow([
      new Date(),
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
      CONFIG.DEFAULT_STATUS,
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

function getAssigners_(sheet) {
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
  var headerLike = {
    assign: true,
    assignee: true,
    assignees: true,
    interviewer: true,
    interviewers: true,
    name: true,
    names: true,
  };

  if (headerLike[first]) {
    return values.slice(1);
  }

  return values;
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
