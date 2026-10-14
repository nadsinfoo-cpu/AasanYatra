import { useEffect, useState } from "react";
import {
  ArrowRight,
  CarFront,
  Headphones,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  MapPin,
} from "lucide-react";
import hero from "./assets/hero.png";
import "./LoginPage.css";

const headlines = [
  "Welcome to AasanYatra 2.0",
  "Expanding across North India",
  "One Way • Round Trip • Airport Transfer • Local Rides",
  "Your Journey, Our Priority",
];

const slides = [
  {
    image: hero,
    heading: "Your Journey, Our Priority",
    description: "One Way • Round Trip • Airport Transfer • Local Rides",
  },
  {
    image: hero,
    heading: "Travel across North India",
    description: "Comfortable rides for your next journey",
  },
  {
    image: hero,
    heading: "Book with confidence",
    description: "Simple mobile OTP login and easy ride booking",
  },
];

export default function LoginPage({
  phone,
  setPhone,
  otp,
  setOtp,
  otpSent,
  loading,
  message,
  checkingSession,
  onRequestOtp,
  onVerifyOtp,
  onChangeNumber,
}) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setSlide((previous) => (previous + 1) % slides.length),
      5000,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="ayl-page">
      <header className="ayl-header">
        <a className="ayl-brand" href="/" aria-label="AasanYatra home">
          <strong>
            Aasan<span>Yatra 2.0</span>
          </strong>
          <small>Your Journey, Our Priority</small>
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
          <span aria-hidden="true">|</span>
          <a href="/support">Support</a>
        </nav>
      </header>

      <div className="ayl-ticker" aria-label="Latest AasanYatra news">
        <span className="ayl-news-label">NEWS</span>
        <div className="ayl-ticker-viewport">
          <div className="ayl-ticker-track">
            {[0, 1].map((copy) => (
              <span
                className="ayl-ticker-group"
                key={copy}
                aria-hidden={copy === 1}
              >
                {headlines.map((headline) => (
                  <span key={headline}>
                    🚕 {headline} <b aria-hidden="true">•</b>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ayl-shell">
        <section className="ayl-marketing" aria-label="About AasanYatra">
          <div className="ayl-marketing-top">
            <h1>
              Aasan<span>Yatra 2.0</span>
            </h1>
            <p>Your Journey, Our Priority</p>
          </div>
          <div className="ayl-slide-window">
            {slides.map((item, index) => (
              <img
                key={index}
                src={item.image}
                alt={index === 0 ? "AasanYatra cab booking illustration" : ""}
                className={
                  index === slide ? "ayl-slide is-active" : "ayl-slide"
                }
              />
            ))}
          </div>
          <div className="ayl-marketing-bottom">
            <h2>{slides[slide].heading}</h2>
            <p>{slides[slide].description}</p>
            <div className="ayl-dots" aria-label="Choose slideshow image">
              {slides.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  className={slide === index ? "active" : ""}
                  aria-label={`Show slide ${index + 1}`}
                  aria-pressed={slide === index}
                  onClick={() => setSlide(index)}
                />
              ))}
            </div>
            <div className="ayl-features">
              <div>
                <CarFront size={19} />
                <span>Safe Rides</span>
              </div>
              <div>
                <ShieldCheck size={19} />
                <span>Reliable Service</span>
              </div>
              <div>
                <Wallet size={19} />
                <span>Affordable Fares</span>
              </div>
              <div>
                <MapPin size={19} />
                <span>North India</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ayl-login" aria-label="Login or sign up">
          <div className="ayl-form-content">
            <h2>Welcome Back</h2>
            <p className="ayl-subtitle">
              Login or sign up with your mobile number.
            </p>
            {checkingSession ? (
              <p role="status">Checking your login session...</p>
            ) : (
              <>
                <form onSubmit={otpSent ? onVerifyOtp : onRequestOtp}>
                  <label htmlFor="ayl-phone">Mobile Number</label>
                  <div className="ayl-phone-field">
                    <span>+91</span>
                    <input
                      id="ayl-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="Enter 10-digit mobile number"
                      value={phone}
                      maxLength={10}
                      pattern="[6-9][0-9]{9}"
                      required
                      disabled={otpSent || loading}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                    />
                  </div>
                  {otpSent && (
                    <>
                      <label htmlFor="ayl-otp">Enter 6-digit OTP</label>
                      <input
                        className="ayl-otp-field"
                        id="ayl-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Enter OTP"
                        value={otp}
                        maxLength={6}
                        pattern="[0-9]{6}"
                        required
                        disabled={loading}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                      />
                      <p className="ayl-dev-note">
                        Local development only: use OTP 123456.
                      </p>
                    </>
                  )}
                  <button
                    className="ayl-submit"
                    type="submit"
                    disabled={
                      loading ||
                      (otpSent ? otp.length !== 6 : !/^[6-9]\d{9}$/.test(phone))
                    }
                  >
                    {loading
                      ? "Please wait..."
                      : otpSent
                        ? "Verify OTP & Login"
                        : "Get OTP"}
                    <ArrowRight size={19} />
                  </button>
                </form>
                {otpSent && (
                  <button
                    className="ayl-change"
                    type="button"
                    disabled={loading}
                    onClick={onChangeNumber}
                  >
                    Change mobile number
                  </button>
                )}
                {message && (
                  <p className="ayl-message" role="status">
                    {message}
                  </p>
                )}
                <p className="ayl-secure">
                  <LockKeyhole size={15} /> Secure OTP-based login
                </p>
                <div className="ayl-or">
                  <span>OR</span>
                </div>
                <div className="ayl-benefits">
                  <div>
                    <CarFront size={22} />
                    <span>
                      <strong>Quick Booking</strong>
                      <small>Book in minutes</small>
                    </span>
                  </div>
                  <div>
                    <Headphones size={22} />
                    <span>
                      <strong>Support</strong>
                      <small>Here to help</small>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      <footer className="ayl-footer">
        <div>
          <a href="/terms">Terms of Service</a>
          <span>|</span>
          <a href="/privacy">Privacy Policy</a>
          <span>|</span>
          <a href="/support">Contact Us</a>
        </div>
        <p>© {new Date().getFullYear()} AasanYatra. All rights reserved.</p>
      </footer>
    </main>
  );
}
