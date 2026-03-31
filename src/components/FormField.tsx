// FORM FIELD: Reusable form input component with label and error display.
//
// Supports text, email, number, textarea, and select inputs.
// Renders a label, the input element, and an optional error message.
//
// Usage:
//   <FormField label="Title" name="title" value={title} onChange={setTitle} required />
//   <FormField label="Status" name="status" type="select" options={['Active', 'Inactive']} value={status} onChange={setStatus} />
//   <FormField label="Notes" name="notes" type="textarea" value={notes} onChange={setNotes} />

'use client';

interface FormFieldBaseProps {
  /** Display label above the input */
  label: string;
  /** HTML name attribute */
  name: string;
  /** Current value */
  value: string;
  /** Change handler — receives the new value string */
  onChange: (value: string) => void;
  /** Validation error message */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
}

interface TextFieldProps extends FormFieldBaseProps {
  type?: 'text' | 'email' | 'number' | 'password';
}

interface TextareaFieldProps extends FormFieldBaseProps {
  type: 'textarea';
  rows?: number;
}

interface SelectFieldProps extends FormFieldBaseProps {
  type: 'select';
  options: string[] | { label: string; value: string }[];
}

type FormFieldProps = TextFieldProps | TextareaFieldProps | SelectFieldProps;

export function FormField(props: FormFieldProps) {
  const { label, name, value, onChange, error, required, disabled, placeholder } = props;

  const baseClasses =
    'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const errorClasses = error ? 'border-red-300' : 'border-gray-300';
  const disabledClasses = disabled ? 'bg-gray-100 cursor-not-allowed' : '';
  const inputClasses = `${baseClasses} ${errorClasses} ${disabledClasses}`;

  let input: React.ReactNode;

  if (props.type === 'textarea') {
    input = (
      <textarea
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        rows={props.rows ?? 3}
      />
    );
  } else if (props.type === 'select') {
    input = (
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
        required={required}
        disabled={disabled}
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
        {props.options.map((opt) => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    );
  } else {
    input = (
      <input
        type={props.type || 'text'}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {input}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
