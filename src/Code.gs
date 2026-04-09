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
