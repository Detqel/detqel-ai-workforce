import React from "react";

export interface PrimaryButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
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
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#8a2be2] dark:bg-[#FFA500] hover:bg-[#7823c9] dark:hover:bg-[#FFA500]/90 text-white dark:text-slate-950 font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#8a2be2] dark:bg-[#FFA500] hover:bg-[#7823c9] dark:hover:bg-[#FFA500]/90 text-white dark:text-slate-950 font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      <span>{value}</span>
      {icon}
    </button>
  );
};

export default PrimaryButton;
