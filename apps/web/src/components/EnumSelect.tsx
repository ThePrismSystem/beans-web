import { parseEnumValue } from "../lib/enum.js";

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
        const next = parseEnumValue(event.target.value, options);
        if (next) {
          onChange(next);
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
