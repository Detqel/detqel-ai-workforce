import React from "react";

export interface SecondaryButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  value,
  icon,
  iconPosition = "right",
  className = "",
  type = "button",
  ...props
}) => {
  if (iconPosition === "left") {
    return (
      <button
        type={type}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#151f32] hover:bg-slate-50 dark:hover:bg-[#1e2a40] text-slate-700 dark:text-slate-300 dark:hover:text-[#FFA500] border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...props}
      >
        {icon}
        <span>{value}</span>
      </button>
    );
  }

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#151f32] hover:bg-slate-50 dark:hover:bg-[#1e2a40] text-slate-700 dark:text-slate-300 dark:hover:text-[#FFA500] border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      <span>{value}</span>
      {icon}
    </button>
  );
};

export default SecondaryButton;
