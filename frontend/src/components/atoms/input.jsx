export default function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="tw-border tw-rounded tw-px-3 tw-py-2 tw-w-full tw-focus:outline-none tw-focus:ring-2 tw-focus:ring-blue-500"
    />
  );
}
