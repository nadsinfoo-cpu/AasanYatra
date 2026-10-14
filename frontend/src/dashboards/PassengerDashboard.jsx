import { useEffect, useState } from "react";
import {
  CarFront,
  CalendarDays,
  Clock3,
  MapPin,
  RefreshCw,
  LogOut,
  ArrowRight,
  Users,
} from "lucide-react";
import { createBooking, getMyBookings } from "../services/api";
import "./PassengerDashboard.css";
import BookingDetails from "../components/passenger/BookingDetails";

const API = "http://127.0.0.1:5000/api";
const IST = "Asia/Kolkata";
const timeOptions = Array.from({ length: 48 }, (_, n) => {
  const hour = Math.floor(n / 2);
  const minute = n % 2 ? 30 : 0;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const label = new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString(
    "en-IN",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    },
  );
  return { value, label };
});

function istParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function nextSlot() {
  const now = istParts();
  const minutes = (Math.floor(now.minutes / 30) + 1) * 30;
  if (minutes >= 1440) {
    const tomorrow = new Date(
      Date.parse(`${now.date}T00:00:00+05:30`) + 86400000,
    );
    return { date: istParts(tomorrow).date, time: "00:00" };
  }
  return {
    date: now.date,
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
  };
}

function CityInput({ label, value, onChange }) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API}/locations/cities?search=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("City search unavailable");
        const result = await response.json();
        setMatches(result.data || []);
        setError("");
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);
  return (
    <div className="pd-city-wrap">
      <label>{label}</label>
      <input
        required
        autoComplete="off"
        value={value}
        placeholder="Search city"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <div className="pd-city-results">
          {matches.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => {
                onChange(city.city_name);
                setOpen(false);
              }}
            >
              {city.city_name} <small>{city.state_name}</small>
            </button>
          ))}
        </div>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export default function PassengerDashboard({
  user,
  onLogout,
  onSwitchDashboard,
  onSwitchDriverDashboard,
}) {
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [initial] = useState(nextSlot);
  const [trip, setTrip] = useState("ONE_WAY");
  const [pickupCity, setPickupCity] = useState("");
  const [dropCity, setDropCity] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropAddress, setDropAddress] = useState("");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [returnDate, setReturnDate] = useState(initial.date);
  const [returnTime, setReturnTime] = useState(initial.time);
  const [vehicle, setVehicle] = useState("SEDAN");
  const [passengers, setPassengers] = useState(1);
  const [distance, setDistance] = useState("");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(nextSlot);

  useEffect(() => {
    const update = () => setNow(nextSlot());
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (`${date}T${time}` < `${now.date}T${now.time}`) {
      setDate(now.date);
      setTime(now.time);
    }
  }, [date, time, now]);

  async function refreshBookings() {
    try {
      const result = await getMyBookings();
      setBookings(result.bookings || result.data?.bookings || []);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refreshBookings();
  }, []);

  const availableTimes = timeOptions.filter(
    (slot) => date !== now.date || slot.value >= now.time,
  );
  const returnTimes = timeOptions.filter(
    (slot) => `${returnDate}T${slot.value}` > `${date}T${time}`,
  );
  const completed = bookings.filter((b) => b.status === "COMPLETED").length;
  const upcoming = bookings.filter((b) =>
    ["PENDING", "CONFIRMED", "DRIVER_ASSIGNED"].includes(b.status),
  ).length;

  async function submitBooking(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const pickup = `${date}T${time}`;
    if (pickup < `${nextSlot().date}T${nextSlot().time}`)
      return setError("Select a future pickup time.");
    if (trip === "ROUND_TRIP" && `${returnDate}T${returnTime}` <= pickup)
      return setError("Return must be after pickup.");
    if (!Number.isFinite(Number(distance)) || Number(distance) <= 0)
      return setError("Enter a valid distance in km.");
    setLoading(true);
    try {
      const payload = {
        booking_type: trip,
        pickup_address: pickupAddress,
        drop_address: dropAddress,
        pickup_city: pickupCity,
        drop_city: dropCity,
        pickup_datetime: pickup.replace("T", " ") + ":00",
        return_datetime:
          trip === "ROUND_TRIP" ? `${returnDate} ${returnTime}:00` : null,
        vehicle_type: vehicle,
        passenger_count: Number(passengers),
        distance_km: Number(distance),
        estimated_fare: 0,
      };
      const result = await createBooking(payload);
      setMessage(result.message || "Booking request submitted successfully.");
      await refreshBookings();
    } catch (e) {
      setError(e.message || "Unable to book cab.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pd-page">
      <header className="pd-header">
        <div>
          <strong>AasanYatra</strong>
          <span>Passenger Dashboard</span>
        </div>
        <div className="pd-header-actions">
          <span>{user?.full_name || user?.phone || "Passenger"}</span>
          {onSwitchDashboard && (
            <button type="button" onClick={onSwitchDashboard}>
              Admin Dashboard
            </button>
          )}
{onSwitchDriverDashboard && (
  <button type="button" onClick={onSwitchDriverDashboard}>
    Driver Dashboard
  </button>
)}
          <button type="button" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>
      <main className="pd-main">
        <section className="pd-hero">
          <p>WELCOME ABOARD</p>
          <h1>Where would you like to go?</h1>
          <span>Book your journey with AasanYatra.</span>
        </section>
        <div className="pd-layout">
          <section className="pd-card pd-booking">
            <h2>
              <CarFront size={22} /> Book a Cab
            </h2>
            <form onSubmit={submitBooking}>
              <div className="pd-trips">
                {[
                  ["ONE_WAY", "One Way"],
                  ["ROUND_TRIP", "Round Trip"],
                  ["LOCAL", "Local"],
                  ["AIRPORT_TRANSFER", "Airport"],
                ].map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={trip === id ? "selected" : ""}
                    onClick={() => setTrip(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="pd-grid">
                <CityInput
                  label="Pickup city"
                  value={pickupCity}
                  onChange={setPickupCity}
                />
                <CityInput
                  label="Drop city"
                  value={dropCity}
                  onChange={setDropCity}
                />
                <div>
                  <label>Pickup address</label>
                  <input
                    required
                    maxLength={500}
                    placeholder="Pickup address / landmark"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label>Destination address</label>
                  <input
                    required
                    maxLength={500}
                    placeholder="Destination address / landmark"
                    value={dropAddress}
                    onChange={(e) => setDropAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label>
                    <CalendarDays size={15} /> Journey date
                  </label>
                  <input
                    required
                    type="date"
                    min={now.date}
                    value={date}
                    onChange={(e) => {
                      const d = e.target.value;
                      setDate(d);
                      setTime(d === now.date ? now.time : "00:00");
                    }}
                  />
                </div>
                <div>
                  <label>
                    <Clock3 size={15} /> Pickup time
                  </label>
                  <select
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  >
                    {availableTimes.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {trip === "ROUND_TRIP" && (
                  <>
                    <div>
                      <label>Return date</label>
                      <input
                        type="date"
                        required
                        min={date}
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label>Return time</label>
                      <select
                        required
                        value={returnTime}
                        onChange={(e) => setReturnTime(e.target.value)}
                      >
                        {returnTimes.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label>Vehicle</label>
                  <select
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value)}
                  >
                    <option value="HATCHBACK">Hatchback</option>
                    <option value="SEDAN">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="TEMPO_TRAVELLER">Tempo Traveller</option>
                  </select>
                </div>
                <div>
                  <label>
                    <Users size={15} /> Passengers
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    required
                    value={passengers}
                    onChange={(e) => setPassengers(e.target.value)}
                  />
                </div>
                <div>
                  <label>Estimated distance (km)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="Enter distance"
                  />
                </div>
              </div>
              <p className="pd-note">
                City suggestions come from your database. Maps API is not used.
                Final fare is calculated by the backend.
              </p>
              {error && (
                <p role="alert" className="pd-error">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="pd-success">
                  {message}
                </p>
              )}
              <button className="pd-submit" type="submit" disabled={loading}>
                {loading ? "Requesting cab..." : "Request Cab"}
                <ArrowRight size={18} />
              </button>
            </form>
          </section>
          <aside className="pd-side">
            <section className="pd-card">
              <h2>My Ride Summary</h2>
              <div className="pd-stats">
                <div>
                  <strong>{bookings.length}</strong>
                  <span>Total</span>
                </div>
                <div>
                  <strong>{upcoming}</strong>
                  <span>Upcoming</span>
                </div>
                <div>
                  <strong>{completed}</strong>
                  <span>Completed</span>
                </div>
              </div>
            </section>
            <section className="pd-card">
              <div className="pd-row">
                <h2>My Bookings</h2>
                <button
                  type="button"
                  onClick={refreshBookings}
                  aria-label="Refresh bookings"
                >
                  <RefreshCw size={18} />
                </button>
              </div>

              {bookings.length === 0 ? (
                <p className="pd-empty">No bookings found.</p>
              ) : (
                bookings.slice(0, 8).map((b, i) => (
                  <div className="pd-booking-row" key={b.id || i}>
                    <div>
                      <strong>
                        {b.booking_reference || `Booking #${b.id}`}
                      </strong>

                      <small>
                        {b.pickup_city || "Pickup"} →{" "}
                        {b.drop_city || "Destination"}
                      </small>
                    </div>

                    <div className="pd-booking-actions">
                      <span className="pd-booking-status">{b.status}</span>

                      <button
                        type="button"
                        className="pd-view-details"
                        onClick={() => setSelectedBookingId(b.id)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      </main>

      {selectedBookingId !== null && (
        <BookingDetails
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onUpdated={refreshBookings}
        />
      )}
    </div>
  );
}
