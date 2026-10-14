import AdminBookingManagement from "../components/admin/AdminBookingManagement";
import PassengerManagement from "../components/admin/PassengerManagement";
import { useState, useEffect, useCallback } from "react";
import LocationSettings from "../components/admin/LocationSettings";
import AdminRideRequests from "./AdminRideRequests";
import DriverManagement from "../components/admin/DriverManagement";


import {
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Users,
  CarFront,
  Building2,
  CalendarDays,
  Route,
  Repeat2,
  IndianRupee,
  Gift,
  Wallet,
  Settings,
  Menu,
  X,
  Search,
  Bell,
  ChevronRight,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import "./AdminDashboard.css";

const navigation = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "passengers", label: "Passengers", icon: Users },
  { id: "drivers", label: "Drivers", icon: CarFront },
  { id: "distributors", label: "Distributors", icon: Building2 },
  { id: "bookings", label: "Cab Bookings", icon: CalendarDays },
{ id: "ride-requests", label: "Ride Requests", icon: CarFront },
  { id: "carpool", label: "Carpooling", icon: Route },
  { id: "rideshare", label: "Ride Sharing", icon: Repeat2 },
  { id: "fares", label: "Fare Management", icon: IndianRupee },
  { id: "offers", label: "Offers", icon: Gift },
  { id: "wallet", label: "Wallet", icon: Wallet },
  { id: "settings", label: "Settings", icon: Settings },
];

// Sample chart data for UI demonstration only.
// Replace with authenticated backend statistics later.
const bookingTrend = [
  { month: "Jan", bookings: 120, completed: 90 },
  { month: "Feb", bookings: 180, completed: 140 },
  { month: "Mar", bookings: 150, completed: 115 },
  { month: "Apr", bookings: 260, completed: 220 },
  { month: "May", bookings: 210, completed: 180 },
  { month: "Jun", bookings: 320, completed: 275 },
];

const rideDistribution = [
  { name: "One Way", value: 45 },
  { name: "Round Trip", value: 25 },
  { name: "Outstation", value: 20 },
  { name: "Airport", value: 10 },
];

const chartColors = ["#7659ed", "#a78bfa", "#c4b5fd", "#ddd6fe"];

const stats = [
  {
    label: "Total Bookings",
    icon: CalendarDays,
    key: "total_bookings",
  },
  {
    label: "Approved Drivers",
    icon: CarFront,
    key: "approved_drivers",
  },
  {
    label: "Passengers",
    icon: Users,
    key: "total_passengers",
  },
  {
    label: "Total Revenue",
    icon: IndianRupee,
    key: "total_revenue",
  },
];

export default function AdminDashboard({ user, onSwitchDashboard, onLogout }) {
  const [activePage, setActivePage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("aasanyatra_sidebar_collapsed") === "true",
  );

  useEffect(() => {
    localStorage.setItem(
      "aasanyatra_sidebar_collapsed",
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);
  const [search, setSearch] = useState("");
  const [adminStats, setAdminStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [bookingAnalytics, setBookingAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    if (!user?.roles?.includes("SUPER_ADMIN")) {
      setAnalyticsLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadBookingAnalytics() {
      setAnalyticsLoading(true);
      setAnalyticsError("");

      try {
        const token = localStorage.getItem("aasanyatra_token");

        const response = await fetch(
          "http://127.0.0.1:5000/api/admin/booking-analytics",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Unable to load booking analytics.",
          );
        }

        if (!controller.signal.aborted) {
          setBookingAnalytics(result.data);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAnalyticsError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setAnalyticsLoading(false);
        }
      }
    }

    loadBookingAnalytics();

    return () => controller.abort();
  }, [user]);

  const dailyBookingChart = (bookingAnalytics?.daily_bookings || []).map(
    (item) => ({
      date: String(item.date).slice(5),
      bookings: Number(item.total),
    }),
  );

  const bookingTypeChart = (bookingAnalytics?.booking_types || []).map(
    (item) => ({
      name: item.booking_type.replaceAll("_", " "),
      bookings: Number(item.total),
    }),
  );

  const bookingStatusChart = (bookingAnalytics?.booking_statuses || []).map(
    (item) => ({
      name: item.status.replaceAll("_", " "),
      value: Number(item.total),
    }),
  );
  const loadAdminStats = useCallback(async (signal) => {
    setStatsLoading(true);
    setStatsError("");

    try {
      const token = localStorage.getItem("aasanyatra_token");

      if (!token) {
        throw new Error("Please log in again.");
      }

      const response = await fetch("http://127.0.0.1:5000/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load statistics.");
      }

      setAdminStats(result.data);
    } catch (error) {
      if (error.name === "AbortError") return;

      setStatsError(error.message);
    } finally {
      if (!signal?.aborted) {
        setStatsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!user?.roles?.includes("SUPER_ADMIN")) {
      setStatsLoading(false);
      return;
    }

    const controller = new AbortController();

    loadAdminStats(controller.signal);

    return () => controller.abort();
  }, [user, loadAdminStats]);

  const [profileOpen, setProfileOpen] = useState(false);

  const roles = Array.isArray(user?.roles) ? user.roles : [];

  if (!roles.includes("SUPER_ADMIN")) {
    return (
      <div className="ay-access-denied">
        <ShieldCheck size={42} />
        <h2>Access Denied</h2>
        <p>Super Admin permission is required.</p>
      </div>
    );
  }

  const currentPage =
    navigation.find((item) => item.id === activePage) || navigation[0];

  function navigate(id) {
    setActivePage(id);
    setSidebarOpen(false);
  }

  return (
    <div
      className={`ay-admin ${sidebarCollapsed ? "ay-sidebar-collapsed" : ""}`}
    >
      {sidebarOpen && (
        <button
          className="ay-sidebar-overlay"
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`ay-sidebar ${sidebarOpen ? "ay-sidebar-open" : ""}`}>
        <div className="ay-brand">
          <div className="ay-brand-mark">A</div>
          <div className="ay-brand-text">
            <strong>AasanYatra</strong>
            <small>ADMIN PANEL</small>
          </div>
          <button
            type="button"
            className="ay-sidebar-collapse-btn"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => {
              if (window.innerWidth <= 768) {
                setSidebarOpen(false);
              } else {
                setSidebarCollapsed(!sidebarCollapsed);
              }
            }}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
          </button>
        </div>

        <p className="ay-menu-heading">MAIN MENU</p>

        <nav className="ay-navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={activePage === item.id ? "page" : undefined}
                className={`ay-nav-link ${
                  activePage === item.id ? "active" : ""
                }`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span className="ay-nav-label">{item.label}</span>
                {activePage === item.id && !sidebarCollapsed && (
                  <ChevronRight size={15} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="ay-sidebar-bottom">
          <div className="ay-admin-avatar">A</div>
          <div>
            <strong>Super Admin</strong>
            <small>AasanYatra Management</small>
          </div>
        </div>
      </aside>

      <div className="ay-main">
        <header className="ay-topbar">
          <div className="ay-topbar-left">
            <button
              type="button"
              className="ay-menu-button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>

            <div className="ay-breadcrumb">
              Pages <ChevronRight size={14} />
              <strong>{currentPage.label}</strong>
            </div>
          </div>

          <div className="ay-topbar-right">
            <div className="ay-search">
              <Search size={16} />
              <input
                type="search"
                aria-label="Search dashboard modules"
                placeholder="Search modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="ay-icon-button"
              aria-label="Notifications"
              title="Notifications coming soon"
              disabled
            >
              <Bell size={19} />
            </button>

            <div className="ay-profile-menu">
              <button
                type="button"
                className="ay-profile-trigger"
                onClick={() => setProfileOpen(!profileOpen)}
                aria-expanded={profileOpen}
                aria-label="Account menu"
              >
                <div className="ay-profile-avatar">A</div>
                <span>Super Admin</span>
                <ChevronRight size={15} />
              </button>

              {profileOpen && (
                <div className="ay-profile-dropdown">
                  <div className="ay-profile-details">
                    <strong>Super Admin</strong>
                    <small>{user?.phone}</small>
                  </div>

                  {user?.roles?.includes("PASSENGER") && (
                    <button type="button" onClick={onSwitchDashboard}>
                      <Users size={17} />
                      Passenger Dashboard
                    </button>
                  )}

                  <button
                    type="button"
                    className="ay-logout-option"
                    onClick={onLogout}
                  >
                    <X size={17} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="ay-content">
          {activePage === "overview" ? (
            <>
              <div className="ay-page-title">
                <div>
                  <h1>Dashboard</h1>
                  <p>Welcome back! Here's your platform overview.</p>
                </div>

                <span className="ay-demo-badge">Preview Data</span>
              </div>
              {statsError && (
                <div className="ay-stats-error" role="alert">
                  <span>{statsError}</span>
                  <button type="button" onClick={() => loadAdminStats()}>
                    Retry
                  </button>
                </div>
              )}
              <section className="ay-stats-grid">
                {stats.map((stat) => {
                  const Icon = stat.icon;

                  return (
                    <article className="ay-stat-card" key={stat.label}>
                      <div className="ay-stat-header">
                        <span>{stat.label}</span>
                        <Icon size={19} />
                      </div>
                      <h2>
                        {statsLoading
                          ? "..."
                          : statsError
                            ? "â€”"
                            : adminStats?.[stat.key] == null
                              ? "â€”"
                              : stat.key === "total_revenue"
                                ? `â‚¹${Number(adminStats[stat.key]).toLocaleString("en-IN")}`
                                : Number(adminStats[stat.key]).toLocaleString(
                                    "en-IN",
                                  )}
                      </h2>

                      <p>
                        {statsLoading
                          ? "Loading statistics..."
                          : statsError
                            ? "Unable to load"
                            : stat.key === "total_revenue"
                              ? "Awaiting verified payments"
                              : "Live database statistics"}
                      </p>

                      <div className="ay-stat-bottom">
                        <Activity size={15} />
                        <span>
                          {statsError ? "Connection error" : "AasanYatra MySQL"}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="ay-chart-grid">
                <article className="ay-panel">
                  <div className="ay-panel-header">
                    <div>
                      <h3>Booking Analytics</h3>
                      <p>Illustrative booking trends</p>
                    </div>
                    <TrendingUp size={19} />
                  </div>

                  <div className="ay-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyBookingChart}>
                        <defs>
                          <linearGradient
                            id="ayPurple"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#7659ed"
                              stopOpacity={0.25}
                            />
                            <stop
                              offset="95%"
                              stopColor="#7659ed"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#eef0f5" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="bookings"
                          stroke="#7659ed"
                          strokeWidth={2.5}
                          fill="url(#ayPurple)"
                        />
                        <Area
                          type="monotone"
                          dataKey="completed"
                          stroke="#a5b4fc"
                          strokeWidth={2}
                          fill="none"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="ay-panel">
                  <div className="ay-panel-header">
                    <div>
                      <h3>Monthly Performance</h3>
                      <p>Illustrative ride activity</p>
                    </div>
                    <Activity size={19} />
                  </div>

                  <div className="ay-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bookingTypeChart}>
                        <CartesianGrid stroke="#eef0f5" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Bar
                          dataKey="bookings"
                          fill="#7659ed"
                          radius={[5, 5, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </section>

              <section className="ay-bottom-grid">
                <article className="ay-panel">
                  <div className="ay-panel-header">
                    <div>
                      <h3>Ride Distribution</h3>
                      <p>Illustrative trip categories</p>
                    </div>
                  </div>

                  <div className="ay-donut-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={bookingStatusChart}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {bookingStatusChart.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={chartColors[index % chartColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="ay-chart-legend">
                    {bookingStatusChart.map((item, index) => (
                      <div key={item.name}>
                        <span
                          className="ay-legend-dot"
                          style={{
                            background: chartColors[index % chartColors.length],
                          }}
                        />
                        {item.name}: {item.value}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="ay-panel">
                  <div className="ay-panel-header">
                    <div>
                      <h3>Quick Management</h3>
                      <p>Access frequently used modules</p>
                    </div>
                  </div>

                  <div className="ay-quick-links">
                    {navigation
                      .filter(
                        (item) =>
                          item.id !== "overview" &&
                          item.label
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((item) => {
                        const Icon = item.icon;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(item.id)}
                          >
                            <span className="ay-quick-icon">
                              <Icon size={18} />
                            </span>
                            <span>{item.label}</span>
                            <ArrowUpRight size={16} />
                          </button>
                        );
                      })}
                  </div>
                </article>
              </section>
            </>
          ) : activePage === "bookings" ? (
            <AdminBookingManagement />
) : activePage === "ride-requests" ? (
  <AdminRideRequests />
         ) : activePage === "passengers" ? (
  <PassengerManagement />
) : activePage === "drivers" ? (
  <DriverManagement />
) : activePage === "settings" ? (
            <LocationSettings />
          ) : (
            <section className="ay-panel ay-module-page">
              <div className="ay-module-icon">
                <currentPage.icon size={30} />
              </div>
              <h2>{currentPage.label}</h2>
              <p>
                This module is ready for future backend integration. Live
                management tools will be added in the next development steps.
              </p>

              <button
                type="button"
                className="ay-primary-button"
                onClick={() => navigate("overview")}
              >
                Back to Dashboard
              </button>


            </section>
          )}
        </main>
      </div>
    </div>
  );
}
