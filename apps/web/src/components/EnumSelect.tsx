export interface EnumSelectProps<T extends string> {
  id?: string;
  ariaLabel?: string;
  options: readonly T[];
  value: string;
  onChange: (value: T) => void;
}

export function EnumSelect<T extends string>({
  id,
  ariaLabel,
  options,
  value,
  onChange,
}: EnumSelectProps<T>) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        // The <option>s below are rendered from `options` and nothing else, so
        // the selected value is always a member. Handing back the member itself
        // keeps the call typed as `T` without narrowing the event's string —
        // which is what used to need a "didn't match" branch no caller could
        // reach.
        for (const option of options) {
          if (option === event.target.value) {
            onChange(option);
            break;
          }
        }
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
