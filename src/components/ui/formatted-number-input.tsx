import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";

type FormattedNumberInputProps = Omit<InputProps, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

function formatNumberInputValue(value: string) {
  if (!value) return "";

  const [rawInteger = "", rawDecimal] = value.split(".");
  const integer = rawInteger.replace(/\D/g, "") || "0";
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rawDecimal === undefined ? groupedInteger : `${groupedInteger},${rawDecimal.replace(/\D/g, "")}`;
}

function parseNumberInputValue(value: string) {
  const sanitized = value.replace(/[^\d.,]/g, "");
  if (!sanitized) return "";

  const commaIndex = sanitized.indexOf(",");
  const integerSource = commaIndex >= 0 ? sanitized.slice(0, commaIndex) : sanitized;
  const integerDigits = integerSource.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  if (commaIndex < 0) return integerDigits;

  const decimalDigits = sanitized.slice(commaIndex + 1).replace(/\D/g, "").slice(0, 2);
  return `${integerDigits}.${decimalDigits}`;
}

const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  ({ value, onValueChange, inputMode = "decimal", ...props }, ref) => (
    <Input
      ref={ref}
      type="text"
      inputMode={inputMode}
      value={formatNumberInputValue(value)}
      onChange={(event) => onValueChange(parseNumberInputValue(event.target.value))}
      {...props}
    />
  ),
);

FormattedNumberInput.displayName = "FormattedNumberInput";

export { FormattedNumberInput };
