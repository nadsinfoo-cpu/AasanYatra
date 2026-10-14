import { useCallback, useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:5000/api/admin/ride-requests";

export default function AdminRideRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("aasanyatra_token");

      if (!token) {
        throw new Error("Please log in again.");
      }

      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load ride requests.");
      }

      setRequests(result.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function reviewRequest(request, action) {
    const isApproval = action === "approve";

    const confirmed = window.confirm(
      `${isApproval ? "Approve" : "Reject"} driver request #${request.id} for booking ${request.booking_reference}?`
    );

    if (!confirmed) return;

    setProcessingId(request.id);
    setError("");
    setMessage("");

    try {
      const token = localStorage.getItem("aasanyatra_token");

      if (!token) {
        throw new Error("Please log in again.");
      }

      const response = await fetch(
        `${API_URL}/${request.id}/${action}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to review request.");
      }

      await loadRequests();
      setMessage(result.message || "Request updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  const pendingRequests = requests.filter(
    (request) =>
      request.status === "PENDING" &&
      request.booking_status === "CONFIRMED"
  );

  return (
    <section
      style={{
        padding: 24,
        background: "#ffffff",
        borderRadius: 16,
        color: "#172033",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Driver Ride Requests</h2>
          <p style={{ color: "#64748b" }}>
            Review driver requests and assign bookings.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRequests}
          disabled={loading || processingId !== null}
        >
          Refresh
        </button>
      </div>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#15803d" }}>{message}</p>}

      {loading ? (
        <p>Loading ride requests...</p>
      ) : pendingRequests.length === 0 ? (
        <p>No pending ride requests.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                {[
                  "Request ID",
                  "Booking",
                  "Driver",
                  "Phone",
                  "Route",
                  "Vehicle",
                  "Pickup",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {pendingRequests.map((request) => (
                <tr key={request.id}>
                  <td style={{ padding: 12 }}>{request.id}</td>
                  <td style={{ padding: 12 }}>
                    {request.booking_reference}
                  </td>
                  <td style={{ padding: 12 }}>
                    {request.driver_name || `Driver ${request.driver_id}`}
                  </td>
                  <td style={{ padding: 12 }}>
                    {request.driver_phone || "-"}
                  </td>
                  <td style={{ padding: 12 }}>
                    {request.pickup_city || "-"} →{" "}
                    {request.drop_city || "-"}
                  </td>
                  <td style={{ padding: 12 }}>
                    {request.vehicle_type}
                  </td>
                  <td style={{ padding: 12 }}>
                    {request.pickup_datetime
                      ? new Date(request.pickup_datetime).toLocaleString("en-IN")
                      : "-"}
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={processingId !== null}
                        onClick={() => reviewRequest(request, "approve")}
                      >
                        {processingId === request.id
                          ? "Processing..."
                          : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={processingId !== null}
                        onClick={() => reviewRequest(request, "reject")}
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
  );
}