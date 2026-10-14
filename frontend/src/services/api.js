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
// Get authenticated user's profile and roles
export function getCurrentUser() {
  return apiRequest("/auth/me");
}

export function getLocationSettings() {
  return apiRequest("/locations/settings");
}

export function updateLocationMapsSetting(enabled) {
  return apiRequest("/admin/settings/location-maps", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function getBookingDetails(bookingId) {
  return apiRequest(`/bookings/${encodeURIComponent(bookingId)}`);
}
// DRIVER: Get logged-in driver's profile
export function getDriverProfile() {
  return apiRequest("/drivers/me");
}

// DRIVER: Get uploaded documents and verification statuses
export function getDriverDocuments() {
  return apiRequest("/drivers/documents");
}

// DRIVER: Resubmit rejected profile for admin review
export function resubmitDriverProfile() {
  return apiRequest("/drivers/resubmit", {
    method: "PATCH",
  });
}

export async function uploadDriverDocument({
  file,
  documentType,
  documentNumber,
  expiryDate,
}) {
  if (!file) {
    throw new Error("Please select a document.");
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ];

  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (!allowedTypes.includes(file.type) ||
      !allowedExtensions.includes(extension)) {
    throw new Error("Only PDF, JPG and PNG files are allowed.");
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("File size must not exceed 5 MB.");
  }

  const token = localStorage.getItem("aasanyatra_token");

  if (!token) {
    throw new Error("Please log in again.");
  }

  const formData = new FormData();
  formData.append("document", file);
  formData.append("document_type", documentType);

  if (documentNumber?.trim()) {
    formData.append("document_number", documentNumber.trim());
  }

  if (expiryDate) {
    formData.append("expiry_date", expiryDate);
  }

  const response = await fetch(
    "http://127.0.0.1:5000/api/drivers/documents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Document upload failed.");
  }

  return result;
}

