
const API_BASE_URL = "http://127.0.0.1:5000/api";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("aasanyatra_token");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "API request failed");
  }

  return data;
}

export function requestOtp(phone) {
  return apiRequest("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(phone, otp) {
  return apiRequest("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
}

export function getMyBookings() {
  return apiRequest("/bookings/my");
}

export function cancelBooking(bookingId) {
  return apiRequest(`/bookings/${bookingId}/cancel`, {
    method: "PATCH",
  });
}

export function createBooking(booking) {
  return apiRequest("/bookings", {
    method: "POST",
    body: JSON.stringify(booking),
  });
}
