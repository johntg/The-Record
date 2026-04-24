export function createCardsRenderer({
  appState,
  getSortedVisibleCallings,
  hasAdminPasswordAccess,
  isStakePasswordSession,
  getHighCouncilVoteSummary,
  resolveSustainingByField,
  resolveSettingApartByField,
  resolveSettingApartDoneField,
  resolveLcrRecordedField,
  isCompletedValue,
  escapeHtml,
  documentRef = document,
  windowRef = window,
}) {
  function isInlineEditingField(id, field) {
    return (
      appState.activeInlineEdit?.id === id &&
      appState.activeInlineEdit?.field === field
    );
  }

  function renderEditableCardField(row, field, tagName, style) {
    const label = field === "name" ? "name" : "position";
    const currentValue = String(row[field] || "");

    if (isInlineEditingField(row.id, field)) {
      return `
        <input
          type="text"
          class="inline-edit-input"
          data-inline-edit="true"
          value="${escapeHtml(currentValue)}"
          aria-label="Edit ${label}"
          onkeyup="window.handleInlineEditKeyup(event, '${row.id}', '${field}')"
          onblur="window.commitInlineEdit('${row.id}', '${field}', this.value)"
          style="${style}"
        />
      `;
    }

    return `
      <${tagName}
        class="editable-field"
        title="Click to edit ${label}"
        onclick="window.startInlineEdit('${row.id}', '${field}')"
        style="${style}"
      >${escapeHtml(currentValue)}</${tagName}>
    `;
  }

  function focusActiveInlineEdit() {
    if (typeof documentRef === "undefined" || !appState.activeInlineEdit) {
      return;
    }

    windowRef.requestAnimationFrame(() => {
      const input = documentRef.querySelector("[data-inline-edit='true']");
      if (!input || documentRef.activeElement === input) {
        return;
      }

      input.focus();
      input.select();
    });
  }

  function renderCards() {
    const list = documentRef.getElementById("data-list");
    if (!list) return;

    const reportsPage = documentRef.getElementById("reports-page");
    if (reportsPage) {
      reportsPage.classList.add("hidden");
    }

    list.classList.remove("hidden");

    const rowsToRender = getSortedVisibleCallings();

    if (!rowsToRender.length) {
      list.innerHTML = `
        <article class="card">
          <div style="padding: 25px; text-align: center; color: #666;">
            No assigned callings to display.
          </div>
        </article>
      `;
      return;
    }

    list.innerHTML = rowsToRender
      .map((row) => {
        const canAssign = hasAdminPasswordAccess();
        const isExpanded = appState.expandedGridId === row.id;
        const isRelease = row.type?.toUpperCase() === "RELEASE";
        const sustainingByField = resolveSustainingByField(row);
        const sustainingBy = row[sustainingByField] || "";
        const settingApartByField = resolveSettingApartByField(row);
        const settingApartDoneField = resolveSettingApartDoneField(row);
        const lcrRecordedField = resolveLcrRecordedField(row);
        const settingApartBy = row[settingApartByField] || "";
        const settingApartDone = isCompletedValue(row[settingApartDoneField]);
        const lcrRecorded = isCompletedValue(row[lcrRecordedField]);
        const voteSummary = getHighCouncilVoteSummary(row.id);
        const isHcBypassed = row.hc_sustained_bypass === true;
        const currentUserVote = voteSummary.currentUserVote;
        const showVotingControls =
          !isRelease &&
          appState.hcVotingTableAvailable &&
          isStakePasswordSession() &&
          voteSummary.canVote;
        const isHcDetailsExpanded = appState.expandedHcDetailsIds.has(row.id);
        const hasExtraHcDetails =
          !isRelease &&
          appState.hcVotingTableAvailable &&
          (hasAdminPasswordAccess() ||
            Boolean(row.hc_sustained_date) ||
            isHcBypassed);
        const currentStatus = (row.status || "In Progress").trim();
        const statusOptions = [...appState.statusOptions];
        if (currentStatus && !statusOptions.includes(currentStatus)) {
          statusOptions.unshift(currentStatus);
        }
        const visibleStatusOptions = hasAdminPasswordAccess()
          ? statusOptions
          : statusOptions.filter(
              (status) => status.toLowerCase().trim() !== "archived",
            );

        return `
        <article class="card">
          <div style="background: ${isRelease ? "var(--banner-release-bg)" : "var(--banner-call-bg)"}; 
          padding: 10px; text-align: center; font-weight: 900; color: ${isRelease ? "var(--banner-release-text)" : "var(--banner-call-text)"};">
            ${isRelease ? "RELEASE" : "CALLING"}
          </div>

          <div style="padding: 18px;">
            ${renderEditableCardField(row, "name", "h2", "margin: 0; font-size: 1.6rem;")}
            ${renderEditableCardField(row, "position", "p", "color: var(--text-muted); margin: 4px 0;")}
            <p style="color: var(--unit-soft); font-weight: bold;">${row.unit}</p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0;">
              <label class="workflow-block ${row.sp_approved ? "done" : ""}" style="display: flex; flex-direction: column; gap: 6px; padding: 10px; background: ${row.sp_approved ? "var(--block-done)" : "var(--block-pending)"}; color: var(--workflow-text); border-radius: 12px; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <input type="checkbox" ${row.sp_approved ? "checked" : ""} onchange="window.updateField('${row.id}', 'sp_approved', this.checked)">
                  <span style="font-weight: bold;">S.Pres Approved</span>
                </div>
                ${row.sp_approved_date ? `<span style="font-size: 0.75rem; color: var(--workflow-date); margin-left: 26px;">${new Date(row.sp_approved_date).toLocaleDateString()}</span>` : ""}
              </label>

              <div class="workflow-block ${row.hc_sustained ? "done" : ""}" style="display: flex; flex-direction: column; gap: 8px; padding: 10px; background: ${row.hc_sustained ? "var(--block-done)" : "var(--block-pending)"}; color: var(--workflow-text); border-radius: 12px;">
                <span style="font-weight: bold;">SHC Sustaining</span>

                ${
                  isRelease
                    ? `
                  <div style="padding: 6px; border-radius: 6px; background: var(--surface-muted); text-align: center; font-weight: 700; color: var(--text-muted);">
                    N/A
                  </div>
                `
                    : `
                  ${
                    appState.hcVotingTableAvailable
                      ? `
                    <span style="font-size: 0.78rem; color: var(--workflow-date);">Sustain: ${voteSummary.sustainCount} | Concern: ${voteSummary.concernCount} | Pending: ${voteSummary.pendingCount}</span>
                  `
                      : `
                    <span style="font-size: 0.78rem; color: #8b1e1e; font-weight: 600;">
                      Voting table missing in database. Run migration to enable per-member SHC votes.
                    </span>
                  `
                  }

                  ${
                    showVotingControls
                      ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px;">
                      <button
                        type="button"
                        onclick="window.submitHighCouncilVote('${row.id}', 'sustain')"
                        style="padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border); background: ${currentUserVote === "sustain" ? "var(--chip-selected-bg)" : "var(--white)"}; color: ${currentUserVote === "sustain" ? "var(--chip-selected-text)" : "var(--text)"}; font-weight: 700; cursor: pointer;"
                      >Sustain</button>
                     
                      <button
                          type="button"
                          class="concern-btn ${currentUserVote === "concern" ? "is-selected" : ""}"
                          onclick="${
                            currentUserVote === "concern" &&
                            hasAdminPasswordAccess()
                              ? `window.submitHighCouncilVote('${row.id}', 'clear')`
                              : `window.handleConcernClick(event, '${row.id}')`
                          }"
                          style="padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border); font-weight: 700;"
                          ${currentUserVote === "concern" && !hasAdminPasswordAccess() ? "disabled" : ""}
                        >
                          ${
                            currentUserVote === "concern"
                              ? hasAdminPasswordAccess()
                                ? "Undo Concern"
                                : "Concerned"
                              : "Concern"
                          }
                        </button>

                    <button
                      type="button"
                      onclick="window.submitHighCouncilVote('${row.id}', 'clear')"
                      style="margin-top: 2px; padding: 5px 8px; border-radius: 8px; border: 1px dashed var(--border); background: transparent; color: var(--text-muted); font-weight: 600; cursor: pointer;"
                    >Clear my vote</button>
                  `
                      : ""
                  }

                  ${
                    hasExtraHcDetails
                      ? `
                    <button
                      type="button"
                      onclick="window.toggleHighCouncilDetails('${row.id}')"
                      style="margin-top: 2px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--accent-border); background: var(--accent-soft); color: var(--accent-text); font-weight: 700; cursor: pointer;"
                    >${isHcDetailsExpanded ? "▲ Hide SHC details" : "▼ Show SHC details"}</button>
                  `
                      : ""
                  }

                  ${
                    isHcDetailsExpanded && appState.hcVotingTableAvailable
                      ? `
                    <div style="margin-top: 4px; display: grid; gap: 4px; font-size: 0.75rem; color: var(--workflow-date);">
                      <span>Majority required: ${voteSummary.majorityCount || "-"} of ${voteSummary.eligibleCount}</span>
                      ${
                        isHcBypassed
                          ? `<span style="color: var(--danger-text); font-weight: 700;">Admin bypass enabled${row.hc_sustained_bypass_by ? ` by ${escapeHtml(row.hc_sustained_bypass_by)}` : ""}</span>`
                          : ""
                      }
                      ${
                        row.hc_sustained_date
                          ? `<span>Majority reached: ${new Date(row.hc_sustained_date).toLocaleDateString()}</span>`
                          : ""
                      }
                    </div>
                    ${
                      hasAdminPasswordAccess()
                        ? `
                      <div style="margin-top: 4px; font-size: 0.75rem; color: var(--workflow-date); display: grid; gap: 3px;">
                        
                      <div>
                        <strong>Sustained by:</strong>
                        ${
                          voteSummary.sustainVoters.length
                            ? `
                          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                            ${voteSummary.sustainVoters
                              .map(
                                (name) => `
                              <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: var(--surface-subtle); border: 1px solid var(--border); color: var(--text);">
                                ${escapeHtml(name)}
                                <button
                                  type="button"
                                  onclick="window.clearHighCouncilVoteForVoter('${row.id}', '${escapeHtml(name)}')"
                                  style="border: none; background: transparent; color: var(--danger-text); font-weight: 700; cursor: pointer; padding: 0;"
                                  title="Clear this vote"
                                >×</button>
                              </span>
                            `,
                              )
                              .join("")}
                          </div>
                        `
                            : " None"
                        }
                      </div>

                      <div>
                        <strong>Unable to sustain:</strong>
                        ${
                          voteSummary.concernVoters.length
                            ? `
                          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                            ${voteSummary.concernVoters
                              .map(
                                (name) => `
                              <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: var(--danger-soft); border: 1px solid var(--border); color: var(--danger-text);">
                                ${escapeHtml(name)}
                                <button
                                  type="button"
                                  onclick="window.clearHighCouncilVoteForVoter('${row.id}', '${escapeHtml(name)}')"
                                  style="border: none; background: transparent; color: var(--danger-text); font-weight: 700; cursor: pointer; padding: 0;"
                                  title="Clear this vote"
                                >×</button>
                              </span>
                            `,
                              )
                              .join("")}
                          </div>
                        `
                            : " None"
                        }
                      </div>

                      </div>
                      <div style="margin-top: 6px; display: grid; gap: 6px;">
                        <button
                          type="button"
                          onclick="window.setHighCouncilBypass('${row.id}', ${isHcBypassed ? "false" : "true"})"
                          style="padding: 7px 8px; border-radius: 8px; border: 1px solid var(--border); background: ${isHcBypassed ? "var(--danger-soft)" : "var(--surface-subtle)"}; color: ${isHcBypassed ? "var(--danger-text)" : "var(--text)"}; font-weight: 700; cursor: pointer;"
                        >${isHcBypassed ? "Disable training bypass" : "Enable training bypass (mark pass)"}</button>
                        ${
                          !appState.hcBypassAvailable
                            ? `<span style="font-size: 0.72rem; color: #8b1e1e; font-weight: 600;">Bypass DB columns not found. Run migration to enable this control.</span>`
                            : ""
                        }
                      </div>
                    `
                        : ""
                    }
                  `
                      : ""
                  }
                `
                }
              </div>
            </div>

            <button onclick="window.toggleDetails('${row.id}')" 
              style="width: 100%; padding: 10px; background: var(--surface-subtle); border: 1px solid var(--border); border-radius: 8px; font-weight: bold; color: var(--text-muted); cursor: pointer;">
              ${isExpanded ? "▲ Hide Details" : "▼ More Details"}
            </button>

            <div style="display: ${isExpanded ? "block" : "none"}; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border);">
              <p style="font-size: 0.8rem; color: var(--text-subtle); margin-bottom: 8px;">DETAILED STEPS:</p>
              <div style="background: var(--surface-panel); padding: 12px; border-radius: 10px; border: 1px solid var(--border);">
                <div style="display: grid; gap: 10px; margin-bottom: 10px;">
                  <div>
                    <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Interview assigned to</label>
                    <select
                      onchange="window.updateAssignment('${row.id}', 'interview_by', this.value)"
                      ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                      style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                    >
                      <option value="">Assignment pending...</option>
                      ${appState.assignableNames
                        .map(
                          (name) =>
                            `<option value="${name}" ${row.interview_by === name ? "selected" : ""}>${name}</option>`,
                        )
                        .join("")}
                    </select>
                  </div>

                  <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${row.interviewed ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.interviewed ? "checked" : ""} onchange="window.updateField('${row.id}', 'interviewed', this.checked)">
                    <span>Interview completed</span>
                  </label>

                  ${
                    isRelease
                      ? ""
                      : `<label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${row.prev_release ? "var(--warning-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                    <input type="checkbox" ${row.prev_release ? "checked" : ""} onchange="window.updateField('${row.id}', 'prev_release', this.checked)">
                    <span>Reminder: verify previous release</span>
                  </label>`
                  }
                </div>

                ${
                  isRelease
                    ? ""
                    : `
                  <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
                    <div style="margin-bottom: 10px;">
                      <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Sustaining assigned to</label>
                      <select
                        onchange="window.updateAssignment('${row.id}', '${sustainingByField}', this.value)"
                        ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                        style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                      >
                        <option value="">Assignment pending</option>
                        ${appState.assignableNames
                          .map(
                            (name) =>
                              `<option value="${name}" ${sustainingBy === name ? "selected" : ""}>${name}</option>`,
                          )
                          .join("")}
                      </select>
                    </div>

                    <button onclick="window.toggleSustainingUnits('${row.id}')" style="width: 100%; padding: 8px; background: var(--accent-soft); border: 1px solid var(--accent-border); border-radius: 8px; font-weight: 600; color: var(--accent-text); cursor: pointer; font-size: 0.9rem;">
                      ${appState.expandedSustainingIds.has(row.id) ? "▲ Hide" : "▼ Show"} Sustaining Units
                    </button>

                    ${
                      appState.expandedSustainingIds.has(row.id)
                        ? `
                      <div style="margin-top: 10px; padding: 10px; background: var(--surface-muted); border-radius: 8px;">
                        <p style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin: 0 0 10px 0; text-transform: uppercase;">Units to sustain</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                          ${appState.units
                            .map((unit) => {
                              const selectedUnits = Array.isArray(
                                row.units_sustained,
                              )
                                ? row.units_sustained
                                : [];
                              const isSelected = selectedUnits.includes(unit);
                              return `
                              <button
                                onclick="window.updateSustainedUnits('${row.id}', '${unit}')"
                                style="padding: 7px 10px; border-radius: 20px; border: 1px solid var(--border); background: ${isSelected ? "var(--chip-selected-bg)" : "var(--white)"}; color: ${isSelected ? "var(--chip-selected-text)" : "var(--text)"}; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;"
                              >
                                ${unit}
                              </button>
                            `;
                            })
                            .join("")}
                        </div>
                      </div>
                    `
                        : ""
                    }
                  </div>

                  <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); display: grid; gap: 10px;">
                    <div>
                      <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Setting apart assigned to</label>
                      <select
                        onchange="window.updateAssignment('${row.id}', '${settingApartByField}', this.value)"
                        ${canAssign ? "" : "disabled title='Admin password required for assignments'"}
                        style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                      >
                        <option value="">Assignment pending...</option>
                        ${appState.assignableNames
                          .map(
                            (name) =>
                              `<option value="${name}" ${settingApartBy === name ? "selected" : ""}>${name}</option>`,
                          )
                          .join("")}
                      </select>
                    </div>

                    <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${settingApartDone ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                      <input type="checkbox" ${settingApartDone ? "checked" : ""} onchange="window.updateField('${row.id}', '${settingApartDoneField}', this.checked)">
                      <span>Setting apart completed</span>
                    </label>

                    <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: ${lcrRecorded ? "var(--success-soft)" : "var(--surface-muted)"}; color: var(--text); font-weight: 600; cursor: pointer;">
                      <input type="checkbox" ${lcrRecorded ? "checked" : ""} onchange="window.updateField('${row.id}', '${lcrRecordedField}', this.checked)">
                      <span>Recorded in LCR</span>
                    </label>
                  </div>
                  `
                }

                <div style="margin: 10px 0 0 0;">
                  <label style="display: block; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-bottom: 6px; text-transform: uppercase;">Status</label>
                  <select
                    onchange="window.updateAssignment('${row.id}', 'status', this.value)"
                    style="width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); color: var(--text); font-size: 0.95rem;"
                  >
                    ${visibleStatusOptions
                      .map(
                        (status) =>
                          `<option value="${status}" ${currentStatus === status ? "selected" : ""}>${status}</option>`,
                      )
                      .join("")}
                  </select>

                  ${
                    hasAdminPasswordAccess()
                      ? `
                    <button
                      onclick="window.archiveCalling('${row.id}')"
                      style="margin-top: 8px; width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--danger-soft); color: white; font-weight: 700; cursor: pointer;"
                    >
                      Archive
                    </button>
  `
                      : ""
                  }
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
      })
      .join("");

    focusActiveInlineEdit();
  }

  return { renderCards };
}
