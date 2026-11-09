"use client";

import {
  MIN_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  PHONE_DIGITS,
  USERNAME_PATTERN,
} from "@/constants/authConstants";

import { ASSET_PATHS, APPLICATION_NAME_UPPERCASE } from "@/constants/commonConstants";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  User,
  Building2,
  AtSign,
  Loader2,
  AlertCircle,
  Phone,
  Globe,
  MapPin,
  BadgeCheck,
} from "lucide-react";
import { PuzzleCaptcha } from "./PuzzleCaptcha";
import { useWorkspace } from "@/context/WorkspaceContext";
import { apiLicenseOptions, apiLogin, apiRegister, type LicenseOption } from "@/lib/api";
import { loadCountries, type CountryOption } from "@/lib/country-regions";
import { PrimaryButton } from "@/components/ui/primary-button";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { CustomDropdown } from "@/components/ui/custom-dropdown";

const INPUT_SHELL =
  "flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10";
const INPUT_TEXT = "w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400";
const DROPDOWN_TRIGGER = "py-2.5 text-sm";

const Field: React.FC<{ id: string; label: string; children: React.ReactNode }> = ({ id, label, children }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

export const LoginForm: React.FC = () => {
  const { setSession } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSubmitted, setResetSubmitted] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const [signInUsername, setSignInUsername] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [licensePlanId, setLicensePlanId] = useState("");

  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [countriesError, setCountriesError] = useState(false);
  const [licenseOptions, setLicenseOptions] = useState<LicenseOption[] | null>(null);
  const [licenseOptionsError, setLicenseOptionsError] = useState<string | null>(null);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // The country and state list is loaded only when someone opens registration.
  useEffect(() => {
    if (activeTab !== "signup" || countries) return;
    let active = true;
    loadCountries().then(
      (list) => { if (active) setCountries(list); },
      () => { if (active) setCountriesError(true); },
    );
    return () => { active = false; };
  }, [activeTab, countries]);

  // The licenses on offer come from the License Portal's catalog each time registration opens.
  useEffect(() => {
    if (activeTab !== "signup" || licenseOptions) return;
    let active = true;
    apiLicenseOptions().then(
      (options) => {
        if (!active) return;
        setLicenseOptions(options);
        setLicensePlanId((current) => current || options[0]?.id || "");
      },
      (error: unknown) => {
        if (active) setLicenseOptionsError(error instanceof Error ? error.message : "The license list could not be loaded.");
      },
    );
    return () => { active = false; };
  }, [activeTab, licenseOptions]);

  const licenseDropdownOptions = (licenseOptions ?? []).map((option) => ({
    value: option.id,
    label: option.name,
    badge: option.billing === "FREE" ? "Free" : option.billing,
    description: [option.description, option.durationDays ? `Valid ${option.durationDays} days after approval` : "No expiry"]
      .filter(Boolean)
      .join(" · "),
  }));

  const countryOptions = (countries ?? []).map((item) => ({ value: item.code, label: item.name }));
  const regions = countries?.find((item) => item.code === country)?.regions ?? [];
  const regionOptions = regions.map((name) => ({ value: name, label: name }));

  const handleTabChange = (tab: "signin" | "signup") => {
    setActiveTab(tab);
    setAuthError(null);
    setAuthSuccess(null);
    setCountriesError(false);
    setLicenseOptionsError(null);
    setIsCaptchaVerified(false);
    if (tab === "signin" && username.trim()) {
      setSignInUsername(username.trim());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (isForgotPassword) {
      if (!forgotEmail || !forgotEmail.includes("@")) {
        setAuthError("Please provide a valid email address.");
        return;
      }
      setResetSubmitted(true);
      return;
    }

    if (!isCaptchaVerified) {
      setAuthError("Please complete the security puzzle verification before continuing.");
      return;
    }

    if (activeTab === "signin") {
      if (!signInUsername.trim()) {
        setAuthError("Please enter your username.");
        return;
      }
      if (!signInPassword) {
        setAuthError("Please enter your password.");
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await apiLogin({
          username: signInUsername.trim(),
          password: signInPassword,
        });

        setSession(response.user, response.workspaces);
        setAuthSuccess(
          response.hasWorkspace && response.workspaces.length > 0
            ? `Authentication successful! Connecting to ${response.workspaces[0].name}...`
            : "Authentication successful! Welcome to DETQEL."
        );
      } catch (err: unknown) {
        setAuthError(
          err instanceof Error
            ? err.message
            : "Failed to authenticate. Please check credentials."
        );
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const digits = phone.trim();
      if (!firstName.trim() || !lastName.trim()) {
        setAuthError("Please provide both first and last name.");
        return;
      }
      if (username.trim().length < MIN_USERNAME_LENGTH || !USERNAME_PATTERN.test(username.trim())) {
        setAuthError(`Username must be at least ${MIN_USERNAME_LENGTH} characters and use only letters, numbers, dots, dashes or underscores.`);
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        setAuthError("Please enter a valid email address.");
        return;
      }
      if (!companyName.trim()) {
        setAuthError("Please enter your company name.");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setAuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
        return;
      }
      if (password !== confirmPassword) {
        setAuthError("Passwords do not match. Please verify both passwords.");
        return;
      }
      if (!/^\d+$/.test(digits) || digits.length < PHONE_DIGITS.minimum || digits.length > PHONE_DIGITS.maximum) {
        setAuthError(`Phone number must contain ${PHONE_DIGITS.minimum} to ${PHONE_DIGITS.maximum} digits.`);
        return;
      }
      if (!country) {
        setAuthError("Please select your country.");
        return;
      }
      if (regions.length > 0 && !region) {
        setAuthError("Please select your state.");
        return;
      }
      if (!licensePlanId) {
        setAuthError("Please select a license.");
        return;
      }
      if (!agreeTerms) {
        setAuthError("You must agree to the Terms of Service and Privacy Policy.");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await apiRegister({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username: username.trim(),
          email: email.trim(),
          companyName: companyName.trim(),
          password,
          confirmPassword,
          phone: digits,
          country,
          state: region,
          licensePlanId,
        });
        // No session yet: a DETQEL administrator approves the license before the first sign-in.
        setActiveTab("signin");
        setSignInUsername(username.trim());
        setSignInPassword("");
        setPassword("");
        setConfirmPassword("");
        setIsCaptchaVerified(false);
        setAuthSuccess(`${response.message} You can sign in once it is approved.`);
      } catch (err: unknown) {
        setAuthError(
          err instanceof Error
            ? err.message
            : "Failed to process registration. Please check your details."
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="w-full mx-auto bg-white rounded-3xl border border-slate-200 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.08)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 transition-all">
      <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
        <div>
          <div className="flex flex-col items-center text-center mb-6 sm:mb-7 select-none">
            <div className="relative flex items-center justify-center mb-2.5">
              <Image
                src={ASSET_PATHS.nameLogoLight}
                alt={APPLICATION_NAME_UPPERCASE}
                width={1983}
                height={793}
                priority
                className="h-14 sm:h-16 w-auto object-contain hover:scale-[1.01] transition-transform dark:hidden block"
              />
              <Image
                src={ASSET_PATHS.nameLogoDark}
                alt={APPLICATION_NAME_UPPERCASE}
                width={1983}
                height={793}
                priority
                className="h-14 sm:h-16 w-auto object-contain hover:scale-[1.01] transition-transform hidden dark:block"
              />
            </div>
            <p className="font-body text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              AI WORKFORCE PLATFORM TO UPGRADE BUSINESS INTELLIGENCE
            </p>
          </div>

          {!isForgotPassword && (
            <div className="flex items-center justify-start border-b border-slate-200 mb-6">
              <button
                type="button"
                onClick={() => handleTabChange("signin")}
                className={`relative pb-3 px-2 text-sm sm:text-base font-semibold transition-colors cursor-pointer mr-6 ${
                  activeTab === "signin"
                    ? "text-slate-900"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Sign In
                {activeTab === "signin" && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                    style={{ backgroundColor: "#8a2be2" }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("signup")}
                className={`relative pb-3 px-2 text-sm sm:text-base font-semibold transition-colors cursor-pointer ${
                  activeTab === "signup"
                    ? "text-slate-900"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Create Account
                {activeTab === "signup" && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                    style={{ backgroundColor: "#8a2be2" }}
                  />
                )}
              </button>
            </div>
          )}

          {isForgotPassword && (
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900">Reset Password</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Enter your email address and we will send you a password reset link.
              </p>
            </div>
          )}

          {authError && (
            <div className="mb-5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{authError}</span>
              </div>
              {authError.toLowerCase().includes("already exists") && (
                <button
                  type="button"
                  onClick={() => handleTabChange("signin")}
                  className="text-xs font-bold text-[#8a2be2] hover:underline shrink-0 cursor-pointer"
                >
                  Sign In Instead &rarr;
                </button>
              )}
            </div>
          )}

          {authSuccess && (
            <div className="mb-5 p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 stroke-[3]" />
              <span>{authSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isForgotPassword ? (
              <div>
                <label
                  htmlFor="forgotEmail"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Account Email
                </label>
                <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                  <Mail className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                  <input
                    id="forgotEmail"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            ) : activeTab === "signin" ? (
              <>
                <Field id="signInUsername" label="Username">
                  <div className={INPUT_SHELL}>
                    <AtSign className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                    <input
                      id="signInUsername"
                      type="text"
                      required
                      autoComplete="username"
                      value={signInUsername}
                      onChange={(e) => setSignInUsername(e.target.value)}
                      placeholder="Your DETQEL username"
                      className={INPUT_TEXT}
                    />
                  </div>
                </Field>

                <div>
                  <label
                    htmlFor="signInPassword"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                    <Lock className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                    <input
                      id="signInPassword"
                      type={showSignInPassword ? "text" : "password"}
                      required
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    <IconOnlyButton
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="ml-1 p-0.5"
                      aria-label={
                        showSignInPassword ? "Hide password" : "Show password"
                      }
                      icon={
                        showSignInPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label
                    htmlFor="rememberMe"
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <button
                      type="button"
                      id="rememberMe"
                      role="checkbox"
                      aria-checked={rememberMe}
                      onClick={() => setRememberMe(!rememberMe)}
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer ${
                        rememberMe
                          ? "bg-[#8a2be2] border-[#8a2be2] text-white"
                          : "bg-white border-slate-300"
                      }`}
                    >
                      {rememberMe && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                    <span className="text-xs text-slate-600">Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-semibold hover:underline cursor-pointer transition-colors"
                    style={{ color: "#8a2be2" }}
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="firstName" label="First Name">
                    <div className={INPUT_SHELL}>
                      <User className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="firstName" type="text" required maxLength={60} autoComplete="given-name" value={firstName}
                        onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className={INPUT_TEXT} />
                    </div>
                  </Field>
                  <Field id="lastName" label="Last Name">
                    <div className={INPUT_SHELL}>
                      <User className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="lastName" type="text" required maxLength={60} autoComplete="family-name" value={lastName}
                        onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className={INPUT_TEXT} />
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="username" label="Username">
                    <div className={INPUT_SHELL}>
                      <AtSign className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="username" type="text" required minLength={MIN_USERNAME_LENGTH} maxLength={64} autoComplete="username"
                        value={username} onChange={(e) => setUsername(e.target.value)} placeholder="janedoe" className={INPUT_TEXT} />
                    </div>
                  </Field>
                  <Field id="email" label="Email">
                    <div className={INPUT_SHELL}>
                      <Mail className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="email" type="email" required maxLength={254} autoComplete="email" value={email}
                        onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" className={INPUT_TEXT} />
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="companyName" label="Company Name">
                    <div className={INPUT_SHELL}>
                      <Building2 className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="companyName" type="text" required maxLength={120} autoComplete="organization" value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corporation" className={INPUT_TEXT} />
                    </div>
                  </Field>
                  <Field id="phone" label="Phone Number">
                    <div className={INPUT_SHELL}>
                      <Phone className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="phone" type="tel" required inputMode="numeric" pattern="[0-9]*" autoComplete="tel"
                        minLength={PHONE_DIGITS.minimum} maxLength={PHONE_DIGITS.maximum} value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, PHONE_DIGITS.maximum))}
                        placeholder="Digits only, with country code" className={INPUT_TEXT} />
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="password" label="Password">
                    <div className={INPUT_SHELL}>
                      <Lock className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="password" type={showPassword ? "text" : "password"} required minLength={MIN_PASSWORD_LENGTH} maxLength={128}
                        autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`} className={INPUT_TEXT} />
                      <IconOnlyButton
                        onClick={() => setShowPassword(!showPassword)}
                        className="ml-1 p-0.5"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        icon={showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      />
                    </div>
                  </Field>
                  <Field id="confirmPassword" label="Confirm Password">
                    <div className={INPUT_SHELL}>
                      <Lock className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} required maxLength={128}
                        autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password" className={INPUT_TEXT} />
                      <IconOnlyButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="ml-1 p-0.5"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        icon={showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="country" label="Country">
                    <CustomDropdown
                      options={countryOptions}
                      value={country}
                      onChange={(code) => { setCountry(code); setRegion(""); }}
                      placeholder={countriesError ? "Country list unavailable" : "Select country"}
                      loading={!countries && !countriesError}
                      loadingText="Loading countries..."
                      searchable
                      searchPlaceholder="Search countries"
                      icon={<Globe className="w-4 h-4" />}
                      triggerClassName={DROPDOWN_TRIGGER}
                    />
                  </Field>
                  <Field id="state" label="State">
                    <CustomDropdown
                      options={regionOptions}
                      value={region}
                      onChange={setRegion}
                      placeholder={!country ? "Select a country first" : regions.length ? "Select state" : "No states for this country"}
                      disabled={!country || regions.length === 0}
                      searchable
                      searchPlaceholder="Search states"
                      icon={<MapPin className="w-4 h-4" />}
                      triggerClassName={DROPDOWN_TRIGGER}
                    />
                  </Field>
                </div>

                <Field id="licenseType" label="License Type">
                  <CustomDropdown
                    options={licenseDropdownOptions}
                    value={licensePlanId}
                    onChange={setLicensePlanId}
                    placeholder={licenseOptionsError ? "License list unavailable" : "Select license"}
                    loading={!licenseOptions && !licenseOptionsError}
                    loadingText="Loading licenses..."
                    emptyText="No licenses are offered right now"
                    icon={<BadgeCheck className="w-4 h-4" />}
                    triggerClassName={DROPDOWN_TRIGGER}
                  />
                  <p className={`mt-1.5 text-[11px] ${licenseOptionsError ? "text-red-600" : "text-slate-500"}`}>
                    {licenseOptionsError ??
                      "Licenses are managed by DETQEL. An administrator approves each request before the first sign-in."}
                  </p>
                </Field>

                <div className="flex items-start gap-2 pt-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={agreeTerms}
                    onClick={() => setAgreeTerms(!agreeTerms)}
                    className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer flex-shrink-0 ${
                      agreeTerms
                        ? "bg-[#8a2be2] border-[#8a2be2] text-white"
                        : "bg-white border-slate-300"
                    }`}
                  >
                    {agreeTerms && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                  <span className="text-xs leading-tight text-slate-600">
                    I agree to the{" "}
                    <a
                      href="#terms"
                      className="hover:underline font-semibold"
                      style={{ color: "#8a2be2" }}
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="#privacy"
                      className="hover:underline font-semibold"
                      style={{ color: "#8a2be2" }}
                    >
                      Privacy Policy
                    </a>
                  </span>
                </div>
              </div>
            )}

            {!isForgotPassword && (
              <div className="pt-1">
                <PuzzleCaptcha
                  isVerified={isCaptchaVerified}
                  onVerify={(verified) => {
                    setIsCaptchaVerified(verified);
                    if (verified) setAuthError(null);
                  }}
                />
              </div>
            )}

            {isForgotPassword && resetSubmitted && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
                Reset instructions have been sent to <strong>{forgotEmail}</strong> if it exists in our system.
              </div>
            )}

            <div className="pt-2">
              <PrimaryButton
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 text-sm shadow-md hover:shadow-lg"
                value={
                  isSubmitting
                    ? activeTab === "signup" ? "Submitting..." : "Authenticating..."
                    : isForgotPassword
                    ? "Send Reset Link"
                    : activeTab === "signin"
                    ? "Sign In"
                    : "Create Account"
                }
                icon={
                  isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )
                }
                iconPosition={isSubmitting ? "left" : "right"}
              />
            </div>

            {isForgotPassword && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setResetSubmitted(false);
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  className="text-xs font-semibold hover:underline cursor-pointer"
                  style={{ color: "#8a2be2" }}
                >
                  ← Back to Sign In
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <div className="lg:col-span-5 relative hidden lg:block overflow-hidden border-l border-slate-200/60 bg-[#04050a]">
        <Image
          src={ASSET_PATHS.loginBanner}
          alt="DETQEL AI Neural Core Interface"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 42vw"
          className="object-fill select-none"
        />
      </div>
    </div>
  );
};
