import { useEffect, useMemo, useState } from "react";

const API_URL = "http://127.0.0.1:5000/api/admin";

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN");
}

function formatFare(value) {
  if (value === null || value === undefined) return "—";

  return `₹${Number(value).toLocaleString("en-IN")}`;
}

export default function PassengerManagement() {
  const [passengers, setPassengers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadPassengers() {
      try {
        setLoading(true);
        setError("");

        const token = localStorage.getItem("aasanyatra_token");

        if (!token) throw new Error("Please log in again.");

        const response = await fetch(`${API_URL}/passengers`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load passengers.");
        }

        if (!controller.signal.aborted) {
          setPassengers(result.data || []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPassengers();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedId === null) return;

    const controller = new AbortController();

    async function loadDetails() {
      try {
        setDetailsLoading(true);
        setDetailsError("");
        setDetails(null);

        const token = localStorage.getItem("aasanyatra_token");

        if (!token) throw new Error("Please log in again.");

        const response = await fetch(`${API_URL}/passengers/${selectedId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Unable to load passenger details.",
          );
        }

        if (!controller.signal.aborted) {
          setDetails(result.data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setDetailsError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailsLoading(false);
        }
      }
    }

    loadDetails();

    return () => controller.abort();
  }, [selectedId]);

  const filteredPassengers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return passengers.filter(
      (passenger) =>
        String(passenger.full_name || "")
          .toLowerCase()
          .includes(query) ||
        String(passenger.phone || "")
          .toLowerCase()
          .includes(query),
    );
  }, [passengers, search]);

  function closeDetails() {
    setSelectedId(null);
    setDetails(null);
    setDetailsError("");
  }

  if (selectedId !== null) {
    return (
      <section className="ay-passengers-page">
        <button
          type="button"
          className="ay-primary-button"
          onClick={closeDetails}
          style={{ marginBottom: 20 }}
        >
          ← Back to Passengers
        </button>

        <h1>Passenger Details</h1>

        {detailsLoading && <p>Loading passenger details...</p>}

        {detailsError && (
          <p role="alert" className="ay-passengers-error">
            {detailsError}
          </p>
        )}

        {!detailsLoading && details && (
          <>
            <div
              className="ay-passenger-profile"
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <h2>{details.passenger.full_name || "Passenger"}</h2>

              <p>
                <strong>Passenger ID:</strong> #{details.passenger.id}
              </p>

              <p>
                <strong>Mobile:</strong> {details.passenger.phone}
              </p>

              <p>
                <strong>Status:</strong> {details.passenger.status}
              </p>

              <p>
                <strong>Registered:</strong>{" "}
                {formatDate(details.passenger.created_at)}
              </p>

              <p>
                <strong>Total Bookings:</strong> {details.total_bookings}
              </p>
            </div>

            <h2>Booking History</h2>

            <p>
              Showing {details.bookings.length} most recent bookings out of{" "}
              {details.total_bookings}.
            </p>

            <div className="ay-passengers-table-wrap">
              <table className="ay-passengers-table">
                <thead>
                  <tr>
                    <th>Booking Reference</th>
                    <th>Type</th>
                    <th>Pickup</th>
                    <th>Drop</th>
                    <th>Travel Date</th>
                    <th>Vehicle</th>
                    <th>Fare</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {details.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.booking_reference}</td>
                      <td>{booking.booking_type}</td>
                      <td>{booking.pickup_city || "—"}</td>
                      <td>{booking.drop_city || "—"}</td>
                      <td>{formatDate(booking.pickup_datetime)}</td>
                      <td>{booking.vehicle_type}</td>
                      <td>{formatFare(booking.estimated_fare)}</td>
                      <td>{booking.status}</td>
                    </tr>
                  ))}

                  {details.bookings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="ay-passengers-empty">
                        No booking history available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="ay-passengers-page">
      <div className="ay-passengers-heading">
        <div>
          <h1>Passenger Management</h1>
          <p>View and search registered AasanYatra passengers.</p>
        </div>

        <div className="ay-passengers-count">
          Total Passengers: {passengers.length}
        </div>
      </div>

      <div className="ay-passengers-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or mobile number..."
          aria-label="Search passengers"
        />
      </div>

      {loading && <p>Loading passengers...</p>}

      {error && (
        <p role="alert" className="ay-passengers-error">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="ay-passengers-table-wrap">
          <table className="ay-passengers-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Passenger</th>
                <th>Mobile Number</th>
                <th>Status</th>
                <th>Bookings</th>
                <th>Registered On</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredPassengers.map((passenger) => (
                <tr key={passenger.id}>
                  <td>#{passenger.id}</td>
                  <td>{passenger.full_name || "Not provided"}</td>
                  <td>{passenger.phone}</td>
                  <td>
                    <span
                      className={
                        passenger.status === "ACTIVE"
                          ? "ay-passenger-active"
                          : "ay-passenger-inactive"
                      }
                    >
                      {passenger.status}
                    </span>
                  </td>
                  <td>{passenger.total_bookings}</td>
                  <td>{formatDate(passenger.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="ay-primary-button"
                      onClick={() => setSelectedId(passenger.id)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}

              {filteredPassengers.length === 0 && (
                <tr>
                  <td colSpan={7} className="ay-passengers-empty">
                    No passengers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
