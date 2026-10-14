
import { useEffect, useState } from "react";
import {
  getDriverProfile,
  getDriverDocuments,
  resubmitDriverProfile,
  uploadDriverDocument,
} from "../services/api";

export default function DriverDashboard({ user, onLogout, onSwitchDashboard }) {
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [documentType, setDocumentType] = useState("DRIVING_LICENSE");
  const [documentNumber, setDocumentNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
const [availableRides, setAvailableRides] = useState([]);
const [ridesLoading, setRidesLoading] = useState(false);
const [acceptingRideId, setAcceptingRideId] = useState(null);
const [rideError, setRideError] = useState("");
const [rideMessage, setRideMessage] = useState("");
async function loadAvailableRides() {
  setRidesLoading(true);
  setRideError("");

  try {
    const token = localStorage.getItem("aasanyatra_token");

    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      "http://127.0.0.1:5000/api/driver-bookings/available",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Unable to load rides.");
    }

    setAvailableRides(result.bookings || []);
  } catch (err) {
    setRideError(err.message);
  } finally {
    setRidesLoading(false);
  }
}

async function requestRide(ride) {
  if (!window.confirm(`Request booking ${ride.booking_reference}?`)) {
    return;
  }

  setAcceptingRideId(ride.id);
  setRideError("");
  setRideMessage("");

  try {
    const token = localStorage.getItem("aasanyatra_token");

    if (!token) {
      throw new Error("Please log in again.");
    }

    const response = await fetch(
      `http://127.0.0.1:5000/api/driver-ride-requests/${ride.id}/request`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Unable to request ride.");
    }

    setRideMessage(
      result.message ||
        (result.status === "APPROVED"
          ? "Ride assigned successfully."
          : "Ride request submitted. Waiting for Super Admin approval.")
    );

    // In AUTO mode, the assigned ride disappears from available rides.
    // In MANUAL mode, it remains available to other eligible drivers.
    if (result.status === "APPROVED") {
      await loadAvailableRides();
    }
  } catch (err) {
    setRideError(err.message);
  } finally {
    setAcceptingRideId(null);
  }
}  async function handleDocumentUpload(event) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Please select a document file.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await uploadDriverDocument({
        file: selectedFile,
        documentType,
        documentNumber,
        expiryDate,
      });

      setMessage(result.message || "Document uploaded successfully. Awaiting admin verification.");
      setDocumentNumber("");
      setExpiryDate("");
      setSelectedFile(null);

      event.target?.reset();
      await loadDriverData();
    } catch (err) {
      setError(err.message || "Document upload failed.");
    } finally {
      setUploading(false);
    }
  }


  async function loadDriverData() {
    setLoading(true);
    setError("");

    try {
      const [profileResult, documentResult] = await Promise.all([
        getDriverProfile(),
        getDriverDocuments(),
      ]);

      setProfile(profileResult.driver || profileResult.profile || null);
      setDocuments(documentResult.documents || []);
    } catch (err) {
      setError(err.message || "Unable to load driver information.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDriverData();
  }, []);

  async function handleResubmit() {
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const result = await resubmitDriverProfile();
      setMessage(result.message || "Application resubmitted.");
      await loadDriverData();
    } catch (err) {
      setError(err.message || "Unable to resubmit application.");
    } finally {
      setSubmitting(false);
    }
  }

  const status = profile?.approval_status || "NOT_REGISTERED";
useEffect(() => {
  if (status === "APPROVED") {
    loadAvailableRides();
  } else {
    setAvailableRides([]);
  }
}, [status]);

  const statusColors = {
    APPROVED: "#15803d",
    PENDING: "#b45309",
    REJECTED: "#b91c1c",
    SUSPENDED: "#7c3aed",
    NOT_REGISTERED: "#64748b",
  };

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 20,
    marginBottom: 18,
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f4f7fb",
      padding: "24px",
      color: "#172033",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}>
          <div>
            <h1 style={{ margin: 0 }}>AasanYatra 2.0</h1>
            <p>Driver Dashboard</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {onSwitchDashboard && (
              <button type="button" onClick={onSwitchDashboard}>
                Passenger Dashboard
              </button>
            )}
            <button type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        {message && <p role="status" style={{ color: "#15803d" }}>{message}</p>}
        {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}

        {loading ? (
          <p>Loading driver information...</p>
        ) : (
          <>
            <section style={cardStyle}>
              <h2>Driver Account</h2>
              <p><strong>Mobile:</strong> {user?.phone || "N/A"}</p>
              <p><strong>User ID:</strong> {user?.id || "N/A"}</p>
              <p>
                <strong>Approval Status: </strong>
                <span style={{ color: statusColors[status] || "#64748b", fontWeight: 700 }}>
                  {status.replaceAll("_", " ")}
                </span>
              </p>

              {profile?.admin_notes && (
                <p style={{ color: "#b91c1c" }}>
                  <strong>Admin Remarks:</strong> {profile.admin_notes}
                </p>
              )}
            </section>

            <section style={cardStyle}>
              <h2>Vehicle Information</h2>
              {profile ? (
                <>
                  <p><strong>Vehicle Type:</strong> {profile.vehicle_type || "N/A"}</p>
                  <p><strong>Make:</strong> {profile.vehicle_make || "N/A"}</p>
                  <p><strong>Model:</strong> {profile.vehicle_model || "N/A"}</p>
                  <p><strong>Registration:</strong> {profile.vehicle_registration_number || "N/A"}</p>
                  <p><strong>Seats:</strong> {profile.vehicle_seats ?? "N/A"}</p>
                </>
              ) : (
                <p>No driver profile found.</p>
              )}
            </section>
{status === "APPROVED" && (
  <section style={cardStyle}>
    <h2>Available Ride Requests</h2>
    <p>View and accept bookings matching your vehicle.</p>

    <button
      type="button"
      onClick={loadAvailableRides}
      disabled={ridesLoading}
      style={{ marginBottom: 15, padding: 10 }}
    >
      {ridesLoading ? "Loading..." : "Refresh Available Rides"}
    </button>

    {rideError && (
      <p role="alert" style={{ color: "#b91c1c" }}>
        {rideError}
      </p>
    )}

    {rideMessage && (
      <p role="status" style={{ color: "#15803d" }}>
        {rideMessage}
      </p>
    )}

    {!ridesLoading && availableRides.length === 0 && (
      <p>No available rides matching your vehicle right now.</p>
    )}

    {availableRides.length > 0 && (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Pickup</th>
              <th>Destination</th>
              <th>Date & Time</th>
              <th>Vehicle</th>
              <th>Fare</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {availableRides.map((ride) => (
              <tr key={ride.id}>
                <td>{ride.booking_reference}</td>
                <td>{ride.pickup_city || ride.pickup_address}</td>
                <td>{ride.drop_city || ride.drop_address}</td>
                <td>
                  {new Date(ride.pickup_datetime).toLocaleString("en-IN")}
                </td>
                <td>{ride.vehicle_type}</td>
                <td>₹{ride.estimated_fare}</td>
                <td>
                  <button
                    type="button"
                    disabled={acceptingRideId !== null}
                    onClick={() => requestRide(ride)}
                    style={{
                      background: "#155eef",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      padding: "10px 14px",
                      cursor: "pointer",
                    }}
                  >
                    {acceptingRideId === ride.id
                      ? "Accepting..."
                      : "Request Ride"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
)}
            <section style={cardStyle}>
              <h2>Driver Documents</h2>

              {documents.length === 0 ? (
                <p>No documents uploaded yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 10 }}>Document</th>
                        <th style={{ padding: 10 }}>Status</th>
                        <th style={{ padding: 10 }}>Admin Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: 10 }}>{doc.document_type?.replaceAll("_", " ")}</td>
                          <td style={{ padding: 10 }}>{doc.verification_status}</td>
                          <td style={{ padding: 10 }}>{doc.admin_notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>


            {profile && status !== "APPROVED" && (
              <section style={cardStyle}>
                <h2>Upload Driver Document</h2>
                <p>
                  Upload genuine documents for verification.
                  Accepted formats: PDF, JPG, PNG (maximum 5 MB).
                </p>

                <form
                  onSubmit={handleDocumentUpload}
                  style={{ display: "grid", gap: 14, maxWidth: 520 }}
                >
                  <label>
                    Document Type
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      required
                      style={{ display: "block", width: "100%", padding: 10 }}
                    >
                      <option value="DRIVING_LICENSE">Driving Licence</option>
                      <option value="VEHICLE_RC">Vehicle RC</option>
                      <option value="INSURANCE">Vehicle Insurance</option>
                      <option value="PERMIT">Vehicle Permit</option>
                    </select>
                  </label>

                  <label>
                    Document Number
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="Enter document number"
                      required
                      maxLength={100}
                      style={{ display: "block", width: "100%", padding: 10 }}
                    />
                  </label>

                  <label>
                    Expiry Date (if applicable)
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      style={{ display: "block", width: "100%", padding: 10 }}
                    />
                  </label>

                  <label>
                    Select Document
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setSelectedFile(e.target.files?.[0] || null)
                      }
                      required
                      style={{ display: "block", marginTop: 8 }}
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={uploading}
                    style={{
                      background: "#155eef",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      padding: "12px 18px",
                      cursor: uploading ? "wait" : "pointer",
                    }}
                  >
                    {uploading ? "Uploading..." : "Upload Document"}
                  </button>
                </form>
              </section>
            )}


            {status === "REJECTED" && (
              <section style={cardStyle}>
                <h2>Resubmit Driver Application</h2>
                <p>
                  Upload genuine replacement documents before resubmitting.
                  Driving Licence, Vehicle RC and Insurance are required.
                </p>
                <button
                  type="button"
                  onClick={handleResubmit}
                  disabled={submitting}
                  style={{
                    background: "#155eef",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    padding: "12px 18px",
                    cursor: "pointer",
                  }}
                >
                  {submitting ? "Submitting..." : "Resubmit Application"}
                </button>
              </section>
            )}

            <button type="button" onClick={loadDriverData}>
              Refresh Dashboard
            </button>
          </>
        )}
      </div>
    </main>
  );
}
