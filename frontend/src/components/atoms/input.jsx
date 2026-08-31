export default function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="tw-border tw-rounded tw-px-3 tw-py-2 tw-w-full focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-blue-500"
    />
  );
}
