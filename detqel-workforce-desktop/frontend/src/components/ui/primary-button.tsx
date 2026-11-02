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
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      <span>{value}</span>
      {icon}
    </button>
  );
};

export default PrimaryButton;
