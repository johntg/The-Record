import "./style.css";
import { createClient } from "@supabase/supabase-js";

// --- INITIALIZE ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const appState = {
  callings: [],
  units: [],
  assigners: [],
  statuses: [],
  sessionName: "",
  sessionRole: "",
  sortNewestFirst: true,
};

// --- AUTHENTICATION ---

async function loadAuthOptions() {
  const { data } = await supabase.from("members").select("name").order("name");
  const authSelect = document.getElementById("auth-user");
  authSelect.innerHTML =
    '<option value="">Select your name...</option>' +
    data.map((m) => `<option value="${m.name}">${m.name}</option>`).join("");
}

async function login(e) {
  e.preventDefault();
  const name = e.target.authUser.value;
  const password = e.target.authPassword.value;

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("name", name)
    .single();

  if (!member) return alert("User not in directory");

  // Logic: Check password based on the member's assigned role type
  const isAdmin =
    member.shared_password_type === "admin" && password === "YourAdminPass";
  const isStake =
    member.shared_password_type === "stake" && password === "YourStakePass";

  if (isAdmin || isStake) {
    appState.sessionName = member.name;
    appState.sessionRole = member.role;
    document.getElementById("auth-modal").classList.add("hidden");
    loadData();
  } else {
    alert("Incorrect password.");
  }
}

// --- DATA FETCHING ---

async function loadData() {
  document.getElementById("loader").style.display = "block";

  const [cals, unts, mems, stats] = await Promise.all([
    supabase
      .from("callings")
      .select("*")
      .order("created_at", { ascending: !appState.sortNewestFirst }),
    supabase.from("units").select("name"),
    supabase.from("members").select("name"),
    supabase.from("status_options").select("name"),
  ]);

  appState.callings = cals.data;
  appState.units = unts.data.map((u) => u.name);
  appState.assigners = mems.data.map((m) => m.name);
  appState.statuses = stats.data.map((s) => s.name);

  renderCards();
}

// --- RENDERING (Using your CSS Classes) ---

function renderCards() {
  const list = document.getElementById("data-list");
  document.getElementById("loader").style.display = "none";

  list.innerHTML = appState.callings
    .map((row) => {
      const isRelease = row.type?.toLowerCase() === "release";

      return `
      <article class="card">
        <span class="type-badge ${isRelease ? "type-release" : "type-call"}">${row.type}</span>
        <div class="person-name">${row.name}</div>
        <div class="pos-text">${row.position}</div>
        <div class="unit-text">${row.unit}</div>
        
        <div class="approval-grid">
           <div class="approval-row ${row.sp_approved ? "completion-complete" : "completion-pending"}">
             <label class="approval-item">
               <input type="checkbox" ${row.sp_approved ? "checked" : ""} 
                onchange="toggleField('${row.id}', 'sp_approved', this.checked)">
               <span>S.Pres approved</span>
             </label>
             <small class="approval-date">${row.sp_approved ? new Date(row.sp_approved).toLocaleDateString() : ""}</small>
           </div>
           </div>

        <div class="interview-section">
            <label class="field-label">Status</label>
            <select onchange="updateStatus('${row.id}', this.value)">
              ${appState.statuses.map((s) => `<option value="${s}" ${row.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
            ${appState.sessionRole === "admin" ? `<button class="archive-btn" onclick="archive('${row.id}')">Archive</button>` : ""}
        </div>
      </article>
    `;
    })
    .join("");
}

// --- UPDATES ---

async function toggleField(id, field, isChecked) {
  const val = isChecked ? new Date().toISOString() : null;
  await supabase
    .from("callings")
    .update({ [field]: val })
    .eq("id", id);
  loadData();
}

async function archive(id) {
  if (!confirm("Archive this record?")) return;
  await supabase.from("callings").update({ status: "Archived" }).eq("id", id);
  loadData();
}

// --- INIT ---
document.getElementById("auth-form").addEventListener("submit", login);
loadAuthOptions();
