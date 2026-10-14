import { useCallback, useEffect, useState } from "react";
import "./AdminBookingManagement.css";

const API = "http://127.0.0.1:5000/api/admin/bookings";

const statuses = [
  "PENDING",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

const formatDate = (value) =>
  value ? String(value).replace("T", " ").slice(0, 19) : "—";

const formatMoney = (value) =>
  value == null ? "—" : `₹${Number(value).toLocaleString("en-IN")}`;

export default function AdminBookingManagement() {
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    total_pages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBookings = useCallback(
    async (signal) => {
      const token = localStorage.getItem("aasanyatra_token");
      if (!token) {
        setError("Please log in as Super Admin.");
        setLoading(false);
        return;
      }

      const query = new URLSearchParams({
        page: String(page),
      });
      if (search) query.set("search", search);
      if (status) query.set("status", status);
      if (from) query.set("from", from);
      if (to) query.set("to", to);

      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API}?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to load bookings.");
        }

        if (signal.aborted) return;
        setBookings(result.data.bookings || []);
        setPagination(result.data.pagination);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
          setBookings([]);
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [page, search, status, from, to],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadBookings(controller.signal);
    return () => controller.abort();
  }, [loadBookings, refresh]);

  const updateFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <section className="abm">
      <div className="abm-heading">
        <div>
          <h2>Cab Booking Management</h2>
          <p>View and manage passenger booking records.</p>
        </div>
        <button type="button" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>

      <div className="abm-summary">
        <div>
          <small>Matching bookings</small>
          <strong>{pagination.total}</strong>
        </div>
        <div>
          <small>Current page</small>
          <strong>{pagination.page}</strong>
        </div>
        <div>
          <small>Total pages</small>
          <strong>{pagination.total_pages}</strong>
        </div>
      </div>

      <form
        className="abm-filters"
        onSubmit={(event) => {
          event.preventDefault();
          updateFilter(setSearch)(searchInput.trim());
        }}
      >
        <input
          aria-label="Search bookings"
          placeholder="Booking ID, passenger, phone or city"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          maxLength={100}
        />
        <select
          aria-label="Booking status"
          value={status}
          onChange={(event) => updateFilter(setStatus)(event.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <label>
          Journey from
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => updateFilter(setFrom)(event.target.value)}
          />
        </label>
        <label>
          Journey to
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => updateFilter(setTo)(event.target.value)}
          />
        </label>
        <button type="submit">Search</button>
        <button
          type="button"
          onClick={() => {
            setSearchInput("");
            setSearch("");
            setStatus("");
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          Clear
        </button>
      </form>

      {error && (
        <p className="abm-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading bookings...</p>
      ) : (
        <>
          <div className="abm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking</th>
                  <th>Passenger</th>
                  <th>Journey</th>
                  <th>Pickup date</th>
                  <th>Vehicle</th>
                  <th>Fare</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{booking.booking_reference}</td>
                    <td>
                      <strong>{booking.passenger_name || "—"}</strong>
                      <small>{booking.passenger_phone}</small>
                    </td>
                    <td>
                      {booking.pickup_city || "—"} → {booking.drop_city || "—"}
                    </td>
                    <td>{formatDate(booking.pickup_datetime)}</td>
                    <td>{booking.vehicle_type}</td>
                    <td>{formatMoney(booking.estimated_fare)}</td>
                    <td>
                      <span className="abm-status">
                        {booking.status?.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelected(booking)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bookings.length && !error && (
              <p className="abm-empty">No bookings found.</p>
            )}
          </div>

          <div className="abm-pagination">
            <span>
              Page {pagination.page} of {pagination.total_pages || 1}
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div className="abm-modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="abm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Booking details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="abm-heading">
              <h3>Booking Details</h3>
              <button type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <dl className="abm-details">
              {[
                ["Reference", selected.booking_reference],
                ["Passenger", selected.passenger_name],
                ["Mobile", selected.passenger_phone],
                ["Booking type", selected.booking_type],
                ["Pickup", selected.pickup_address],
                ["Drop", selected.drop_address],
                ["Pickup date", formatDate(selected.pickup_datetime)],
                ["Return date", formatDate(selected.return_datetime)],
                ["Vehicle", selected.vehicle_type],
                ["Passengers", selected.passenger_count],
                ["Estimated fare", formatMoney(selected.estimated_fare)],
                ["Status", selected.status],
                ["Created", formatDate(selected.created_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
