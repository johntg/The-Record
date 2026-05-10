import { showModalAlert } from "../ui/modal-manager.js";

export function createCallingsActions({
  appState,
  supabase,
  hasAdminPasswordAccess,
  getCurrentUserName,
  normalizeComparableName,
  getHighCouncilVoteSummary,
  applyHighCouncilSummaryToCalling,
  getAssignmentFieldCandidates,
  resolveReleaseAnnouncedUnitsField,
  renderCards,
  renderCurrentPage,
  archiveCallingRecord,
  applyHiddenVisibilityForRow = null,
  showConcernNoticeModal = null,
  sendConcernEmail = null,
}) {
  function canUpdateAssignmentField(field) {
    const assignmentFields = new Set(getAssignmentFieldCandidates());

    if (!assignmentFields.has(field)) {
      return true;
    }

    return hasAdminPasswordAccess();
  }

  function isArchivedStatus(value) {
    return String(value).toLowerCase().trim() === "archived";
  }

  function isShcRoleSession() {
    return (
      String(appState.currentRole || "")
        .toLowerCase()
        .trim() === "shc"
    );
  }

  async function toggleDetails(id) {
    appState.expandedGridId = appState.expandedGridId === id ? null : id;
    renderCards();
  }

  async function toggleHighCouncilDetails(id) {
    if (appState.expandedHcDetailsIds.has(id)) {
      appState.expandedHcDetailsIds.delete(id);
    } else {
      appState.expandedHcDetailsIds.add(id);
    }
    renderCards();
  }

  async function toggleSustainingUnits(id) {
    if (appState.expandedSustainingIds.has(id)) {
      appState.expandedSustainingIds.delete(id);
    } else {
      appState.expandedSustainingIds.add(id);
    }
    renderCards();
  }

  async function toggleReleaseAnnouncementUnits(id) {
    if (appState.expandedReleaseAnnouncementIds.has(id)) {
      appState.expandedReleaseAnnouncementIds.delete(id);
    } else {
      appState.expandedReleaseAnnouncementIds.add(id);
    }
    renderCards();
  }

  async function updateSustainedUnits(id, unitName) {
    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) return;

    let sustaining = Array.isArray(item.units_sustained)
      ? [...item.units_sustained]
      : [];

    if (sustaining.includes(unitName)) {
      sustaining = sustaining.filter((unit) => unit !== unitName);
    } else {
      sustaining.push(unitName);
    }

    item.units_sustained = sustaining;

    const { error } = await supabase
      .from("callings")
      .update({ units_sustained: sustaining })
      .eq("id", id);

    if (error) {
      console.error("Error updating sustaining units:", error);
      await showModalAlert(
        `Failed to update sustaining units: ${error.message}`,
      );
    } else {
      console.log("Sustaining units updated:", sustaining);
      renderCards();
    }
  }

  async function updateReleaseAnnouncedUnits(id, unitName) {
    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) return;

    const field = resolveReleaseAnnouncedUnitsField(item);

    let announcedUnits = Array.isArray(item[field]) ? [...item[field]] : [];

    if (announcedUnits.includes(unitName)) {
      announcedUnits = announcedUnits.filter((unit) => unit !== unitName);
    } else {
      announcedUnits.push(unitName);
    }

    item[field] = announcedUnits;

    const { error } = await supabase
      .from("callings")
      .update({ [field]: announcedUnits })
      .eq("id", id);

    if (error) {
      console.error("Error updating release announced units:", error);
      await showModalAlert(
        `Failed to update release announced units: ${error.message}`,
      );
    } else {
      console.log("Release announced units updated:", announcedUnits);
      renderCards();
    }
  }

  async function submitHighCouncilVote(id, vote) {
    if (!isShcRoleSession()) {
      await showModalAlert(
        "Only members with role SHC can submit High Council votes.",
      );
      return;
    }

    if (!appState.hcVotingTableAvailable) {
      await showModalAlert(
        "High Council voting is not configured in the database yet. Please run the migration for calling_hc_votes.",
      );
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) {
      await showModalAlert("Could not find this item to record the vote.");
      return;
    }

    const currentUser = String(getCurrentUserName() || "").trim();
    if (!currentUser) {
      await showModalAlert("Could not determine the signed-in member.");
      return;
    }

    const isEligibleHighCouncillor = appState.highCouncilNames.some(
      (name) =>
        normalizeComparableName(name) === normalizeComparableName(currentUser),
    );

    if (!isEligibleHighCouncillor) {
      await showModalAlert(
        "Only High Council members can record SHC sustaining votes.",
      );
      return;
    }

    const normalizedVote = String(vote || "")
      .toLowerCase()
      .trim();
    const previousVote = getHighCouncilVoteSummary(id).currentUserVote;

    if (!["sustain", "concern", "clear"].includes(normalizedVote)) {
      await showModalAlert("Invalid vote type.");
      return;
    }

    if (normalizedVote === "clear") {
      const { error: deleteError } = await supabase
        .from("calling_hc_votes")
        .delete()
        .eq("calling_id", id)
        .eq("voter_name", currentUser);

      if (deleteError) {
        console.error("Failed to clear HC vote:", deleteError);
        await showModalAlert(`Failed to clear vote: ${deleteError.message}`);
        return;
      }
    } else {
      const { error: upsertError } = await supabase
        .from("calling_hc_votes")
        .upsert(
          {
            calling_id: id,
            voter_name: currentUser,
            vote: normalizedVote,
            voted_at: new Date().toISOString(),
          },
          { onConflict: "calling_id,voter_name" },
        );

      if (upsertError) {
        console.error("Failed to save HC vote:", upsertError);
        await showModalAlert(`Failed to save vote: ${upsertError.message}`);
        return;
      }
    }

    const { data: latestVotes, error: fetchVotesError } = await supabase
      .from("calling_hc_votes")
      .select("calling_id, voter_name, vote, voted_at")
      .eq("calling_id", id);

    if (fetchVotesError) {
      console.error("Failed to refresh HC votes:", fetchVotesError);
      await showModalAlert(
        `Vote saved, but refreshing vote totals failed: ${fetchVotesError.message}`,
      );
      return;
    }

    appState.hcVotesByCalling[id] = latestVotes || [];

    const previousSustained = Boolean(item.hc_sustained);
    const previousSustainedDate = item.hc_sustained_date;
    applyHighCouncilSummaryToCalling(item);
    const nextSustained = Boolean(item.hc_sustained);

    const updateData = {
      hc_sustained: nextSustained,
      hc_sustained_date: nextSustained
        ? item.hc_sustained_date || new Date().toISOString()
        : null,
    };

    const shouldPersist =
      nextSustained !== previousSustained ||
      (nextSustained && !previousSustainedDate) ||
      (!nextSustained && previousSustainedDate);

    if (shouldPersist) {
      const { error: callingUpdateError } = await supabase
        .from("callings")
        .update(updateData)
        .eq("id", id);

      if (callingUpdateError) {
        console.error(
          "Failed to persist derived hc_sustained fields:",
          callingUpdateError,
        );
        await showModalAlert(
          `Vote saved, but updating call status failed: ${callingUpdateError.message}`,
        );
        return;
      }

      item.hc_sustained = updateData.hc_sustained;
      item.hc_sustained_date = updateData.hc_sustained_date;
    }

    const summary = getHighCouncilVoteSummary(id);
    if (summary.isMajoritySustained) {
      console.log("SHC majority reached.");
    }

    if (normalizedVote === "concern" && previousVote !== "concern") {
      if (typeof sendConcernEmail === "function") {
        const emailResult = await sendConcernEmail(item);

        if (!emailResult?.ok && !emailResult?.skipped) {
          await showModalAlert(
            `Concern recorded, but the email notification failed: ${emailResult.error || "Unknown error"}`,
          );
        }
      }

      if (typeof showConcernNoticeModal === "function") {
        showConcernNoticeModal();
      } else {
        await showModalAlert(
          "You have indicated a concern. Please contact a member of the Stake Presidency as soon as possible. An email indicating your concern will be sent to them.",
        );
      }
    }

    renderCurrentPage();
  }

  async function setHighCouncilBypass(id, enabled) {
    if (!hasAdminPasswordAccess()) {
      await showModalAlert("Admin password is required to use SHC bypass.");
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) {
      await showModalAlert("Could not find this item to update SHC bypass.");
      return;
    }

    const bypassEnabled = Boolean(enabled);
    const updateData = {
      hc_sustained_bypass: bypassEnabled,
      hc_sustained_bypass_by: bypassEnabled ? getCurrentUserName() : null,
      hc_sustained_bypass_at: bypassEnabled ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("callings")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Failed to update SHC bypass:", error);

      if (error.code === "42703") {
        appState.hcBypassAvailable = false;
        await showModalAlert(
          "SHC bypass columns are not in the database yet. Please run the migration for hc_sustained_bypass fields.",
        );
        return;
      }

      await showModalAlert(`Failed to update SHC bypass: ${error.message}`);
      return;
    }

    Object.assign(item, updateData);
    applyHighCouncilSummaryToCalling(item);
    renderCurrentPage();
  }

  async function updateAssignment(id, field, value) {
    if (!canUpdateAssignmentField(field)) {
      await showModalAlert(
        "Assignments require signing in with the admin password.",
      );
      return;
    }

    if (field === "status" && isArchivedStatus(value)) {
      await archiveCallingRecord(id, { confirm: true });
      return;
    }

    const { error } = await supabase
      .from("callings")
      .update({ [field]: value || null })
      .eq("id", id);

    if (error) {
      console.error("Assignment update error:", error);
      await showModalAlert(`Failed to update assignment: ${error.message}`);
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (item) {
      item[field] = value || null;
    }

    renderCurrentPage();
  }

  async function startInlineEdit(id, field) {
    if (!["name", "position"].includes(field)) {
      return;
    }

    if (!hasAdminPasswordAccess()) {
      await showModalAlert(
        "Editing records requires signing in with the admin password.",
      );
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) {
      await showModalAlert("Could not find this record to edit.");
      return;
    }

    appState.activeInlineEdit = { id, field };
    renderCards();
  }

  function cancelInlineEdit() {
    if (!appState.activeInlineEdit) {
      return;
    }

    appState.activeInlineEdit = null;
    renderCards();
  }

  function handleInlineEditKeyup(event, id, field) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitInlineEdit(id, field, event.target.value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
    }
  }

  async function commitInlineEdit(id, field, nextValue) {
    if (
      !appState.activeInlineEdit ||
      appState.activeInlineEdit.id !== id ||
      appState.activeInlineEdit.field !== field
    ) {
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) {
      appState.activeInlineEdit = null;
      renderCards();
      return;
    }

    const currentValue = String(item[field] || "");
    const label = field === "name" ? "name" : "position";
    const cleaned = String(nextValue).trim();

    if (!cleaned) {
      appState.activeInlineEdit = null;
      renderCards();
      return;
    }

    if (cleaned === currentValue) {
      appState.activeInlineEdit = null;
      renderCards();
      return;
    }

    const { data, error } = await supabase
      .from("callings")
      .update({ [field]: cleaned })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(`Failed to update ${field}:`, error);
      await showModalAlert(`Failed to update ${label}: ${error.message}`);
      return;
    }

    item[field] = cleaned;

    if (field === "name" && typeof applyHiddenVisibilityForRow === "function") {
      await applyHiddenVisibilityForRow(data);
    }

    appState.activeInlineEdit = null;
    renderCurrentPage();
  }

  async function archiveCalling(id) {
    await archiveCallingRecord(id, { confirm: true });
  }

  async function updateField(id, field, value) {
    if (field === "hc_sustained") {
      await showModalAlert(
        "SHC Sustained is now calculated from individual High Council votes.",
      );
      return;
    }

    const updateData = {};
    const isSettingApartDoneField = [
      "set_apart",
      "setting_apart_done",
      "sa_done",
      "set_apart_done",
    ].includes(field);

    if (field === "interviewed" || isSettingApartDoneField) {
      updateData[field] = value ? new Date().toISOString() : null;
    } else {
      updateData[field] = value;
    }

    if (value === true) {
      const timestamp = new Date().toISOString();
      if (field === "sp_approved") {
        updateData.sp_approved_date = timestamp;
      } else if (field === "hc_sustained") {
        updateData.hc_sustained_date = timestamp;
      }
    } else if (value === false) {
      if (field === "sp_approved") {
        updateData.sp_approved_date = null;
      } else if (field === "hc_sustained") {
        updateData.hc_sustained_date = null;
      }
    }

    console.log("Updating:", id, "with data:", updateData);

    const { error } = await supabase
      .from("callings")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Update error:", error);
      await showModalAlert(`Failed to update: ${error.message}`);
    } else {
      console.log("Update successful");
      const item = appState.callings.find((calling) => calling.id === id);
      Object.assign(item, updateData);
      renderCurrentPage();
    }
  }

  async function clearHighCouncilVoteForVoter(id, voterName) {
    if (!hasAdminPasswordAccess()) {
      await showModalAlert(
        "Admin password is required to clear another member's vote.",
      );
      return;
    }

    const item = appState.callings.find((calling) => calling.id === id);
    if (!item) {
      await showModalAlert("Could not find this item to update.");
      return;
    }

    const targetVoter = String(voterName || "").trim();
    if (!targetVoter) {
      await showModalAlert("No voter name was provided.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("calling_hc_votes")
      .delete()
      .eq("calling_id", id)
      .eq("voter_name", targetVoter);

    if (deleteError) {
      console.error("Failed to clear HC vote for voter:", deleteError);
      await showModalAlert(`Failed to clear vote: ${deleteError.message}`);
      return;
    }

    const { data: latestVotes, error: fetchVotesError } = await supabase
      .from("calling_hc_votes")
      .select("calling_id, voter_name, vote, voted_at")
      .eq("calling_id", id);

    if (fetchVotesError) {
      console.error("Failed to refresh HC votes:", fetchVotesError);
      await showModalAlert(
        `Vote cleared, but refreshing vote totals failed: ${fetchVotesError.message}`,
      );
      return;
    }

    appState.hcVotesByCalling[id] = latestVotes || [];

    const previousSustained = Boolean(item.hc_sustained);
    const previousSustainedDate = item.hc_sustained_date;
    applyHighCouncilSummaryToCalling(item);
    const nextSustained = Boolean(item.hc_sustained);

    const updateData = {
      hc_sustained: nextSustained,
      hc_sustained_date: nextSustained
        ? item.hc_sustained_date || new Date().toISOString()
        : null,
    };

    const shouldPersist =
      nextSustained !== previousSustained ||
      (nextSustained && !previousSustainedDate) ||
      (!nextSustained && previousSustainedDate);

    if (shouldPersist) {
      const { error: callingUpdateError } = await supabase
        .from("callings")
        .update(updateData)
        .eq("id", id);

      if (callingUpdateError) {
        console.error(
          "Failed to persist derived hc_sustained fields:",
          callingUpdateError,
        );
        await showModalAlert(
          `Vote cleared, but updating call status failed: ${callingUpdateError.message}`,
        );
        return;
      }

      item.hc_sustained = updateData.hc_sustained;
      item.hc_sustained_date = updateData.hc_sustained_date;
    }

    renderCurrentPage();
  }

  return {
    toggleDetails,
    toggleHighCouncilDetails,
    toggleSustainingUnits,
    toggleReleaseAnnouncementUnits,
    updateSustainedUnits,
    updateReleaseAnnouncedUnits,
    submitHighCouncilVote,
    clearHighCouncilVoteForVoter,
    setHighCouncilBypass,
    updateAssignment,
    startInlineEdit,
    cancelInlineEdit,
    handleInlineEditKeyup,
    commitInlineEdit,
    archiveCalling,
    updateField,
  };
}
