import React from "react";

export interface IconOnlyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
}

export const IconOnlyButton: React.FC<IconOnlyButtonProps> = ({
  icon,
  className = "",
  type = "button",
  ...props
}) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-xl p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#151f32] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
};

export default IconOnlyButton;
