
import { useState } from "react";
import {
  requestOtp,
  verifyOtp,
  getMyBookings,
  cancelBooking,
  createBooking,
} from "./services/api";
import "./App.css";

const FARE_RATES = {
  ONE_WAY: { baseFare: 50, perKm: 12, multiplier: 1 },
  ROUND_TRIP: { baseFare: 100, perKm: 10, multiplier: 2 },
  OUTSTATION: { baseFare: 100, perKm: 14, multiplier: 1 },
  AIRPORT_TRANSFER: { baseFare: 100, perKm: 15, multiplier: 1 },
};

function calculateEstimatedFare(bookingType, distanceKm) {
  const distance = Number(distanceKm);

  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }

  const rate = FARE_RATES[bookingType];

  if (!rate) {
    return 0;
  }

  return Math.round(
    rate.baseFare + distance * rate.perKm * rate.multiplier
  );
}

const initialBookingForm = {
  booking_type: "ONE_WAY",
  pickup_address: "",
  drop_address: "",
  pickup_city: "",
  drop_city: "",
  pickup_datetime: "",
  return_datetime: "",
  vehicle_type: "SEDAN",
  passenger_count: 1,
};

export default function App() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const [bookingForm, setBookingForm] = useState(initialBookingForm);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [distanceKm, setDistanceKm] = useState("");

  const estimatedFare = calculateEstimatedFare(
  bookingForm.booking_type,
  distanceKm
);

  // Request OTP using a 10-digit Indian mobile number.
  async function handleRequestOtp(e) {
    e.preventDefault();
    setMessage("");

    if (!/^[6-9]\d{9}$/.test(phone)) {
      setMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    setLoading(true);

    try {
      const internationalPhone = `+91${phone}`;
      const result = await requestOtp(internationalPhone);

      setOtpSent(true);
      setOtp("");
      setMessage(
        result.message || "OTP requested successfully."
      );
    } catch (error) {
      setMessage(error.message || "Unable to request OTP.");
    } finally {
      setLoading(false);
    }
  }
  

  // Verify OTP and log in.
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setMessage("");

    if (!/^[6-9]\d{9}$/.test(phone)) {
      setMessage("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setMessage("Enter the complete 6-digit OTP.");
      return;
    }

    setLoading(true);

    try {
      const internationalPhone = `+91${phone}`;
      const result = await verifyOtp(internationalPhone, otp);

      if (!result.token) {
        throw new Error("Login response did not contain a token.");
      }

      localStorage.setItem("aasanyatra_token", result.token);
      setUser(result.user);
      setOtpSent(false);
      setOtp("");
      setMessage("Login successful!");

      await loadBookings();
    } catch (error) {
      setMessage(error.message || "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  // Load the logged-in passenger's bookings.
  async function loadBookings() {
    setBookingsLoading(true);

    try {
      const result = await getMyBookings();
      setBookings(result.bookings || []);
    } catch (error) {
      setMessage(error.message || "Unable to load bookings.");
    } finally {
      setBookingsLoading(false);
    }
  }

  // Create a cab booking.
  async function handleCreateBooking(e) {
    e.preventDefault();
    setMessage("");

    if (!bookingForm.pickup_datetime) {
      setMessage("Please select your pickup date and time.");
      return;
    }

    if (
      bookingForm.booking_type === "ROUND_TRIP" &&
      (!bookingForm.return_datetime ||
        bookingForm.return_datetime <= bookingForm.pickup_datetime)
    ) {
      setMessage("Return time must be after pickup time.");
      return;
    }

    setBookingLoading(true);

    try {
      const booking = {
        ...bookingForm,
        passenger_count: Number(bookingForm.passenger_count),
        estimated_fare: 0,
        pickup_datetime: bookingForm.pickup_datetime.replace("T", " "),
        return_datetime:
          bookingForm.booking_type === "ROUND_TRIP"
            ? bookingForm.return_datetime.replace("T", " ")
            : null,
      };

      const result = await createBooking({
        ...booking,
       distance_km: Number(distanceKm),
        });
      setMessage(
        result.message ||
          `Booking created: ${
            result.booking?.booking_reference || ""
          }`
      );

      setBookingForm({ ...initialBookingForm });

      await loadBookings();
    } catch (error) {
      setMessage(error.message || "Unable to create booking.");
    } finally {
      setBookingLoading(false);
    }
  }

  // Cancel an eligible booking.
  async function handleCancelBooking(bookingId) {
    const confirmed = window.confirm(
      `Are you sure you want to cancel booking #${bookingId}?`
    );

    if (!confirmed) return;

    setCancellingId(bookingId);
    setMessage("");

    try {
      const result = await cancelBooking(bookingId);
      setMessage(result.message || "Booking cancelled successfully.");
      await loadBookings();
    } catch (error) {
      setMessage(error.message || "Unable to cancel booking.");
    } finally {
      setCancellingId(null);
    }
  }

  // Log out the current user.
  function handleLogout() {
    localStorage.removeItem("aasanyatra_token");
    setUser(null);
    setBookings([]);
    setBookingForm({ ...initialBookingForm });
    setOtpSent(false);
    setOtp("");
    setPhone("");
    setMessage("");
  }

  function updateBookingField(field, value) {
    setBookingForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  const minimumPickup = new Date(
    Date.now() - new Date().getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

  return (
    <main className="page">
      <header className="brand">
        <div className="brand-icon">A</div>
        <div>
          <h1>AasanYatra</h1>
          <p>Your journey, made easy.</p>
        </div>
      </header>

      <section className="login-card">
        {!user ? (
          <>
            <div className="card-heading">
              <span className="eyebrow">WELCOME ABOARD</span>
              <h2>Welcome to AasanYatra</h2>
              <p>
                Enter your mobile number to log in or create your account.
              </p>
            </div>

            <form
              onSubmit={otpSent ? handleVerifyOtp : handleRequestOtp}
            >
              <label htmlFor="phone">Mobile number</label>

              <div className="phone-input">
                <span className="country-code">+91</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10-digit mobile number"
                  value={phone}
                  maxLength={10}
                  pattern="[6-9][0-9]{9}"
                  required
                  disabled={otpSent || loading}
                  onChange={(e) =>
                    setPhone(
                      e.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                />
              </div>

              {otpSent && (
                <>
                  <label htmlFor="otp">Enter 6-digit OTP</label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter OTP"
                    value={otp}
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    onChange={(e) =>
                      setOtp(
                        e.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                  />

                  <p className="hint">
                    Local development only: use OTP 123456.
                  </p>
                </>
              )}

              <button
                className="primary-button"
                type="submit"
                disabled={
                  loading ||
                  (otpSent
                    ? otp.length !== 6
                    : !/^[6-9]\d{9}$/.test(phone))
                }
              >
                {loading
                  ? "Please wait..."
                  : otpSent
                    ? "Verify OTP & Login"
                    : "Get OTP"}
              </button>
            </form>

            {otpSent && (
              <button
                type="button"
                className="text-button"
                disabled={loading}
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setMessage("");
                }}
              >
                Change mobile number
              </button>
            )}

            {message && (
              <p className="message" role="status">
                {message}
              </p>
            )}

            <p className="privacy">
              By continuing, you agree to our{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </>
        ) : (
          <div className="success-panel">
            <div className="success-icon">✓</div>
            <h2>Welcome to AasanYatra!</h2>
            <p>You are successfully logged in.</p>

            <div className="user-info">
              <p>
                <strong>Mobile:</strong> {user.phone}
              </p>
              <p>
                <strong>Role:</strong>{" "}
                {Array.isArray(user.roles)
                  ? user.roles.join(", ")
                  : user.roles || "PASSENGER"}
              </p>
              <p>
                <strong>User ID:</strong> {user.id}
              </p>
            </div>

            {message && (
              <p className="message" role="status">
                {message}
              </p>
            )}

            <section className="booking-form-section">
              <h2>Book a Cab</h2>
              <p>Enter your journey details to request a cab.</p>

              <form
                onSubmit={handleCreateBooking}
                className="booking-form"
              >
                <label htmlFor="booking_type">Trip type</label>
                <select
                  id="booking_type"
                  value={bookingForm.booking_type}
                  onChange={(e) =>
                    updateBookingField("booking_type", e.target.value)
                  }
                >
                  <option value="ONE_WAY">One Way</option>
                  <option value="ROUND_TRIP">Round Trip</option>
                  <option value="LOCAL">Local</option>
                  <option value="AIRPORT_TRANSFER">
                    Airport Transfer
                  </option>
                </select>

                <label htmlFor="pickup_address">Pickup address</label>
                <input
                  id="pickup_address"
                  value={bookingForm.pickup_address}
                  onChange={(e) =>
                    updateBookingField("pickup_address", e.target.value)
                  }
                  placeholder="Enter pickup location"
                  maxLength={500}
                  required
                />

                <label htmlFor="drop_address">Destination address</label>
                <input
                  id="drop_address"
                  value={bookingForm.drop_address}
                  onChange={(e) =>
                    updateBookingField("drop_address", e.target.value)
                  }
                  placeholder="Enter destination"
                  maxLength={500}
                  required
                />

                <label htmlFor="pickup_city">Pickup city</label>
                <input
                  id="pickup_city"
                  value={bookingForm.pickup_city}
                  onChange={(e) =>
                    updateBookingField("pickup_city", e.target.value)
                  }
                  placeholder="e.g. Delhi"
                  maxLength={100}
                />

                {/* <label htmlFor="drop_city">Destination city</label> */}
                <input
                  id="drop_city"
                  value={bookingForm.drop_city}
                  onChange={(e) =>
                    updateBookingField("drop_city", e.target.value)
                  }
                  placeholder="e.g. Jaipur"
                  maxLength={100}
                />
                
<div className="form-group">
  <label htmlFor="distanceKm">
    Estimated Distance (km)
  </label>

  <input
    id="distanceKm"
    type="number"
    min="1"
    step="1"
    placeholder="Enter trip distance in km"
    value={distanceKm}
    onChange={(event) => setDistanceKm(event.target.value)}
    required
  />
</div>

<div className="fare-preview">
  <span>Estimated Fare</span>
  <strong>₹{estimatedFare.toLocaleString("en-IN")}</strong>
  <small>Final fare may vary based on actual trip details.</small>
</div>


                <label htmlFor="pickup_datetime">
                  Pickup date and time
                </label>
                <input
                  id="pickup_datetime"
                  type="datetime-local"
                  value={bookingForm.pickup_datetime}
                  min={minimumPickup}
                  onChange={(e) =>
                    updateBookingField("pickup_datetime", e.target.value)
                  }
                  required
                />

                {bookingForm.booking_type === "ROUND_TRIP" && (
                  <>
                    <label htmlFor="return_datetime">
                      Return date and time
                    </label>
                    <input
                      id="return_datetime"
                      type="datetime-local"
                      value={bookingForm.return_datetime}
                      min={
                        bookingForm.pickup_datetime || minimumPickup
                      }
                      onChange={(e) =>
                        updateBookingField(
                          "return_datetime",
                          e.target.value
                        )
                      }
                      required
                    />
                  </>
                )}

                <label htmlFor="vehicle_type">Select vehicle</label>
                <select
                  id="vehicle_type"
                  value={bookingForm.vehicle_type}
                  onChange={(e) =>
                    updateBookingField("vehicle_type", e.target.value)
                  }
                >
                  <option value="HATCHBACK">Hatchback</option>
                  <option value="SEDAN">Sedan</option>
                  <option value="SUV">SUV</option>
                  <option value="TEMPO_TRAVELLER">
                    Tempo Traveller
                  </option>
                </select>

                <label htmlFor="passenger_count">
                  Number of passengers
                </label>
                <input
                  id="passenger_count"
                  type="number"
                  min="1"
                  max="20"
                  value={bookingForm.passenger_count}
                  onChange={(e) =>
                    updateBookingField(
                      "passenger_count",
                      Number(e.target.value)
                    )
                  }
                  required
                />

                <p className="hint">
                  Fare calculation will be added in the next stage.
                </p>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={bookingLoading}
                >
                  {bookingLoading
                    ? "Creating booking..."
                    : "Request Cab"}
                </button>
              </form>
            </section>

            <section className="my-bookings">
              <div className="booking-heading">
                <h2>My Bookings</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={loadBookings}
                  disabled={bookingsLoading}
                >
                  {bookingsLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {bookingsLoading && bookings.length === 0 && (
                <p>Loading your bookings...</p>
              )}

              {!bookingsLoading && bookings.length === 0 && (
                <p>You don't have any bookings yet.</p>
              )}

              <div className="bookings-list">
                {bookings.map((booking) => (
                  <article className="booking-item" key={booking.id}>
                    <h3>Booking #{booking.id}</h3>

                    <p>
                      <strong>Reference:</strong>{" "}
                      {booking.booking_reference || "N/A"}
                    </p>

                    <p>
                      <strong>Type:</strong>{" "}
                      {(booking.booking_type || "N/A").replaceAll(
                        "_",
                        " "
                      )}
                    </p>

                    <p>
                      <strong>Pickup:</strong>{" "}
                      {booking.pickup_address || "N/A"}
                    </p>

                    <p>
                      <strong>Destination:</strong>{" "}
                      {booking.drop_address || "N/A"}
                    </p>

                    <p>
                      <strong>Pickup time:</strong>{" "}
                      {booking.pickup_datetime
                        ? new Date(
                            booking.pickup_datetime
                          ).toLocaleString()
                        : "Not available"}
                    </p>

                    <p>
                      <strong>Estimated fare:</strong> ₹
                      {Number(booking.estimated_fare || 0).toFixed(2)}
                    </p>

                    <p>
                      <strong>Status:</strong>{" "}
                      <span
                        className={`status status-${(
                          booking.status || "pending"
                        ).toLowerCase()}`}
                      >
                        {(booking.status || "PENDING").replaceAll(
                          "_",
                          " "
                        )}
                      </span>
                    </p>

                    {["PENDING", "CONFIRMED"].includes(
                      booking.status
                    ) && (
                      <button
                        type="button"
                        className="cancel-button"
                        disabled={cancellingId === booking.id}
                        onClick={() =>
                          handleCancelBooking(booking.id)
                        }
                      >
                        {cancellingId === booking.id
                          ? "Cancelling..."
                          : "Cancel Booking"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <button
              type="button"
              className="primary-button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        )}
      </section>

                 <div className="support-contact">
        <strong>AasanYatra Support</strong>
        <p>
          Phone: <a href="tel:7895865387">7895865387</a>
        </p>
      </div>

      <footer>
        &copy; {new Date().getFullYear()} AasanYatra. All rights reserved.
      </footer>
    </main>
  );
}