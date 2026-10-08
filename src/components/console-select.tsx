"use client";
import { Children, isValidElement, useState, type ReactNode } from "react";
import { FilterSelect } from "./filter-select";

// Keep form submission and existing option lists while sharing the public menu UI.
export function ConsoleSelect({ label, value, defaultValue, name, onChange, children }: {
  label: string; value?: string | number; defaultValue?: string; name?: string;
  onChange?: (value: string) => void; children: ReactNode;
}) {
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const props = child.props as { value?: string | number; children: ReactNode; disabled?: boolean };
    const text = Children.toArray(props.children).join("");
    return { value: String(props.value ?? text), label: text, disabled: props.disabled };
  });
  const [local, setLocal] = useState(defaultValue ?? options[0]?.value ?? "");
  const selected = String(value ?? local);
  return <>
    {name && <input type="hidden" name={name} value={selected} />}
    <FilterSelect compact label={label} value={selected}
      options={options.filter(option => !option.disabled || option.value === selected)}
      onChange={next => {
        if (options.find(option => option.value === next)?.disabled) return;
        setLocal(next); onChange?.(next);
      }} />
  </>;
}
