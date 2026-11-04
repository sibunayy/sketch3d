export interface IconButtonProps {
  /** Name of a picture in public/icons, without ".webp". */
  icon: string;
  /** Always shown under the picture: icons come with words. */
  label: string;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  testId?: string;
}

/** A picture with a short label under it. Used for tools and for undo and redo. */
export function IconButton({ icon, label, onClick, on, disabled, testId }: IconButtonProps) {
  return (
    <button type="button" class={`iconbtn ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={on === undefined ? undefined : on} data-testid={testId}>
      <img src={`${import.meta.env.BASE_URL}icons/${icon}.webp`} alt="" width={32} height={32} />
      <span>{label}</span>
    </button>
  );
}
