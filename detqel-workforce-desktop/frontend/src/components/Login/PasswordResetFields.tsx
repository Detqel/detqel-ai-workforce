"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { MIN_PASSWORD_LENGTH } from "@/constants/authConstants";

interface Props {
  identifier: string;
  password: string;
  confirmation: string;
  disabled: boolean;
  onIdentifier: (value: string) => void;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
}

const INPUT = "w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#8a2be2] focus:ring-2 focus:ring-[#8a2be2]/10 disabled:opacity-60";

export function PasswordResetFields(props: Props) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-4">
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-700">Username or email</span>
      <input name="resetIdentifier" type="text" required maxLength={254} autoComplete="username" autoCapitalize="none" spellCheck={false}
        placeholder="Your login username or registered email" aria-describedby="resetIdentifierHelp"
        value={props.identifier} onChange={event => props.onIdentifier(event.target.value)} disabled={props.disabled} className={INPUT} />
      <span id="resetIdentifierHelp" className="mt-1.5 block text-[11px] text-slate-500">Use the username you sign in with or your registered email address. Your display name may be different.</span>
    </label>
    <div>
      <label htmlFor="resetPassword" className="mb-1.5 block text-xs font-medium text-slate-700">New password</label>
      <div className="relative">
        <input id="resetPassword" name="newPassword" type={visible ? "text" : "password"} required minLength={MIN_PASSWORD_LENGTH} maxLength={128}
          autoComplete="new-password" value={props.password} onChange={event => props.onPassword(event.target.value)} disabled={props.disabled} className={`${INPUT} pr-11`} />
        <IconOnlyButton type="button" onClick={() => setVisible(value => !value)} disabled={props.disabled} aria-label={visible ? "Hide new password" : "Show new password"}
          className="absolute right-3 top-1/2 -translate-y-1/2" icon={visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">Use at least {MIN_PASSWORD_LENGTH} characters.</p>
    </div>
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-700">Confirm new password</span>
      <input name="confirmPassword" type={visible ? "text" : "password"} required minLength={MIN_PASSWORD_LENGTH} maxLength={128} autoComplete="new-password"
        value={props.confirmation} onChange={event => props.onConfirmation(event.target.value)} disabled={props.disabled} className={INPUT} />
    </label>
  </div>;
}
