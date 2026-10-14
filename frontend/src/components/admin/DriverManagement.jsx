
import { useCallback, useEffect, useState } from "react";

const API = "http://127.0.0.1:5000/api/drivers/admin";

async function adminRequest(path, options = {}) {
  const token = localStorage.getItem("aasanyatra_token");

  if (!token) throw new Error("Please log in as Super Admin.");

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Request failed.");
  }

  return result;
}

const panel = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  marginBottom: 18,
};

const button = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  cursor: "pointer",
  background: "#fff",
};

export default function DriverManagement() {
  const [tab, setTab] = useState("documents");
  const [drivers, setDrivers] = useState([]);
  const [documents, setDocuments] = useState([]);
const [allDocuments, setAllDocuments] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
     const [profilesResult, documentsResult, allResult, allDocumentsResult] =
  await Promise.all([
    adminRequest("/profiles"),
    adminRequest("/documents"),
    adminRequest("/profiles/all?limit=100"),
    adminRequest("/documents/all"),
  ]);

      setDrivers(profilesResult.profiles || []);
      setDocuments(documentsResult.documents || []);
setAllDocuments(allDocumentsResult.documents || []);
      setAllDrivers(
        allResult.profiles || allResult.drivers || []
      );
    } catch (err) {
      setError(err.message || "Unable to load driver records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
async function viewDocument(doc) {
  const token = localStorage.getItem("aasanyatra_token");

  // Open immediately so the browser doesn't block the tab.
  const newTab = window.open("", "_blank");

  if (!newTab) {
    setError("Please allow pop-ups for document viewing.");
    return;
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:5000/api/drivers/admin/documents/${doc.id}/view`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Unable to open document (HTTP ${response.status}).`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    newTab.location.href = url;

    // Release the object URL later, after the new tab has loaded.
    newTab.addEventListener(
      "load",
      () => URL.revokeObjectURL(url),
      { once: true }
    );

  } catch (error) {
    newTab.close();
    setError(error.message);
  }
}
  async function reviewDocument(doc, status) {
    const notes =
      status === "REJECTED"
        ? window.prompt("Enter reason for rejection:")
        : window.prompt("Verification remarks (optional):", "");

    if (notes === null) return;

    if (status === "REJECTED" && !notes.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    if (
      !window.confirm(
        `Confirm ${status.toLowerCase()} for document #${doc.id}?`
      )
    ) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await adminRequest(
        `/documents/${doc.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            admin_notes: notes.trim(),
          }),
        }
      );

      setMessage(result.message || "Document reviewed.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewDriver(driver, status) {
    const notes =
      status === "REJECTED"
        ? window.prompt("Enter reason for rejection:")
        : "";

    if (notes === null) return;

    if (status === "REJECTED" && !notes.trim()) {
      setError("Rejection reason is required.");
      return;
    }

    if (
      !window.confirm(
        `Confirm ${status.toLowerCase()} for driver #${driver.driver_id}?`
      )
    ) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await adminRequest(
        `/profiles/${driver.driver_id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            admin_notes: notes.trim(),
          }),
        }
      );

      setMessage(result.message || "Driver reviewed.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filteredDrivers = allDrivers.filter((driver) => {
    const searchable = [
      driver.id,
      driver.full_name,
      driver.phone,
      driver.vehicle_registration_number,
    ]
      .join(" ")
      .toLowerCase();

    return (
      searchable.includes(search.toLowerCase()) &&
      (!statusFilter || driver.approval_status === statusFilter)
    );
  });

  return (
    <div style={{ color: "#172033" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 20,
      }}>
        <div>
          <h1>Driver Management</h1>
          <p>Manage driver applications and document verification.</p>
        </div>

        <button
          type="button"
          style={button}
          disabled={loading || busy}
          onClick={loadData}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}>
        {[
          ["Pending Drivers", drivers.length],
          ["Pending Documents", documents.length],
          ["Loaded Drivers", allDrivers.length],
        ].map(([label, value]) => (
          <div key={label} style={panel}>
            <p>{label}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </div>

      {message && (
        <p role="status" style={{ color: "#15803d" }}>
          {message}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 18,
      }}>
        {[
         ["documents", "Document Verification"],
["allDocuments", "All Documents"],
["applications", "Driver Applications"],
["all", "All Drivers"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              ...button,
              background: tab === id ? "#155eef" : "#fff",
              color: tab === id ? "#fff" : "#172033",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "documents" && (
        <section style={panel}>
          <h2>Pending Document Verification</h2>

          {documents.length === 0 ? (
            <p>No pending documents.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>Document ID</th>
                    <th>Driver</th>
                    <th>Type</th>
                    <th>Number</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.id}</td>
                      <td>
                        {doc.full_name || doc.phone ||
                          `Driver #${doc.driver_id}`}
                      </td>
                      <td>{doc.document_type}</td>
                      <td>{doc.document_number || "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            style={button}
                            disabled={busy}
                            onClick={() =>
                              reviewDocument(doc, "VERIFIED")
                            }
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            style={button}
                            disabled={busy}
                            onClick={() =>
                              reviewDocument(doc, "REJECTED")
                            }
                          >
                            Reject
                          </button>
<button
  type="button"
  onClick={() => viewDocument(doc)}
  disabled={busy}
>
  View Document
</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
{tab === "allDocuments" && (
  <section style={panel}>
    <h2>All Driver Documents ({allDocuments.length})</h2>

    {allDocuments.length === 0 ? (
      <p>No driver documents found.</p>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th>Document ID</th>
              <th>Driver ID</th>
              <th>Driver</th>
              <th>Document Type</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {allDocuments.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.id}</td>
                <td>{doc.driver_id}</td>
                <td>{doc.full_name || doc.phone || "-"}</td>
                <td>{doc.document_type}</td>
                <td>{doc.verification_status}</td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={button}
                      disabled={busy}
                      onClick={() => viewDocument(doc)}
                    >
                      View Document
                    </button>

                    {doc.verification_status === "PENDING" && (
                      <>
                        <button
                          type="button"
                          style={button}
                          disabled={busy}
                          onClick={() => reviewDocument(doc, "VERIFIED")}
                        >
                          Verify
                        </button>

                        <button
                          type="button"
                          style={button}
                          disabled={busy}
                          onClick={() => reviewDocument(doc, "REJECTED")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
)}
      {tab === "applications" && (
        <section style={panel}>
          <h2>Pending Driver Applications</h2>

          {drivers.length === 0 ? (
            <p>No pending driver applications.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>Driver ID</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Vehicle</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => (
                    <tr key={driver.driver_id}>
  <td>{driver.driver_id}</td>
                      <td>{driver.full_name || "-"}</td>
                      <td>{driver.phone || "-"}</td>
                      <td>
                        {driver.vehicle_registration_number || "-"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            style={button}
                            disabled={busy}
                            onClick={() =>
                              reviewDriver(driver, "APPROVED")
                            }
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            style={button}
                            disabled={busy}
                            onClick={() =>
                              reviewDriver(driver, "REJECTED")
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "all" && (
        <section style={panel}>
          <h2>All Drivers</h2>

          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
          }}>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile or vehicle"
              style={{ padding: 10, flex: 1, minWidth: 200 }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: 10 }}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>

          {filteredDrivers.length === 0 ? (
            <p>No matching drivers.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Vehicle</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((driver) => (
                    <tr key={driver.id}>
                      <td>{driver.id}</td>
                      <td>{driver.full_name || "-"}</td>
                      <td>{driver.phone || "-"}</td>
                      <td>
                        {driver.vehicle_registration_number || "-"}
                      </td>
                      <td>{driver.approval_status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
