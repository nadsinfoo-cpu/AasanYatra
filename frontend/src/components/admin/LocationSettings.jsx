import { useEffect, useState } from "react";
import {
  getLocationSettings,
  updateLocationMapsSetting,
} from "../../services/api";

export default function LocationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const result = await getLocationSettings();

        if (active) {
          setEnabled(result.data?.location_maps_enabled === true);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, []);

  async function handleChange(event) {
    const nextValue = event.target.checked;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const result = await updateLocationMapsSetting(nextValue);

      setEnabled(result.data?.location_maps_enabled === true);

      setMessage("Location setting saved successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        padding: 24,
        borderRadius: 14,
        maxWidth: 650,
      }}
    >
      <h2>Location Search Settings</h2>

      <p>
        Control whether AasanYatra is allowed to use Maps API for location
        search.
      </p>

      {loading ? (
        <p>Loading settings...</p>
      ) : (
        <>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 20,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={handleChange}
              disabled={saving}
            />

            <strong>Maps API: {enabled ? "ON" : "OFF"}</strong>
          </label>

          <p style={{ marginTop: 16 }}>
            {enabled
              ? "Maps API is permitted. Database fallback remains available."
              : "Database-only location search. No Maps API required."}
          </p>

          {saving && <p>Saving setting...</p>}
          {message && (
            <p role="status" style={{ color: "green" }}>
              {message}
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}
    </section>
  );
}
