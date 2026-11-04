import type { ComponentChildren } from 'preact';

export interface ButtonProps {
  label: string;
  onClick: () => void;
  /** Name of a picture in public/icons, without ".webp". */
  icon?: string;
  variant?: 'primary' | 'plain';
  on?: boolean;
  disabled?: boolean;
  children?: ComponentChildren;
}

/** Words with an optional picture. At least 48 px tall. */
export function Button({ label, onClick, icon, variant = 'plain', on, disabled }: ButtonProps) {
  return (
    <button type="button" class={`btn ${variant === 'primary' ? 'primary' : ''} ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <img src={`${import.meta.env.BASE_URL}icons/${icon}.webp`} alt="" width={28} height={28} />}
      <span>{label}</span>
    </button>
  );
}
