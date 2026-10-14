import { useEffect, useState } from "react";
import { getBookingDetails, cancelBooking } from "../../services/api";
import "./BookingDetails.css";

const steps = [
  "PENDING",
  "CONFIRMED",
  "DRIVER_ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
];

export default function BookingDetails({ bookingId, onClose, onUpdated }) {
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadDetails() {
    setLoading(true);
    setError("");

    try {
      const result = await getBookingDetails(bookingId);
      setBooking(result.booking || result.data?.booking);
    } catch (err) {
      setError(err.message || "Unable to load booking.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [bookingId]);

  async function handleCancel() {
    if (!window.confirm("Cancel this booking?")) return;

    setBusy(true);
    setError("");

    try {
      await cancelBooking(bookingId);
      await loadDetails();
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || "Unable to cancel booking.");
    } finally {
      setBusy(false);
    }
  }

  const canCancel = ["PENDING", "CONFIRMED"].includes(booking?.status);

  const currentStep = steps.indexOf(booking?.status);

  return (
    <div className="bd-overlay" onClick={onClose}>
      <section
        className="bd-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Booking details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bd-heading">
          <h2>Booking Details</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p>Loading booking details...</p>}

        {error && (
          <p role="alert" className="bd-error">
            {error}
          </p>
        )}

        {booking && !loading && (
          <>
            <p className="bd-reference">
              {booking.booking_reference || `Booking #${booking.id}`}
            </p>

            <div className="bd-route">
              <strong>{booking.pickup_city || "Pickup"}</strong>
              <span>{booking.pickup_address}</span>
              <div className="bd-route-arrow">↓</div>
              <strong>{booking.drop_city || "Destination"}</strong>
              <span>{booking.drop_address}</span>
            </div>

            <div className="bd-info">
              <div>
                <small>Trip Type</small>
                <strong>{booking.booking_type}</strong>
              </div>
              <div>
                <small>Vehicle</small>
                <strong>{booking.vehicle_type}</strong>
              </div>
              <div>
                <small>Passengers</small>
                <strong>{booking.passenger_count}</strong>
              </div>
              <div>
                <small>Pickup Date & Time</small>
                <strong>{booking.pickup_datetime}</strong>
              </div>
              {booking.return_datetime && (
                <div>
                  <small>Return Date & Time</small>
                  <strong>{booking.return_datetime}</strong>
                </div>
              )}
              <div>
                <small>Estimated Fare</small>
                <strong>₹{booking.estimated_fare ?? "—"}</strong>
              </div>
            </div>

            <h3>Ride Status</h3>

            {booking.status === "CANCELLED" ? (
              <p className="bd-cancelled">Booking Cancelled</p>
            ) : (
              <div className="bd-timeline">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className={
                      index <= currentStep ? "bd-step done" : "bd-step"
                    }
                  >
                    <span className="bd-dot" />
                    <span>{step.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bd-actions">
              <button type="button" onClick={loadDetails}>
                Refresh Status
              </button>

              {canCancel && (
                <button
                  type="button"
                  className="bd-danger"
                  disabled={busy}
                  onClick={handleCancel}
                >
                  {busy ? "Cancelling..." : "Cancel Booking"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
