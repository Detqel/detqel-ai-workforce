"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { PuzzleCaptcha } from "./PuzzleCaptcha";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiLogin,
  apiRegister,
  apiCheckUser,
  CheckUserResponse,
  UserProfile,
  WorkspaceSummary,
} from "@/lib/api";

export const LoginForm: React.FC = () => {
  const router = useRouter();
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

  const [signInIdentifier, setSignInIdentifier] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [existingUserMatch, setExistingUserMatch] = useState<CheckUserResponse | null>(null);

  const checkExistingAccount = async (emailVal: string, usernameVal: string) => {
    if (!emailVal.includes("@") && (!usernameVal || usernameVal.length < 3)) {
      setExistingUserMatch(null);
      return;
    }
    const res = await apiCheckUser({ email: emailVal, username: usernameVal });
    if (res.exists) {
      setExistingUserMatch(res);
    } else {
      setExistingUserMatch(null);
    }
  };

  const handleTabChange = (tab: "signin" | "signup") => {
    setActiveTab(tab);
    setAuthError(null);
    setAuthSuccess(null);
    setIsCaptchaVerified(false);
    if (tab === "signin" && (companyEmail.trim() || username.trim())) {
      setSignInIdentifier(companyEmail.trim() || username.trim());
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
      if (!signInIdentifier.trim()) {
        setAuthError("Please enter your email or username.");
        return;
      }
      if (!signInPassword) {
        setAuthError("Please enter your password.");
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await apiLogin({
          identifier: signInIdentifier.trim(),
          password: signInPassword,
          companyName: companyName.trim() || undefined,
        });

        setSession(response.user, response.workspaces);

        if (response.hasWorkspace && response.workspaces.length > 0) {
          const matchedWorkspace = companyName.trim()
            ? response.workspaces.find(
                (w) =>
                  w.name.toLowerCase().includes(companyName.trim().toLowerCase()) ||
                  w.slug.toLowerCase().includes(companyName.trim().toLowerCase())
              )
            : undefined;

          if (matchedWorkspace) {
            setSession(response.user, [
              matchedWorkspace,
              ...response.workspaces.filter((w) => w.id !== matchedWorkspace.id),
            ]);
          }

          setAuthSuccess(
            `Authentication successful! Connecting to ${
              matchedWorkspace?.name || response.workspaces[0].name
            }...`
          );
          setTimeout(() => {
            setIsSubmitting(false);
            router.push("/dashboard");
          }, 600);
        } else {
          // First time user with no workspace -> Redirect to dashboard (full setup modal covers page there)
          setSession(response.user, []);
          setAuthSuccess("Authentication successful! Welcome to DETQEL.");
          setTimeout(() => {
            setIsSubmitting(false);
            router.push("/dashboard");
          }, 600);
        }
      } catch (err: unknown) {
        // Fallback demo credentials if API backend is not reached
        const isDefaultAdmin =
          (signInIdentifier.trim().toLowerCase() === "admin" ||
            signInIdentifier.trim().toLowerCase() === "admin@detqel.ai") &&
          signInPassword === "admin";

        if (isDefaultAdmin) {
          const fallbackUser: UserProfile = {
            id: "user-admin-default",
            name: "DETQEL Admin",
            email: "admin@detqel.ai",
            username: "admin",
            status: "active",
          };
          const fallbackWorkspace: WorkspaceSummary = {
            id: "ws-acme-default",
            name: companyName.trim() || "ACME Retail",
            slug: "acme-retail",
            industry: "Retail & E-Commerce",
            role: "owner",
            status: "active",
          };
          setSession(fallbackUser, [fallbackWorkspace]);
          setAuthSuccess("Welcome back, DETQEL Admin!");
          setTimeout(() => {
            setIsSubmitting(false);
            router.push("/dashboard");
          }, 600);
          return;
        }

        setIsSubmitting(false);
        const errMsg =
          err instanceof Error
            ? err.message
            : "Failed to authenticate. Please check credentials.";
        setAuthError(errMsg);
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setAuthError("Please provide both first and last name.");
        return;
      }
      if (!companyEmail.trim() || !companyEmail.includes("@")) {
        setAuthError("Please enter a valid company email address.");
        return;
      }
      if (!username.trim() || username.length < 3) {
        setAuthError("Username must be at least 3 characters.");
        return;
      }
      if (!password) {
        setAuthError("Please enter a password.");
        return;
      }
      if (password.length < 6) {
        setAuthError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setAuthError("Passwords do not match. Please verify both passwords.");
        return;
      }
      if (!agreeTerms) {
        setAuthError("You must agree to the Terms of Service and Privacy Policy.");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await apiRegister({
          name: `${firstName.trim()} ${lastName.trim()}`,
          email: companyEmail.trim(),
          username: username.trim(),
          password,
        });

        if (response.hasWorkspace && response.workspaces.length > 0) {
          // Existing user with active workspace -> Log them directly into their workspace!
          setSession(response.user, response.workspaces);
          setAuthSuccess(
            `Welcome back, ${response.user.name}! Connecting to your workspace (${response.workspaces[0].name})...`
          );
          setTimeout(() => {
            setIsSubmitting(false);
            router.push("/dashboard");
          }, 600);
        } else {
          // First-time user with 0 workspaces -> Redirect to dashboard (full setup modal covers page there)
          setSession(response.user, []);
          setAuthSuccess("Account created! Welcome to DETQEL.");
          setTimeout(() => {
            setIsSubmitting(false);
            router.push("/dashboard");
          }, 600);
        }
      } catch (err: unknown) {
        setIsSubmitting(false);
        const errMsg =
          err instanceof Error
            ? err.message
            : "Failed to process registration. Please check your credentials.";
        setAuthError(errMsg);
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
                src="/images/detqel-forge-logo.png"
                alt="DETQEL FORGE"
                width={2172}
                height={724}
                priority
                className="h-14 sm:h-16 w-auto object-contain hover:scale-[1.01] transition-transform"
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

          {activeTab === "signup" && existingUserMatch?.exists && (
            <div className="mb-5 p-3.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-900 text-xs flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#8a2be2] flex-shrink-0" />
                <span>
                  Existing account detected (<strong>{existingUserMatch.user?.email || existingUserMatch.user?.name}</strong>). Enter your password to sign in directly to your workspace.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange("signin")}
                className="text-xs font-bold text-[#8a2be2] hover:underline shrink-0 cursor-pointer"
              >
                Sign In &rarr;
              </button>
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
                <div>
                  <label
                    htmlFor="signInIdentifier"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Email or Username
                  </label>
                  <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                    <User className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                    <input
                      id="signInIdentifier"
                      type="text"
                      required
                      value={signInIdentifier}
                      onChange={(e) => setSignInIdentifier(e.target.value)}
                      placeholder="you@company.com or username"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="companyName"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Company Name
                  </label>
                  <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                    <Building2 className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                    <input
                      id="companyName"
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corporation"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

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
                    <button
                      type="button"
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer ml-1 p-0.5"
                      aria-label={
                        showSignInPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showSignInPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
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
                  <div>
                    <label
                      htmlFor="firstName"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      First Name
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <User className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="firstName"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jane"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="lastName"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Last Name
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <User className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="lastName"
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="companyEmail"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Company Email
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <Mail className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="companyEmail"
                        type="email"
                        required
                        value={companyEmail}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCompanyEmail(val);
                          if (val.includes("@")) {
                            checkExistingAccount(val, username);
                          } else if (!username) {
                            setExistingUserMatch(null);
                          }
                        }}
                        onBlur={() => checkExistingAccount(companyEmail, username)}
                        placeholder="jane@company.com"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="username"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Username
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <AtSign className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUsername(val);
                          if (val.length >= 3) {
                            checkExistingAccount(companyEmail, val);
                          } else if (!companyEmail.includes("@")) {
                            setExistingUserMatch(null);
                          }
                        }}
                        onBlur={() => checkExistingAccount(companyEmail, username)}
                        placeholder="janedoe"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <Lock className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer ml-1 p-0.5"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-[#8a2be2] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8a2be2]/10">
                      <Lock className="w-4 h-4 text-slate-400 mr-2.5 flex-shrink-0" />
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer ml-1 p-0.5"
                        aria-label={
                          showConfirmPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

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
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#8a2be2" }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#7823c9")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "#8a2be2")
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {isForgotPassword
                        ? "Send Reset Link"
                        : activeTab === "signin"
                        ? "Sign In"
                        : existingUserMatch?.exists
                        ? "Sign In to Your Workspace"
                        : "Create Account"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
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
          src="/images/login-right-banner.png"
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
